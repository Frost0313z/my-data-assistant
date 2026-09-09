"""C3 남용 방어 — 두 겹이 각각 다른 것을 막는다."""

import pytest

from app import config, ratelimit


@pytest.fixture(autouse=True)
def clean():
    ratelimit.reset()
    yield
    ratelimit.reset()


def test_분당_상한을_넘으면_429(client, db, openai, monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 3)
    for _ in range(3):
        assert client.post("/api/chat", json={"message": "질문"}).status_code == 200
    blocked = client.post("/api/chat", json={"message": "질문"})
    assert blocked.status_code == 429
    assert "다시 시도" in blocked.json()["detail"]
    assert int(blocked.headers["retry-after"]) > 0


def test_상한에_걸리면_OpenAI를_부르지_않는다(client, db, openai, monkeypatch):
    """막고 나서 부르면 막는 의미가 없다."""
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 1)
    client.post("/api/chat", json={"message": "질문"})
    before = len(openai.calls)
    client.post("/api/chat", json={"message": "질문"})
    assert len(openai.calls) == before


def test_1분이_지나면_다시_열린다(monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 2)
    for i in range(2):
        ratelimit.check("1.2.3.4", now=1000 + i)
    with pytest.raises(ratelimit.RateLimited):
        ratelimit.check("1.2.3.4", now=1002)
    ratelimit.check("1.2.3.4", now=1061)  # 창이 지나갔다


def test_다른_IP는_서로_영향이_없다(monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 1)
    ratelimit.check("1.1.1.1", now=1000)
    ratelimit.check("2.2.2.2", now=1000)
    with pytest.raises(ratelimit.RateLimited):
        ratelimit.check("1.1.1.1", now=1000)


def test_프록시_뒤에서는_XFF를_본다(client, db, openai, monkeypatch):
    """Render는 프록시 뒤라 client.host가 전부 같다. XFF를 안 보면 모든 사용자가
    한 양동이를 나눠 쓰게 된다."""
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 1)
    a = {"x-forwarded-for": "10.0.0.1"}
    b = {"x-forwarded-for": "10.0.0.2, 172.16.0.1"}
    assert client.post("/api/chat", json={"message": "질문"}, headers=a).status_code == 200
    assert client.post("/api/chat", json={"message": "질문"}, headers=b).status_code == 200
    assert client.post("/api/chat", json={"message": "질문"}, headers=a).status_code == 429


def test_일일_토큰_상한은_느린_반복을_막는다(monkeypatch):
    """분당 제한은 느리게 오래 두드리는 것을 못 막는다."""
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 0)  # 분당 제한은 끈다
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", 1000)
    # 시각은 전부 같은 날 안에 둔다. 날짜가 넘어가면 총량이 초기화돼(아래 테스트)
    # 이 테스트가 검증하려는 것이 사라진다.
    ratelimit.check("1.1.1.1", now=1000)
    ratelimit.record_tokens(999, now=1000)
    ratelimit.check("1.1.1.1", now=40000)  # 한참 뒤지만 아직 남았다
    ratelimit.record_tokens(2, now=40000)
    with pytest.raises(ratelimit.RateLimited) as raised:
        ratelimit.check("1.1.1.1", now=80000)
    assert "오늘" in raised.value.message


def test_날짜가_바뀌면_토큰이_초기화된다(monkeypatch):
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", 100)
    ratelimit.record_tokens(200, now=0)
    with pytest.raises(ratelimit.RateLimited):
        ratelimit.check("1.1.1.1", now=0)
    ratelimit.check("1.1.1.1", now=86400 + 1)  # 다음 날


def test_실제_사용량이_총량에_쌓인다(client, db, openai):
    before = ratelimit.snapshot()["used"]
    client.post("/api/chat", json={"message": "질문"})
    assert ratelimit.snapshot()["used"] == before + 120  # 스텁 usage


def test_스트리밍도_총량에_쌓인다(client, db, streaming):
    """스트리밍만 빼먹으면 이 경로로는 상한이 없는 것과 같다."""
    before = ratelimit.snapshot()["used"]
    client.post("/api/chat/stream", json={"message": "질문"})
    assert ratelimit.snapshot()["used"] == before + 1730


def test_0이면_그_겹을_끈다(monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 0)
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", 0)
    for i in range(50):
        ratelimit.check("1.1.1.1", now=1000)
        ratelimit.record_tokens(10_000, now=1000)


def test_데이터_조회는_제한하지_않는다(client, db, monkeypatch):
    """돈이 나가는 것은 채팅뿐이다. 요약을 막으면 화면이 그냥 죽는다."""
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 1)
    for _ in range(5):
        assert client.get("/api/data/summary").status_code == 200
