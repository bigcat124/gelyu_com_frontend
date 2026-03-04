import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from firebase_admin import firestore as fs
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.access import (
    get_sub_vault_by_slug,
    get_user_access_level,
    grant_access,
    revoke_access,
)
from app.auth import AuthenticatedUser, require_admin, require_allowlist
from app.dependencies import get_firestore_client, get_settings
from app.models import (
    CreateSubVaultRequest,
    GrantAccessRequest,
    RevokeAccessRequest,
    SubVaultDetailResponse,
    SubVaultListResponse,
    SubVaultResponse,
    name_to_slug,
)

logger = logging.getLogger(__name__)
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/vault/sub-vaults", tags=["sub-vaults"])


@router.post("", status_code=201)
@limiter.limit(settings.rate_limit_auth)
async def create_sub_vault(
    request: Request,
    body: CreateSubVaultRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    """Create a new sub-vault. Admin only."""
    db = get_firestore_client()
    slug = name_to_slug(body.name)

    if not slug:
        raise HTTPException(status_code=400, detail="Name produces an invalid slug.")

    # Check slug uniqueness
    existing = get_sub_vault_by_slug(db, slug)
    if existing:
        raise HTTPException(status_code=409, detail=f"Sub-vault with slug '{slug}' already exists.")

    doc_ref = db.collection("sub_vaults").document()
    doc_ref.set({
        "name": body.name,
        "slug": slug,
        "description": body.description,
        "created_at": fs.SERVER_TIMESTAMP,
        "created_by": user.email,
    })

    return {
        "id": doc_ref.id,
        "slug": slug,
        "name": body.name,
        "description": body.description,
        "created_by": user.email,
    }


@router.get("")
@limiter.limit(settings.rate_limit_auth)
async def list_sub_vaults(
    request: Request,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """List sub-vaults accessible to the current user. Admins see all."""
    db = get_firestore_client()
    is_user_admin = user.allowlist_data.get("role") == "admin"

    if is_user_admin:
        docs = db.collection("sub_vaults").get()
        sub_vaults = [
            SubVaultResponse(
                id=doc.id,
                slug=doc.to_dict()["slug"],
                name=doc.to_dict()["name"],
                description=doc.to_dict().get("description", ""),
                access_level="write",
            )
            for doc in docs
        ]
    else:
        access_group = user.allowlist_data.get("access_group", {})
        if not isinstance(access_group, dict) or not access_group:
            return SubVaultListResponse(sub_vaults=[])

        # Fetch sub-vault docs by their IDs
        sub_vaults = []
        doc_ids = list(access_group.keys())

        # Firestore get_all supports batching
        doc_refs = [db.collection("sub_vaults").document(doc_id) for doc_id in doc_ids]
        docs = db.get_all(doc_refs)

        for doc in docs:
            if doc.exists:
                data = doc.to_dict()
                sub_vaults.append(
                    SubVaultResponse(
                        id=doc.id,
                        slug=data["slug"],
                        name=data["name"],
                        description=data.get("description", ""),
                        access_level=access_group.get(doc.id),
                    )
                )

    return SubVaultListResponse(sub_vaults=sub_vaults)


@router.get("/{slug}")
@limiter.limit(settings.rate_limit_auth)
async def get_sub_vault(
    request: Request,
    slug: str,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Get sub-vault detail. User must have access or be admin."""
    db = get_firestore_client()

    result = get_sub_vault_by_slug(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="Sub-vault not found.")

    doc_id, data = result
    is_user_admin = user.allowlist_data.get("role") == "admin"

    if is_user_admin:
        access_level = "write"
    else:
        access_level = get_user_access_level(user.allowlist_data, doc_id)
        if not access_level:
            raise HTTPException(status_code=403, detail="You do not have access to this sub-vault.")

    created_at = data.get("created_at")
    created_at_str = created_at.isoformat() if created_at else None

    return SubVaultDetailResponse(
        id=doc_id,
        slug=data["slug"],
        name=data["name"],
        description=data.get("description", ""),
        created_at=created_at_str,
        created_by=data.get("created_by", ""),
        access_level=access_level,
    )


@router.post("/{slug}/access")
@limiter.limit(settings.rate_limit_auth)
async def grant_sub_vault_access(
    request: Request,
    slug: str,
    body: GrantAccessRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    """Grant a user access to a sub-vault. Admin only."""
    db = get_firestore_client()

    result = get_sub_vault_by_slug(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="Sub-vault not found.")

    doc_id, _ = result

    # Validate target email is on allowlist and active
    target_doc = db.collection("allowlist").document(body.email).get()
    if not target_doc.exists or target_doc.to_dict().get("status") != "active":
        raise HTTPException(status_code=400, detail="Target email is not on the active allowlist.")

    grant_access(db, body.email, doc_id, body.level.value)

    return {"message": "Access granted.", "email": body.email, "slug": slug, "level": body.level.value}


@router.post("/{slug}/access/revoke")
@limiter.limit(settings.rate_limit_auth)
async def revoke_sub_vault_access(
    request: Request,
    slug: str,
    body: RevokeAccessRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    """Revoke a user's access to a sub-vault. Admin only."""
    db = get_firestore_client()

    result = get_sub_vault_by_slug(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="Sub-vault not found.")

    doc_id, _ = result

    revoke_access(db, body.email, doc_id)

    return {"message": "Access revoked.", "email": body.email, "slug": slug}
