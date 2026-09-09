"""D3 시드 리셋 — 파괴적인 엔드포인트라 잠금이 먼저다."""

import pytest

from app import config
from app.services import seed_service

# HTTP 헤더는 latin-1만 실을 수 있다. 토큰은 ASCII여야 한다.
TOKEN = "test-token-1234"


@pytest.fixture
def unlocked(monkeypatch):
    monkeypatch.setattr(config, "DEV_RESET_TOKEN", TOKEN)


def test_토큰이_없으면_엔드포인트가_아예_없는_것처럼_404(client, monkeypatch):
    """503으로 '여기 있는데 꺼져 있다'고 알려 주면 두드릴 곳을 광고하는 셈이다."""
    monkeypatch.setattr(config, "DEV_RESET_TOKEN", "")
    assert client.post("/api/dev/reset").status_code == 404


def test_틀린_토큰은_403이고_데이터를_건드리지_않는다(client, unlocked):
    client.post("/api/data", json={"date": "2025-03-01", "value": 1})
    assert client.post("/api/dev/reset", headers={"X-Dev-Token": "wrong"}).status_code == 403
    assert len(client.get("/api/data").json()) == 1


def test_토큰이_없는_요청도_403(client, unlocked):
    assert client.post("/api/dev/reset").status_code == 403


def test_리셋하면_시드_상태로_돌아간다(client, unlocked):
    seed_count = len(seed_service._load_seed())

    # 리뷰어가 망가뜨린 상황을 만든다
    client.post("/api/data", json={"date": "2099-01-01", "value": 12345, "memo": "쓰레기"})
    client.post(
        "/api/conversations", json={"title": "앞사람 대화", "messages": []}
    )

    result = client.post("/api/dev/reset", headers={"X-Dev-Token": TOKEN}).json()
    assert result["seeded"] == seed_count
    assert result["removed_data"] == 1
    assert result["removed_conversations"] == 1

    # 기준 상태: conversations 0 / data = 시드 수
    assert len(client.get("/api/data").json()) == seed_count
    assert client.get("/api/conversations").json() == []
    assert not [r for r in client.get("/api/data").json() if r["memo"] == "쓰레기"]


def test_리셋_직후_요약이_바로_맞는다(client, unlocked):
    """캐시를 안 비우면 리셋해 놓고도 30초간 옛 요약이 보인다."""
    client.post("/api/data", json={"date": "2099-01-01", "value": 1})
    assert client.get("/api/data/summary").json()["count"] == 1

    client.post("/api/dev/reset", headers={"X-Dev-Token": TOKEN})
    assert client.get("/api/data/summary").json()["count"] == len(seed_service._load_seed())


def test_시드_파일이_기준_상태와_일치한다():
    """기준 상태는 data 492건이다. 시드가 달라지면 복구가 복구가 아니게 된다."""
    assert len(seed_service._load_seed()) == 492
