import threading
import time

from .. import config, models
from ..firestore_client import get_db

COLLECTION = "data"

# C5: 요약은 매 채팅마다 다시 계산된다. 계산이 아니라 **읽기**가 비싸다 —
# 컬렉션을 통째로 스트리밍한다(현재 492건, B2 전량 적재 후에는 훨씬 커진다).
# 짧은 TTL이면 사용자가 데이터를 고친 직후에도 화면이 어긋나지 않는다.
# 게다가 쓰기 경로에서 직접 비우므로 사실상 어긋날 창이 없다.
_summary_cache: tuple[float, "models.DataSummary"] | None = None
_summary_lock = threading.Lock()


def invalidate_summary_cache() -> None:
    global _summary_cache
    with _summary_lock:
        _summary_cache = None


def list_records():
    docs = get_db().collection(COLLECTION).order_by("date").stream()
    return [models.DataRecordOut(id=doc.id, **doc.to_dict()) for doc in docs]


def create_record(record: models.DataRecordIn) -> models.DataRecordOut:
    _, ref = get_db().collection(COLLECTION).add(record.model_dump())
    invalidate_summary_cache()
    return models.DataRecordOut(id=ref.id, **record.model_dump())


def update_record(record_id: str, record: models.DataRecordIn) -> models.DataRecordOut | None:
    """없는 id면 None. set()은 문서를 만들어 버리므로 존재 확인이 필수다.

    확인 없이 set()을 부르면 오타 난 id로 보낸 PUT이 그 id를 가진 레코드를 새로 만들고
    200을 돌려준다. 이 저장소에 쓰레기 레코드가 쌓였던 전례가 있어(운영 제약 참조)
    쓰기 경로에서 조용히 만들어지는 길을 남기지 않는다.
    """
    ref = get_db().collection(COLLECTION).document(record_id)
    if not ref.get().exists:
        return None
    ref.set(record.model_dump())
    invalidate_summary_cache()
    return models.DataRecordOut(id=record_id, **record.model_dump())


def delete_record(record_id: str) -> bool:
    """지웠으면 True, 없었으면 False. Firestore delete는 없어도 성공한다."""
    ref = get_db().collection(COLLECTION).document(record_id)
    if not ref.get().exists:
        return False
    ref.delete()
    invalidate_summary_cache()
    return True


def _trend(records):
    """B4: 앞뒤 절반 평균 비교 -> 시점별 합계의 선형회귀 기울기.

    앞뒤 절반 비교는 시점이 6개뿐일 때 가운데 한 시점의 튐에 그대로 흔들린다.
    최소제곱 기울기는 모든 시점을 쓴다.

    한 시점에 82개 행정동 레코드가 들어 있으므로 **시점별로 합쳐서** 회귀한다.
    레코드 하나하나를 점으로 쓰면 같은 날짜가 82번 반복돼 기울기가 뜻을 잃는다.

    판정 문구는 그대로 세 가지다 — 화면과 프롬프트가 이미 그 값을 쓴다.

    한계: 최소제곱은 이상치에 강하지 않다. 한 시점이 크게 튀면 방향이 뒤집힐 수 있다
    (`tests/test_trend.py`에 그 경우를 남겨 뒀다). 이 데이터에서는 2024년 4개 시점이
    자료 수집범위 단절로 급증했는데, 그건 분석 단계에서 이미 제외됐다.
    """
    totals = {}
    for r in records:
        totals[r.date] = totals.get(r.date, 0) + r.value
    points = [totals[d] for d in sorted(totals)]
    n = len(points)
    if n < 2:
        return "판단 보류", 0.0, 0.0

    mean_x = (n - 1) / 2
    mean_y = sum(points) / n
    denominator = sum((i - mean_x) ** 2 for i in range(n))
    slope = sum((i - mean_x) * (y - mean_y) for i, y in enumerate(points)) / denominator

    # 기울기의 단위는 "시점당 값"이라 규모에 따라 크기가 제각각이다.
    # 평균 대비 몇 %인지로 바꿔야 시점 수가 달라도 같은 기준으로 읽힌다.
    per_period_pct = slope / mean_y * 100 if mean_y else 0.0
    total_change = (points[-1] - points[0]) / points[0] * 100 if points[0] else 0.0

    # 0.5%는 임의의 선이 아니다. 시점당 0.5%면 6시점에 약 3%로, 이 데이터의
    # 실제 성장률(+3.59%)이 "상승"으로 읽히는 경계다.
    if per_period_pct > 0.5:
        trend = "상승"
    elif per_period_pct < -0.5:
        trend = "하락"
    else:
        trend = "유지"
    return trend, round(slope, 2), round(total_change, 2)


def matches(record, filters) -> bool:
    """B3: 자치구·행정동·업종은 정확히, 기간은 범위로 거른다.

    부분 일치를 쓰지 않는 이유: `중구`가 `유성구`를 잡거나 `동구`가 `대덕구`를 잡는다.
    행정동 이름에도 `가양동`/`가양1동`처럼 겹치는 짝이 있다.
    """
    for key in ("district", "dong", "industry"):
        wanted = filters.get(key)
        if wanted and getattr(record, key, "") != wanted:
            return False
    if filters.get("date_from") and record.date < filters["date_from"]:
        return False
    if filters.get("date_to") and record.date > filters["date_to"]:
        return False
    return True


def get_summary(filters: dict | None = None) -> models.DataSummary:
    """짧은 TTL 캐시. 쓰기 경로가 직접 비우므로 TTL은 다중 인스턴스 대비 안전망이다.

    필터가 붙으면 캐시를 쓰지 않는다. 조합이 많아 캐시가 메모리만 먹고 잘 안 맞는다 —
    채팅이 매번 부르는 것은 필터 없는 전체 요약뿐이라 거기만 캐시하면 충분하다.
    """
    global _summary_cache
    if filters:
        return _compute_summary(filters)

    with _summary_lock:
        if _summary_cache and time.monotonic() - _summary_cache[0] < config.SUMMARY_CACHE_TTL:
            return _summary_cache[1]

    summary = _compute_summary()
    with _summary_lock:
        _summary_cache = (time.monotonic(), summary)
    return summary


def _compute_summary(filters: dict | None = None) -> models.DataSummary:
    records = sorted(list_records(), key=lambda r: r.date)
    if filters:
        records = [r for r in records if matches(r, filters)]
    if not records:
        # 필터가 아무것도 못 잡은 것과 데이터가 아예 없는 것은 다른 상황이다.
        # 화면에서 "조건을 바꿔 보라"고 안내할 수 있어야 한다.
        empty = "조건에 맞는 데이터 없음" if filters else "데이터 없음"
        return models.DataSummary(period=empty, count=0, metrics={}, trend=empty)

    values = [r.value for r in records]
    trend, slope, change = _trend(records)
    metrics = {
        "total": sum(values),
        "average": round(sum(values) / len(values), 2),
        "max": max(values),
        "min": min(values),
        # B4: 판정만 주면 AI가 근거 없이 "상승세입니다"라고 말한다. 수치를 함께 준다.
        "slope_per_period": slope,
        "change_pct": change,
    }

    return models.DataSummary(
        period=f"{records[0].date} ~ {records[-1].date}",
        count=len(records),
        metrics=metrics,
        trend=trend,
    )
