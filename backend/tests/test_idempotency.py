"""스트리밍 폴백이 같은 답을 두 번 만들지 않는다 (4b P2).

**막는 상황**: 프런트는 스트리밍이 첫 글자도 못 받고 끊기면 비스트리밍으로 한 번 더
보낸다. 스트리밍 자체가 안 되는 환경에서는 그게 옳다. 문제는 **서버가 이미 답을 다
만들어 저장했는데 응답만 유실된** 경우다 — 같은 질문에 OpenAI가 두 번 불리고(돈)
대화에 턴이 두 벌 쌓인다.

수용 기준: 스트림 완료 직후 응답을 끊는 상황에서 **OpenAI 호출과 저장된
user/assistant 턴이 각각 1회**.
"""

import pytest

from app import idempotency
from conftest import TEST_CLIENT_ID, StubOpenAI


@pytest.fixture(autouse=True)
def clean():
    idempotency.reset()
    yield
    idempotency.reset()


def turns_of(client, conversation_id):
    return client.get(f"/api/conversations/{conversation_id}").json()["messages"]


def test_스트림_완료_뒤_폴백해도_한_번만_처리된다(client, db, streaming):
    """이 파일의 핵심. 스트리밍이 끝까지 돌아 저장까지 됐고, 프런트는 아무것도 못
    받은 셈 치고 같은 request_id로 비스트리밍에 다시 보낸다."""
    body = {"message": "용문동 교체율은?", "request_id": "req-1"}

    streamed = client.post("/api/chat/stream", json=body)
    assert streamed.status_code == 200
    calls_after_stream = len(streaming.calls)
    conversation_id = next(
        line[len("data: "):]
        for line in streamed.text.splitlines()
        if line.startswith("data: ") and "conversation_id" in line
    )
    assert conversation_id

    # 프런트가 첫 delta를 못 받았다고 판단하고 폴백한 상황
    replayed = client.post("/api/chat", json=body)
    assert replayed.status_code == 200

    # ① OpenAI를 다시 부르지 않았다
    assert len(streaming.calls) == calls_after_stream

    # ② 답은 그대로 돌려준다 — 사용자는 차이를 모른다
    assert replayed.json()["reply"] == "".join(streaming.pieces)

    # ③ 턴이 한 벌이다
    saved = turns_of(client, replayed.json()["conversation_id"])
    assert [m["role"] for m in saved] == ["user", "assistant"]


def test_request_id가_없으면_예전처럼_두_번_처리된다(client, db, openai):
    """반증 가능성. 키가 없으면 서버는 두 요청을 구분할 방법이 없다 —
    이게 고치기 전의 동작이고, 위 테스트가 막고 있는 것이다."""
    body = {"message": "용문동 교체율은?"}

    client.post("/api/chat", json=body)
    client.post("/api/chat", json=body)
    assert len(openai.calls) == 2  # 또 불렸다


def test_다른_질문은_따로_처리된다(client, db, openai):
    """키가 다르면 당연히 각각 처리한다. 안 그러면 두 번째 질문이 첫 답을 받는다."""
    first = client.post("/api/chat", json={"message": "질문 하나", "request_id": "a"})
    second = client.post("/api/chat", json={"message": "질문 둘", "request_id": "b"})
    assert len(openai.calls) == 2
    assert first.json()["conversation_id"] and second.json()["conversation_id"]


def test_남의_키로는_꺼낼_수_없다(client, db, openai):
    """키는 난수지만 소유자를 함께 본다. 대화 소유권과 같은 규칙이다."""
    client.post("/api/chat", json={"message": "내 질문", "request_id": "shared"})
    before = len(openai.calls)

    stranger = client.post(
        "/api/chat",
        json={"message": "남의 질문", "request_id": "shared"},
        headers={"X-Client-Id": "someone-else"},
    )
    assert stranger.status_code == 200
    assert len(openai.calls) == before + 1, "남의 결과를 그대로 받아 갔다"
    assert stranger.json()["reply"] == openai.reply


def test_실패한_요청은_기억하지_않는다(client, db, monkeypatch):
    """실패까지 기억하면 재시도가 영영 막힌다."""
    from app.services import chat_service

    class Broken(StubOpenAI):
        def create(self, **kwargs):
            raise RuntimeError("OpenAI 장애")

    monkeypatch.setattr(chat_service, "_get_client", lambda: Broken())
    # TestClient는 서버 예외를 그대로 되던진다. 500이 나갔다는 것과 같은 뜻이다.
    with pytest.raises(RuntimeError):
        client.post("/api/chat", json={"message": "질문", "request_id": "r"})

    ok = StubOpenAI()
    monkeypatch.setattr(chat_service, "_get_client", lambda: ok)
    retried = client.post("/api/chat", json={"message": "질문", "request_id": "r"})
    assert retried.status_code == 200
    assert len(ok.calls) == 1, "실패를 기억해 재시도를 막았다"


def test_기억은_무한정_쌓이지_않는다():
    """인메모리라 상한이 없으면 메모리가 샌다."""
    for i in range(idempotency.MAX_ENTRIES + 50):
        idempotency.remember(f"k{i}", "owner", "conv", "답", None)
    assert idempotency.get("k0", "owner") is None  # 오래된 것부터 밀려났다
    assert idempotency.get(f"k{idempotency.MAX_ENTRIES + 49}", "owner") is not None


def test_예약한_토큰을_재사용_요청이_또_까먹지_않는다(client, db, streaming, monkeypatch):
    """재사용은 OpenAI를 안 부르므로 일일 예산도 건드리지 않아야 한다.
    레이트리밋을 먼저 통과시키면 이미 끝난 일로 예산이 두 번 깎인다."""
    from app import config, ratelimit

    body = {"message": "질문", "request_id": "req-budget"}
    client.post("/api/chat/stream", json=body)
    used_after_stream = ratelimit.snapshot()["used"]

    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 0)
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", 1)  # 새 요청이라면 무조건 429다
    assert client.post("/api/chat", json=body).status_code == 200
    assert ratelimit.snapshot()["used"] == used_after_stream
