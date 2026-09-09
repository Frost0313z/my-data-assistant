"""C7 에러 트래킹 — DSN 없이도 돌아야 하고, 켜지면 사용자 질문이 새면 안 된다."""

from app import config, observability


def test_DSN이_없으면_켜지_않는다(monkeypatch):
    """계정 없이도 서비스가 돌아야 한다."""
    monkeypatch.setattr(config, "SENTRY_DSN", "")
    assert observability.init_error_tracking() == "off"


def test_SDK가_없으면_앱을_죽이지_않는다(monkeypatch):
    """무료 티어 배포에서 의존성 하나가 빠졌다고 서비스 전체가 죽으면 안 된다."""
    import builtins

    monkeypatch.setattr(config, "SENTRY_DSN", "https://x@example.invalid/1")
    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "sentry_sdk":
            raise ImportError("없음")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    assert observability.init_error_tracking() == "missing"


def test_요청_본문은_이벤트에서_제거된다():
    """사용자의 질문이 그대로 실려 나가면 안 된다."""
    event = {
        "request": {
            "data": {"message": "내 가게 주소는 대전 중구 …"},
            "headers": {"X-Dev-Token": "비밀", "User-Agent": "test"},
        }
    }
    scrubbed = observability._scrub(event, None)
    assert "data" not in scrubbed["request"]
    assert scrubbed["request"]["headers"]["X-Dev-Token"] == "[제거됨]"
    assert scrubbed["request"]["headers"]["User-Agent"] == "test"


def test_브레드크럼의_민감한_값도_지운다():
    event = {
        "breadcrumbs": {
            "values": [{"data": {"message": "질문 내용", "path": "/api/chat"}}]
        }
    }
    scrubbed = observability._scrub(event, None)
    data = scrubbed["breadcrumbs"]["values"][0]["data"]
    assert data["message"] == "[제거됨]"
    assert data["path"] == "/api/chat"


def test_빈_이벤트도_터지지_않는다():
    assert observability._scrub({}, None) == {}
