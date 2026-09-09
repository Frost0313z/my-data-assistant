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

FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]
