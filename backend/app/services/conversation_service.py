from datetime import datetime, timezone

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


def append_turn(conversation_id: str | None, user_message: str, assistant_message: str) -> str:
    """conversation_id가 없으면 새 대화를 만들고, 있으면 이어붙인다 (채팅 API의 자동 저장용)."""
    db = get_db()
    ref = db.collection(COLLECTION).document(conversation_id) if conversation_id else None
    messages = []
    if ref is not None:
        snap = ref.get()
        if snap.exists:
            messages = snap.to_dict().get("messages", [])
        else:
            ref = None

    messages = messages + [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": assistant_message},
    ]

    if ref is None:
        _, ref = db.collection(COLLECTION).add(
            {"title": user_message[:30], "messages": messages, "updated_at": _now()}
        )
    else:
        ref.update({"messages": messages, "updated_at": _now()})

    return ref.id
