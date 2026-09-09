"""B2 구조 필드 · B3 요약 필터."""

import pytest

RECORDS = [
    {"date": "2025-03-01", "value": 100, "district": "동구", "dong": "중앙동", "industry": "소매업"},
    {"date": "2025-06-01", "value": 120, "district": "동구", "dong": "중앙동", "industry": "소매업"},
    {"date": "2025-03-01", "value": 50, "district": "서구", "dong": "둔산1동", "industry": "음식점업"},
    {"date": "2026-06-01", "value": 80, "district": "서구", "dong": "둔산1동", "industry": "음식점업"},
    # 예전 레코드처럼 구조 필드가 없는 것도 섞는다
    {"date": "2025-03-01", "value": 10, "memo": "옛 레코드"},
]


@pytest.fixture
def seeded(client):
    for r in RECORDS:
        assert client.post("/api/data", json=r).status_code == 200
    return client


def test_구조_필드가_왕복한다(seeded):
    row = next(r for r in seeded.get("/api/data").json() if r["dong"] == "중앙동")
    assert (row["district"], row["dong"], row["industry"]) == ("동구", "중앙동", "소매업")


def test_구조_필드가_없어도_저장된다(seeded):
    """예전 레코드에는 이 필드가 없다. 필수로 바꾸면 전부 읽히지 않는다."""
    row = next(r for r in seeded.get("/api/data").json() if r["memo"] == "옛 레코드")
    assert row["district"] == "" and row["dong"] == "" and row["industry"] == ""


@pytest.mark.parametrize(
    "query, count, total",
    [
        ("", 5, 360),
        ("?district=동구", 2, 220),
        ("?district=서구", 2, 130),
        ("?dong=중앙동", 2, 220),
        ("?industry=음식점업", 2, 130),
        ("?district=동구&industry=소매업", 2, 220),
        ("?date_from=2025-06-01", 2, 200),
        ("?date_to=2025-03-01", 3, 160),
        ("?date_from=2025-03-01&date_to=2025-06-01", 4, 280),
        ("?district=동구&dong=둔산1동", 0, 0),
    ],
)
def test_필터별_집계(seeded, query, count, total):
    summary = seeded.get(f"/api/data/summary{query}").json()
    assert summary["count"] == count
    if count:
        assert summary["metrics"]["total"] == total


def test_부분_일치로_잡지_않는다(seeded):
    """`중구`가 `유성구`를, `동구`가 `대덕구`를 잡으면 안 된다."""
    assert seeded.get("/api/data/summary?district=구").json()["count"] == 0
    assert seeded.get("/api/data/summary?dong=중앙").json()["count"] == 0


def test_아무것도_못_잡으면_그렇게_말한다(seeded):
    """데이터가 아예 없는 것과 조건이 안 맞는 것은 다른 상황이다."""
    summary = seeded.get("/api/data/summary?district=없는구").json()
    assert summary["count"] == 0
    assert summary["trend"] == "조건에 맞는 데이터 없음"


def test_잘못된_날짜_형식은_422(seeded):
    assert seeded.get("/api/data/summary?date_from=2025-3-1").status_code == 422


def test_필터가_없으면_예전과_같다(seeded):
    assert seeded.get("/api/data/summary").json() == seeded.get("/api/data/summary?district=").json()


def test_필터_요약은_캐시를_쓰지_않는다(seeded, db, monkeypatch):
    """조합이 많아 캐시가 메모리만 먹고 잘 안 맞는다."""
    from app.services import data_service

    calls = []
    original = data_service.list_records
    monkeypatch.setattr(data_service, "list_records", lambda: (calls.append(1), original())[1])

    seeded.get("/api/data/summary?district=동구")
    seeded.get("/api/data/summary?district=동구")
    assert len(calls) == 2


def test_dimensions가_고를_수_있는_값을_준다(seeded):
    dims = seeded.get("/api/data/dimensions").json()
    assert dims["districts"] == ["동구", "서구"]
    assert dims["dongs"] == ["둔산1동", "중앙동"]
    assert dims["industries"] == ["소매업", "음식점업"]
    assert dims["dates"] == ["2025-03-01", "2025-06-01", "2026-06-01"]


def test_시드가_구조_필드를_갖는다():
    """B2. 이게 없으면 리셋 후 필터가 아무것도 못 잡는다."""
    from app.services import seed_service

    records = seed_service._load_seed()
    assert len(records) == 492
    assert all(r.get("district") and r.get("dong") and r.get("industry") for r in records)
    assert len({r["district"] for r in records}) == 5
    assert len({r["dong"] for r in records}) == 82
