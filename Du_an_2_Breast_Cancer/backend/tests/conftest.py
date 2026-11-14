import os
import sys
from pathlib import Path

import pytest


PROJECT_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = PROJECT_DIR.parent
for path in (PROJECT_DIR, REPO_ROOT):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

TEST_DB = Path(__file__).resolve().parent / "test_bc_backend.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["JWT_SECRET"] = "project-two-test-jwt-secret-not-public-1234567890"
os.environ["CLIENT_ID"] = "project-two-api"
os.environ["BC_DATA_TOKEN"] = "bc-data-test-token-that-is-longer-than-32-bytes"
os.environ["RATE_LIMIT_REQUESTS"] = "1000"
os.environ["FRONTEND_ORIGINS"] = "http://localhost:5500"

from database.db import Base, engine
from database import models as _models  # noqa: F401 - registers table metadata
from app import main as app_main


@pytest.fixture(autouse=True)
def clean_state():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app_main.request_limiter._events.clear()
    yield
