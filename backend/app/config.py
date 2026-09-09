import os

from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
# 500이면 지표 여러 개를 함께 묻는 질문(A28 '창업 준비 중'의 자동 질문 등)이
# 마무리 문장 없이 끊긴다. 실측에서 정확히 500에 걸려 잘렸다.
CHAT_MAX_TOKENS = int(os.environ.get("CHAT_MAX_TOKENS", "900"))
# 대화 이력은 매 요청마다 통째로 다시 올라간다. 상한이 없으면 입력 토큰이
# 대화 길이에 비례해 늘어, 답변 길이와 무관하게 비용이 커진다.
HISTORY_MAX_MESSAGES = int(os.environ.get("HISTORY_MAX_MESSAGES", "8"))
# 주제 리포트(A14)는 4블록 구조를 채워야 해서 일반 답변보다 상한이 커야 한다.
# 500으로는 [한계] 블록이 잘려 나가는데, 그 블록이 이 서비스의 차별점이라 잘리면 안 된다.
REPORT_MAX_TOKENS = int(os.environ.get("REPORT_MAX_TOKENS", "1200"))

# C5: 요약 캐시 수명(초). 채팅 한 번마다 컬렉션을 통째로 읽는 것을 막는다.
# 쓰기 경로가 캐시를 직접 비우므로 이 값은 "다른 인스턴스가 고쳤을 때" 대비용이다.
# 0으로 두면 캐시가 꺼진다.
SUMMARY_CACHE_TTL = float(os.environ.get("SUMMARY_CACHE_TTL", "30"))

# C4: 배포된 것이 어느 커밋인지. Render가 `RENDER_GIT_COMMIT`을 넣어 준다.
# 배포 브랜치와 실제 배포본이 어긋난 사례가 있었는데 스키마만으로는 구분이 안 됐다.
BUILD_REV = (os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("BUILD_REV") or "dev")[:12]

# D3: 데모 복구 엔드포인트(POST /api/dev/reset)의 토큰. **비어 있으면 엔드포인트가
# 통째로 없는 것처럼 404를 낸다.** 데이터를 지우는 경로라 기본값은 꺼짐이어야 한다.
DEV_RESET_TOKEN = os.environ.get("DEV_RESET_TOKEN", "")

FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]
