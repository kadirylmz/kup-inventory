from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.seed.core import seed_core


@asynccontextmanager
async def lifespan(app: FastAPI):
    if get_settings().secret_key == "CHANGE_ME":
        print("UYARI: SECRET_KEY varsayılan değerde! Üretimde mutlaka değiştirin.")
    with SessionLocal() as db:
        seed_core(db)
    yield


app = FastAPI(title="KÜP Inventory API", version="0.1.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(api_router)


@app.exception_handler(Exception)
async def unhandled(request, exc):
    return JSONResponse({"detail": "Beklenmeyen bir hata oluştu."}, status_code=500)
