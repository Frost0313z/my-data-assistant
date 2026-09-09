import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from .. import models, observability
from ..services import chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=models.ChatResponse)
def chat(payload: models.ChatRequest):
    conversation_id, reply, usage = chat_service.ask(
        payload.message, payload.conversation_id, payload.context
    )
    return models.ChatResponse(conversation_id=conversation_id, reply=reply, usage=usage)


@router.post("/stream")
def chat_stream(payload: models.ChatRequest):
    """A4: 토큰이 오는 대로 SSE로 흘려보낸다.

    비스트리밍 `POST /api/chat`은 그대로 둔다. 프론트가 스트리밍에 실패하면 그쪽으로
    떨어져야 하고, 스트리밍을 못 받는 환경(일부 프록시가 SSE를 버퍼링한다)에서도
    서비스가 성립해야 한다.
    """

    def events():
        try:
            for kind, data in chat_service.stream(
                payload.message, payload.conversation_id, payload.context
            ):
                yield f"event: {kind}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            # 스트림이 시작된 뒤에는 HTTP 상태로 실패를 알릴 수 없다. 이벤트로 알린다 —
            # 안 그러면 프론트는 답이 조용히 끊긴 것과 구분하지 못한다.
            observability.logger.exception("chat.stream.failed")
            yield f"event: error\ndata: {json.dumps({'message': type(exc).__name__}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # nginx 계열 프록시가 SSE를 통째로 버퍼링해 스트리밍을 무력화한다.
            "X-Accel-Buffering": "no",
        },
    )
