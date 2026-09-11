from pathlib import Path
from typing import Dict, Optional

from openai import OpenAI

from .. import config, observability
from . import conversation_service, data_service

# 사전 분석 리포트(고정 스냅샷). 없으면 빈 문자열로 두고 실시간 요약만 주입한다.
_INSIGHTS_PATH = Path(__file__).resolve().parents[1] / "seed" / "insights.md"
try:
    _INSIGHTS = _INSIGHTS_PATH.read_text(encoding="utf-8").strip()
except OSError:
    _INSIGHTS = ""

# 블록 순서는 비용 때문에 이렇게 잡혀 있다. OpenAI 자동 프롬프트 캐싱은
# **앞에서부터 같은 부분**만 재사용하고(1,024토큰 이상), 히트하면 그 구간 입력이
# 절반 값이다. 그래서 매 요청 똑같은 것(역할·리포트·규칙)을 전부 앞에 몰고,
# 요청마다 달라지는 것(요약·주제·페르소나)을 뒤로 뺐다. 가변 블록이 하나라도
# 앞에 끼면 그 뒤 전체가 캐시에서 빠진다.
#
# 부수 효과로 [선택한 분석 주제]가 사용자 메시지 바로 앞에 오는데, "주제는 항상
# 최신 상태"라는 규칙과 방향이 같아서 손해가 아니다.
SYSTEM_PROMPT_TEMPLATE = """당신은 사용자의 데이터를 잘 아는 상권 분석 비서입니다.

[사전 분석 리포트] — 2025-03~2026-06 대전 상권 분석의 고정 스냅샷
{insights}

규칙:
- 수치를 묻는 질문은 [실시간 데이터 요약]을 우선한다. 배경·해석·지역/업종별 세부는 [사전 분석 리포트]를 활용한다.
- **[선택한 분석 주제]는 항상 최신 상태다. 이전 대화에서 다른 주제를 다뤘더라도, 지금 주어진 주제가 우선한다.** 사용자가 주제를 바꿨다면 이전 주제 이야기를 이어가지 말고 새 주제로 옮겨간다.
- **[선택한 분석 주제]가 있으면 답변 첫 문장에서 어떤 주제 기준으로 답하는지 자연스럽게 밝힌다.** (예: "점포 교체율 기준으로 보면, …") 사용자가 "이 주제", "지금 보고 있는", "여기" 등으로 물으면 그 주제를 가리키는 것으로 해석하고, [사전 분석 리포트]의 해당 섹션을 중심으로 답한다.
- [선택한 분석 주제]가 없으면 주제를 지어내지 말고 전체 관점에서 답하되, 주제를 고르면 더 자세히 볼 수 있다고 한 번만 안내한다.
- 리포트에 없는 지역·수치는 지어내지 말고 "그 부분은 리포트에 없다"고 답한다.
- 구체적이고 친근하게, 근거가 된 수치를 함께 제시한다.

[실시간 데이터 요약] — 현재 저장된 레코드 기준, 편집하면 갱신됨
- 데이터 기간: {period}
- 총 레코드: {count}개
- 주요 지표: {metrics}
- 최근 트렌드: {trend}
{screen_block}"""


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


# A28: 화면에서 고른 목적(페르소나). 같은 질문이라도 무엇을 하러 왔는지에 따라
# 짚어줘야 할 것이 다르다. 문구는 백엔드가 갖는다 — 프롬프트에 들어가는 말이라
# 프론트가 임의 문자열을 넣게 두면 프롬프트 주입 표면이 된다.
PERSONA_HINTS = {
    "explore": "아직 특정 지역을 정하지 않고 둘러보는 중이다. 여러 지역을 견주어 보여주고, 어디부터 볼지 고를 수 있게 돕는다.",
    "prepare": "창업할 곳을 고르는 중이다. 후보지의 공급 밀도·교체율·잔존율을 함께 짚고, 판단에 필요한 반대 신호도 빠뜨리지 않는다.",
    "running": "이미 가게를 운영 중이다. 업종 구성과 주변 변화에 초점을 두고, 내 업종이 속한 흐름을 설명한다.",
}


def _build_persona_block(context: Optional[Dict[str, str]]) -> str:
    hint = PERSONA_HINTS.get((context or {}).get("persona", ""))
    if not hint:
        return ""
    # 페르소나는 초점을 바꾸는 장치지 어투를 바꾸는 장치가 아니다. 창업 준비 중인
    # 사용자에게 특히 권유가 나가기 쉬워 금지 규칙을 여기서 한 번 더 못 박는다.
    return (
        f"\n[사용자 상황] — 사용자가 화면에서 직접 고른 목적\n- {hint}\n"
        "- 이 상황을 답변의 초점에만 반영한다. 상황을 알더라도 창업을 권하거나 말리지 않고, "
        "매출·유동인구가 없어 판단할 수 없는 것은 그대로 없다고 말한다.\n"
    )


# A26: 화면이 보여주는 지역 유형. 리포트에 없는 구분이라 뜻을 알려주지 않으면
# AI가 아는 다른 수치(LQ 등)로 갈아타 "좋은 지역 유형입니다"라고 답한다(실측).
REGION_TYPE_HINTS = {
    "dense_stable": "주민 수에 비해 가게가 많고, 점포 교체가 82개 동 중앙값보다 적은 곳",
    "dense_churn": "주민 수에 비해 가게가 많고, 점포 교체가 82개 동 중앙값보다 잦은 곳",
    "sparse_stable": "주민 수에 비해 가게가 적고, 점포 교체가 82개 동 중앙값보다 적은 곳",
    "sparse_churn": "주민 수에 비해 가게가 적고, 점포 교체가 82개 동 중앙값보다 잦은 곳",
    "aside": "두 축 중 하나를 믿을 수 없어 유형에 넣지 않은 곳"
    " (등록 업소가 200개 미만이라 교체율의 분모가 작거나, 밀도가 75분위의 3배를 넘어"
    " 상주인구 나눗셈이 만든 값인 경우)",
}


def _build_region_type_block(context: Optional[Dict[str, str]]) -> str:
    hint = REGION_TYPE_HINTS.get((context or {}).get("regionType", ""))
    if not hint:
        return ""
    return (
        f"\n[화면의 지역 유형] — 사용자가 보고 있는 지도가 이 동에 붙인 유형\n- {hint}\n"
        "- 이 유형은 공급 밀도와 점포 교체율을 각각 중앙값에서 자른 **묘사**이지 평가나 점수가 아니다."
        " 네 유형 사이에 좋고 나쁨의 순서가 없다.\n"
        "- 사용자가 '이 유형이 좋냐 나쁘냐'고 물으면 좋다·나쁘다로 답하지 말고,"
        " 그 판단에는 매출·유동인구가 필요한데 이 데이터에 없다고 말한다."
        " 대신 이 유형이 실제로 무엇을 뜻하는지 두 축으로 풀어서 설명한다.\n"
        "- 이 유형은 [사전 분석 리포트]에 없는 구분이다. 리포트의 다른 지표(입지계수 LQ 등)를"
        " 유형의 근거인 것처럼 섞지 않는다.\n"
    )


def _is_report(context: Optional[Dict[str, str]]) -> bool:
    """context.mode == 'report' 이면 리포트 경로를 탄다. 값은 models에서 이미 검증됐다."""
    return (context or {}).get("mode") == "report"


def _build_screen_block(context: Optional[Dict[str, str]]) -> str:
    """사용자가 화면에서 고른 분석 주제와 요청 모드를 프롬프트 블록으로 만든다."""
    topic = (context or {}).get("topic")
    block = ""
    if topic:
        block = f"\n[선택한 분석 주제] — 사용자가 화면에서 고른 주제\n- 주제: {topic}\n"
    block += _build_region_type_block(context)
    block += _build_persona_block(context)
    if _is_report(context):
        block += REPORT_INSTRUCTION
    return block

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def _prepare(message, conversation_id, context, owner):
    """시스템 프롬프트·이력·상한을 만든다. 일반 답변과 스트리밍이 같은 것을 써야
    두 경로의 답이 갈리지 않는다."""
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
        conversation = conversation_service.get_conversation(conversation_id, owner)
        if conversation and conversation.messages:
            # 최근 것부터 상한만큼만 올린다. 오래된 대화를 통째로 다시 보내는 것이
            # 입력 토큰이 늘어나는 유일한 무제한 경로였다.
            recent = conversation.messages[-config.HISTORY_MAX_MESSAGES :]
            history = [{"role": m.role, "content": m.content} for m in recent]

    # 리포트는 4블록을 채워야 해서 상한이 다르다. 일반 답변 상한(500)이면 [한계]가 잘린다.
    max_tokens = config.REPORT_MAX_TOKENS if _is_report(context) else config.CHAT_MAX_TOKENS
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": message},
    ]
    return messages, max_tokens, len(history)


def ask(
    message: str,
    conversation_id: Optional[str],
    context: Optional[Dict[str, str]] = None,
    owner: str = "",
) -> tuple[str, str, Optional[Dict[str, int]]]:
    messages, max_tokens, history_len = _prepare(message, conversation_id, context, owner)

    response = _get_client().chat.completions.create(
        model=config.OPENAI_MODEL,
        max_tokens=max_tokens,
        messages=messages,
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

    # C4: 비용을 남긴다. `cached`가 0으로 굳어지면 프롬프트 캐시 프리픽스가 깨진
    # 것이다 — 응답은 멀쩡하고 비용만 조용히 두 배가 되므로 로그가 유일한 단서다.
    if raw:
        details = getattr(raw, "prompt_tokens_details", None)
        cached = getattr(details, "cached_tokens", 0) or 0
        observability.log(
            "chat.completed",
            model=config.OPENAI_MODEL,
            prompt_tokens=raw.prompt_tokens,
            cached_tokens=cached,
            completion_tokens=raw.completion_tokens,
            max_tokens=max_tokens,
            truncated=raw.completion_tokens >= max_tokens,
            usd=observability.estimate_cost(
                config.OPENAI_MODEL, raw.prompt_tokens, cached, raw.completion_tokens
            ),
            topic=(context or {}).get("topic"),
            persona=(context or {}).get("persona"),
            history_messages=history_len,
        )

    # A13: 선택 주제를 제목에 반영한다. 기록 목록에서 대화를 구분하는 유일한 단서다.
    saved_id = conversation_service.append_turn(
        conversation_id, message, reply, (context or {}).get("topic"), owner
    )
    return saved_id, reply, usage


def stream(
    message: str,
    conversation_id: Optional[str],
    context: Optional[Dict[str, str]] = None,
    owner: str = "",
):
    """A4: 토큰이 도착하는 대로 흘려보낸다.

    콜드스타트 43초는 C6가 줄이지만, 깨어 있어도 긴 답변은 10초 넘게 걸린다.
    그동안 화면에 아무것도 안 나오면 사용자는 멈춘 줄 안다.

    `(kind, payload)`를 yield한다. 라우터가 SSE로 감싼다 — 서비스가 전송 형식을
    알 필요는 없다.

    저장은 **끝까지 받은 뒤 한 번만** 한다. 조각마다 쓰면 Firestore 쓰기가 수백 번
    일어나고, 중간에 끊긴 답을 대화 기록에 남기게 된다.
    """
    messages, max_tokens, history_len = _prepare(message, conversation_id, context, owner)

    chunks = []
    usage_raw = None
    response = _get_client().chat.completions.create(
        model=config.OPENAI_MODEL,
        max_tokens=max_tokens,
        messages=messages,
        stream=True,
        # 스트리밍은 기본적으로 usage를 안 준다. 명시해야 마지막 청크에 실려 온다 —
        # 없으면 토큰 표시(A8)와 비용 로그(C4)가 스트리밍 경로에서만 사라진다.
        stream_options={"include_usage": True},
    )
    for chunk in response:
        if getattr(chunk, "usage", None):
            usage_raw = chunk.usage
        for choice in chunk.choices or []:
            piece = getattr(choice.delta, "content", None)
            if piece:
                chunks.append(piece)
                yield "delta", piece

    reply = "".join(chunks)
    saved_id = conversation_service.append_turn(
        conversation_id, message, reply, (context or {}).get("topic"), owner
    )

    usage = (
        {
            "prompt_tokens": usage_raw.prompt_tokens,
            "completion_tokens": usage_raw.completion_tokens,
            "total_tokens": usage_raw.total_tokens,
        }
        if usage_raw
        else None
    )
    if usage_raw:
        details = getattr(usage_raw, "prompt_tokens_details", None)
        cached = getattr(details, "cached_tokens", 0) or 0
        observability.log(
            "chat.completed",
            streamed=True,
            model=config.OPENAI_MODEL,
            prompt_tokens=usage_raw.prompt_tokens,
            cached_tokens=cached,
            completion_tokens=usage_raw.completion_tokens,
            max_tokens=max_tokens,
            truncated=usage_raw.completion_tokens >= max_tokens,
            usd=observability.estimate_cost(
                config.OPENAI_MODEL, usage_raw.prompt_tokens, cached, usage_raw.completion_tokens
            ),
            topic=(context or {}).get("topic"),
            persona=(context or {}).get("persona"),
            history_messages=history_len,
        )

    yield "done", {"conversation_id": saved_id, "usage": usage}
