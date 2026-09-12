"""같은 요청을 두 번 처리하지 않는다.

**막는 상황**: 프런트는 스트리밍이 첫 글자도 못 받고 끊기면 비스트리밍으로 한 번 더
보낸다(`chat.js`의 `sendStreaming`). 스트리밍이 아예 안 되는 환경에서는 그게 옳다.
그런데 **서버는 이미 답을 다 만들어 저장했는데 응답만 유실된** 경우가 있다 — SSE를
통째로 버퍼링하는 프록시 뒤에서 연결이 끊기면 그렇게 된다. 그러면 같은 질문에
OpenAI가 두 번 불리고(돈) 대화에 턴이 두 벌 쌓인다.

프런트가 사용자 메시지 하나당 `request_id`를 하나 만들어 **두 요청에 같은 값**을
싣는다. 여기서 그 키로 끝난 결과를 기억해 두었다가 그대로 돌려준다.

**인메모리인 이유**: 인스턴스가 하나이고(`ratelimit`과 같은 전제), Firestore에 쓰면
읽기·쓰기 비용이 드는데 이건 드물게 쓰이는 안전장치다. 재시작하면 잊는다 —
그때 최악은 예전과 같은 동작(중복 한 번)이라 후퇴가 아니다.

**소유자를 함께 본다**: 키는 난수지만, 남의 키를 주워 결과를 꺼내 가는 경로를
애초에 만들지 않는다. 대화 소유권(`conversations.py`)과 같은 규칙이다.
"""

import threading
from collections import OrderedDict

# 사용자 메시지 하나당 한 칸. 넘치면 오래된 것부터 버린다. 재시도는 원래 요청 직후에
# 오므로 깊게 쌓아 둘 이유가 없다.
MAX_ENTRIES = 256

_lock = threading.Lock()
_done: "OrderedDict[tuple[str, str], tuple[str, str, dict | None]]" = OrderedDict()


def _key(request_id: str, owner: str) -> tuple[str, str]:
    return (request_id, owner or "")


def get(request_id: str, owner: str):
    """끝난 결과가 있으면 `(conversation_id, reply, usage)`, 없으면 None."""
    if not request_id:
        return None
    with _lock:
        found = _done.get(_key(request_id, owner))
        if found is not None:
            _done.move_to_end(_key(request_id, owner))
        return found


def remember(request_id: str, owner: str, conversation_id: str, reply: str, usage) -> None:
    """**완료된** 결과만 기억한다. 실패한 요청까지 기억하면 재시도가 막힌다."""
    if not request_id:
        return
    with _lock:
        # 새 키는 OrderedDict가 알아서 끝에 붙인다. 같은 키를 두 번 기억하는 경로가 없다.
        _done[_key(request_id, owner)] = (conversation_id, reply, usage)
        while len(_done) > MAX_ENTRIES:
            _done.popitem(last=False)


def reset() -> None:
    """테스트 전용."""
    with _lock:
        _done.clear()
