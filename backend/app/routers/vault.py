from fastapi import APIRouter, Depends

from app.auth import AuthenticatedUser, require_allowlist

router = APIRouter(prefix="/api/vault", tags=["vault"])


@router.get("/access")
async def vault_access(user: AuthenticatedUser = Depends(require_allowlist)):
    """Protected endpoint: returns vault data only for allowlisted users."""
    return {
        "message": f"Welcome to the vault, {user.name or user.email}.",
        "email": user.email,
        "uid": user.uid,
        "content": "This is placeholder vault content. Replace with real data later.",
    }
