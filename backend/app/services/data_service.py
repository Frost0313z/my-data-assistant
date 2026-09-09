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


def get_summary() -> models.DataSummary:
    """짧은 TTL 캐시. 쓰기 경로가 직접 비우므로 TTL은 다중 인스턴스 대비 안전망이다."""
    global _summary_cache
    with _summary_lock:
        if _summary_cache and time.monotonic() - _summary_cache[0] < config.SUMMARY_CACHE_TTL:
            return _summary_cache[1]

    summary = _compute_summary()
    with _summary_lock:
        _summary_cache = (time.monotonic(), summary)
    return summary


def _compute_summary() -> models.DataSummary:
    records = sorted(list_records(), key=lambda r: r.date)
    if not records:
        return models.DataSummary(period="데이터 없음", count=0, metrics={}, trend="데이터 없음")

    values = [r.value for r in records]
    metrics = {
        "total": sum(values),
        "average": round(sum(values) / len(values), 2),
        "max": max(values),
        "min": min(values),
    }

    # 날짜순 정렬 후 앞/뒤 절반 평균을 비교해 추세를 판단한다.
    half = max(len(records) // 2, 1)
    first_half_avg = sum(r.value for r in records[:half]) / half
    second_half_avg = sum(r.value for r in records[-half:]) / half
    if second_half_avg > first_half_avg * 1.02:
        trend = "상승"
    elif second_half_avg < first_half_avg * 0.98:
        trend = "하락"
    else:
        trend = "유지"

    return models.DataSummary(
        period=f"{records[0].date} ~ {records[-1].date}",
        count=len(records),
        metrics=metrics,
        trend=trend,
    )
