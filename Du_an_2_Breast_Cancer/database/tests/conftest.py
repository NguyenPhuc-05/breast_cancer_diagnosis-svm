import os
import sys
from pathlib import Path

import pytest


PROJECT_DIR = Path(__file__).resolve().parents[2]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

TEST_DB = Path(__file__).resolve().parent / "test_bc_data.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["BC_DATA_TOKEN"] = "bc-data-test-token-that-is-longer-than-32-bytes"

from database.db import Base, engine


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
