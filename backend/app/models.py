import re
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class AccessLevel(str, Enum):
    read = "read"
    write = "write"


class CreateVaultRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)


class UpdateVaultRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class GrantAccessRequest(BaseModel):
    email: str = Field(min_length=1)
    level: AccessLevel = AccessLevel.read


class RevokeAccessRequest(BaseModel):
    email: str = Field(min_length=1)


class VaultResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    access_level: str | None = None


class VaultDetailResponse(VaultResponse):
    created_at: str | None = None
    created_by: str
    is_admin: bool = False


class VaultListResponse(BaseModel):
    vaults: list[VaultResponse]


class AccessEntry(BaseModel):
    email: str
    level: str


class AccessListResponse(BaseModel):
    users: list[AccessEntry]


def name_to_slug(name: str) -> str:
    """Convert a name to a URL-safe slug using underscores."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s]", "", slug)
    slug = re.sub(r"\s+", "_", slug)
    slug = slug.strip("_")
    return slug


# --- Album models ---


class CreateAlbumRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)


class UpdateAlbumRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    cover_photo_id: str | None = None


class AlbumResponse(BaseModel):
    id: str
    slug: str
    title: str
    description: str
    cover_photo_url: str | None = None
    photo_count: int = 0
    created_at: str | None = None


class AlbumDetailResponse(AlbumResponse):
    created_by: str
    is_admin: bool = False
    can_write: bool = False


class AlbumListResponse(BaseModel):
    albums: list[AlbumResponse]


# --- Photo models ---


class UploadUrlResponse(BaseModel):
    photo_id: str
    original_upload_url: str
    thumb_upload_url: str
    storage_path_original: str
    storage_path_thumb: str


class ConfirmUploadRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1)
    width: int = Field(ge=0)
    height: int = Field(ge=0)
    caption: str = Field(default="", max_length=1000)
    has_thumbnail: bool = True


class UpdatePhotoRequest(BaseModel):
    caption: str = Field(default="", max_length=1000)


class PhotoResponse(BaseModel):
    id: str
    thumb_url: str | None = None
    original_url: str | None = None
    caption: str
    file_name: str
    content_type: str
    width: int
    height: int
    created_at: str | None = None


class PhotoListResponse(BaseModel):
    photos: list[PhotoResponse]
