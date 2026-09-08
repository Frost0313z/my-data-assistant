from typing import List

from fastapi import APIRouter, HTTPException

from .. import models
from ..services import conversation_service

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=List[models.ConversationOut])
def list_conversations():
    return conversation_service.list_conversations()


@router.post("", response_model=models.ConversationOut)
def create_conversation(payload: models.ConversationIn):
    return conversation_service.create_conversation(payload)


@router.get("/{conversation_id}", response_model=models.ConversationOut)
def get_conversation(conversation_id: str):
    conversation = conversation_service.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="대화를 찾을 수 없습니다.")
    return conversation


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: str):
    conversation_service.delete_conversation(conversation_id)
    return {"ok": True}
