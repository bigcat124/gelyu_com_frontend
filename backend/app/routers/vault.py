from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AuthenticatedUser, require_allowlist
from app.dependencies import get_settings

settings = get_settings()
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api/vault", tags=["vault"])


@router.get("/access")
@limiter.limit(settings.rate_limit_auth)
async def vault_access(request: Request, user: AuthenticatedUser = Depends(require_allowlist)):
    """Protected endpoint: returns vault data only for allowlisted users."""
    return {
        "message": f"Welcome to the vault, {user.name or user.email}.",
        "email": user.email,
        "is_admin": user.allowlist_data.get("role") == "admin",
    }
