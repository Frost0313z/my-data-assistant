"""데이터 CRUD와 요약."""

import pytest

RECORD = {"date": "2025-03-01", "value": 100, "memo": "정상"}


def test_생성_조회_수정_삭제_왕복(client):
    created = client.post("/api/data", json=RECORD).json()
    assert created["value"] == 100 and created["id"]

    assert [r["id"] for r in client.get("/api/data").json()] == [created["id"]]

    updated = client.put(f"/api/data/{created['id']}", json={**RECORD, "value": 200})
    assert updated.status_code == 200 and updated.json()["value"] == 200

    assert client.delete(f"/api/data/{created['id']}").status_code == 200
    assert client.get("/api/data").json() == []


def test_없는_id_수정은_404이고_레코드를_만들지_않는다(client):
    """Firestore set()은 문서를 만든다. 존재 확인이 없으면 오타 난 id로 보낸 PUT이
    그 id를 가진 레코드를 새로 만들고 200을 돌려준다 — 실제로 그랬다."""
    assert client.put("/api/data/없는id", json=RECORD).status_code == 404
    assert client.get("/api/data").json() == []


def test_없는_id_삭제는_404(client):
    assert client.delete("/api/data/없는id").status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"date": "2025-3-1", "value": 1},
        {"date": "2025-02-30", "value": 1},
        {"date": "2025-03-01", "value": 1e18},
        {"date": "2025-03-01", "value": 1, "memo": "x" * 5000},
    ],
    ids=["날짜형식", "없는날짜", "값상한", "메모길이"],
)
def test_잘못된_입력은_422(client, payload):
    assert client.post("/api/data", json=payload).status_code == 422


# Inf/NaN은 json= 으로 못 보낸다(직렬화 자체가 막힌다). 원문으로 보내야 한다 —
# 파이썬 json 파서는 `Infinity`를 받아들이므로 이 경로가 실제로 서버까지 닿았다.
@pytest.mark.parametrize("literal", ["Infinity", "-Infinity", "NaN"], ids=["Inf", "-Inf", "NaN"])
def test_비유한_숫자는_500이_아니라_422로_돌아온다(client, literal):
    """검증 에러 payload에 Inf가 그대로 실리면 422 응답 직렬화가 500으로 터진다.
    `main._json_safe`가 문자열로 바꿔 준다 — 그게 없으면 이 테스트가 500을 본다."""
    response = client.post(
        "/api/data",
        content=f'{{"date":"2025-03-01","value":{literal}}}',
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 422, response.text
    assert response.json()["detail"]


def test_요약은_기간과_추세를_계산한다(client):
    for date, value in [("2025-03-01", 10), ("2025-04-01", 20), ("2025-05-01", 40)]:
        client.post("/api/data", json={"date": date, "value": value})

    summary = client.get("/api/data/summary").json()
    assert summary["count"] == 3
    assert summary["period"] == "2025-03-01 ~ 2025-05-01"
    assert summary["metrics"]["max"] == 40 and summary["metrics"]["min"] == 10
    assert summary["trend"] == "상승"


def test_데이터가_없으면_요약이_터지지_않는다(client):
    summary = client.get("/api/data/summary").json()
    assert summary["count"] == 0 and summary["trend"] == "데이터 없음"
