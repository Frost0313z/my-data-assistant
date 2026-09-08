from fastapi import APIRouter

from .. import models
from ..services import chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=models.ChatResponse)
def chat(payload: models.ChatRequest):
    conversation_id, reply = chat_service.ask(
        payload.message, payload.conversation_id, payload.context
    )
    return models.ChatResponse(conversation_id=conversation_id, reply=reply)
