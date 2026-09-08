from pathlib import Path
from typing import Dict, Optional

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
{screen_block}
규칙:
- 수치를 묻는 질문은 [실시간 데이터 요약]을 우선한다. 배경·해석·지역/업종별 세부는 [사전 분석 리포트]를 활용한다.
- **[선택한 분석 주제]는 항상 최신 상태다. 이전 대화에서 다른 주제를 다뤘더라도, 지금 주어진 주제가 우선한다.** 사용자가 주제를 바꿨다면 이전 주제 이야기를 이어가지 말고 새 주제로 옮겨간다.
- **[선택한 분석 주제]가 있으면 답변 첫 문장에서 어떤 주제 기준으로 답하는지 자연스럽게 밝힌다.** (예: "점포 교체율 기준으로 보면, …") 사용자가 "이 주제", "지금 보고 있는", "여기" 등으로 물으면 그 주제를 가리키는 것으로 해석하고, [사전 분석 리포트]의 해당 섹션을 중심으로 답한다.
- [선택한 분석 주제]가 없으면 주제를 지어내지 말고 전체 관점에서 답하되, 주제를 고르면 더 자세히 볼 수 있다고 한 번만 안내한다.
- 리포트에 없는 지역·수치는 지어내지 말고 "그 부분은 리포트에 없다"고 답한다.
- 구체적이고 친근하게, 근거가 된 수치를 함께 제시한다."""


def _build_screen_block(context: Optional[Dict[str, str]]) -> str:
    """사용자가 화면에서 고른 분석 주제를 프롬프트 블록으로 만든다."""
    topic = (context or {}).get("topic")
    if not topic:
        return ""
    return f"\n[선택한 분석 주제] — 사용자가 화면에서 고른 주제\n- 주제: {topic}\n"

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def ask(
    message: str,
    conversation_id: Optional[str],
    context: Optional[Dict[str, str]] = None,
) -> tuple[str, str, Optional[Dict[str, int]]]:
    summary = data_service.get_summary()
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        period=summary.period,
        count=summary.count,
        metrics=summary.metrics,
        trend=summary.trend,
        insights=_INSIGHTS or "(사전 분석 리포트 없음)",
        screen_block=_build_screen_block(context),
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

    # 토큰 사용량 — 프론트에서 답변 아래 작은 문구로 보여준다.
    raw = getattr(response, "usage", None)
    usage = (
        {
            "prompt_tokens": raw.prompt_tokens,
            "completion_tokens": raw.completion_tokens,
            "total_tokens": raw.total_tokens,
        }
        if raw
        else None
    )

    saved_id = conversation_service.append_turn(conversation_id, message, reply)
    return saved_id, reply, usage
