import re
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class AccessLevel(str, Enum):
    read = "read"
    write = "write"


class CreateSubVaultRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)


class GrantAccessRequest(BaseModel):
    email: str = Field(min_length=1)
    level: AccessLevel = AccessLevel.read


class RevokeAccessRequest(BaseModel):
    email: str = Field(min_length=1)


class SubVaultResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    access_level: str | None = None


class SubVaultDetailResponse(SubVaultResponse):
    created_at: str | None = None
    created_by: str
    is_admin: bool = False


class SubVaultListResponse(BaseModel):
    sub_vaults: list[SubVaultResponse]


class UpdateSubVaultRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class AccessEntry(BaseModel):
    email: str
    level: str


class AccessListResponse(BaseModel):
    users: list[AccessEntry]


def name_to_slug(name: str) -> str:
    """Convert a sub-vault name to a URL-safe slug using underscores."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s]", "", slug)
    slug = re.sub(r"\s+", "_", slug)
    slug = slug.strip("_")
    return slug
