from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import config, models
from ..services import data_service

router = APIRouter(prefix="/api/data", tags=["data"])

READ_ONLY_MESSAGE = "이 배포는 읽기 전용입니다. 데이터 추가·수정·삭제가 꺼져 있습니다."


def require_writable():
    """D5: 공개 데모에서 아무나 데이터를 지우지 못하게 한다.

    읽기는 그대로 열어 둔다 — 막아야 하는 것은 남의 데이터를 바꾸는 일이지
    보는 일이 아니다."""
    if not config.DATA_WRITES_ENABLED:
        raise HTTPException(status_code=403, detail=READ_ONLY_MESSAGE)


@router.get("", response_model=List[models.DataRecordOut])
def list_data():
    return data_service.list_records()


@router.post("", response_model=models.DataRecordOut, dependencies=[Depends(require_writable)])
def create_data(record: models.DataRecordIn):
    return data_service.create_record(record)


@router.put("/{record_id}", response_model=models.DataRecordOut, dependencies=[Depends(require_writable)])
def update_data(record_id: str, record: models.DataRecordIn):
    updated = data_service.update_record(record_id, record)
    if updated is None:
        raise HTTPException(status_code=404, detail="데이터를 찾을 수 없습니다.")
    return updated


@router.delete("/{record_id}", dependencies=[Depends(require_writable)])
def delete_data(record_id: str):
    if not data_service.delete_record(record_id):
        raise HTTPException(status_code=404, detail="데이터를 찾을 수 없습니다.")
    return {"ok": True}


@router.get("/summary", response_model=models.DataSummary)
def summary(
    district: str = Query("", max_length=models.DIMENSION_MAX, description="자치구 정확히 일치"),
    dong: str = Query("", max_length=models.DIMENSION_MAX, description="행정동 정확히 일치"),
    industry: str = Query("", max_length=models.DIMENSION_MAX, description="주력업종 정확히 일치"),
    date_from: str = Query("", pattern=r"^(\d{4}-\d{2}-\d{2})?$", description="YYYY-MM-DD 이상"),
    date_to: str = Query("", pattern=r"^(\d{4}-\d{2}-\d{2})?$", description="YYYY-MM-DD 이하"),
):
    """B3: 필터별 집계. 인자가 없으면 예전과 똑같이 전체 요약을 돌려준다."""
    filters = {
        k: v
        for k, v in {
            "district": district.strip(),
            "dong": dong.strip(),
            "industry": industry.strip(),
            "date_from": date_from,
            "date_to": date_to,
        }.items()
        if v
    }
    return data_service.get_summary(filters or None)


@router.get("/dimensions")
def dimensions():
    """B3: 필터에 넣을 수 있는 값 목록. 화면이 자유 입력 대신 목록에서 고르게 한다."""
    records = data_service.list_records()
    return {
        "districts": sorted({r.district for r in records if r.district}),
        "dongs": sorted({r.dong for r in records if r.dong}),
        "industries": sorted({r.industry for r in records if r.industry}),
        "dates": sorted({r.date for r in records}),
    }
