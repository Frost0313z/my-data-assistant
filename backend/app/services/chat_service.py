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
- 사용자가 "지금 화면", "이 지역", "여기" 등으로 물으면 [현재 보고 있는 화면]의 선택값을 기준으로 답한다.
- 리포트에 없는 지역·수치는 지어내지 말고 "그 부분은 리포트에 없다"고 답한다.
- 구체적이고 친근하게, 근거가 된 수치를 함께 제시한다."""

_SCREEN_LABELS = {
    "district": "자치구",
    "dong": "행정동",
    "category": "업종",
    "metric": "선택 지표",
    "period": "비교 기간",
    "mapPeriod": "지도 관측 시점",
}


def _build_screen_block(context: Optional[Dict[str, str]]) -> str:
    """대시보드에서 사용자가 지금 보고 있는 필터 상태를 프롬프트 블록으로 만든다."""
    if not context:
        return ""
    lines = [
        f"- {_SCREEN_LABELS.get(key, key)}: {value}"
        for key, value in context.items()
        if key in _SCREEN_LABELS and value
    ]
    if not lines:
        return ""
    return "\n[현재 보고 있는 화면] — 사용자가 대시보드에서 선택한 필터\n" + "\n".join(lines) + "\n"

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
) -> tuple[str, str]:
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

    saved_id = conversation_service.append_turn(conversation_id, message, reply)
    return saved_id, reply
