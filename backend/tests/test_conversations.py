"""대화 저장·조회와 `append_turn`의 동시성."""

import threading

from app.services import conversation_service as cs


def test_대화_생성_조회_삭제(client):
    created = client.post(
        "/api/conversations",
        json={"title": "제목", "messages": [{"role": "user", "content": "안녕"}]},
    ).json()

    fetched = client.get(f"/api/conversations/{created['id']}").json()
    assert fetched["title"] == "제목"
    assert [m["content"] for m in fetched["messages"]] == ["안녕"]

    assert client.delete(f"/api/conversations/{created['id']}").status_code == 200
    assert client.get(f"/api/conversations/{created['id']}").status_code == 404


def test_없는_대화는_404(client):
    assert client.get("/api/conversations/없는id").status_code == 404


def test_목록은_최근_수정순(client, db):
    for i in range(3):
        client.post("/api/conversations", json={"title": f"대화{i}", "messages": []})
    titles = [c["title"] for c in client.get("/api/conversations").json()]
    assert titles == ["대화2", "대화1", "대화0"]


def test_제목에_선택_주제가_붙는다(db):
    """A13. 기록 목록에서 대화를 구분하는 유일한 단서다."""
    cid = cs.append_turn(None, "이 주제 핵심이 뭐야?", "답변", topic="공급 밀도")
    assert cs.get_conversation(cid).title.startswith("[공급 밀도] ")


def test_이어붙일_때_제목은_안_바뀐다(db):
    """갱신하면 기록 목록이 마지막 질문을 따라 흔들려 식별 가치가 사라진다."""
    cid = cs.append_turn(None, "첫 질문", "답변", topic="공급 밀도")
    first = cs.get_conversation(cid).title
    cs.append_turn(cid, "완전히 다른 두 번째 질문", "답변2", topic="점포 교체율")
    assert cs.get_conversation(cid).title == first


def test_삭제된_대화에_이어붙이면_새_대화가_된다(db):
    cid = cs.append_turn(None, "질문", "답변")
    cs.delete_conversation(cid)
    new_id = cs.append_turn(cid, "다음 질문", "답변")
    assert new_id != cid
    assert len(cs.get_conversation(new_id).messages) == 2


def test_동시에_이어붙여도_턴이_사라지지_않는다(db):
    """실제로 났던 결함의 회귀 테스트.

    트랜잭션 없이 읽고-고쳐-쓰면 나중 요청이 앞의 턴을 통째로 덮어써 대화가 사라진다.
    `on_commit` 훅으로 **커밋 직전에** 다른 요청이 끼어드는 상황을 정확히 재현한다.
    """
    cid = cs.append_turn(None, "첫 질문", "첫 답변")

    intruded = []

    def intrude():
        # 커밋 직전 딱 한 번만 끼어든다. 훅을 먼저 끄지 않으면 무한 재귀가 된다.
        if intruded:
            return
        intruded.append(True)
        db.on_commit = lambda: None
        cs.append_turn(cid, "끼어든 질문", "끼어든 답변")

    db.on_commit = intrude
    cs.append_turn(cid, "두 번째 질문", "두 번째 답변")
    db.on_commit = lambda: None

    contents = [m.content for m in cs.get_conversation(cid).messages]
    assert intruded, "끼어들기가 실행되지 않았다 — 테스트가 아무것도 검증하지 못했다"
    assert "끼어든 질문" in contents, "먼저 커밋된 턴이 사라졌다"
    assert "두 번째 질문" in contents, "재시도된 턴이 사라졌다"
    assert len(contents) == 6, contents


def test_여러_스레드가_같은_대화에_붙여도_전부_남는다(db):
    cid = cs.append_turn(None, "시작", "답변")
    threads = [
        threading.Thread(target=cs.append_turn, args=(cid, f"질문{i}", f"답변{i}"))
        for i in range(5)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    contents = [m.content for m in cs.get_conversation(cid).messages]
    for i in range(5):
        assert f"질문{i}" in contents, f"질문{i}이 사라졌다: {contents}"
    assert len(contents) == 12
