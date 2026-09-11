from datetime import datetime, timezone

from firebase_admin import firestore

from .. import models
from ..firestore_client import get_db

COLLECTION = "conversations"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _owned(data: dict, owner: str) -> bool:
    """이 대화가 이 브라우저의 것인가.

    **빈 소유자는 누구의 것도 아니다.** 목록에도 안 나오고 열리지도 않는다.
    소유자 개념이 없던 시절에 만들어진 문서와, 헤더를 안 보내는 클라이언트가
    같은 빈 양동이를 나눠 쓰면 예전 구멍이 그대로 남는다.
    """
    stored = (data or {}).get("owner") or ""
    return bool(owner) and stored == owner


def list_conversations(owner: str):
    """그 브라우저가 만든 것만 돌려준다.

    전에는 컬렉션 전체를 돌려줬다. 공개 URL에서 방문자 A가 B의 질문을 읽고
    지울 수 있었다 — 실제로 관측됐다(2026-09-10).

    정렬을 Firestore에 맡기지 않고 파이썬에서 한다. `where` + 다른 필드
    `order_by`는 복합 인덱스를 요구해서, 인덱스를 안 만들면 런타임에 터진다.
    한 브라우저의 대화 수는 정렬 비용을 걱정할 규모가 아니다.
    """
    if not owner:
        return []
    docs = get_db().collection(COLLECTION).where("owner", "==", owner).stream()
    result = [
        models.ConversationOut(
            id=doc.id,
            title=(doc.to_dict() or {}).get("title", "제목 없음"),
            updated_at=(doc.to_dict() or {}).get("updated_at", ""),
        )
        for doc in docs
    ]
    result.sort(key=lambda c: c.updated_at, reverse=True)
    return result


def _read(conversation_id: str):
    """소유자 확인 없이 읽는다. **라우터에서 쓰지 않는다** — 방금 만든 것을
    돌려줄 때처럼 소유자가 이미 확실한 내부 경로 전용이다."""
    doc = get_db().collection(COLLECTION).document(conversation_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    return models.ConversationOut(
        id=doc.id,
        title=data.get("title", "제목 없음"),
        updated_at=data.get("updated_at", ""),
        messages=[models.ChatMessage(**m) for m in data.get("messages", [])],
    )


def get_conversation(conversation_id: str, owner: str):
    doc = get_db().collection(COLLECTION).document(conversation_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    if not _owned(data, owner):
        return None
    return models.ConversationOut(
        id=doc.id,
        title=data.get("title", "제목 없음"),
        updated_at=data.get("updated_at", ""),
        messages=[models.ChatMessage(**m) for m in data.get("messages", [])],
    )


def create_conversation(payload: models.ConversationIn, owner: str) -> models.ConversationOut:
    title = payload.title or (payload.messages[0].content[:30] if payload.messages else "새 대화")
    data = {
        "title": title,
        "messages": [m.model_dump() for m in payload.messages],
        "updated_at": _now(),
        "owner": owner,
    }
    _, ref = get_db().collection(COLLECTION).add(data)
    return _read(ref.id)


def delete_conversation(conversation_id: str, owner: str) -> bool:
    """남의 대화를 지우지 못하게 한다. 지웠으면 True, 없거나 남의 것이면 False."""
    ref = get_db().collection(COLLECTION).document(conversation_id)
    doc = ref.get()
    if not doc.exists or not _owned(doc.to_dict(), owner):
        return False
    ref.delete()
    return True


def _derive_title(user_message: str, topic: str | None) -> str:
    """A13: 대화 제목 앞에 주제를 붙인다.

    첫 메시지에서만 파생하면 '이 주제 핵심만 한 줄로' 같은 제목이 중복 누적돼
    기록에서 서로 구분되지 않는다. 주제를 앞에 두면 목록만 보고 갈라진다.
    """
    head = user_message[:30]
    title = f"[{topic}] {head}" if topic else head
    return title[: models.TITLE_MAX]


@firestore.transactional
def _append_in_transaction(transaction, ref, turns, owner) -> bool:
    """읽기와 쓰기를 한 트랜잭션에 묶는다. 붙였으면 True, 문서가 없으면 False.

    트랜잭션 밖에서 읽고-고쳐-쓰면 같은 대화에 두 요청이 겹칠 때 나중 것이 앞의 턴을
    통째로 덮어써 대화가 사라진다. `messages`가 배열 하나라 부분 갱신이 안 되기 때문이다.

    ArrayUnion을 쓰지 않은 이유: 합집합이라 **같은 질문을 두 번 하면 두 번째가 조용히
    사라진다.** 대화 기록에는 쓸 수 없는 의미다.
    """
    snap = ref.get(transaction=transaction)
    if not snap.exists:
        return False
    data = snap.to_dict() or {}
    # 남의 대화에 내 턴을 붙이지 못하게 한다. id만 알면 끼어들 수 있으면
    # 소유권을 건 의미가 없다.
    if not _owned(data, owner):
        return False
    messages = data.get("messages", []) + turns
    transaction.update(ref, {"messages": messages, "updated_at": _now()})
    return True


def append_turn(
    conversation_id: str | None,
    user_message: str,
    assistant_message: str,
    topic: str | None = None,
    owner: str = "",
) -> str:
    """conversation_id가 없으면 새 대화를 만들고, 있으면 이어붙인다 (채팅 API의 자동 저장용)."""
    db = get_db()
    turns = [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": assistant_message},
    ]

    if conversation_id:
        ref = db.collection(COLLECTION).document(conversation_id)
        if _append_in_transaction(db.transaction(), ref, turns, owner):
            return ref.id
        # 문서가 사라졌으면(삭제 등) 새 대화로 떨어진다

    # 제목은 대화를 처음 만들 때만 정한다. 이어붙일 때 갱신하면 기록 목록이
    # 마지막 질문을 따라 계속 흔들려 식별 가치가 사라진다.
    _, ref = db.collection(COLLECTION).add(
        {
            "title": _derive_title(user_message, topic),
            "messages": turns,
            "updated_at": _now(),
            "owner": owner,
        }
    )
    return ref.id
