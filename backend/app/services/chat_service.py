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


# A14 주제 리포트. 사용자가 '이 주제 전체 리포트 보기'를 누르면 이 블록이 덧붙는다.
# 네 블록 구조가 흔들리면 리포트가 아니라 그냥 긴 답변이 되므로 제목까지 고정한다.
REPORT_INSTRUCTION = """
[리포트 모드] — 사용자가 '이 주제 전체 리포트 보기'를 눌렀다
이번 답변은 대화가 아니라 **가져갈 수 있는 산출물**이다.
아래 네 블록을 이 순서와 제목 그대로, 빠짐없이 낸다.

## 요약
주제의 핵심을 3문장 이내로. 결론을 먼저 쓴다.

## 핵심 수치
근거가 되는 수치를 3~5개. 각 줄을 `- 항목: 값 (기준)` 형태로 쓴다.
[실시간 데이터 요약]과 [사전 분석 리포트]에 **실제로 있는 값만** 쓴다.

## 해석
그 수치가 무엇을 뜻하는지 설명한다. 원인을 단정하지 말고 가능한 설명으로 제시한다.

## 한계
이 리포트로 알 수 없는 것을 명시한다. **이 블록은 생략할 수 없다.**
매출·유동인구 데이터가 없어 상권의 실제 수익성은 판단할 수 없다는 점을 반드시 포함한다.

리포트 어투 규칙:
- "유망하다", "추천한다", "창업하세요" 같은 단정·권유 어휘를 쓰지 않는다. 결정을 대신하지 않는다.
- 증감을 좋고 나쁨으로 표현하지 않는다("호조", "부진", "개선", "악화" 금지). 방향만 말한다.
- 리포트에 없는 지역·수치는 지어내지 않는다. 없으면 [한계]에 없다고 쓴다.
"""


def _is_report(context: Optional[Dict[str, str]]) -> bool:
    """context.mode == 'report' 이면 리포트 경로를 탄다. 값은 models에서 이미 검증됐다."""
    return (context or {}).get("mode") == "report"


def _build_screen_block(context: Optional[Dict[str, str]]) -> str:
    """사용자가 화면에서 고른 분석 주제와 요청 모드를 프롬프트 블록으로 만든다."""
    topic = (context or {}).get("topic")
    block = ""
    if topic:
        block = f"\n[선택한 분석 주제] — 사용자가 화면에서 고른 주제\n- 주제: {topic}\n"
    if _is_report(context):
        block += REPORT_INSTRUCTION
    return block

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

    # 리포트는 4블록을 채워야 해서 상한이 다르다. 일반 답변 상한(500)이면 [한계]가 잘린다.
    max_tokens = config.REPORT_MAX_TOKENS if _is_report(context) else config.CHAT_MAX_TOKENS

    response = _get_client().chat.completions.create(
        model=config.OPENAI_MODEL,
        max_tokens=max_tokens,
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
