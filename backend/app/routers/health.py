from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.dependencies import get_settings

settings = get_settings()
limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
@limiter.limit(settings.rate_limit_default)
async def health_check(request: Request):
    return {"status": "ok"}
