from datetime import datetime, timezone

from firebase_admin import firestore

from .. import models
from ..firestore_client import get_db

COLLECTION = "conversations"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_conversations():
    docs = (
        get_db()
        .collection(COLLECTION)
        .order_by("updated_at", direction="DESCENDING")
        .stream()
    )
    result = []
    for doc in docs:
        data = doc.to_dict()
        result.append(
            models.ConversationOut(
                id=doc.id,
                title=data.get("title", "제목 없음"),
                updated_at=data.get("updated_at", ""),
            )
        )
    return result


def get_conversation(conversation_id: str):
    doc = get_db().collection(COLLECTION).document(conversation_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    return models.ConversationOut(
        id=doc.id,
        title=data.get("title", "제목 없음"),
        updated_at=data.get("updated_at", ""),
        messages=[models.ChatMessage(**m) for m in data.get("messages", [])],
    )


def create_conversation(payload: models.ConversationIn) -> models.ConversationOut:
    title = payload.title or (payload.messages[0].content[:30] if payload.messages else "새 대화")
    data = {
        "title": title,
        "messages": [m.model_dump() for m in payload.messages],
        "updated_at": _now(),
    }
    _, ref = get_db().collection(COLLECTION).add(data)
    return get_conversation(ref.id)


def delete_conversation(conversation_id: str) -> None:
    get_db().collection(COLLECTION).document(conversation_id).delete()


def _derive_title(user_message: str, topic: str | None) -> str:
    """A13: 대화 제목 앞에 주제를 붙인다.

    첫 메시지에서만 파생하면 '이 주제 핵심만 한 줄로' 같은 제목이 중복 누적돼
    기록에서 서로 구분되지 않는다. 주제를 앞에 두면 목록만 보고 갈라진다.
    """
    head = user_message[:30]
    title = f"[{topic}] {head}" if topic else head
    return title[: models.TITLE_MAX]


@firestore.transactional
def _append_in_transaction(transaction, ref, turns) -> bool:
    """읽기와 쓰기를 한 트랜잭션에 묶는다. 붙였으면 True, 문서가 없으면 False.

    트랜잭션 밖에서 읽고-고쳐-쓰면 같은 대화에 두 요청이 겹칠 때 나중 것이 앞의 턴을
    통째로 덮어써 대화가 사라진다. `messages`가 배열 하나라 부분 갱신이 안 되기 때문이다.

    ArrayUnion을 쓰지 않은 이유: 합집합이라 **같은 질문을 두 번 하면 두 번째가 조용히
    사라진다.** 대화 기록에는 쓸 수 없는 의미다.
    """
    snap = ref.get(transaction=transaction)
    if not snap.exists:
        return False
    messages = (snap.to_dict() or {}).get("messages", []) + turns
    transaction.update(ref, {"messages": messages, "updated_at": _now()})
    return True


def append_turn(
    conversation_id: str | None,
    user_message: str,
    assistant_message: str,
    topic: str | None = None,
) -> str:
    """conversation_id가 없으면 새 대화를 만들고, 있으면 이어붙인다 (채팅 API의 자동 저장용)."""
    db = get_db()
    turns = [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": assistant_message},
    ]

    if conversation_id:
        ref = db.collection(COLLECTION).document(conversation_id)
        if _append_in_transaction(db.transaction(), ref, turns):
            return ref.id
        # 문서가 사라졌으면(삭제 등) 새 대화로 떨어진다

    # 제목은 대화를 처음 만들 때만 정한다. 이어붙일 때 갱신하면 기록 목록이
    # 마지막 질문을 따라 계속 흔들려 식별 가치가 사라진다.
    _, ref = db.collection(COLLECTION).add(
        {
            "title": _derive_title(user_message, topic),
            "messages": turns,
            "updated_at": _now(),
        }
    )
    return ref.id
