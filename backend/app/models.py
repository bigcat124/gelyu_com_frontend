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
    """Convert a vault name to a URL-safe slug using underscores."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s]", "", slug)
    slug = re.sub(r"\s+", "_", slug)
    slug = slug.strip("_")
    return slug
