"""시작 로그 — 설정이 안 먹은 것을 로그 한 줄로 알아채기 위한 장치."""

import json
import logging

import pytest

from app import config, observability


@pytest.fixture
def logs():
    captured = []

    class Capture(logging.Handler):
        def emit(self, record):
            captured.append(json.loads(observability.JsonFormatter().format(record)))

    handler = Capture()
    observability.logger.addHandler(handler)
    observability.logger.setLevel(logging.INFO)
    yield captured
    observability.logger.removeHandler(handler)


def announce():
    from main import announce_config

    announce_config()


def test_시작_로그가_실효_설정을_남긴다(logs):
    """CHAT_MAX_TOKENS가 .env에 덮여 답변이 계속 잘리던 적이 있다.
    실효값이 로그에 있으면 '왜 안 바뀌지'를 한 줄로 끝낼 수 있다."""
    announce()
    entry = next(e for e in logs if e["message"] == "startup")
    assert entry["chat_max_tokens"] == config.CHAT_MAX_TOKENS
    assert entry["report_max_tokens"] == config.REPORT_MAX_TOKENS
    assert entry["history_max_messages"] == config.HISTORY_MAX_MESSAGES
    assert entry["build"] == config.BUILD_REV
    assert entry["model"] == config.OPENAI_MODEL


def test_리셋_토큰_여부는_남기되_값은_남기지_않는다(logs, monkeypatch):
    monkeypatch.setattr(config, "DEV_RESET_TOKEN", "비밀토큰")
    announce()
    entry = next(e for e in logs if e["message"] == "startup")
    assert entry["dev_reset"] == "on"
    assert "비밀토큰" not in json.dumps(entry, ensure_ascii=False)


def test_CORS가_와일드카드면_경고를_남긴다(logs, monkeypatch):
    """기본값을 좁히면 ALLOWED_ORIGINS가 빠진 배포가 조용히 죽는다.
    좁히는 대신 시끄럽게 한다."""
    monkeypatch.setattr(config, "CORS_IS_WILDCARD", True)
    announce()
    assert any(e["message"] == "cors.wildcard" and e["level"] == "WARNING" for e in logs)


def test_오리진을_지정했으면_경고하지_않는다(logs, monkeypatch):
    monkeypatch.setattr(config, "CORS_IS_WILDCARD", False)
    monkeypatch.setattr(config, "ALLOWED_ORIGINS", ["https://example.com"])
    announce()
    assert not [e for e in logs if e["message"] == "cors.wildcard"]
    entry = next(e for e in logs if e["message"] == "startup")
    assert entry["allowed_origins"] == ["https://example.com"]
