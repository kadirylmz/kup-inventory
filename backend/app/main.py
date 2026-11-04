from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

import app.models  # noqa: F401
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.seed.core import seed_core


@asynccontextmanager
async def lifespan(app: FastAPI):
    if get_settings().secret_key == "CHANGE_ME":
        print("UYARI: SECRET_KEY varsayılan değerde! Üretimde mutlaka değiştirin.")
    Base.metadata.create_all(bind=engine)

    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS from_warehouse_id UUID REFERENCES warehouses(id);"))
            conn.commit()
    except Exception as e:
        print(f"Migration check: {e}")

    with SessionLocal() as db:
        seed_core(db)
    yield


app = FastAPI(title="KÜP Inventory API", version="0.1.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(api_router)


@app.exception_handler(Exception)
async def unhandled(request, exc):
    return JSONResponse({"detail": "Beklenmeyen bir hata oluştu."}, status_code=500)
