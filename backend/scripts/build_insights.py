"""B1: 사전 분석 리포트의 수치를 데이터에서 다시 뽑고, 큐레이션과 어긋나는지 본다.

    python scripts/build_insights.py          # 검사만
    python scripts/build_insights.py --write  # 수치 절을 다시 써 넣는다

`insights.md`는 두 가지가 섞여 있다.

* **수치** — 데이터에서 나온다. 대시보드를 다시 뽑으면 같이 바뀌어야 한다.
* **해석** — "과밀이나 성공으로 단정할 수 없다" 같은 문장. 이건 사람이 판단한 것이고
  **이 서비스의 차별점 그 자체**다. 스크립트가 지어낼 수 없다.

그래서 통째로 재생성하지 않는다. 수치 절만 다시 쓰고, 해석 문장에 박힌 숫자는
데이터와 대조해 어긋나면 멈춘다. 리포트가 조용히 낡으면 AI가 틀린 숫자를 인용한다 —
근거를 대는 것이 이 서비스의 약속이라 그게 제일 나쁜 고장이다.
"""

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAP = ROOT / "frontend" / "data" / "daejeon-map.json"
INSIGHTS = ROOT / "backend" / "app" / "seed" / "insights.md"

GENERATED_START = "<!-- 아래는 build_insights.py가 씁니다. 직접 고치지 마세요. -->"
GENERATED_END = "<!-- 여기까지 -->"


# insights.md 머리말이 정한 기준월. "단면 지표 기준월 2026-03, 변화·코호트 기준월 2025-03."
# 마지막 시점(2026-06)으로 재면 리포트가 틀린 것처럼 보인다 — 실제로 처음에 그렇게
# 재서 "잔존율 최고가 중앙동이 아니라 기성동"이라는 잘못된 결론을 냈다.
CROSS_SECTION = "2026-03-01"


def figures():
    data = json.loads(MAP.read_text(encoding="utf-8"))
    first, last = data["periods"][0], data["periods"][-1]
    start, end = data["metrics"][first], data["metrics"][CROSS_SECTION]
    base = {r["dong_code"]: r["stores"] for r in start}

    # 총계·성장률은 전 구간(첫 시점 → 마지막 시점)이다. 단면 지표와 기준월이 다르다.
    final = data["metrics"][last]
    total_start = sum(r["stores"] for r in start)
    total_end = sum(r["stores"] for r in final)

    by_district = {}
    for row in start:
        by_district.setdefault(row["district"], [0, 0])[0] += row["stores"]
    for row in final:
        by_district[row["district"]][1] += row["stores"]

    def q(values, p):
        v = sorted(values)
        return v[min(len(v) - 1, int(p * (len(v) - 1) + 0.5))]

    density = [r["density"] for r in end]
    survival = [r["survival"] for r in end]
    turnover = [r["turnover"] for r in end if r["turnover"] is not None]
    change = [(r["stores"] - base[r["dong_code"]]) / base[r["dong_code"]] * 100 for r in final]

    top = lambda key, n=3: sorted(end, key=lambda r: -r[key])[:n]  # noqa: E731
    bottom = lambda key, n=3: sorted(end, key=lambda r: r[key])[:n]  # noqa: E731

    return {
        "range": (first[:7], last[:7]),
        "cross_section": CROSS_SECTION[:7],
        "total_start": total_start,
        "total_end": total_end,
        "growth": (total_end - total_start) / total_start * 100,
        "districts": {
            k: (v[1] - v[0]) / v[0] * 100 for k, v in sorted(by_district.items())
        },
        "density_median": q(density, 0.5),
        "density_top": [(r["district"], r["dong"], r["density"]) for r in top("density")],
        "survival_median": q(survival, 0.5),
        "survival_low": [(r["district"], r["dong"], r["survival"]) for r in bottom("survival")],
        "survival_high": [(r["district"], r["dong"], r["survival"]) for r in top("survival")],
        "turnover_median": q(turnover, 0.5),
        "change_median": q(change, 0.5),
        "change_down": sum(1 for c in change if c < 0),
        "dongs": len(final),
        "periods": len(data["periods"]),
    }


def render(f) -> str:
    place = lambda rows, unit, digits: " · ".join(  # noqa: E731
        f"{d} {n} {v:.{digits}f}{unit}" for d, n, v in rows
    )
    return f"""{GENERATED_START}
## 데이터에서 다시 뽑은 수치 (전 구간 {f['range'][0]} ~ {f['range'][1]} · 단면 {f['cross_section']})
- 총 업소: {f['total_start']:,} → {f['total_end']:,} ({f['total_end'] - f['total_start']:+,}, {f['growth']:+.2f}%).
- 자치구 성장률: {' · '.join(f'{k} {v:+.2f}%' for k, v in f['districts'].items())}.
- 행정동 {f['dongs']}개 × {f['periods']}개 시점. 업소 수가 줄어든 동은 {f['change_down']}개, 증감률 중앙값 {f['change_median']:+.1f}%.
- 공급 밀도 중앙값 {f['density_median']:.1f}개. 상위: {place(f['density_top'], '개', 1)}.
- 잔존율 중앙값 {f['survival_median']:.1f}%. 최저: {place(f['survival_low'], '%', 1)}. 최고: {place(f['survival_high'], '%', 1)}.
- 점포 교체율 중앙값 {f['turnover_median']:.1f}%.
{GENERATED_END}"""


# 리포트가 실제로 주장하는 것만 검사한다.
#
# 처음에는 "데이터의 최저·최고가 리포트에 있는가"로 쟀는데 그건 리포트가 하는 말이
# 아니었다. "최저권: 목동 73.7%"는 예시지 최소값 주장이 아니다. 그렇게 재면 멀쩡한
# 문장을 틀렸다고 말하게 된다 — 실제로 한 번 그랬다.
#
# 대신 **리포트에 적힌 (행정동, 숫자) 쌍이 데이터에 실제로 있는지**를 본다.
# 있으면 어느 시점 값인지도 알려준다. 리포트는 단면 기준월이 2026-03인데 다른 달
# 숫자가 섞여 들어오는 것이 실제로 일어나는 일이다.
CITED = re.compile(r"([가-힣0-9]+동)\s+(\d+\.\d)(%|개)")


def verify_citations(text, data):
    """리포트가 인용한 수치를 데이터에서 찾는다. (문구, 판정, 설명) 목록."""
    by_period = {
        period: {r["dong"]: r for r in rows} for period, rows in data["metrics"].items()
    }
    results = []
    for dong, raw, unit in CITED.findall(text):
        value = float(raw)
        keys = ("survival", "turnover") if unit == "%" else ("density",)
        found = []
        for period, rows in sorted(by_period.items()):
            row = rows.get(dong)
            if not row:
                continue
            for key in keys:
                if row.get(key) is not None and abs(row[key] - value) < 0.06:
                    found.append(f"{period[:7]} {key}")
        label = f"{dong} {raw}{unit}"
        if found:
            results.append((label, True, " / ".join(found)))
        elif dong not in by_period[data["periods"][-1]]:
            results.append((label, True, "지도 데이터에 없는 행정동 — 확인 불가"))
        else:
            results.append((label, False, "어느 시점에서도 이 값이 나오지 않습니다"))
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="수치 절을 다시 써 넣는다")
    args = parser.parse_args()

    f = figures()
    text = INSIGHTS.read_text(encoding="utf-8")
    data = json.loads(MAP.read_text(encoding="utf-8"))

    # 총계는 리포트에 그대로 적혀 있어야 한다
    totals = [
        ("총 업소 시작", f"{f['total_start']:,}"),
        ("총 업소 끝", f"{f['total_end']:,}"),
        ("전체 성장률", f"+{f['growth']:.2f}%"),
    ]
    stale = [(label, value) for label, value in totals if value not in text]

    citations = verify_citations(text, data)
    wrong = [c for c in citations if not c[1]]

    print(f"인용 수치 {len(citations)}건 확인:")
    for label, ok, note in citations:
        print(f"  {'OK ' if ok else '틀림'} {label:20} {note}")
    for label, value in stale:
        print(f"  틀림 {label}: 데이터는 {value}")

    if (stale or wrong) and not args.write:
        raise SystemExit(1)

    block = render(f)
    if GENERATED_START in text:
        text = re.sub(
            re.escape(GENERATED_START) + r".*?" + re.escape(GENERATED_END),
            block,
            text,
            flags=re.S,
        )
    else:
        text = text.rstrip() + "\n\n" + block + "\n"

    if args.write:
        INSIGHTS.write_text(text, encoding="utf-8")
        print(f"수치 절을 갱신했습니다 -> {INSIGHTS.name}")
    else:
        print("리포트의 수치가 데이터와 일치합니다.")
    print(f"  {f['total_start']:,} → {f['total_end']:,} ({f['growth']:+.2f}%) · 행정동 {f['dongs']}개")


if __name__ == "__main__":
    main()
