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
    from app.services import conversation_service, data_service

    fake = FakeFirestore()
    for module in (conversation_service, data_service):
        monkeypatch.setattr(module, "get_db", lambda: fake)
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
