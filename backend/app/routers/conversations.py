from typing import List

from fastapi import APIRouter, Header, HTTPException

from .. import models
from ..services import conversation_service

router = APIRouter(prefix="/api/conversations", tags=["conversations"])

# 브라우저가 스스로 만든 난수 식별자. 로그인이 아니라 **칸막이**다.
# 남의 대화를 못 보게 하는 것이 목적이고, 본인 확인을 하는 것이 아니다.
# 길이를 제한하는 이유: 그대로 Firestore 쿼리에 들어가므로 쓰레기 값을 막는다.
CLIENT_ID_MAX = 64


def client_owner(x_client_id: str = Header(default="")) -> str:
    """요청을 보낸 브라우저의 칸막이 키. 없거나 이상하면 빈 값 — 아무것도 못 본다."""
    value = (x_client_id or "").strip()
    if not value or len(value) > CLIENT_ID_MAX:
        return ""
    return value


@router.get("", response_model=List[models.ConversationOut])
def list_conversations(owner: str = Header(default="", alias="X-Client-Id")):
    """**그 브라우저가 만든 것만** 돌려준다.

    전에는 컬렉션 전체를 돌려줬다. 공개 URL에서 방문자 A가 B의 질문을 읽고
    지울 수 있었다(2026-09-10 관측). 목록이 곧 남의 대화를 찾는 경로였다.
    """
    return conversation_service.list_conversations(client_owner(owner))


@router.post("", response_model=models.ConversationOut)
def create_conversation(
    payload: models.ConversationIn, owner: str = Header(default="", alias="X-Client-Id")
):
    return conversation_service.create_conversation(payload, client_owner(owner))


@router.get("/{conversation_id}", response_model=models.ConversationOut)
def get_conversation(conversation_id: str, owner: str = Header(default="", alias="X-Client-Id")):
    conversation = conversation_service.get_conversation(conversation_id, client_owner(owner))
    if conversation is None:
        # 남의 대화도 "없다"고 답한다. 403으로 갈라 주면 어떤 id가 실재하는지 알려 준다.
        raise HTTPException(status_code=404, detail="대화를 찾을 수 없습니다.")
    return conversation


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: str, owner: str = Header(default="", alias="X-Client-Id")):
    if not conversation_service.delete_conversation(conversation_id, client_owner(owner)):
        raise HTTPException(status_code=404, detail="대화를 찾을 수 없습니다.")
    return {"ok": True}
