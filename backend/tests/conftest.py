"""테스트 공용 준비물.

원칙 하나: **실제 Firestore와 OpenAI를 절대 부르지 않는다.** 돈이 나가고 데모 데이터가
오염된다. 서비스 모듈은 `from ..firestore_client import get_db`로 이름을 바인딩해 두므로,
`firestore_client` 쪽만 갈아 끼우면 안 먹는다 — 각 서비스 모듈의 이름을 직접 바꾼다.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fake_firestore import FakeFirestore  # noqa: E402


@pytest.fixture
def db(monkeypatch):
    """빈 메모리 DB. 서비스들이 이걸 보게 만든다."""
    from app.services import conversation_service, data_service, seed_service

    fake = FakeFirestore()
    for module in (conversation_service, data_service, seed_service):
        monkeypatch.setattr(module, "get_db", lambda: fake)
    # 요약 캐시와 남용 방어 카운터는 프로세스 전역이라 DB를 갈아 끼워도 남는다.
    # 안 비우면 앞 테스트가 다음 테스트로 새어 들어간다 — 실제로 채팅 테스트가
    # 누적 10회를 넘기며 뒤쪽이 통째로 429가 났다.
    from app import ratelimit

    data_service.invalidate_summary_cache()
    ratelimit.reset()
    return fake


class StubUsage:
    prompt_tokens = 100
    completion_tokens = 20
    total_tokens = 120


class StubOpenAI:
    """마지막으로 받은 요청을 남겨 둔다 — 프롬프트에 무엇이 들어갔는지 검사하려고."""

    def __init__(self, reply="테스트 답변"):
        self.reply = reply
        self.calls = []
        self.chat = self

    @property
    def completions(self):
        return self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        message = type("M", (), {"content": self.reply})()
        choice = type("C", (), {"message": message})()
        return type("R", (), {"choices": [choice], "usage": StubUsage()})()

    @property
    def system_prompt(self):
        return self.calls[-1]["messages"][0]["content"]


@pytest.fixture
def openai(monkeypatch):
    from app.services import chat_service

    stub = StubOpenAI()
    monkeypatch.setattr(chat_service, "_get_client", lambda: stub)
    return stub


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient

    from main import app

    return TestClient(app)


class StreamChunk:
    def __init__(self, content=None, usage=None):
        delta = type("D", (), {"content": content})()
        self.choices = [type("C", (), {"delta": delta})()] if content is not None else []
        self.usage = usage


class StreamUsage:
    prompt_tokens = 1700
    completion_tokens = 30
    total_tokens = 1730
    prompt_tokens_details = type("P", (), {"cached_tokens": 1024})()


@pytest.fixture
def streaming(monkeypatch):
    """OpenAI 스트리밍 응답 대역. 실제 호출은 하지 않는다."""
    from app.services import chat_service

    pieces = ["## 요약\n", "대전 상권은 ", "완만히 늘었다."]
    calls = []

    class Stub:
        chat = property(lambda self: self)

        @property
        def completions(self):
            return self

        def create(self, **kwargs):
            calls.append(kwargs)
            return iter([StreamChunk(p) for p in pieces] + [StreamChunk(usage=StreamUsage())])

    stub = Stub()
    monkeypatch.setattr(chat_service, "_get_client", lambda: stub)
    stub.calls = calls
    stub.pieces = pieces
    return stub
