"""채팅 경로 — 화면 컨텍스트가 프롬프트까지 정확히 흐르는지."""

import pytest

from app.services import chat_service


def ask(client, message="질문", context=None):
    body = {"message": message}
    if context is not None:
        body["context"] = context
    return client.post("/api/chat", json=body)


def test_답변과_토큰_사용량이_돌아온다(client, openai):
    body = ask(client).json()
    assert body["reply"] == "테스트 답변"
    assert body["usage"]["total_tokens"] == 120
    assert body["conversation_id"]


def test_대화가_저장되고_이어진다(client, openai):
    first = ask(client, "첫 질문").json()
    second = ask(client, "두 번째 질문")
    # conversation_id를 주면 같은 대화에 붙는다
    body = client.post(
        "/api/chat",
        json={"message": "세 번째 질문", "conversation_id": first["conversation_id"]},
    ).json()
    assert body["conversation_id"] == first["conversation_id"]
    saved = client.get(f"/api/conversations/{first['conversation_id']}").json()
    assert [m["content"] for m in saved["messages"]][::2] == ["첫 질문", "세 번째 질문"]
    assert second.status_code == 200


def test_이력이_상한만큼만_올라간다(client, openai):
    """상한이 없으면 입력 토큰이 대화 길이에 비례해 늘어난다."""
    from app import config

    cid = ask(client, "0").json()["conversation_id"]
    for i in range(1, 8):
        client.post("/api/chat", json={"message": str(i), "conversation_id": cid})

    sent = openai.calls[-1]["messages"]
    history = sent[1:-1]  # 시스템 프롬프트와 이번 질문 제외
    assert len(history) == config.HISTORY_MAX_MESSAGES


@pytest.mark.parametrize(
    "context, expected",
    [
        ({"topic": "공급 밀도"}, "주제: 공급 밀도"),
        ({"topic": "x", "evil": "무시됨"}, "무시됨"),
    ],
    ids=["주제가_프롬프트에_들어간다", "허용되지_않은_키는_안_들어간다"],
)
def test_컨텍스트_화이트리스트(client, openai, context, expected):
    ask(client, context=context)
    prompt = openai.system_prompt
    if "evil" in context:
        assert expected not in prompt
    else:
        assert expected in prompt


def test_리포트_모드는_네_블록을_요구하고_상한이_다르다(client, openai):
    from app import config

    ask(client, context={"topic": "공급 밀도", "mode": "report"})
    prompt = openai.system_prompt
    for block in ("## 요약", "## 핵심 수치", "## 해석", "## 한계"):
        assert block in prompt
    assert "매출·유동인구" in prompt
    assert openai.calls[-1]["max_tokens"] == config.REPORT_MAX_TOKENS


def test_일반_답변_상한(client, openai):
    from app import config

    ask(client)
    assert openai.calls[-1]["max_tokens"] == config.CHAT_MAX_TOKENS


def test_페르소나가_프롬프트에_들어간다(client, openai):
    ask(client, context={"persona": "prepare"})
    prompt = openai.system_prompt
    assert "[사용자 상황]" in prompt
    assert "창업할 곳을 고르는 중" in prompt
    # 페르소나가 있어도 권유 금지·한계 고지는 유지된다
    assert "권하거나 말리지 않고" in prompt


def test_허용되지_않은_페르소나는_무시된다(client, openai):
    ask(client, context={"persona": "ceo"})
    assert "[사용자 상황]" not in openai.system_prompt


def test_지역_유형은_평가하지_말라는_규칙과_함께_들어간다(client, openai):
    """A26. 유형은 화면이 만든 구분이라, 안 알려주면 AI가 다른 지표로 갈아타
    '좋은 지역 유형입니다'라고 답한다 — 실제로 그랬다."""
    ask(client, context={"topic": "지역 유형", "regionType": "dense_churn"})
    prompt = openai.system_prompt
    assert "[화면의 지역 유형]" in prompt
    assert "가게가 많고" in prompt
    assert "평가나 점수가 아니다" in prompt
    assert "좋다·나쁘다로 답하지 말고" in prompt


@pytest.mark.parametrize("key", sorted(chat_service.REGION_TYPE_HINTS))
def test_모든_지역_유형이_설명을_갖는다(client, openai, key):
    ask(client, context={"regionType": key})
    assert "[화면의 지역 유형]" in openai.system_prompt


def test_프롬프트_고정_프리픽스가_캐시_임계를_넘는다(client, openai):
    """OpenAI 자동 캐싱은 **앞에서부터 같은 구간**만 1,024토큰 이상일 때 재사용한다.
    가변 블록(요약·주제·페르소나)이 하나라도 앞으로 올라오면 그 뒤가 전부 캐시에서
    빠지는데, 응답은 멀쩡해서 아무도 모른다. 그래서 여기서 길이를 지킨다."""
    ask(client, context={"topic": "공급 밀도", "persona": "prepare"})
    a = openai.system_prompt
    ask(client, context={"topic": "점포 교체율", "mode": "report"})
    b = openai.system_prompt
    ask(client)
    c = openai.system_prompt

    shared = 0
    while shared < min(len(a), len(b), len(c)) and a[shared] == b[shared] == c[shared]:
        shared += 1

    # 한국어는 문자당 대략 0.6토큰 아래로 내려가지 않는다. 2,000자면 1,024토큰을 넘는다.
    assert shared >= 2000, f"고정 프리픽스가 {shared}자뿐 — 가변 블록이 앞으로 올라왔다"
    assert "[사전 분석 리포트]" in a[:shared]
    assert "규칙:" in a[:shared]
    assert "- 주제: " not in a[:shared]


def test_빈_메시지는_422(client, openai):
    assert client.post("/api/chat", json={"message": "   "}).status_code == 422
    assert openai.calls == [], "검증에서 막혔는데 OpenAI를 불렀다"
