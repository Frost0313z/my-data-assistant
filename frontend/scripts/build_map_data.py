"""기존 대시보드의 대전 지도 데이터만 추출한다 (외부 스크립트 실행 없음)."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

SOURCE = "https://frost0313z.github.io/daejeon-commercial-analysis/interactive-dashboard.html"


def extract(raw):
    data, _ = json.JSONDecoder().raw_decode(raw.decode("utf-8").split("const data=", 1)[1])
    features = data["dongBoundaries"]["features"]
    codes = {f["properties"]["dong_code"] for f in features}
    assert len(features) == len(codes) == 82, "행정동 경계는 중복 없이 82개여야 합니다"
    periods = data["mapPeriods"]
    for period in periods:
        rows = data["dongMetrics"][period]
        assert len(rows) == 82 and {r["dong_code"] for r in rows} == codes
        assert all(r["density"] >= 0 for r in rows)

    # A23: dongMetrics에 없는 두 지표를 붙인다.
    #  stores   등록 업소 수(절대값) — 밀도는 상주인구로 나눈 값이라 원도심에서 왜곡된다.
    #           중앙동은 밀도 1위지만 실제 개수로는 전체의 2.4%다. 둘을 함께 보여야 한다.
    #  turnover 교체율 = 15개월간 (이탈 + 진입) ÷ 시작 업소 수.
    #           시점별 값이 아니라 전 기간 단일 값이라 모든 시점 행에 같은 값을 넣는다.
    #           화면에서 기간 선택이 이 지표에는 영향이 없다고 밝혀야 한다.
    stores = data["dongs"]
    by_dong = data["dongTurnover"]["byDong"]
    first = periods[0]
    metrics = {}
    for period in periods:
        out = []
        for row in data["dongMetrics"][period]:
            name = f"{row['district']} {row['dong']}"
            assert name in stores, f"업소 수에 없는 행정동: {name}"
            base = stores[name][first]
            flow = by_dong.get(name)
            turnover = (
                round((sum(flow["left"]) + sum(flow["entered"])) / base * 100, 1)
                if flow and base
                else None
            )
            out.append({**row, "stores": stores[name][period], "turnover": turnover})
        assert all(r["stores"] >= 0 for r in out)
        metrics[period] = out

    return {
        "source": SOURCE,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "periods": periods,
        "turnoverRange": [periods[0], periods[-1]],
        "boundaries": data["dongBoundaries"],
        "districts": data["boundaries"],
        "metrics": metrics,
    }


def extract_points(raw):
    """A25: 업종별 점포 위치. 행정동 평균으로는 안 보이는 실제 상권 덩어리를 보여준다.

    최신 1시점만 담는다. 6시점 전부면 1.2MB라 지도 데이터가 1.5MB가 되는데,
    roadmap 리스크 표에 이미 "대시보드 1.8MB 단일 파일"이 올라 있다. 같은 실수를
    반복하지 않는다. 시점별 점 이동을 보여줄 근거도 아직 없다.

    별도 파일로 뺀 이유는 지연 로드다. 첫 화면은 코로플레스만으로 성립하고,
    점 레이어는 사용자가 켤 때 받으면 된다.
    """
    data, _ = json.JSONDecoder().raw_decode(raw.decode("utf-8").split("const data=", 1)[1])
    period = data["mapPeriods"][-1]
    points = data["mapPoints"][period]
    total = sum(p["count"] for p in points)
    assert total > 0 and all(p["count"] > 0 for p in points)
    categories = sorted({p["category"] for p in points})
    # 좌표는 5자리(약 1m)까지 필요 없다. 4자리(약 11m)면 점 분포를 읽는 데 충분하다.
    rows = [
        [round(p["lon"], 4), round(p["lat"], 4), categories.index(p["category"]), p["count"]]
        for p in points
    ]
    return {
        "source": SOURCE,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "period": period,
        "categories": categories,
        "total": total,
        # [lon, lat, 업종 인덱스, 점포 수] — 키 이름을 반복하지 않아 파일이 절반이 된다.
        "points": rows,
    }


if __name__ == "__main__":
    raw = urlopen(SOURCE, timeout=30).read()
    base = Path(__file__).resolve().parents[1] / "data"
    base.mkdir(exist_ok=True)

    result = extract(raw)
    target = base / "daejeon-map.json"
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"대전 82개 행정동 × {len(result['periods'])}개 시점 저장: {target.name}")

    points = extract_points(raw)
    ptarget = base / "daejeon-points.json"
    ptarget.write_text(json.dumps(points, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"업종 {len(points['categories'])}종 × {len(points['points'])}점 "
        f"(합계 {points['total']:,}개, {points['period'][:7]}) 저장: {ptarget.name}"
    )
