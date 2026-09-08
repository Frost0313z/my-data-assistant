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

    # --- main._json_safe: 검증 에러 응답 직렬화 안전장치 ---
    from main import _json_safe

    out = _json_safe([{"input": float("inf")}, {"input": float("nan")}, {"x": 1}])
    assert out == [{"input": "inf"}, {"input": "nan"}, {"x": 1}], out
    print("OK  통과: _json_safe가 Inf/NaN을 문자열로 치환")

    print("\n모든 검증 규칙 통과.")


if __name__ == "__main__":
    main()
