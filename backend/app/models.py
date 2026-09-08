import re
from datetime import date as _date
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# 제어문자(탭/개행 제외)를 걸러내는 화이트리스트성 필터. 입력·저장·프롬프트 주입 모든 경로에 적용된다.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# 길이 상한 (문자 수 기준). 초과 시 422로 거절한다.
MEMO_MAX = 500
MESSAGE_MAX = 2000
TITLE_MAX = 100
CONTENT_MAX = 8000


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

    @field_validator("message")
    @classmethod
    def _clean_message(cls, v: str) -> str:
        cleaned = _clean_text(v)
        if not cleaned:
            raise ValueError("빈 메시지는 보낼 수 없습니다")
        return cleaned


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str
