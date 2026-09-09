"""입력 검증 규칙 — 신뢰 경계에서 모델이 무엇을 걸러내는지.

라우터를 거치지 않고 모델을 직접 본다. HTTP 왕복은 `test_data_api.py`가 맡는다.
"""

import pytest
from pydantic import ValidationError

from app import models


@pytest.mark.parametrize(
    "kwargs",
    [
        {"date": "2025-3-1", "value": 1},
        {"date": "2025-02-30", "value": 1},
        {"date": "2025-03-01", "value": float("inf")},
        {"date": "2025-03-01", "value": float("nan")},
        {"date": "2025-03-01", "value": 1e18},
        {"date": "2025-03-01", "value": 1, "memo": "x" * (models.MEMO_MAX + 1)},
    ],
    ids=["날짜형식", "없는날짜", "Inf", "NaN", "값상한", "memo길이"],
)
def test_잘못된_레코드는_거절된다(kwargs):
    with pytest.raises(ValidationError):
        models.DataRecordIn(**kwargs)


def test_정상_레코드는_통과한다():
    assert models.DataRecordIn(date="2025-03-01", value=100, memo="정상").value == 100


def test_memo의_제어문자는_저장_전에_제거된다():
    assert models.DataRecordIn(date="2025-03-01", value=1, memo="a\x00b\x07c  ").memo == "abc"


@pytest.mark.parametrize(
    "message", ["", "   ", "x" * (models.MESSAGE_MAX + 1)], ids=["빈값", "공백뿐", "길이초과"]
)
def test_잘못된_메시지는_거절된다(message):
    with pytest.raises(ValidationError):
        models.ChatRequest(message=message)


def test_title_길이_상한():
    with pytest.raises(ValidationError):
        models.ConversationIn(title="t" * (models.TITLE_MAX + 1))


# --- context: 키와 값을 둘 다 좁힌다 ---


def test_허용되지_않은_키는_버린다():
    r = models.ChatRequest(message="안녕", context={"topic": "업종별 증감", "evil": "무시됨"})
    assert r.context == {"topic": "업종별 증감"}


def test_값_길이_상한이_적용된다():
    r = models.ChatRequest(message="안녕", context={"topic": "x" * 200})
    assert len(r.context["topic"]) == models.CONTEXT_VALUE_MAX


def test_빈_context는_None으로_정규화된다():
    assert models.ChatRequest(message="안녕", context={"topic": "  "}).context is None


@pytest.mark.parametrize(
    "key, values",
    [
        ("mode", models.CONTEXT_MODES),
        ("persona", models.CONTEXT_PERSONAS),
        ("regionType", models.CONTEXT_REGION_TYPES),
    ],
)
def test_열거형_키는_값도_화이트리스트다(key, values):
    """이 세 키는 프롬프트 분기를 결정한다. 임의 문자열이 들어오면 의도하지 않은
    경로를 탄다."""
    for value in values:
        assert models.ChatRequest(message="안녕", context={key: value}).context == {key: value}
    assert models.ChatRequest(message="안녕", context={key: "허용안된값"}).context is None


# --- 화면 컨텍스트 → 프롬프트 블록 ---


def test_주제가_없으면_블록도_없다():
    from app.services.chat_service import _build_screen_block

    assert _build_screen_block(None) == ""
    assert _build_screen_block({}) == ""
    assert _build_screen_block({"district": "서구"}) == ""  # 허용되지 않은 키


def test_주제_블록이_만들어진다():
    from app.services.chat_service import _build_screen_block

    block = _build_screen_block({"topic": "점포 교체율"})
    assert "[선택한 분석 주제]" in block and "주제: 점포 교체율" in block


def test_모든_지역_유형이_평가_금지_문구를_담는다():
    """이 문장이 빠지면 AI가 '좋은 지역 유형입니다'라고 답한다 — 실제로 그랬다."""
    from app.services.chat_service import REGION_TYPE_HINTS, _build_region_type_block

    assert _build_region_type_block(None) == ""
    assert _build_region_type_block({"regionType": "없는값"}) == ""
    for key in REGION_TYPE_HINTS:
        block = _build_region_type_block({"regionType": key})
        assert "평가나 점수가 아니다" in block
        assert "좋다·나쁘다로 답하지 말고" in block
        assert "매출·유동인구" in block


def test_json_safe가_Inf와_NaN을_문자열로_바꾼다():
    """안 바꾸면 422 응답 직렬화 자체가 500으로 터진다."""
    from main import _json_safe

    assert _json_safe([{"input": float("inf")}, {"input": float("nan")}, {"x": 1}]) == [
        {"input": "inf"},
        {"input": "nan"},
        {"x": 1},
    ]
