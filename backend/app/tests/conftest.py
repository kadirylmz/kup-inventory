import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["SECRET_KEY"] = "test-secret-key-test-secret-key-123"

import pytest
from fastapi.testclient import TestClient

from app.db.base import Base
from app.db.session import SessionLocal, engine
import app.models  # noqa: F401
from app.main import app
from app.seed.core import seed_core


@pytest.fixture(scope="session")
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin_headers(client):
    r = client.post("/api/v1/auth/login", json={"email": "admin@kup.local", "password": "ChangeMe!12345"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
