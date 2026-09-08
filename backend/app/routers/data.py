from typing import List

from fastapi import APIRouter

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
    return data_service.update_record(record_id, record)


@router.delete("/{record_id}")
def delete_data(record_id: str):
    data_service.delete_record(record_id)
    return {"ok": True}


@router.get("/summary", response_model=models.DataSummary)
def summary():
    return data_service.get_summary()
