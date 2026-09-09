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


if __name__ == "__main__":
    result = extract(urlopen(SOURCE, timeout=30).read())
    target = Path(__file__).resolve().parents[1] / "data" / "daejeon-map.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"대전 82개 행정동 × {len(result['periods'])}개 시점 저장: {target.name}")
