"""D3: 데모 복구. 파괴적인 엔드포인트라 기본은 꺼져 있다."""

import secrets

from fastapi import APIRouter, Header, HTTPException

from .. import config, observability
from ..services import seed_service

router = APIRouter(prefix="/api/dev", tags=["dev"])


@router.post("/reset")
def reset(x_dev_token: str = Header(default="")):
    """데이터를 시드로 되돌리고 대화를 비운다. `X-Dev-Token` 필요.

    토큰이 설정돼 있지 않으면 **404로 감춘다.** 503으로 "여기 있는데 꺼져 있다"고
    알려 주면, 토큰을 설정한 순간 두드릴 곳을 미리 광고하는 셈이 된다.
    """
    if not config.DEV_RESET_TOKEN:
        raise HTTPException(status_code=404, detail="Not Found")
    # bytes로 비교한다. compare_digest는 비ASCII str을 받으면 TypeError를 내는데,
    # 그러면 토큰을 한글로 설정한 순간 403이 아니라 500이 난다.
    if not secrets.compare_digest(x_dev_token.encode(), config.DEV_RESET_TOKEN.encode()):
        raise HTTPException(status_code=403, detail="토큰이 올바르지 않습니다.")

    result = seed_service.reset()
    observability.log("dev.reset", **result)
    return result
