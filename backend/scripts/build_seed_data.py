"""B2: 시드 데이터를 구조화한다. `python scripts/build_seed_data.py`

지금까지 자치구·행정동·주력업종이 `memo` 한 줄에 문자열로 뭉쳐 있었다
(`"동구 중앙동 (주력업종: 소매업)"`). 사람이 읽기엔 되지만 **필터를 걸 수 없다**(B3).

원본 CSV는 저장소 밖(분석 과제 폴더)에 있어 없을 수도 있다. 그래서 저장소 안에 있는
두 가지로 만든다 — 기존 시드의 `memo`(주력업종)와 `frontend/data/daejeon-map.json`
(자치구·행정동·시점별 업소 수, 대시보드에서 추출되고 SHA256이 기록돼 있다).

두 출처가 어긋나면 멈춘다. 조용히 한쪽을 믿으면 어느 쪽이 맞는지 모른 채 배포된다.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "backend" / "app" / "seed" / "seed_data.json"
MAP = ROOT / "frontend" / "data" / "daejeon-map.json"

MEMO = re.compile(r"^(?P<district>\S+)\s+(?P<dong>\S+)\s+\(주력업종:\s*(?P<industry>[^)]+)\)$")


def main():
    records = json.loads(SEED.read_text(encoding="utf-8"))
    map_data = json.loads(MAP.read_text(encoding="utf-8"))

    # (시점, 자치구 동) -> 업소 수
    reference = {
        (period, f"{row['district']} {row['dong']}"): row["stores"]
        for period, rows in map_data["metrics"].items()
        for row in rows
    }

    out, mismatched = [], []
    for record in records:
        parsed = MEMO.match(record["memo"])
        assert parsed, f"memo 형식이 예상과 다릅니다: {record['memo']!r}"
        district, dong, industry = parsed.group("district", "dong", "industry")

        key = (record["date"], f"{district} {dong}")
        expected = reference.get(key)
        if expected is None:
            mismatched.append(f"지도 데이터에 없음: {key}")
        elif expected != record["value"]:
            mismatched.append(f"{key} 값 불일치: 시드 {record['value']} vs 지도 {expected}")

        out.append(
            {
                "date": record["date"],
                "value": record["value"],
                "memo": record["memo"],
                "district": district,
                "dong": dong,
                "industry": industry,
            }
        )

    if mismatched:
        raise SystemExit("두 출처가 어긋납니다:\n  " + "\n  ".join(mismatched[:10]))

    SEED.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    districts = sorted({r["district"] for r in out})
    industries = sorted({r["industry"] for r in out})
    print(f"{len(out)}개 레코드에 구조 필드를 붙였습니다 -> {SEED.name}")
    print(f"  자치구 {len(districts)}개: {' · '.join(districts)}")
    print(f"  행정동 {len({r['dong'] for r in out})}개 · 업종 {len(industries)}종")
    print(f"  지도 데이터와 값 불일치 0건")


if __name__ == "__main__":
    main()
