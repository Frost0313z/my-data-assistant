"""D3: 데모 데이터를 시드 상태로 되돌린다.

리뷰어가 화면에서 데이터를 지우거나 망가뜨려도 복구할 수 있어야 한다.
기준 상태는 **conversations 0 / data 492**다.
"""

import json
from pathlib import Path

from ..firestore_client import get_db
from . import data_service

SEED_FILE = Path(__file__).resolve().parents[1] / "seed" / "seed_data.json"
BATCH_LIMIT = 400  # Firestore 배치 한도(500)보다 낮게 잡는다


def _load_seed():
    return json.loads(SEED_FILE.read_text(encoding="utf-8"))


def _wipe(db, name: str) -> int:
    docs = list(db.collection(name).stream())
    batch = db.batch()
    for i, doc in enumerate(docs, start=1):
        batch.delete(db.collection(name).document(doc.id))
        if i % BATCH_LIMIT == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()
    return len(docs)


def reset() -> dict:
    """데이터를 시드로 되돌리고 대화 기록을 비운다.

    대화까지 비우는 이유: 기준 상태가 '대화 0건'이다. 데이터만 되돌리면 앞사람이 남긴
    대화가 그대로 보여 다음 리뷰어의 첫 화면이 깨끗하지 않다.
    """
    db = get_db()
    records = _load_seed()

    removed_data = _wipe(db, data_service.COLLECTION)
    removed_conversations = _wipe(db, "conversations")

    collection = db.collection(data_service.COLLECTION)
    batch = db.batch()
    for i, record in enumerate(records, start=1):
        batch.set(collection.document(), record)
        if i % BATCH_LIMIT == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()

    data_service.invalidate_summary_cache()
    return {
        "removed_data": removed_data,
        "removed_conversations": removed_conversations,
        "seeded": len(records),
    }
