from functools import lru_cache

import firebase_admin
from firebase_admin import firestore

from app.config import Settings


@lru_cache
def get_settings() -> Settings:
    return Settings()


def init_firebase():
    """Initialize Firebase Admin SDK using Application Default Credentials."""
    if not firebase_admin._apps:
        settings = get_settings()
        firebase_admin.initialize_app(options={"projectId": settings.gcp_project_id})


def get_firestore_client():
    init_firebase()
    return firestore.client()
