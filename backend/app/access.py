"""Reusable access-control logic operating on the allowlist access_group map."""

from firebase_admin import firestore as fs
from google.cloud.firestore_v1.base_query import FieldFilter


def is_admin(db, email: str) -> bool:
    """Check if a user has admin role in the allowlist."""
    doc = db.collection("allowlist").document(email).get()
    return doc.exists and doc.to_dict().get("role") == "admin"


def get_user_access_level(allowlist_data: dict, resource_id: str) -> str | None:
    """Get user's access level for a resource from their allowlist data.

    Returns "read", "write", or None.
    """
    access_group = allowlist_data.get("access_group", {})
    if not isinstance(access_group, dict):
        return None
    return access_group.get(resource_id)


def grant_access(db, email: str, resource_id: str, level: str) -> None:
    """Grant access to a resource by setting access_group.{resource_id} in the allowlist doc."""
    db.collection("allowlist").document(email).update(
        {f"access_group.{resource_id}": level}
    )


def revoke_access(db, email: str, resource_id: str) -> None:
    """Revoke access to a resource by deleting access_group.{resource_id} from the allowlist doc."""
    db.collection("allowlist").document(email).update(
        {f"access_group.{resource_id}": fs.DELETE_FIELD}
    )


def get_sub_vault_by_slug(db, slug: str):
    """Look up a sub-vault by its slug. Returns (doc_id, data) or None."""
    docs = (
        db.collection("sub_vaults")
        .where(filter=FieldFilter("slug", "==", slug))
        .limit(1)
        .get()
    )
    if not docs:
        return None
    doc = docs[0]
    return doc.id, doc.to_dict()
