from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class DataRecordIn(BaseModel):
    date: str = Field(..., description="YYYY-MM-DD")
    value: float
    memo: str = ""


class DataRecordOut(DataRecordIn):
    id: str


class DataSummary(BaseModel):
    period: str
    count: int
    metrics: dict
    trend: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ConversationIn(BaseModel):
    title: Optional[str] = None
    messages: List[ChatMessage] = []


class ConversationOut(BaseModel):
    id: str
    title: str
    updated_at: str
    messages: Optional[List[ChatMessage]] = None


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str
