"""C3 남용 방어 — 두 겹이 각각 다른 것을 막는다."""

import threading

import pytest

from app import config, ratelimit
from conftest import StubOpenAI


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
    assert ratelimit.snapshot()["reserved"] == 0


def test_예약한_토큰까지_합쳐_상한을_넘기면_막는다(monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 0)
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", 100)

    ratelimit.check("1.1.1.1", reservation=60, now=1000)
    with pytest.raises(ratelimit.RateLimited):
        ratelimit.check("2.2.2.2", reservation=50, now=1000)

    assert ratelimit.snapshot()["reserved"] == 60
    ratelimit.settle(60, 40, now=1000)
    assert ratelimit.snapshot()["used"] == 40
    assert ratelimit.snapshot()["reserved"] == 0
    ratelimit.check("2.2.2.2", reservation=60, now=1000)


def test_진짜_동시_요청에서_두_번째는_429다(client, db, monkeypatch):
    """단위 테스트(위)는 "정산하지 않음"으로 동시성을 흉내 낸다. 여기서는
    **실제로 겹치게** 한다 — 첫 요청이 OpenAI 안에서 멈춰 있는 동안 두 번째가 들어온다.

    이게 이 항목의 원래 지적이다: 예산 확인은 요청 **전**, 토큰 누적은 요청 **후**라서
    예약이 없으면 둘 다 통과하고 상한을 넘긴다.
    """
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 0)
    # 예약 하나(= 출력 상한 + 입력 추정)는 통과하고 둘은 못 지나가게 잡는다.
    reserve = config.CHAT_MAX_TOKENS + config.CHAT_INPUT_TOKEN_RESERVE
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", reserve + 10)

    entered, release = threading.Event(), threading.Event()

    class BlockingOpenAI(StubOpenAI):
        def create(self, **kwargs):
            entered.set()
            release.wait(timeout=5)
            return super().create(**kwargs)

    from app.services import chat_service

    monkeypatch.setattr(chat_service, "_get_client", lambda: BlockingOpenAI())

    first: list = []
    thread = threading.Thread(
        target=lambda: first.append(client.post("/api/chat", json={"message": "질문"}))
    )
    thread.start()
    assert entered.wait(timeout=5), "첫 요청이 OpenAI에 닿지 않았다"

    # 첫 요청이 아직 정산되지 않은 이 순간이 정확히 문제의 창이다.
    second = client.post("/api/chat", json={"message": "질문"})
    assert second.status_code == 429
    assert int(second.headers["retry-after"]) > 0

    release.set()
    thread.join(timeout=5)
    assert first[0].status_code == 200


def test_예약이_없으면_같은_상황에서_둘_다_통과한다(monkeypatch):
    """위 테스트가 무엇을 막고 있는지 반대로 보여 준다. 예약을 0으로 두면
    (= 고치기 전 동작) 두 요청이 모두 통과해 상한을 넘긴다."""
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 0)
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", 100)

    ratelimit.check("1.1.1.1", reservation=0, now=1000)
    ratelimit.check("2.2.2.2", reservation=0, now=1000)  # 막히지 않는다
    ratelimit.settle(0, 80, now=1000)
    ratelimit.settle(0, 80, now=1000)
    assert ratelimit.snapshot()["used"] == 160 > 100  # 상한을 넘겼다


def test_완료_후_누적_사용량이_상한을_넘지_않는다(client, db, openai, monkeypatch):
    """수용 기준의 뒷부분. 막힐 때까지 계속 두드려도 실제 사용량이 상한 아래다.

    예산을 **"예약 하나 + 여유 조금"** 으로 잡는다. 넉넉하게 잡으면 요청마다
    바로 정산돼(순차 호출이라) 예약이 쌓이지 않아 영영 안 막히고, 그러면 이
    테스트는 통과해도 아무것도 증명하지 않는다 — 실제로 그렇게 짰다가 걸렸다.
    """
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 0)
    reserve = config.CHAT_MAX_TOKENS + config.CHAT_INPUT_TOKEN_RESERVE
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", reserve + 500)

    blocked = 0
    for _ in range(20):
        if client.post("/api/chat", json={"message": "질문"}).status_code == 429:
            blocked += 1
    assert blocked, "상한에 걸린 요청이 하나도 없으면 이 테스트는 아무것도 검증하지 않는다"

    snap = ratelimit.snapshot()
    assert snap["used"] <= config.DAILY_TOKEN_BUDGET
    assert snap["reserved"] == 0, "끝난 요청의 예약이 남아 있으면 예산이 조금씩 잠긴다"


def test_실패한_요청의_예약은_반납한다(monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 0)
    monkeypatch.setattr(config, "DAILY_TOKEN_BUDGET", 100)

    ratelimit.check("1.1.1.1", reservation=100, now=1000)
    ratelimit.settle(100, 0, now=1000)
    ratelimit.check("2.2.2.2", reservation=100, now=1000)


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


def test_XFF_첫_항목을_위조해도_제한을_못_피한다(client, db, openai, monkeypatch):
    """이게 이 방어의 핵심이다.

    XFF는 클라이언트가 마음대로 채워 보낼 수 있다. 첫 항목을 키로 쓰면 요청마다
    다른 값을 넣어 분당 제한을 무한히 우회하고 일일 예산을 태울 수 있다.
    신뢰하는 프록시가 붙이는 것은 오른쪽 끝이므로 거기를 봐야 한다.
    """
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 1)
    monkeypatch.setattr(config, "TRUSTED_PROXY_HOPS", 1)
    # 같은 클라이언트(10.0.0.9)가 앞부분만 바꿔 가며 두 번 보낸다.
    first = {"x-forwarded-for": "1.1.1.1, 10.0.0.9"}
    spoofed = {"x-forwarded-for": "2.2.2.2, 10.0.0.9"}
    assert client.post("/api/chat", json={"message": "질문"}, headers=first).status_code == 200
    assert client.post("/api/chat", json={"message": "질문"}, headers=spoofed).status_code == 429


def test_프록시가_없으면_XFF를_아예_믿지_않는다(client, db, openai, monkeypatch):
    monkeypatch.setattr(config, "CHAT_RATE_PER_MINUTE", 1)
    monkeypatch.setattr(config, "TRUSTED_PROXY_HOPS", 0)
    assert client.post("/api/chat", json={"message": "질문"}, headers={"x-forwarded-for": "1.1.1.1"}).status_code == 200
    assert client.post("/api/chat", json={"message": "질문"}, headers={"x-forwarded-for": "2.2.2.2"}).status_code == 429
