import os

from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
CHAT_MAX_TOKENS = int(os.environ.get("CHAT_MAX_TOKENS", "500"))
# 주제 리포트(A14)는 4블록 구조를 채워야 해서 일반 답변보다 상한이 커야 한다.
# 500으로는 [한계] 블록이 잘려 나가는데, 그 블록이 이 서비스의 차별점이라 잘리면 안 된다.
REPORT_MAX_TOKENS = int(os.environ.get("REPORT_MAX_TOKENS", "1200"))

FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]
