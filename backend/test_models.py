"""입력 검증 규칙 자체 점검. `python test_models.py`로 실행 (프레임워크 불필요)."""

from pydantic import ValidationError

from app import models


def expect_reject(fn, label):
    try:
        fn()
    except ValidationError:
        print(f"OK  거절됨: {label}")
    else:
        raise AssertionError(f"거절됐어야 함: {label}")


def expect_ok(fn, label):
    fn()
    print(f"OK  통과: {label}")


def main():
    # --- DataRecordIn ---
    expect_ok(lambda: models.DataRecordIn(date="2025-03-01", value=100, memo="정상"), "정상 레코드")
    expect_reject(lambda: models.DataRecordIn(date="2025-3-1", value=1), "날짜 형식 위반")
    expect_reject(lambda: models.DataRecordIn(date="2025-02-30", value=1), "존재하지 않는 날짜")
    expect_reject(lambda: models.DataRecordIn(date="2025-03-01", value=float("inf")), "value=Inf")
    expect_reject(lambda: models.DataRecordIn(date="2025-03-01", value=float("nan")), "value=NaN")
    expect_reject(lambda: models.DataRecordIn(date="2025-03-01", value=1e18), "value 상한 초과")
    expect_reject(
        lambda: models.DataRecordIn(date="2025-03-01", value=1, memo="x" * (models.MEMO_MAX + 1)),
        "memo 길이 초과",
    )

    # 제어문자는 저장 전에 제거된다
    r = models.DataRecordIn(date="2025-03-01", value=1, memo="a\x00b\x07c  ")
    assert r.memo == "abc", r.memo
    print("OK  memo 제어문자 제거:", repr(r.memo))

    # --- ChatRequest ---
    expect_ok(lambda: models.ChatRequest(message="안녕"), "정상 메시지")
    expect_reject(lambda: models.ChatRequest(message=""), "빈 메시지")
    expect_reject(lambda: models.ChatRequest(message="   "), "공백뿐인 메시지")
    expect_reject(lambda: models.ChatRequest(message="x" * (models.MESSAGE_MAX + 1)), "메시지 길이 초과")

    # --- ConversationIn ---
    expect_reject(
        lambda: models.ConversationIn(title="t" * (models.TITLE_MAX + 1)), "title 길이 초과"
    )

    # --- ChatRequest.context: 선택한 분석 주제 화이트리스트 ---
    r = models.ChatRequest(message="안녕", context={"topic": "업종별 증감", "evil": "무시됨"})
    assert r.context == {"topic": "업종별 증감"}, r.context
    print("OK  통과: context는 허용 키(topic)만 남긴다:", r.context)

    r = models.ChatRequest(message="안녕", context={"topic": "x" * 200})
    assert len(r.context["topic"]) == models.CONTEXT_VALUE_MAX, r.context
    print("OK  통과: context 값 길이 상한 적용")

    r = models.ChatRequest(message="안녕", context={"topic": "  "})
    assert r.context is None, r.context
    print("OK  통과: 빈 context는 None으로 정규화")

    # mode는 키뿐 아니라 값도 화이트리스트다 (A14 리포트 경로 분기)
    r = models.ChatRequest(message="안녕", context={"topic": "공급 밀도", "mode": "report"})
    assert r.context == {"topic": "공급 밀도", "mode": "report"}, r.context
    r = models.ChatRequest(message="안녕", context={"topic": "공급 밀도", "mode": "evil"})
    assert r.context == {"topic": "공급 밀도"}, r.context
    print("OK  통과: context.mode는 허용 값(report)만 남긴다")

    # persona도 값 화이트리스트다 (A28)
    r = models.ChatRequest(message="안녕", context={"persona": "prepare"})
    assert r.context == {"persona": "prepare"}, r.context
    r = models.ChatRequest(message="안녕", context={"persona": "ceo"})
    assert r.context is None, r.context
    print("OK  통과: context.persona는 허용 값(explore·prepare·running)만 남긴다")

    # --- chat_service._build_screen_block ---
    from app.services.chat_service import _build_screen_block

    assert _build_screen_block(None) == ""
    assert _build_screen_block({}) == ""
    assert _build_screen_block({"district": "서구"}) == ""  # topic 외 키는 무시
    block = _build_screen_block({"topic": "점포 교체율"})
    assert "[선택한 분석 주제]" in block and "주제: 점포 교체율" in block, block
    print("OK  통과: _build_screen_block이 선택 주제 블록을 만든다")

    # A26 지역 유형도 값 화이트리스트다
    r = models.ChatRequest(message="안녕", context={"regionType": "dense_churn"})
    assert r.context == {"regionType": "dense_churn"}, r.context
    r = models.ChatRequest(message="안녕", context={"regionType": "좋은곳"})
    assert r.context is None, r.context
    print("OK  통과: context.regionType은 허용 값 5종만 남긴다")

    # 유형 블록은 "좋다/나쁘다로 답하지 말라"를 반드시 담아야 한다.
    # 이 문장이 빠지면 AI가 "좋은 지역 유형입니다"라고 답한다 — 실제로 그랬다.
    from app.services.chat_service import _build_region_type_block, REGION_TYPE_HINTS

    assert _build_region_type_block(None) == ""
    assert _build_region_type_block({"regionType": "없는값"}) == ""
    for key in REGION_TYPE_HINTS:
        b = _build_region_type_block({"regionType": key})
        assert "평가나 점수가 아니다" in b, key
        assert "좋다·나쁘다로 답하지 말고" in b, key
        assert "매출·유동인구" in b, key
    print(f"OK  통과: 지역 유형 {len(REGION_TYPE_HINTS)}종 전부 평가 금지 문구를 담는다")

    # --- 프롬프트 캐시 프리픽스: 가변 블록이 앞으로 올라오면 조용히 깨진다 ---
    # OpenAI 자동 캐싱은 앞에서부터 같은 구간만 재사용하고 1,024토큰 이상이어야 붙는다.
    # 요약·주제·페르소나 중 하나라도 위로 올라가면 그 뒤가 전부 캐시에서 빠지는데,
    # 응답은 멀쩡해서 아무도 모른다. 그래서 프리픽스 길이를 여기서 지킨다.
    from app.services.chat_service import SYSTEM_PROMPT_TEMPLATE, _INSIGHTS

    def render(period, count, ctx):
        return SYSTEM_PROMPT_TEMPLATE.format(
            period=period, count=count, metrics="{}", trend="유지",
            insights=_INSIGHTS, screen_block=_build_screen_block(ctx),
        )

    variants = [
        render("2025-03-01 ~ 2026-06-01", 492, {"topic": "공급 밀도", "persona": "prepare"}),
        render("2020-01-01 ~ 2020-02-01", 7, {"topic": "점포 교체율", "mode": "report"}),
        render("1999-12-31 ~ 1999-12-31", 0, None),  # 주제도 페르소나도 없는 요청
    ]
    a = variants[0]
    shared = 0
    while shared < min(len(v) for v in variants) and len({v[shared] for v in variants}) == 1:
        shared += 1
    # 한국어는 문자당 대략 0.6토큰 아래로 내려가지 않는다. 2,000자면 1,024토큰을 넘는다.
    assert shared >= 2000, f"고정 프리픽스가 {shared}자뿐 — 가변 블록이 앞으로 올라왔다"
    assert "[사전 분석 리포트]" in a[:shared], "리포트가 프리픽스 밖에 있다"
    assert "규칙:" in a[:shared], "규칙 블록이 프리픽스 밖에 있다"
    # 규칙 본문이 "[선택한 분석 주제]"를 언급하므로 블록 헤더로는 판별이 안 된다.
    # 실제로 값이 들어가는 줄로 본다.
    assert "- 주제: " not in a[:shared], "선택 주제 값이 프리픽스 안에 들어갔다"
    print(f"OK  통과: 프롬프트 고정 프리픽스 {shared}자 (캐시 임계 1,024토큰 충족)")

    # --- main._json_safe: 검증 에러 응답 직렬화 안전장치 ---
    from main import _json_safe

    out = _json_safe([{"input": float("inf")}, {"input": float("nan")}, {"x": 1}])
    assert out == [{"input": "inf"}, {"input": "nan"}, {"x": 1}], out
    print("OK  통과: _json_safe가 Inf/NaN을 문자열로 치환")

    print("\n모든 검증 규칙 통과.")


if __name__ == "__main__":
    main()
