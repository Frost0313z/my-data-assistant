"""B4 트렌드 판정 — 판정만 주지 않고 근거 수치를 함께 준다."""

import pytest

from app.services.data_service import _trend


def make(points, per_period=1):
    """시점별 값을 레코드로 바꾼다. per_period > 1이면 한 시점에 여러 레코드."""
    Row = type("Row", (), {})
    records = []
    for i, total in enumerate(points):
        for _ in range(per_period):
            r = Row()
            r.date = f"2025-{i + 1:02d}-01"
            r.value = total / per_period
            records.append(r)
    return records


@pytest.mark.parametrize(
    "points, expected",
    [
        ([100, 110, 120, 130], "상승"),
        ([130, 120, 110, 100], "하락"),
        ([100, 100, 100, 100], "유지"),
        ([100, 101, 100, 101], "유지"),  # 시점당 0.5% 미만
    ],
)
def test_방향_판정(points, expected):
    assert _trend(make(points))[0] == expected


def test_모든_시점을_쓴다():
    """회귀가 앞뒤 절반 비교보다 나은 지점은 '이상치에 강하다'가 아니라
    '모든 점을 쓴다'이다.

    아래 배치는 앞 절반 평균(100.7)과 뒤 절반 평균(101.3)이 거의 같아 옛 방식이면
    '유지'로 읽힌다. 그런데 값은 처음부터 끝까지 꾸준히 오르고 있다."""
    steady_rise = [100, 101, 101, 101, 101, 102]
    trend, slope, _ = _trend(make(steady_rise))
    assert slope > 0
    assert trend in ("상승", "유지")  # 기울기 자체는 양수로 잡힌다


def test_큰_이상치는_기울기를_끌어당긴다():
    """최소제곱의 알려진 한계다. 숨기지 않고 여기 적어 둔다 —
    한 시점이 4배로 튀면 방향 판정이 뒤집힐 수 있다.

    이 데이터에서 실제로 있었던 일이다: 2024년 4개 시점은 자료 수집범위 단절로
    2024-12에 +17% 급증했고, 그래서 **분석에서 통째로 제외**했다(insights.md 머리말).
    즉 이 한계는 데이터를 고르는 단계에서 이미 다뤄졌다."""
    steady = [100, 102, 104, 106, 108, 110]
    spiked = [100, 102, 400, 106, 108, 110]
    assert _trend(make(steady))[0] == "상승"
    assert _trend(make(spiked))[0] == "하락"  # 튐 하나가 뒤집는다


def test_한_시점에_여러_레코드가_있어도_기울기가_같다():
    """한 시점에 82개 행정동이 들어 있다. 레코드를 그대로 점으로 쓰면 같은 날짜가
    82번 반복돼 기울기가 뜻을 잃는다."""
    one = _trend(make([100, 110, 120, 130], per_period=1))
    many = _trend(make([100, 110, 120, 130], per_period=82))
    assert one[0] == many[0]
    assert one[1] == pytest.approx(many[1], rel=1e-6)


def test_근거_수치를_함께_준다():
    trend, slope, change = _trend(make([100, 110, 120, 130]))
    assert trend == "상승"
    assert slope == pytest.approx(10.0)          # 시점당 +10
    assert change == pytest.approx(30.0)         # 처음 대비 +30%


def test_시점이_하나면_판단을_보류한다():
    """한 점으로는 기울기를 낼 수 없다. '유지'라고 하면 없는 근거를 만드는 것이다."""
    assert _trend(make([100]))[0] == "판단 보류"


def test_요약_응답에_근거가_실린다(client, db):
    for date, value in [("2025-03-01", 100), ("2025-04-01", 110), ("2025-05-01", 120)]:
        client.post("/api/data", json={"date": date, "value": value})
    metrics = client.get("/api/data/summary").json()["metrics"]
    assert metrics["slope_per_period"] == pytest.approx(10.0)
    assert metrics["change_pct"] == pytest.approx(20.0)


def test_실제_데이터의_성장률이_상승으로_읽힌다():
    """판정 경계(시점당 0.5%)가 이 데이터에 맞는지 본다.
    실제 총 업소는 6시점에 77,904 -> 80,704 (+3.59%)다."""
    trend, _, change = _trend(make([77904, 78500, 79100, 79700, 80200, 80704]))
    assert trend == "상승"
    assert change == pytest.approx(3.59, abs=0.01)
