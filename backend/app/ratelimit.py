"""C3: 채팅 요청 제한과 일일 토큰 상한.

포트폴리오 데모라 링크가 어디로 갈지 모른다. 누군가 반복해서 두드리면 요금은
그대로 나간다. 두 겹으로 막는다 —

1. **분당 요청 수**(IP 단위): 사람이 손으로 낼 수 있는 속도를 넘는 것을 끊는다.
2. **일일 토큰 총량**(전체): 느리게 오래 두드리는 것을 끊는다. 1번만으로는 못 막는다.

인메모리다. 인스턴스가 하나라 충분하고, 무료 티어에 Redis를 붙일 이유가 없다.
여러 인스턴스로 늘리면 상한이 인스턴스 수만큼 느슨해진다 — 그때 옮긴다.
"""

import threading
import time
from collections import defaultdict, deque

from . import config, observability

_lock = threading.Lock()
_hits: dict[str, deque] = defaultdict(deque)
_tokens_today = {"day": None, "used": 0}


class RateLimited(Exception):
    """429로 바꿔 내보낼 신호. 사용자에게 보일 문구를 함께 들고 있다."""

    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.message = message
        self.retry_after = retry_after


def _today(now: float) -> int:
    return int(now // 86400)


def check(client: str, now: float | None = None) -> None:
    """요청을 받아도 되는지 본다. 안 되면 RateLimited를 던진다."""
    now = time.time() if now is None else now
    with _lock:
        if config.CHAT_RATE_PER_MINUTE > 0:
            hits = _hits[client]
            while hits and now - hits[0] > 60:
                hits.popleft()
            if len(hits) >= config.CHAT_RATE_PER_MINUTE:
                wait = max(1, int(60 - (now - hits[0])))
                observability.log("ratelimit.minute", client=client, hits=len(hits))
                raise RateLimited(
                    f"요청이 너무 잦습니다. {wait}초 뒤에 다시 시도해 주세요.", wait
                )
            hits.append(now)

        if config.DAILY_TOKEN_BUDGET > 0:
            day = _today(now)
            if _tokens_today["day"] != day:
                _tokens_today.update(day=day, used=0)
            if _tokens_today["used"] >= config.DAILY_TOKEN_BUDGET:
                observability.log("ratelimit.daily", used=_tokens_today["used"])
                raise RateLimited(
                    "오늘 사용할 수 있는 분량을 모두 썼습니다. 내일 다시 시도해 주세요.", 3600
                )


def record_tokens(total: int, now: float | None = None) -> None:
    """실제로 쓴 토큰을 더한다. 요청 전에는 얼마나 쓸지 알 수 없으므로 사후 기록이다 —
    상한을 살짝 넘길 수 있지만, 넘긴 만큼은 이미 응답으로 나간 뒤다."""
    now = time.time() if now is None else now
    with _lock:
        day = _today(now)
        if _tokens_today["day"] != day:
            _tokens_today.update(day=day, used=0)
        _tokens_today["used"] += max(0, total)


def snapshot() -> dict:
    with _lock:
        return {"day": _tokens_today["day"], "used": _tokens_today["used"]}


def reset() -> None:
    """테스트 전용."""
    with _lock:
        _hits.clear()
        _tokens_today.update(day=None, used=0)
