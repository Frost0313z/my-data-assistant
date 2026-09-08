"""backend/app/seed/seed_data.json을 Firestore의 data 컬렉션에 적재한다.

사용법 (backend/ 디렉터리에서 실행, .env에 FIREBASE_SERVICE_ACCOUNT_JSON 필요):
    python scripts/seed_firestore.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.firestore_client import get_db  # noqa: E402

SEED_FILE = Path(__file__).resolve().parents[1] / "app" / "seed" / "seed_data.json"


def main():
    records = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    db = get_db()
    collection = db.collection("data")

    batch = db.batch()
    for i, record in enumerate(records, start=1):
        batch.set(collection.document(), record)
        if i % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()

    print(f"{len(records)}개 레코드를 Firestore data 컬렉션에 적재했습니다.")


if __name__ == "__main__":
    main()
