from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.dependencies import init_firebase, get_settings
from app.routers import album, health, vault, vault_crud


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_firebase()
    yield


settings = get_settings()
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="gelyu.com API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = [o.strip() for o in settings.allowed_origins.split(";") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router)
app.include_router(vault.router)
app.include_router(vault_crud.router)
app.include_router(album.router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.port)
