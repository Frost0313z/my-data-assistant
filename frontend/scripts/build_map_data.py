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
    for period in data["mapPeriods"]:
        rows = data["dongMetrics"][period]
        assert len(rows) == 82 and {r["dong_code"] for r in rows} == codes
        assert all(r["density"] >= 0 for r in rows)
    return {
        "source": SOURCE,
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "periods": data["mapPeriods"],
        "boundaries": data["dongBoundaries"],
        "districts": data["boundaries"],
        "metrics": data["dongMetrics"],
    }


if __name__ == "__main__":
    result = extract(urlopen(SOURCE, timeout=30).read())
    target = Path(__file__).resolve().parents[1] / "data" / "daejeon-map.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"대전 82개 행정동 × {len(result['periods'])}개 시점 저장: {target.name}")
