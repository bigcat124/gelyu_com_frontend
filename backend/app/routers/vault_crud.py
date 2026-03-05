import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from firebase_admin import firestore as fs
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.access import (
    get_vault_by_slug,
    get_user_access_level,
    grant_access,
    revoke_access,
)
from app.auth import AuthenticatedUser, require_admin, require_allowlist
from app.dependencies import get_firestore_client, get_settings
from app.models import (
    AccessEntry,
    AccessListResponse,
    CreateVaultRequest,
    GrantAccessRequest,
    RevokeAccessRequest,
    UpdateVaultRequest,
    VaultDetailResponse,
    VaultListResponse,
    VaultResponse,
    name_to_slug,
)

logger = logging.getLogger(__name__)
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/vaults", tags=["vaults"])


@router.post("", status_code=201)
@limiter.limit(settings.rate_limit_auth)
async def create_vault(
    request: Request,
    body: CreateVaultRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    """Create a new vault. Admin only."""
    db = get_firestore_client()
    slug = name_to_slug(body.name)

    if not slug:
        raise HTTPException(status_code=400, detail="Name produces an invalid slug.")

    # Check slug uniqueness
    existing = get_vault_by_slug(db, slug)
    if existing:
        raise HTTPException(status_code=409, detail=f"Vault with slug '{slug}' already exists.")

    doc_ref = db.collection("vaults").document()
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
async def list_vaults(
    request: Request,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """List vaults accessible to the current user. Admins see all."""
    db = get_firestore_client()
    is_user_admin = user.allowlist_data.get("role") == "admin"

    if is_user_admin:
        docs = db.collection("vaults").get()
        vaults = [
            VaultResponse(
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
            return VaultListResponse(vaults=[])

        vaults = []
        doc_ids = list(access_group.keys())

        doc_refs = [db.collection("vaults").document(doc_id) for doc_id in doc_ids]
        docs = db.get_all(doc_refs)

        for doc in docs:
            if doc.exists:
                data = doc.to_dict()
                vaults.append(
                    VaultResponse(
                        id=doc.id,
                        slug=data["slug"],
                        name=data["name"],
                        description=data.get("description", ""),
                        access_level=access_group.get(doc.id),
                    )
                )

    return VaultListResponse(vaults=vaults)


@router.get("/{slug}")
@limiter.limit(settings.rate_limit_auth)
async def get_vault(
    request: Request,
    slug: str,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Get vault detail. User must have access or be admin."""
    db = get_firestore_client()

    result = get_vault_by_slug(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="Vault not found.")

    doc_id, data = result
    is_user_admin = user.allowlist_data.get("role") == "admin"

    if is_user_admin:
        access_level = "write"
    else:
        access_level = get_user_access_level(user.allowlist_data, doc_id)
        if not access_level:
            raise HTTPException(status_code=403, detail="You do not have access to this vault.")

    created_at = data.get("created_at")
    created_at_str = created_at.isoformat() if created_at else None

    return VaultDetailResponse(
        id=doc_id,
        slug=data["slug"],
        name=data["name"],
        description=data.get("description", ""),
        created_at=created_at_str,
        created_by=data.get("created_by", ""),
        access_level=access_level,
        is_admin=is_user_admin,
    )


@router.patch("/{slug}")
@limiter.limit(settings.rate_limit_auth)
async def update_vault(
    request: Request,
    slug: str,
    body: UpdateVaultRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    """Update a vault's name. Admin only."""
    db = get_firestore_client()

    result = get_vault_by_slug(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="Vault not found.")

    doc_id, data = result
    new_slug = name_to_slug(body.name)

    if not new_slug:
        raise HTTPException(status_code=400, detail="Name produces an invalid slug.")

    if new_slug != slug:
        existing = get_vault_by_slug(db, new_slug)
        if existing:
            raise HTTPException(status_code=409, detail=f"Vault with slug '{new_slug}' already exists.")

    db.collection("vaults").document(doc_id).update({
        "name": body.name,
        "slug": new_slug,
    })

    return {"slug": new_slug, "name": body.name}


@router.get("/{slug}/access")
@limiter.limit(settings.rate_limit_auth)
async def list_vault_access(
    request: Request,
    slug: str,
    user: AuthenticatedUser = Depends(require_admin),
):
    """List all users with access to a vault. Admin only."""
    db = get_firestore_client()

    result = get_vault_by_slug(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="Vault not found.")

    doc_id, _ = result

    allowlist_docs = db.collection("allowlist").get()
    users = []
    for doc in allowlist_docs:
        data = doc.to_dict()
        access_group = data.get("access_group", {})
        if isinstance(access_group, dict) and doc_id in access_group:
            users.append(AccessEntry(email=doc.id, level=access_group[doc_id]))

    return AccessListResponse(users=users)


@router.post("/{slug}/access")
@limiter.limit(settings.rate_limit_auth)
async def grant_vault_access(
    request: Request,
    slug: str,
    body: GrantAccessRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    """Grant a user access to a vault. Admin only."""
    db = get_firestore_client()

    result = get_vault_by_slug(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="Vault not found.")

    doc_id, _ = result

    target_doc = db.collection("allowlist").document(body.email).get()
    if not target_doc.exists or target_doc.to_dict().get("status") != "active":
        raise HTTPException(status_code=400, detail="Target email is not on the active allowlist.")

    grant_access(db, body.email, doc_id, body.level.value)

    return {"message": "Access granted.", "email": body.email, "slug": slug, "level": body.level.value}


@router.post("/{slug}/access/revoke")
@limiter.limit(settings.rate_limit_auth)
async def revoke_vault_access(
    request: Request,
    slug: str,
    body: RevokeAccessRequest,
    user: AuthenticatedUser = Depends(require_admin),
):
    """Revoke a user's access to a vault. Admin only."""
    db = get_firestore_client()

    result = get_vault_by_slug(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="Vault not found.")

    doc_id, _ = result

    revoke_access(db, body.email, doc_id)

    return {"message": "Access revoked.", "email": body.email, "slug": slug}
