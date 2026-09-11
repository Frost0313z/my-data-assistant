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

# D5: 데이터 쓰기(추가·수정·삭제) 허용 여부.
# `/api/dev/reset`은 토큰으로 잠겨 있었지만 **CRUD는 무방비였다.** 공개 데모 링크에서
# 누가 레코드를 지우면 모두에게 지워진다. 기본값은 꺼짐 — 켜는 것을 잊는 쪽이
# 잠긴 채로 배포되는 쪽보다 위험하다. 로컬 개발은 .env에서 켠다.
DATA_WRITES_ENABLED = os.environ.get("DATA_WRITES_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}

# C3: 채팅 남용 방어. 0이면 그 겹을 끈다.
#  - 분당 요청: 사람이 손으로 낼 수 있는 속도를 넘는 것을 끊는다.
#  - 일일 토큰: 느리게 오래 두드리는 것을 끊는다. 분당 제한만으로는 못 막는다.
# C7: 에러 트래킹. DSN이 없으면 Sentry를 아예 켜지 않는다 — 계정 없이도 돌아야 한다.
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
SENTRY_ENV = os.environ.get("SENTRY_ENVIRONMENT", "production" if os.environ.get("RENDER") else "local")

# 신뢰하는 프록시 홉 수. 레이트리밋 키를 XFF 어디에서 꺼낼지 정한다.
# Render는 앞단 LB가 하나라 1이 맞다. 0이면 XFF를 믿지 않고 소켓 주소를 쓴다.
# **첫 항목을 쓰면 안 된다** — 클라이언트가 마음대로 채워 보내 제한을 우회한다.
TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS", "1"))

CHAT_RATE_PER_MINUTE = int(os.environ.get("CHAT_RATE_PER_MINUTE", "10"))
DAILY_TOKEN_BUDGET = int(os.environ.get("DAILY_TOKEN_BUDGET", "300000"))
# OpenAI usage는 완료 뒤에만 알 수 있다. 동시 요청이 예산을 넘지 않도록
# 입력 추정치와 출력 상한을 먼저 예약하고, 완료 후 실제 사용량으로 정산한다.
CHAT_INPUT_TOKEN_RESERVE = int(os.environ.get("CHAT_INPUT_TOKEN_RESERVE", "2500"))

FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]
# 기본값을 좁히지 않는 이유: `ALLOWED_ORIGINS`가 빠진 배포에서 프론트가 그냥 죽는다.
# 대신 **조용하지 않게** 만든다 — 와일드카드로 뜨면 시작 로그가 그렇게 말한다.
# 진짜 잠그는 것은 C3(rate limit·상한)과 함께 판단한다.
CORS_IS_WILDCARD = "*" in ALLOWED_ORIGINS
