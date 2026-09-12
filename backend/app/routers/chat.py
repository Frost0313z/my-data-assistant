import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .. import config, idempotency, models, observability, ratelimit
from .conversations import client_owner
from ..services import chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _reservation(context: dict | None) -> int:
    """응답 상한과 입력 추정치를 요청 시작 시 함께 확보한다."""
    max_output = (
        config.REPORT_MAX_TOKENS
        if (context or {}).get("mode") == "report"
        else config.CHAT_MAX_TOKENS
    )
    return max_output + max(0, config.CHAT_INPUT_TOKEN_RESERVE)


def _client_ip(request: Request) -> str:
    """레이트리밋 키로 쓸 IP.

    **XFF의 첫 항목은 클라이언트가 마음대로 쓴다.** 그걸 키로 쓰면 요청마다 헤더만
    바꿔서 분당 제한을 무한히 우회하고 일일 예산을 태울 수 있다(2026-09-10 지적 P1).

    신뢰할 수 있는 것은 **신뢰하는 프록시가 직접 붙인 값**뿐이고, 그것은 체인의
    오른쪽 끝이다. 클라이언트가 `a, b, c`를 보내도 Render의 LB가 실제 IP를 뒤에
    덧붙이므로 `[-1]`이 진짜다. 프록시가 없는 환경(TRUSTED_PROXY_HOPS=0)에서는
    XFF를 아예 믿지 않고 소켓 주소를 쓴다.
    """
    hops = config.TRUSTED_PROXY_HOPS
    if hops > 0:
        chain = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(chain) >= hops:
            return chain[-hops]
    return request.client.host if request.client else "-"


def _guard(request: Request, context: dict | None) -> int:
    """C3: 남용 방어. 프록시 뒤라 client.host가 전부 같을 수 있어 XFF를 본다."""
    client = _client_ip(request)
    try:
        reservation = _reservation(context)
        ratelimit.check(client, reservation=reservation)
        return reservation
    except ratelimit.RateLimited as limited:
        raise HTTPException(
            status_code=429,
            detail=limited.message,
            headers={"Retry-After": str(limited.retry_after)},
        )


@router.post("", response_model=models.ChatResponse)
def chat(payload: models.ChatRequest, request: Request):
    owner = client_owner(request.headers.get("x-client-id", ""))

    # 스트리밍이 첫 글자 전에 끊겨 여기로 떨어진 재시도일 수 있다. 서버가 이미
    # 답을 만들어 저장했다면 같은 질문에 두 번 과금하고 턴을 두 벌 쌓는 셈이 된다.
    # **레이트리밋보다 먼저 본다** — 이미 끝난 일을 다시 세면 예산만 축난다.
    done = idempotency.get(payload.request_id or "", owner)
    if done is not None:
        conversation_id, reply, usage = done
        observability.log("chat.replayed", request_id=payload.request_id)
        return models.ChatResponse(conversation_id=conversation_id, reply=reply, usage=usage)

    reservation = _guard(request, payload.context)
    usage = None
    try:
        conversation_id, reply, usage = chat_service.ask(
            payload.message, payload.conversation_id, payload.context, owner
        )
        idempotency.remember(payload.request_id or "", owner, conversation_id, reply, usage)
        return models.ChatResponse(conversation_id=conversation_id, reply=reply, usage=usage)
    finally:
        ratelimit.settle(reservation, (usage or {}).get("total_tokens", 0))


@router.post("/stream")
def chat_stream(payload: models.ChatRequest, request: Request):
    """A4: 토큰이 오는 대로 SSE로 흘려보낸다.

    비스트리밍 `POST /api/chat`은 그대로 둔다. 프론트가 스트리밍에 실패하면 그쪽으로
    떨어져야 하고, 스트리밍을 못 받는 환경(일부 프록시가 SSE를 버퍼링한다)에서도
    서비스가 성립해야 한다.
    """

    reservation = _guard(request, payload.context)
    owner = client_owner(request.headers.get("x-client-id", ""))

    def events():
        settled = False
        # 답을 여기서도 모아 둔다. 저장까지 끝났는데 응답만 유실되면 프런트가
        # 비스트리밍으로 다시 보내는데(`chat.js`), 그때 돌려줄 것이 있어야 한다.
        pieces: list[str] = []
        try:
            for kind, data in chat_service.stream(
                payload.message, payload.conversation_id, payload.context, owner
            ):
                if kind == "delta":
                    pieces.append(data)
                # 쓴 만큼 일일 총량에 더한다. 스트리밍만 빼먹으면 이 경로로는
                # 상한이 없는 것과 같아진다.
                if kind == "done":
                    if (data.get("usage") or {}).get("total_tokens"):
                        ratelimit.settle(reservation, data["usage"]["total_tokens"])
                        settled = True
                    # **여기서 기억한다.** 이 지점을 지났다는 것은 대화가 이미
                    # 저장됐다는 뜻이다 — 재시도가 오면 다시 만들지 않고 이걸 준다.
                    idempotency.remember(
                        payload.request_id or "",
                        owner,
                        data.get("conversation_id"),
                        "".join(pieces),
                        data.get("usage"),
                    )
                yield f"event: {kind}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            # 스트림이 시작된 뒤에는 HTTP 상태로 실패를 알릴 수 없다. 이벤트로 알린다 —
            # 안 그러면 프론트는 답이 조용히 끊긴 것과 구분하지 못한다.
            observability.logger.exception("chat.stream.failed")
            yield f"event: error\ndata: {json.dumps({'message': type(exc).__name__}, ensure_ascii=False)}\n\n"
        finally:
            if not settled:
                ratelimit.settle(reservation, 0)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # nginx 계열 프록시가 SSE를 통째로 버퍼링해 스트리밍을 무력화한다.
            "X-Accel-Buffering": "no",
        },
    )
