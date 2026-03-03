import logging

from fastapi import Depends, HTTPException, Request
from firebase_admin import auth as firebase_auth, firestore

from app.dependencies import init_firebase, get_firestore_client

logger = logging.getLogger(__name__)


class AuthenticatedUser:
    """Represents a verified Firebase user."""

    def __init__(self, uid: str, email: str, name: str | None, token_claims: dict):
        self.uid = uid
        self.email = email
        self.name = name
        self.token_claims = token_claims


async def get_current_user(request: Request) -> AuthenticatedUser:
    """Verify Firebase ID token from Authorization header. Returns 401 if invalid."""
    init_firebase()

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split("Bearer ")[1]

    try:
        decoded_token = firebase_auth.verify_id_token(token)
    except Exception as e:
        logger.error("Token verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return AuthenticatedUser(
        uid=decoded_token["uid"],
        email=decoded_token.get("email", ""),
        name=decoded_token.get("name"),
        token_claims=decoded_token,
    )


async def require_allowlist(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """Check Firestore allowlist for active status. Returns 403 if not allowed."""
    db = get_firestore_client()

    allowlist_ref = db.collection("allowlist").document(user.email)
    allowlist_doc = allowlist_ref.get()

    if not allowlist_doc.exists or allowlist_doc.to_dict().get("status") != "active":
        raise HTTPException(status_code=403, detail="Access denied. You are not on the allowlist.")

    # Upsert user profile
    user_ref = db.collection("users").document(user.uid)
    user_ref.set(
        {
            "email": user.email,
            "name": user.name,
            "last_login": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )

    return user
