"""C4: 구조적 로깅 · 요청 ID · 토큰 비용.

무료 티어 Render의 로그는 텍스트 스트림 하나다. 한 요청에서 무슨 일이 있었는지
되짚으려면 줄마다 같은 식별자가 있어야 하고, 기계로 걸러야 하니 JSON이어야 한다.

의존성을 늘리지 않는다 — 표준 `logging`과 `json`이면 충분하다.
"""

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware

# 요청 ID는 미들웨어가 넣고 서비스 계층이 읽는다. 인자로 들고 다니면 함수 시그니처가
# 로깅 때문에 오염된다.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": request_id_var.get(),
            "message": record.getMessage(),
        }
        # log(..., extra={"fields": {...}})로 넘긴 것만 싣는다. record.__dict__를 통째로
        # 쏟으면 로그가 읽을 수 없게 커진다.
        payload.update(getattr(record, "fields", {}) or {})
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level=logging.INFO) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    # uvicorn 액세스 로그는 우리 미들웨어와 같은 내용을 텍스트로 한 번 더 찍는다.
    logging.getLogger("uvicorn.access").disabled = True


logger = logging.getLogger("app")


def log(event: str, **fields) -> None:
    """구조적 로그 한 줄. `log("chat.done", tokens=120)` 처럼 쓴다."""
    logger.info(event, extra={"fields": fields})


class RequestLogMiddleware(BaseHTTPMiddleware):
    """요청마다 ID를 붙이고 결과를 한 줄로 남긴다.

    ID는 응답 헤더(`X-Request-Id`)로도 나간다 — 화면에서 이상한 답을 본 사람이
    그 값을 가져오면 로그에서 바로 찾을 수 있다.
    """

    async def dispatch(self, request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        elapsed = lambda: round((time.perf_counter() - started) * 1000, 1)  # noqa: E731
        try:
            response = await call_next(request)
            # 요약 로그는 reset 전에 남긴다. 뒤로 빼면 request_id가 이미 풀려 "-"로 찍힌다.
            # 헬스체크는 10분마다 들어온다(C6 콜드스타트 핑) — 로그를 그걸로 채우지 않는다.
            if request.url.path != "/":
                log(
                    "request",
                    method=request.method,
                    path=request.url.path,
                    status=response.status_code,
                    ms=elapsed(),
                )
            response.headers["X-Request-Id"] = request_id
            return response
        except Exception:
            logger.exception(
                "request.failed",
                extra={"fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "ms": elapsed(),
                }},
            )
            raise
        finally:
            request_id_var.reset(token)


# gpt-4o-mini 1M 토큰당 USD. 모델을 바꾸면 여기도 바꿔야 한다 — 안 바꾸면 로그의
# 비용이 조용히 틀린다. 그래서 모델 이름을 함께 남긴다.
PRICE_PER_1M = {
    "gpt-4o-mini": {"input": 0.15, "cached": 0.075, "output": 0.60},
}


def estimate_cost(model: str, prompt: int, cached: int, completion: int) -> float | None:
    price = PRICE_PER_1M.get(model)
    if not price:
        return None
    fresh = max(prompt - cached, 0)
    usd = (
        fresh * price["input"] + cached * price["cached"] + completion * price["output"]
    ) / 1_000_000
    return round(usd, 6)
