"""A4 스트리밍 — 조각이 흐르고, 저장은 끝에 한 번만."""

import json

from app import config
from conftest import TEST_CLIENT_ID


def read_events(response):
    events = []
    for block in response.text.split("\n\n"):
        if not block.strip():
            continue
        kind = next(l[len("event: "):] for l in block.splitlines() if l.startswith("event: "))
        data = next(l[len("data: "):] for l in block.splitlines() if l.startswith("data: "))
        events.append((kind, json.loads(data)))
    return events


def test_조각이_순서대로_흐르고_마지막에_done이_온다(client, db, streaming):
    response = client.post("/api/chat/stream", json={"message": "질문"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    events = read_events(response)
    assert [k for k, _ in events] == ["delta", "delta", "delta", "done"]
    assert "".join(d for k, d in events if k == "delta") == "".join(streaming.pieces)

    done = events[-1][1]
    assert done["conversation_id"]
    assert done["usage"]["total_tokens"] == 1730


def test_스트리밍도_같은_프롬프트를_쓴다(client, db, streaming, monkeypatch):
    """두 경로가 다른 프롬프트를 쓰면 같은 질문에 다른 답이 나온다.

    두 스텁을 한 테스트에서 쓸 수 없어(둘 다 `_get_client`를 갈아 끼운다) 순서대로
    바꿔 끼운다.
    """
    from conftest import StubOpenAI

    from app.services import chat_service

    body = {"message": "질문", "context": {"topic": "공급 밀도", "persona": "prepare"}}

    plain_stub = StubOpenAI()
    monkeypatch.setattr(chat_service, "_get_client", lambda: plain_stub)
    client.post("/api/chat", json=body)
    plain = plain_stub.calls[-1]

    monkeypatch.setattr(chat_service, "_get_client", lambda: streaming)
    client.post("/api/chat/stream", json=body)
    streamed = streaming.calls[-1]

    assert plain["messages"] == streamed["messages"]
    assert plain["max_tokens"] == streamed["max_tokens"]


def test_저장은_끝난_뒤_한_번만_한다(client, db, streaming):
    """조각마다 쓰면 Firestore 쓰기가 수백 번 일어나고 중간에 끊긴 답이 기록에 남는다."""
    from app.services import conversation_service

    response = client.post("/api/chat/stream", json={"message": "질문"})
    cid = read_events(response)[-1][1]["conversation_id"]

    saved = conversation_service.get_conversation(cid, TEST_CLIENT_ID)
    assert [m.content for m in saved.messages] == ["질문", "".join(streaming.pieces)]


def test_이어지는_스트리밍이_같은_대화에_붙는다(client, db, streaming):
    first = read_events(client.post("/api/chat/stream", json={"message": "첫 질문"}))[-1][1]
    second = read_events(
        client.post(
            "/api/chat/stream",
            json={"message": "두 번째", "conversation_id": first["conversation_id"]},
        )
    )[-1][1]
    assert second["conversation_id"] == first["conversation_id"]


def test_usage를_요청한다(client, db, streaming):
    """스트리밍은 기본적으로 usage를 안 준다. 명시하지 않으면 토큰 표시와
    비용 로그가 스트리밍 경로에서만 사라진다."""
    client.post("/api/chat/stream", json={"message": "질문"})
    assert streaming.calls[-1]["stream"] is True
    assert streaming.calls[-1]["stream_options"] == {"include_usage": True}


def test_도중에_터지면_error_이벤트로_알린다(client, db, monkeypatch):
    """스트림이 시작된 뒤에는 HTTP 상태로 실패를 알릴 수 없다. 이벤트가 없으면
    프론트는 '답이 조용히 끊긴 것'과 구분하지 못한다."""
    from app.services import chat_service

    def explode(*args, **kwargs):
        yield "delta", "시작은 했는데"
        raise RuntimeError("끊김")

    monkeypatch.setattr(chat_service, "stream", explode)
    events = read_events(client.post("/api/chat/stream", json={"message": "질문"}))
    assert [k for k, _ in events] == ["delta", "error"]


def test_리포트_모드는_스트리밍에서도_상한이_다르다(client, db, streaming):
    client.post(
        "/api/chat/stream",
        json={"message": "질문", "context": {"topic": "공급 밀도", "mode": "report"}},
    )
    assert streaming.calls[-1]["max_tokens"] == config.REPORT_MAX_TOKENS


def test_빈_메시지는_스트림을_열지도_않는다(client, db, streaming):
    assert client.post("/api/chat/stream", json={"message": "  "}).status_code == 422
    assert streaming.calls == []
