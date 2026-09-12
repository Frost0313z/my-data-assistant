from datetime import date as _date
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


def _require_real_dates(date_from: str, date_to: str) -> None:
    """빈 값은 "필터 없음"이라 통과. 값이 있으면 달력에 실재해야 하고 앞뒤가 맞아야 한다."""
    for name, value in (("date_from", date_from), ("date_to", date_to)):
        if not value:
            continue
        try:
            _date.fromisoformat(value)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"{name}: 존재하지 않는 날짜입니다 (YYYY-MM-DD)")
    # 여기까지 왔으면 둘 다 0으로 채워진 ISO 날짜라 문자열 비교가 날짜 비교와 같다.
    # 집계도 같은 방식으로 자르므로 비교 방식을 굳이 바꾸지 않는다.
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from이 date_to보다 뒤입니다.")


@router.get("/summary", response_model=models.DataSummary)
def summary(
    district: str = Query("", max_length=models.DIMENSION_MAX, description="자치구 정확히 일치"),
    dong: str = Query("", max_length=models.DIMENSION_MAX, description="행정동 정확히 일치"),
    industry: str = Query("", max_length=models.DIMENSION_MAX, description="주력업종 정확히 일치"),
    date_from: str = Query("", pattern=r"^(\d{4}-\d{2}-\d{2})?$", description="YYYY-MM-DD 이상"),
    date_to: str = Query("", pattern=r"^(\d{4}-\d{2}-\d{2})?$", description="YYYY-MM-DD 이하"),
):
    """B3: 필터별 집계. 인자가 없으면 예전과 똑같이 전체 요약을 돌려준다."""
    # 정규식은 모양만 본다. `2026-99-99`는 모양이 맞아서 통과한 뒤 아무것도
    # 못 잡는 필터가 되어 "조건에 맞는 데이터 없음"으로 조용히 끝난다 —
    # 오타를 정답처럼 돌려주는 셈이다. 저장 경로(`DataRecordIn`)는 이미
    # 달력을 확인하고 있었는데 조회 경로만 빠져 있었다.
    _require_real_dates(date_from, date_to)
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
