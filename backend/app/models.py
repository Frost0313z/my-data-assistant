import re
from datetime import date as _date
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# 제어문자(탭/개행 제외)를 걸러내는 화이트리스트성 필터. 입력·저장·프롬프트 주입 모든 경로에 적용된다.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# 길이 상한 (문자 수 기준). 초과 시 422로 거절한다.
# B2 차원 필드(자치구·행정동·업종). 값이 짧아 상한도 짧다.
DIMENSION_MAX = 40
MEMO_MAX = 500
MESSAGE_MAX = 2000
TITLE_MAX = 100
CONTENT_MAX = 8000

# 화면 상태(context): 사용자가 고른 분석 주제와 요청 모드. 허용 키 화이트리스트 + 값 길이 상한.
# 프론트가 이미 정제하지만, 프롬프트에 직접 들어가므로 서버에서도 좁게 통과시킨다.
CONTEXT_KEYS = {"topic", "mode", "persona", "regionType"}
CONTEXT_VALUE_MAX = 80

# mode·persona·regionType은 키뿐 아니라 값도 화이트리스트다. topic과 달리 프롬프트 분기를
# 결정하므로 임의 문자열이 들어오면 의도하지 않은 경로를 탈 수 있다.
CONTEXT_MODES = {"report"}
CONTEXT_PERSONAS = {"explore", "prepare", "running"}
# A26 지역 유형. 화면이 만든 구분이라 리포트에는 없다 — 무슨 뜻인지 백엔드가 알려줘야
# AI가 "좋은 지역 유형입니다" 같은 답을 하지 않는다.
CONTEXT_REGION_TYPES = {"dense_stable", "dense_churn", "sparse_stable", "sparse_churn", "aside"}
CONTEXT_ENUMS = {
    "mode": CONTEXT_MODES,
    "persona": CONTEXT_PERSONAS,
    "regionType": CONTEXT_REGION_TYPES,
}


def _clean_text(value: str) -> str:
    """제어문자 제거 + 양끝 공백 정리. 값 자체를 바꾸므로 저장·표시에 그대로 쓸 수 있다."""
    return _CONTROL_CHARS.sub("", value).strip()


class DataRecordIn(BaseModel):
    # 날짜: YYYY-MM-DD 형식만 허용(정규식 화이트리스트) + 실제 달력상 유효한 날짜인지 확인
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD")
    # 값: 유한 실수만. NaN/Inf 거부, 상식 밖 크기 거부
    value: float = Field(..., ge=-1e12, le=1e12, allow_inf_nan=False)
    # 메모: 길이 제한 + 제어문자 제거
    memo: str = Field("", max_length=MEMO_MAX)
    # B2: 자치구·행정동·주력업종. 예전에는 셋 다 memo에 문자열로 뭉쳐 있어 필터를
    # 걸 수 없었다. 선택 필드로 두는 이유는 예전 레코드에는 없기 때문이다 —
    # 필수로 바꾸면 이미 저장된 것들이 전부 읽히지 않는다.
    district: str = Field("", max_length=DIMENSION_MAX)
    dong: str = Field("", max_length=DIMENSION_MAX)
    industry: str = Field("", max_length=DIMENSION_MAX)

    @field_validator("district", "dong", "industry")
    @classmethod
    def _clean_dimension(cls, v: str) -> str:
        return _clean_text(v)

    @field_validator("date")
    @classmethod
    def _valid_calendar_date(cls, v: str) -> str:
        try:
            _date.fromisoformat(v)
        except ValueError:
            raise ValueError("존재하지 않는 날짜입니다 (YYYY-MM-DD)")
        return v

    @field_validator("memo")
    @classmethod
    def _clean_memo(cls, v: str) -> str:
        return _clean_text(v)


class DataRecordOut(DataRecordIn):
    id: str


class DataSummary(BaseModel):
    period: str
    count: int
    metrics: dict
    trend: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=CONTENT_MAX)

    @field_validator("content")
    @classmethod
    def _clean_content(cls, v: str) -> str:
        return _clean_text(v)


class ConversationIn(BaseModel):
    title: Optional[str] = Field(None, max_length=TITLE_MAX)
    messages: List[ChatMessage] = []

    @field_validator("title")
    @classmethod
    def _clean_title(cls, v: Optional[str]) -> Optional[str]:
        return _clean_text(v) if v is not None else v


class ConversationOut(BaseModel):
    id: str
    title: str
    updated_at: str
    messages: Optional[List[ChatMessage]] = None


class ChatRequest(BaseModel):
    # 채팅 입력: 빈 문자열 거부, 상한 2000자, 제어문자 제거
    message: str = Field(..., min_length=1, max_length=MESSAGE_MAX)
    conversation_id: Optional[str] = None
    # 화면에서 고른 분석 주제 등. 허용 키만, 값은 정제된 짧은 문자열.
    context: Optional[Dict[str, str]] = None

    @field_validator("message")
    @classmethod
    def _clean_message(cls, v: str) -> str:
        cleaned = _clean_text(v)
        if not cleaned:
            raise ValueError("빈 메시지는 보낼 수 없습니다")
        return cleaned

    @field_validator("context")
    @classmethod
    def _clean_context(cls, v: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
        if not v:
            return None
        cleaned = {}
        for key, value in v.items():
            if key not in CONTEXT_KEYS or not isinstance(value, str):
                continue
            text = _clean_text(value)[:CONTEXT_VALUE_MAX]
            # 허용되지 않은 값은 키 자체를 버린다(422가 아니라 무시).
            # 알 수 없는 키를 조용히 떨구는 기존 동작과 같은 규칙을 값에도 적용한다.
            allowed = CONTEXT_ENUMS.get(key)
            if allowed is not None and text not in allowed:
                continue
            if text:
                cleaned[key] = text
        return cleaned or None


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str
    # OpenAI 토큰 사용량 (prompt/completion/total). 응답 실패 시 None.
    usage: Optional[Dict[str, int]] = None
