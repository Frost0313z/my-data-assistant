from typing import List

from fastapi import APIRouter, HTTPException, Query

from .. import models
from ..services import data_service

router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("", response_model=List[models.DataRecordOut])
def list_data():
    return data_service.list_records()


@router.post("", response_model=models.DataRecordOut)
def create_data(record: models.DataRecordIn):
    return data_service.create_record(record)


@router.put("/{record_id}", response_model=models.DataRecordOut)
def update_data(record_id: str, record: models.DataRecordIn):
    updated = data_service.update_record(record_id, record)
    if updated is None:
        raise HTTPException(status_code=404, detail="데이터를 찾을 수 없습니다.")
    return updated


@router.delete("/{record_id}")
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
