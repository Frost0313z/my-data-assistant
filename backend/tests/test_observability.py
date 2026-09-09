"""C4 구조적 로깅 · 요청 ID · 비용."""

import json
import logging

import pytest

from app import config, observability


@pytest.fixture
def logs(monkeypatch):
    """JSON 한 줄씩 잡아 둔다."""
    captured = []

    class Capture(logging.Handler):
        def emit(self, record):
            captured.append(json.loads(observability.JsonFormatter().format(record)))

    handler = Capture()
    observability.logger.addHandler(handler)
    observability.logger.setLevel(logging.INFO)
    yield captured
    observability.logger.removeHandler(handler)


def test_요청마다_ID가_붙고_헤더로_돌아온다(client, logs):
    response = client.get("/api/data")
    assert response.headers["x-request-id"]
    entry = next(e for e in logs if e["message"] == "request")
    assert entry["request_id"] == response.headers["x-request-id"]
    assert entry["path"] == "/api/data" and entry["status"] == 200
    assert isinstance(entry["ms"], float)


def test_클라이언트가_보낸_요청ID를_이어받는다(client, logs):
    """프론트에서 붙인 ID를 그대로 쓰면 화면과 로그를 한 값으로 잇는다."""
    response = client.get("/api/data", headers={"x-request-id": "abc123"})
    assert response.headers["x-request-id"] == "abc123"
    assert any(e["request_id"] == "abc123" for e in logs)


def test_헬스체크는_로그를_남기지_않는다(client, logs):
    """10분마다 들어오는 콜드스타트 핑으로 로그가 채워지면 아무것도 못 찾는다."""
    client.get("/")
    assert not [e for e in logs if e.get("path") == "/"]


def test_배포본_식별자가_헬스체크에_실린다(client):
    body = client.get("/").json()
    assert body["status"] == "ok"
    assert body["build"] == config.BUILD_REV


def test_채팅은_토큰과_비용을_남긴다(client, openai, logs):
    client.post("/api/chat", json={"message": "질문", "context": {"topic": "공급 밀도"}})
    entry = next(e for e in logs if e["message"] == "chat.completed")
    # 서비스 계층 로그도 같은 요청 ID를 달아야 한 요청을 되짚을 수 있다
    assert entry["request_id"] != "-"
    assert entry["prompt_tokens"] == 100 and entry["completion_tokens"] == 20
    assert entry["model"] == config.OPENAI_MODEL
    assert entry["topic"] == "공급 밀도"
    assert entry["usd"] is not None and entry["usd"] > 0
    assert entry["truncated"] is False


def test_답변이_상한에_걸리면_표시된다(client, openai, logs, monkeypatch):
    """잘린 답변은 화면에서 '문장이 어색한' 것으로만 보인다. 로그에는 남아야 한다."""
    monkeypatch.setattr(config, "CHAT_MAX_TOKENS", 20)
    client.post("/api/chat", json={"message": "질문"})
    entry = next(e for e in logs if e["message"] == "chat.completed")
    assert entry["truncated"] is True


def test_캐시_적중이_비용을_낮춘다():
    """cached가 0으로 굳으면 프롬프트 캐시 프리픽스가 깨진 것이다."""
    model = "gpt-4o-mini"
    without = observability.estimate_cost(model, 2000, 0, 100)
    with_cache = observability.estimate_cost(model, 2000, 1024, 100)
    assert with_cache < without


def test_모르는_모델은_비용을_지어내지_않는다():
    assert observability.estimate_cost("무슨-모델", 100, 0, 10) is None


def test_로그가_JSON_한_줄이다(logs):
    observability.log("테스트", 값=1)
    entry = logs[-1]
    assert entry["message"] == "테스트" and entry["값"] == 1
    assert set(entry) >= {"time", "level", "logger", "request_id", "message"}
