"""C5 요약 캐시 — 읽기를 줄이되 화면이 어긋나지 않아야 한다."""

from app.services import data_service


def count_reads(db, monkeypatch):
    """Firestore 컬렉션을 몇 번 통째로 읽는지 센다."""
    calls = []
    original = data_service.list_records
    monkeypatch.setattr(
        data_service, "list_records", lambda: (calls.append(1), original())[1]
    )
    return calls


def test_두_번째_요약은_다시_읽지_않는다(client, db, monkeypatch):
    client.post("/api/data", json={"date": "2025-03-01", "value": 10})
    reads = count_reads(db, monkeypatch)

    first = client.get("/api/data/summary").json()
    second = client.get("/api/data/summary").json()

    assert first == second
    assert len(reads) == 1, f"캐시가 안 먹었다 — 읽기 {len(reads)}회"


def test_데이터를_고치면_요약이_즉시_따라온다(client, db):
    """TTL을 기다리게 두면 사용자가 방금 추가한 값이 요약에 안 보인다."""
    client.post("/api/data", json={"date": "2025-03-01", "value": 10})
    assert client.get("/api/data/summary").json()["count"] == 1

    client.post("/api/data", json={"date": "2025-04-01", "value": 20})
    assert client.get("/api/data/summary").json()["count"] == 2

    record_id = client.get("/api/data").json()[0]["id"]
    client.delete(f"/api/data/{record_id}")
    assert client.get("/api/data/summary").json()["count"] == 1

    client.put(
        f"/api/data/{client.get('/api/data').json()[0]['id']}",
        json={"date": "2025-04-01", "value": 999},
    )
    assert client.get("/api/data/summary").json()["metrics"]["max"] == 999


def test_TTL이_지나면_다시_읽는다(client, db, monkeypatch):
    client.post("/api/data", json={"date": "2025-03-01", "value": 10})
    monkeypatch.setattr(data_service.config, "SUMMARY_CACHE_TTL", 0)
    reads = count_reads(db, monkeypatch)

    client.get("/api/data/summary")
    client.get("/api/data/summary")
    assert len(reads) == 2


def test_채팅이_요약을_반복해_읽지_않는다(client, db, openai, monkeypatch):
    """요약을 매 채팅마다 다시 계산하던 것이 C5의 출발점이다."""
    client.post("/api/data", json={"date": "2025-03-01", "value": 10})
    reads = count_reads(db, monkeypatch)

    for _ in range(3):
        client.post("/api/chat", json={"message": "질문"})

    assert len(reads) == 1, f"채팅 3회에 읽기 {len(reads)}회"
