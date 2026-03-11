"""Album and photo CRUD endpoints. All nested under /api/vaults/{slug}/albums."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from firebase_admin import firestore as fs
from google.cloud.firestore_v1.base_query import FieldFilter
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.access import get_user_access_level, get_vault_by_slug
from app.auth import AuthenticatedUser, require_allowlist
from app.dependencies import get_firestore_client, get_settings
from app.models import (
    AlbumDetailResponse,
    AlbumListResponse,
    AlbumResponse,
    ConfirmUploadRequest,
    CreateAlbumRequest,
    PhotoListResponse,
    PhotoResponse,
    UpdateAlbumRequest,
    UpdatePhotoRequest,
    UploadUrlResponse,
    name_to_slug,
)
from app.storage import delete_blob, generate_download_url, generate_upload_url

logger = logging.getLogger(__name__)
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/vaults", tags=["albums"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4"}
ALLOWED_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES


# --- Helpers ---


def _check_vault_access(db, slug: str, user: AuthenticatedUser):
    """Verify vault exists and user has access. Returns (vault_doc_id, vault_data, is_admin, access_level)."""
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
    return doc_id, data, is_user_admin, access_level


def _require_write(access_level: str):
    """Raise 403 if the user does not have write access."""
    if access_level != "write":
        raise HTTPException(status_code=403, detail="Write access required.")


def _get_album_in_vault(db, vault_doc_id: str, album_slug: str):
    """Find an album by slug within a vault. Returns (album_doc_id, album_data) or raises 404."""
    docs = (
        db.collection("albums")
        .where(filter=FieldFilter("slug", "==", album_slug))
        .where(filter=FieldFilter("vaultId", "==", vault_doc_id))
        .limit(1)
        .get()
    )
    album_list = list(docs)
    if not album_list:
        raise HTTPException(status_code=404, detail="Album not found.")
    doc = album_list[0]
    return doc.id, doc.to_dict()


def _ext_from_content_type(content_type: str) -> str:
    ext = content_type.split("/")[-1]
    if ext == "jpeg":
        ext = "jpg"
    return ext


# --- Album endpoints ---


@router.get("/{slug}/albums")
@limiter.limit(settings.rate_limit_auth)
async def list_albums(
    request: Request,
    slug: str,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """List albums linked to this vault."""
    db = get_firestore_client()
    vault_doc_id, _, _, _ = _check_vault_access(db, slug, user)

    album_docs = (
        db.collection("albums")
        .where(filter=FieldFilter("vaultId", "==", vault_doc_id))
        .order_by("createdAt", direction=fs.Query.DESCENDING)
        .get()
    )

    albums = []
    for doc in album_docs:
        data = doc.to_dict()
        cover_url = None
        if data.get("coverPhotoId"):
            cover_photo = (
                db.collection("albums")
                .document(doc.id)
                .collection("photos")
                .document(data["coverPhotoId"])
                .get()
            )
            if cover_photo.exists:
                thumb_path = cover_photo.to_dict().get("storagePathThumb")
                if thumb_path:
                    try:
                        cover_url = generate_download_url(thumb_path)
                    except Exception:
                        pass

        photo_count = len(
            list(
                db.collection("albums")
                .document(doc.id)
                .collection("photos")
                .select([])
                .get()
            )
        )

        created_at = data.get("createdAt")
        albums.append(
            AlbumResponse(
                id=doc.id,
                slug=data["slug"],
                title=data["title"],
                description=data.get("description", ""),
                cover_photo_url=cover_url,
                photo_count=photo_count,
                created_at=created_at.isoformat() if created_at else None,
            )
        )

    return AlbumListResponse(albums=albums)


@router.post("/{slug}/albums", status_code=201)
@limiter.limit(settings.rate_limit_auth)
async def create_album(
    request: Request,
    slug: str,
    body: CreateAlbumRequest,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Create a new album in this vault. Requires write access."""
    db = get_firestore_client()
    vault_doc_id, _, _, access_level = _check_vault_access(db, slug, user)
    _require_write(access_level)

    album_slug = name_to_slug(body.title)
    if not album_slug:
        raise HTTPException(status_code=400, detail="Title produces an invalid slug.")

    # Check slug uniqueness within this vault
    existing = (
        db.collection("albums")
        .where(filter=FieldFilter("slug", "==", album_slug))
        .where(filter=FieldFilter("vaultId", "==", vault_doc_id))
        .limit(1)
        .get()
    )
    if list(existing):
        raise HTTPException(status_code=409, detail=f"Album '{album_slug}' already exists in this vault.")

    doc_ref = db.collection("albums").document()
    doc_ref.set(
        {
            "title": body.title,
            "slug": album_slug,
            "description": body.description,
            "vaultId": vault_doc_id,
            "coverPhotoId": None,
            "createdAt": fs.SERVER_TIMESTAMP,
            "createdBy": user.email,
        }
    )

    return {"id": doc_ref.id, "slug": album_slug, "title": body.title}


@router.get("/{slug}/albums/{album_slug}")
@limiter.limit(settings.rate_limit_auth)
async def get_album(
    request: Request,
    slug: str,
    album_slug: str,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Get album detail."""
    db = get_firestore_client()
    vault_doc_id, _, is_admin, access_level = _check_vault_access(db, slug, user)
    album_doc_id, album_data = _get_album_in_vault(db, vault_doc_id, album_slug)

    cover_url = None
    if album_data.get("coverPhotoId"):
        cover_photo = (
            db.collection("albums")
            .document(album_doc_id)
            .collection("photos")
            .document(album_data["coverPhotoId"])
            .get()
        )
        if cover_photo.exists:
            thumb_path = cover_photo.to_dict().get("storagePathThumb")
            if thumb_path:
                try:
                    cover_url = generate_download_url(thumb_path)
                except Exception:
                    pass

    photo_count = len(
        list(
            db.collection("albums")
            .document(album_doc_id)
            .collection("photos")
            .select([])
            .get()
        )
    )

    created_at = album_data.get("createdAt")
    return AlbumDetailResponse(
        id=album_doc_id,
        slug=album_data["slug"],
        title=album_data["title"],
        description=album_data.get("description", ""),
        cover_photo_url=cover_url,
        photo_count=photo_count,
        created_at=created_at.isoformat() if created_at else None,
        created_by=album_data.get("createdBy", ""),
        is_admin=is_admin,
        can_write=access_level == "write",
    )


@router.patch("/{slug}/albums/{album_slug}")
@limiter.limit(settings.rate_limit_auth)
async def update_album(
    request: Request,
    slug: str,
    album_slug: str,
    body: UpdateAlbumRequest,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Update album metadata. Requires write access."""
    db = get_firestore_client()
    vault_doc_id, _, _, access_level = _check_vault_access(db, slug, user)
    _require_write(access_level)
    album_doc_id, album_data = _get_album_in_vault(db, vault_doc_id, album_slug)

    updates = {}
    new_slug = album_slug
    if body.title is not None:
        updates["title"] = body.title
        new_slug = name_to_slug(body.title)
        if not new_slug:
            raise HTTPException(status_code=400, detail="Title produces an invalid slug.")
        if new_slug != album_slug:
            existing = (
                db.collection("albums")
                .where(filter=FieldFilter("slug", "==", new_slug))
                .where(filter=FieldFilter("vaultId", "==", vault_doc_id))
                .limit(1)
                .get()
            )
            if list(existing):
                raise HTTPException(status_code=409, detail=f"Album '{new_slug}' already exists.")
            updates["slug"] = new_slug
    if body.description is not None:
        updates["description"] = body.description
    if body.cover_photo_id is not None:
        updates["coverPhotoId"] = body.cover_photo_id

    if updates:
        db.collection("albums").document(album_doc_id).update(updates)

    return {"slug": new_slug, "title": body.title or album_data["title"]}


@router.delete("/{slug}/albums/{album_slug}")
@limiter.limit(settings.rate_limit_auth)
async def delete_album(
    request: Request,
    slug: str,
    album_slug: str,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Delete album, all photos, and storage blobs. Requires write access."""
    db = get_firestore_client()
    vault_doc_id, _, _, access_level = _check_vault_access(db, slug, user)
    _require_write(access_level)
    album_doc_id, _ = _get_album_in_vault(db, vault_doc_id, album_slug)

    # Delete all photos and their storage blobs
    photos = db.collection("albums").document(album_doc_id).collection("photos").get()
    for photo_doc in photos:
        photo_data = photo_doc.to_dict()
        delete_blob(photo_data.get("storagePathOriginal", ""))
        if photo_data.get("storagePathThumb"):
            delete_blob(photo_data["storagePathThumb"])
        photo_doc.reference.delete()

    # Delete the album document
    db.collection("albums").document(album_doc_id).delete()

    return {"message": "Album deleted."}


# --- Photo endpoints ---


@router.get("/{slug}/albums/{album_slug}/photos")
@limiter.limit(settings.rate_limit_auth)
async def list_photos(
    request: Request,
    slug: str,
    album_slug: str,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """List photos in an album with signed thumbnail URLs."""
    db = get_firestore_client()
    vault_doc_id, _, _, _ = _check_vault_access(db, slug, user)
    album_doc_id, _ = _get_album_in_vault(db, vault_doc_id, album_slug)

    photo_docs = (
        db.collection("albums")
        .document(album_doc_id)
        .collection("photos")
        .order_by("createdAt", direction=fs.Query.DESCENDING)
        .get()
    )

    photos = []
    for doc in photo_docs:
        data = doc.to_dict()
        thumb_url = None
        if data.get("storagePathThumb"):
            try:
                thumb_url = generate_download_url(data["storagePathThumb"])
            except Exception:
                pass

        created_at = data.get("createdAt")
        photos.append(
            PhotoResponse(
                id=doc.id,
                thumb_url=thumb_url,
                caption=data.get("caption", ""),
                file_name=data.get("fileName", ""),
                content_type=data.get("contentType", ""),
                width=data.get("width", 0),
                height=data.get("height", 0),
                created_at=created_at.isoformat() if created_at else None,
            )
        )

    return PhotoListResponse(photos=photos)


@router.get("/{slug}/albums/{album_slug}/photos/{photo_id}")
@limiter.limit(settings.rate_limit_auth)
async def get_photo(
    request: Request,
    slug: str,
    album_slug: str,
    photo_id: str,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Get a single photo with signed original URL (for lightbox)."""
    db = get_firestore_client()
    vault_doc_id, _, _, _ = _check_vault_access(db, slug, user)
    album_doc_id, _ = _get_album_in_vault(db, vault_doc_id, album_slug)

    photo_doc = (
        db.collection("albums")
        .document(album_doc_id)
        .collection("photos")
        .document(photo_id)
        .get()
    )
    if not photo_doc.exists:
        raise HTTPException(status_code=404, detail="Photo not found.")

    data = photo_doc.to_dict()
    original_url = None
    thumb_url = None
    try:
        original_url = generate_download_url(data["storagePathOriginal"])
    except Exception:
        pass
    if data.get("storagePathThumb"):
        try:
            thumb_url = generate_download_url(data["storagePathThumb"])
        except Exception:
            pass

    created_at = data.get("createdAt")
    return PhotoResponse(
        id=photo_doc.id,
        thumb_url=thumb_url,
        original_url=original_url,
        caption=data.get("caption", ""),
        file_name=data.get("fileName", ""),
        content_type=data.get("contentType", ""),
        width=data.get("width", 0),
        height=data.get("height", 0),
        created_at=created_at.isoformat() if created_at else None,
    )


@router.post("/{slug}/albums/{album_slug}/upload-url")
@limiter.limit(settings.rate_limit_auth)
async def get_upload_url(
    request: Request,
    slug: str,
    album_slug: str,
    content_type: str = Query(...),
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Generate signed upload URLs for a photo/video. Requires write access."""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type}")

    db = get_firestore_client()
    vault_doc_id, _, _, access_level = _check_vault_access(db, slug, user)
    _require_write(access_level)
    album_doc_id, _ = _get_album_in_vault(db, vault_doc_id, album_slug)

    is_video = content_type in ALLOWED_VIDEO_TYPES
    photo_id = str(uuid.uuid4())
    ext = _ext_from_content_type(content_type)

    if is_video:
        original_path = f"media/albums/{album_doc_id}/video/{photo_id}.{ext}"
    else:
        original_path = f"media/albums/{album_doc_id}/original/{photo_id}.{ext}"
    original_url = generate_upload_url(original_path, content_type)

    thumb_path = ""
    thumb_url = ""
    if not is_video:
        thumb_path = f"media/albums/{album_doc_id}/thumb/{photo_id}.jpg"
        thumb_url = generate_upload_url(thumb_path, "image/jpeg")

    return UploadUrlResponse(
        photo_id=photo_id,
        original_upload_url=original_url,
        thumb_upload_url=thumb_url,
        storage_path_original=original_path,
        storage_path_thumb=thumb_path,
    )


@router.post("/{slug}/albums/{album_slug}/photos", status_code=201)
@limiter.limit(settings.rate_limit_auth)
async def confirm_upload(
    request: Request,
    slug: str,
    album_slug: str,
    photo_id: str = Query(...),
    body: ConfirmUploadRequest = ...,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Confirm a file upload and write metadata to Firestore. Requires write access."""
    if body.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {body.content_type}")

    db = get_firestore_client()
    vault_doc_id, _, _, access_level = _check_vault_access(db, slug, user)
    _require_write(access_level)
    album_doc_id, _ = _get_album_in_vault(db, vault_doc_id, album_slug)

    is_video = body.content_type in ALLOWED_VIDEO_TYPES
    ext = _ext_from_content_type(body.content_type)

    if is_video:
        original_path = f"media/albums/{album_doc_id}/video/{photo_id}.{ext}"
        thumb_path = None
    else:
        original_path = f"media/albums/{album_doc_id}/original/{photo_id}.{ext}"
        thumb_path = f"media/albums/{album_doc_id}/thumb/{photo_id}.jpg" if body.has_thumbnail else None

    photo_ref = (
        db.collection("albums")
        .document(album_doc_id)
        .collection("photos")
        .document(photo_id)
    )
    photo_ref.set(
        {
            "storagePathOriginal": original_path,
            "storagePathThumb": thumb_path,
            "caption": body.caption,
            "tags": [],
            "width": body.width,
            "height": body.height,
            "fileName": body.file_name,
            "contentType": body.content_type,
            "createdAt": fs.SERVER_TIMESTAMP,
        }
    )

    # Set as cover photo if album has none and this is an image
    if not is_video:
        album_ref = db.collection("albums").document(album_doc_id)
        album_data = album_ref.get().to_dict()
        if not album_data.get("coverPhotoId"):
            album_ref.update({"coverPhotoId": photo_id})

    return {"id": photo_id, "message": "Upload confirmed."}


@router.patch("/{slug}/albums/{album_slug}/photos/{photo_id}")
@limiter.limit(settings.rate_limit_auth)
async def update_photo(
    request: Request,
    slug: str,
    album_slug: str,
    photo_id: str,
    body: UpdatePhotoRequest,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Update photo caption. Requires write access."""
    db = get_firestore_client()
    vault_doc_id, _, _, access_level = _check_vault_access(db, slug, user)
    _require_write(access_level)
    album_doc_id, _ = _get_album_in_vault(db, vault_doc_id, album_slug)

    photo_ref = (
        db.collection("albums")
        .document(album_doc_id)
        .collection("photos")
        .document(photo_id)
    )
    if not photo_ref.get().exists:
        raise HTTPException(status_code=404, detail="Photo not found.")

    photo_ref.update({"caption": body.caption})
    return {"message": "Photo updated."}


@router.delete("/{slug}/albums/{album_slug}/photos/{photo_id}")
@limiter.limit(settings.rate_limit_auth)
async def delete_photo(
    request: Request,
    slug: str,
    album_slug: str,
    photo_id: str,
    user: AuthenticatedUser = Depends(require_allowlist),
):
    """Delete a photo and its storage blobs. Requires write access."""
    db = get_firestore_client()
    vault_doc_id, _, _, access_level = _check_vault_access(db, slug, user)
    _require_write(access_level)
    album_doc_id, _ = _get_album_in_vault(db, vault_doc_id, album_slug)

    photo_ref = (
        db.collection("albums")
        .document(album_doc_id)
        .collection("photos")
        .document(photo_id)
    )
    photo_doc = photo_ref.get()
    if not photo_doc.exists:
        raise HTTPException(status_code=404, detail="Photo not found.")

    data = photo_doc.to_dict()
    delete_blob(data.get("storagePathOriginal", ""))
    if data.get("storagePathThumb"):
        delete_blob(data["storagePathThumb"])

    photo_ref.delete()

    # If this was the cover photo, unset it
    album_ref = db.collection("albums").document(album_doc_id)
    album_data = album_ref.get().to_dict()
    if album_data.get("coverPhotoId") == photo_id:
        album_ref.update({"coverPhotoId": None})

    return {"message": "Photo deleted."}
