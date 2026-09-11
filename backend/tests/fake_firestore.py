"""메모리 Firestore 대역. 테스트는 실제 Firestore를 절대 건드리지 않는다.

진짜를 쓰면 돈이 나가고 데모 데이터(conversations 0 / data 492)가 오염된다. 그래서
서비스가 실제로 쓰는 만큼만 흉내 낸다 — collection/document/add/set/update/delete/
order_by/stream, 그리고 트랜잭션.

트랜잭션까지 흉내 내는 이유는 `append_turn`의 경합이 이 프로젝트에서 실제로 났던
결함이라서다. 대역이 트랜잭션을 모르면 그 회귀 테스트를 쓸 수 없다.
"""

import itertools
from copy import deepcopy


class FakeSnapshot:
    def __init__(self, doc_id, data):
        self.id = doc_id
        # 읽은 **그 순간**의 값을 복사해 둔다. 참조로 들고 있으면 나중에 to_dict()를
        # 부를 때 남이 바꾼 최신 값이 나와, 정작 잡아야 할 경합이 재현되지 않는다.
        self._data = deepcopy(data)

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return deepcopy(self._data) if self._data is not None else None

    def raw(self):
        """트랜잭션 커밋 검사용 — 읽었던 값 그대로."""
        return self._data


class FakeDocument:
    def __init__(self, collection, doc_id):
        self._collection = collection
        self.id = doc_id

    def get(self, transaction=None):
        # 트랜잭션 읽기는 커밋 시점에 값이 그대로인지 확인할 수 있게 기록해 둔다.
        data = self._collection.docs.get(self.id)
        if transaction is not None:
            transaction.note_read(self._collection, self.id, data)
        return FakeSnapshot(self.id, data)

    def set(self, data):
        self._collection.docs[self.id] = deepcopy(data)

    def update(self, data):
        if self.id not in self._collection.docs:
            raise KeyError(f"없는 문서 갱신: {self.id}")
        self._collection.docs[self.id].update(deepcopy(data))

    def delete(self):
        self._collection.docs.pop(self.id, None)


class FakeQuery:
    def __init__(self, collection, order=None, descending=False, filters=None):
        self._collection = collection
        self._order = order
        self._descending = descending
        self._filters = list(filters or [])

    def order_by(self, field, direction=None):
        return FakeQuery(self._collection, field, direction == "DESCENDING", self._filters)

    def where(self, field, op, value):
        """대화 소유자 필터용. 실제 Firestore가 쓰는 `==`만 지원한다 —
        대역이 쓰지 않는 연산자를 흉내 내면 통과하는데 검증은 못 하는 상태가 된다."""
        if op != "==":
            raise NotImplementedError(f"대역은 '==' 만 지원한다: {op}")
        return FakeQuery(
            self._collection, self._order, self._descending, self._filters + [(field, value)]
        )

    def stream(self):
        items = [
            (k, v)
            for k, v in self._collection.docs.items()
            if all(v.get(f) == val for f, val in self._filters)
        ]
        if self._order:
            items.sort(key=lambda kv: kv[1].get(self._order, ""), reverse=self._descending)
        return [FakeSnapshot(k, v) for k, v in items]


class FakeCollection(FakeQuery):
    def __init__(self, name, ids):
        super().__init__(self)
        self.name = name
        self.docs = {}
        self._ids = ids
        self._collection = self

    def document(self, doc_id=None):
        # 인자 없이 부르면 새 id를 만든다 — 배치 쓰기가 그렇게 쓴다.
        return FakeDocument(self, doc_id or f"{self.name}-{next(self._ids)}")

    def add(self, data):
        doc_id = f"{self.name}-{next(self._ids)}"
        self.docs[doc_id] = deepcopy(data)
        return None, FakeDocument(self, doc_id)


class FakeTransaction:
    """`@firestore.transactional` 데코레이터가 부르는 만큼만 구현한다.

    커밋 직전에 읽었던 문서가 그대로인지 확인하고, 달라졌으면 Aborted를 던진다 —
    데코레이터가 그걸 잡아 재시도한다. 이게 있어야 "동시에 두 요청이 들어와도 턴이
    사라지지 않는다"를 테스트로 증명할 수 있다.
    """

    _read_only = False
    _max_attempts = 5

    def __init__(self, db):
        self._db = db
        self._id = b"fake-txn"  # 데코레이터가 current_id로 읽어 간다
        self._reads = []
        self._writes = []

    # -- 데코레이터가 부르는 것들 --
    def _clean_up(self):
        self._reads, self._writes = [], []

    def _begin(self, retry_id=None):
        self._clean_up()

    def _rollback(self):
        self._clean_up()

    def _commit(self):
        from google.api_core import exceptions

        for collection, doc_id, seen in self._reads:
            if collection.docs.get(doc_id) != seen:
                raise exceptions.Aborted("문서가 트랜잭션 도중 바뀌었습니다")
        for ref, data in self._writes:
            ref.update(data)
        self._db.on_commit()
        self._clean_up()
        return []

    # -- 서비스 코드가 부르는 것들 --
    def note_read(self, collection, doc_id, data):
        self._reads.append((collection, doc_id, deepcopy(data)))

    def update(self, ref, data):
        self._writes.append((ref, data))


class FakeBatch:
    """모아서 한 번에 쓰는 경로(D3 시드 리셋)가 쓴다."""

    def __init__(self, db):
        self._db = db
        self._ops = []

    def set(self, ref, data):
        self._ops.append(("set", ref, data))

    def delete(self, ref):
        self._ops.append(("delete", ref, None))

    def commit(self):
        for kind, ref, data in self._ops:
            ref.set(data) if kind == "set" else ref.delete()
        self._ops = []


class FakeFirestore:
    def __init__(self):
        self._collections = {}
        self._ids = itertools.count(1)
        # 커밋 직전에 끼어들어 경합을 만드는 훅. 기본은 아무것도 안 한다.
        self.on_commit = lambda: None

    def collection(self, name):
        if name not in self._collections:
            self._collections[name] = FakeCollection(name, self._ids)
        return self._collections[name]

    def transaction(self):
        return FakeTransaction(self)

    def batch(self):
        return FakeBatch(self)
