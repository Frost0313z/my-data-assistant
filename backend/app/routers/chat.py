import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .. import models, observability, ratelimit
from ..services import chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _guard(request: Request) -> None:
    """C3: 남용 방어. 프록시 뒤라 client.host가 전부 같을 수 있어 XFF를 먼저 본다."""
    forwarded = request.headers.get("x-forwarded-for", "")
    client = forwarded.split(",")[0].strip() or (request.client.host if request.client else "-")
    try:
        ratelimit.check(client)
    except ratelimit.RateLimited as limited:
        raise HTTPException(
            status_code=429,
            detail=limited.message,
            headers={"Retry-After": str(limited.retry_after)},
        )


@router.post("", response_model=models.ChatResponse)
def chat(payload: models.ChatRequest, request: Request):
    _guard(request)
    conversation_id, reply, usage = chat_service.ask(
        payload.message, payload.conversation_id, payload.context
    )
    if usage:
        ratelimit.record_tokens(usage.get("total_tokens", 0))
    return models.ChatResponse(conversation_id=conversation_id, reply=reply, usage=usage)


@router.post("/stream")
def chat_stream(payload: models.ChatRequest, request: Request):
    """A4: 토큰이 오는 대로 SSE로 흘려보낸다.

    비스트리밍 `POST /api/chat`은 그대로 둔다. 프론트가 스트리밍에 실패하면 그쪽으로
    떨어져야 하고, 스트리밍을 못 받는 환경(일부 프록시가 SSE를 버퍼링한다)에서도
    서비스가 성립해야 한다.
    """

    _guard(request)

    def events():
        try:
            for kind, data in chat_service.stream(
                payload.message, payload.conversation_id, payload.context
            ):
                # 쓴 만큼 일일 총량에 더한다. 스트리밍만 빼먹으면 이 경로로는
                # 상한이 없는 것과 같아진다.
                if kind == "done" and (data.get("usage") or {}).get("total_tokens"):
                    ratelimit.record_tokens(data["usage"]["total_tokens"])
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
