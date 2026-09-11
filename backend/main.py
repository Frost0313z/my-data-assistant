import math

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config, observability
from app.routers import chat, conversations, data, dev

observability.configure_logging()
_SENTRY = observability.init_error_tracking()

app = FastAPI(title="대전 상권분석 매니저 API")


@app.on_event("startup")
def announce_config():
    """뜰 때 무엇이 켜져 있는지 한 줄로 남긴다.

    설정이 안 먹은 것을 화면에서 알아채기는 어렵다 — 배포 브랜치가 어긋난 적도,
    CHAT_MAX_TOKENS가 .env에 덮여 답변이 계속 잘리던 적도 있었다. 시작 로그에
    실효값을 찍어 두면 "왜 안 바뀌지"를 로그 한 줄로 끝낼 수 있다.
    """
    observability.log(
        "startup",
        build=config.BUILD_REV,
        model=config.OPENAI_MODEL,
        chat_max_tokens=config.CHAT_MAX_TOKENS,
        report_max_tokens=config.REPORT_MAX_TOKENS,
        history_max_messages=config.HISTORY_MAX_MESSAGES,
        summary_cache_ttl=config.SUMMARY_CACHE_TTL,
        dev_reset="on" if config.DEV_RESET_TOKEN else "off",
        sentry=_SENTRY,
        chat_rate_per_minute=config.CHAT_RATE_PER_MINUTE,
        daily_token_budget=config.DAILY_TOKEN_BUDGET,
        allowed_origins=config.ALLOWED_ORIGINS,
    )
    if config.CORS_IS_WILDCARD:
        # 기본값을 좁히면 ALLOWED_ORIGINS가 빠진 배포가 조용히 죽는다. 대신 시끄럽게 한다.
        observability.logger.warning(
            "cors.wildcard",
            extra={"fields": {"hint": "ALLOWED_ORIGINS가 비어 모든 오리진을 허용합니다"}},
        )

app.add_middleware(observability.RequestLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _json_safe(value):
    """검증 에러 payload에 섞인 비유한 float(Inf/NaN)를 문자열로 바꾼다.
    JSON 직렬화는 Inf/NaN을 허용하지 않아, 안 바꾸면 422 응답 자체가 500으로 터진다."""
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # jsonable_encoder로 예외·객체를 먼저 평탄화한 뒤, 남은 Inf/NaN float만 문자열로 바꾼다.
    return JSONResponse(status_code=422, content={"detail": _json_safe(jsonable_encoder(exc.errors()))})

app.include_router(data.router)
app.include_router(conversations.router)
app.include_router(chat.router)
app.include_router(dev.router)


@app.get("/")
def health():
    """콜드스타트 핑(C6)과 배포본 확인용.

    `build`는 배포 브랜치와 실제 배포본이 어긋났을 때 원인을 오진하지 않게 해 준다 —
    전에 브랜치 설정이 안 먹은 사례가 있었는데, 스키마만 봐서는 구분이 안 됐다.
    Render는 커밋 SHA를 `RENDER_GIT_COMMIT`으로 넣어 준다.
    """
    # `writes_enabled`는 화면이 데이터 관리 폼을 미리 잠그는 데 쓴다(D5).
    # 눌러 보고 403을 받는 것보다 처음부터 잠겨 있는 편이 낫다.
    return {"status": "ok", "build": config.BUILD_REV, "writes_enabled": config.DATA_WRITES_ENABLED}
