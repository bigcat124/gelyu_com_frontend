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
        firebase_admin.initialize_app()


def get_firestore_client():
    init_firebase()
    return firestore.client()
