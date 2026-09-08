"""daejeon-commercial-analysis의 행정동×분기 점포수 데이터를 (date, value, memo) 시드 데이터로 변환한다.

원본: 03. AI 응용 학습/01. 데이터 분석/분석 과제/data/processed/dong_indicators_timeseries.csv
출력: backend/app/seed/seed_data.json  (date=조사시점, value=행정동 점포수, memo="구 동")
"""

import csv
import json
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[5] / "01. 데이터 분석" / "분석 과제" / "data" / "processed" / "dong_indicators_timeseries.csv"
DEST = Path(__file__).resolve().parents[1] / "app" / "seed" / "seed_data.json"


def load_records(source: Path) -> list[dict]:
    with source.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        records = []
        for row in reader:
            records.append(
                {
                    "date": row["period"],
                    "value": int(float(row["store_count"])),
                    "memo": f"{row['district']} {row['dong']} (주력업종: {row['leading_category']})",
                }
            )
    return records


def main():
    if not SOURCE.exists():
        print(f"원본 파일을 찾을 수 없습니다: {SOURCE}", file=sys.stderr)
        sys.exit(1)

    records = load_records(SOURCE)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    dates = sorted({r["date"] for r in records})
    print(f"레코드 {len(records)}개 생성 완료 -> {DEST}")
    print(f"기간: {dates[0]} ~ {dates[-1]} ({len(dates)}개 시점)")


if __name__ == "__main__":
    main()
