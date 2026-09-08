from .. import models
from ..firestore_client import get_db

COLLECTION = "data"


def list_records():
    docs = get_db().collection(COLLECTION).order_by("date").stream()
    return [models.DataRecordOut(id=doc.id, **doc.to_dict()) for doc in docs]


def create_record(record: models.DataRecordIn) -> models.DataRecordOut:
    _, ref = get_db().collection(COLLECTION).add(record.model_dump())
    return models.DataRecordOut(id=ref.id, **record.model_dump())


def update_record(record_id: str, record: models.DataRecordIn) -> models.DataRecordOut:
    get_db().collection(COLLECTION).document(record_id).set(record.model_dump())
    return models.DataRecordOut(id=record_id, **record.model_dump())


def delete_record(record_id: str) -> None:
    get_db().collection(COLLECTION).document(record_id).delete()


def get_summary() -> models.DataSummary:
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
