import json
from functools import lru_cache

import firebase_admin
from firebase_admin import credentials, firestore

from . import config


@lru_cache
def get_db():
    """FIREBASE_SERVICE_ACCOUNT_JSON에는 서비스 계정 키의 파일 경로 또는
    JSON 문자열 자체를 넣을 수 있다 (Render 등 배포 환경에서는 파일 대신 문자열 권장)."""
    if not firebase_admin._apps:
        raw = config.FIREBASE_SERVICE_ACCOUNT_JSON.strip()
        if raw.startswith("{"):
            cred = credentials.Certificate(json.loads(raw))
        else:
            cred = credentials.Certificate(raw)
        firebase_admin.initialize_app(cred)
    return firestore.client()
