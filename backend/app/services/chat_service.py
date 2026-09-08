from pathlib import Path
from typing import Optional

from openai import OpenAI

from .. import config
from . import conversation_service, data_service

# 사전 분석 리포트(고정 스냅샷). 없으면 빈 문자열로 두고 실시간 요약만 주입한다.
_INSIGHTS_PATH = Path(__file__).resolve().parents[1] / "seed" / "insights.md"
try:
    _INSIGHTS = _INSIGHTS_PATH.read_text(encoding="utf-8").strip()
except OSError:
    _INSIGHTS = ""

SYSTEM_PROMPT_TEMPLATE = """당신은 사용자의 데이터를 잘 아는 상권 분석 비서입니다.

[실시간 데이터 요약] — 현재 저장된 레코드 기준, 편집하면 갱신됨
- 데이터 기간: {period}
- 총 레코드: {count}개
- 주요 지표: {metrics}
- 최근 트렌드: {trend}

[사전 분석 리포트] — 2025-03~2026-06 대전 상권 분석의 고정 스냅샷
{insights}

규칙:
- 수치를 묻는 질문은 [실시간 데이터 요약]을 우선한다. 배경·해석·지역/업종별 세부는 [사전 분석 리포트]를 활용한다.
- 리포트에 없는 지역·수치는 지어내지 말고 "그 부분은 리포트에 없다"고 답한다.
- 구체적이고 친근하게, 근거가 된 수치를 함께 제시한다."""

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
        insights=_INSIGHTS or "(사전 분석 리포트 없음)",
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
