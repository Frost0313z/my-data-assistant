import math

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config, observability
from app.routers import chat, conversations, data, dev

observability.configure_logging()

app = FastAPI(title="대전 상권분석 매니저 API")

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
    return {"status": "ok", "build": config.BUILD_REV}
