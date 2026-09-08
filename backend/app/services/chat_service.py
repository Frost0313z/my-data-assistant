from typing import Optional

from openai import OpenAI

from .. import config
from . import conversation_service, data_service

SYSTEM_PROMPT_TEMPLATE = """당신은 사용자의 데이터를 잘 아는 분석 비서입니다.

[사용자 데이터 요약]
- 데이터 기간: {period}
- 총 레코드: {count}개
- 주요 지표: {metrics}
- 최근 트렌드: {trend}

위 데이터를 근거로 구체적이고 친근하게 답변하세요."""

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def ask(message: str, conversation_id: Optional[str]) -> tuple[str, str]:
    summary = data_service.get_summary()
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        period=summary.period,
        count=summary.count,
        metrics=summary.metrics,
        trend=summary.trend,
    )

    history = []
    if conversation_id:
        conversation = conversation_service.get_conversation(conversation_id)
        if conversation and conversation.messages:
            history = [{"role": m.role, "content": m.content} for m in conversation.messages]

    response = _get_client().chat.completions.create(
        model=config.OPENAI_MODEL,
        max_tokens=config.CHAT_MAX_TOKENS,
        messages=[
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": message},
        ],
    )
    reply = response.choices[0].message.content

    saved_id = conversation_service.append_turn(conversation_id, message, reply)
    return saved_id, reply
