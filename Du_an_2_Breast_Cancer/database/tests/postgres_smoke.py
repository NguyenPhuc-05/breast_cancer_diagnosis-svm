"""Exercise the data-service contract against CI's real PostgreSQL instance."""

from __future__ import annotations

import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text


PROJECT_DIR = Path(__file__).resolve().parents[2]
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

if not os.getenv("DATABASE_URL"):
    raise RuntimeError("PostgreSQL smoke test requires DATABASE_URL.")

os.environ["BC_DATA_TOKEN"] = secrets.token_urlsafe(48)

from database.db import engine  # noqa: E402
from database.service import app  # noqa: E402


def main() -> None:
    if engine.dialect.name != "postgresql":
        raise RuntimeError(f"Expected PostgreSQL, got {engine.dialect.name}.")

    token = os.environ["BC_DATA_TOKEN"]
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "user_id": "postgres-smoke-user",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "ci-smoke",
        "predicted_label": "benign",
        "probability_malignant": 0.1,
        "probability_benign": 0.9,
        "threshold": 0.3,
        "features": {f"feature_{index}": float(index) for index in range(30)},
    }

    client = TestClient(app)
    created = client.post("/records", headers=headers, json=payload)
    created.raise_for_status()
    record_id = created.json()["id"]

    fetched = client.get(
        "/records",
        headers=headers,
        params={"user_id": payload["user_id"]},
    )
    fetched.raise_for_status()
    records = fetched.json()
    assert len(records) == 1
    assert records[0]["id"] == record_id
    assert records[0]["predicted_label"] == "benign"

    with engine.connect() as connection:
        user_count = connection.execute(
            text("SELECT COUNT(*) FROM bc_users WHERE user_id = :user_id"),
            {"user_id": payload["user_id"]},
        ).scalar_one()
        prediction_count = connection.execute(
            text("SELECT COUNT(*) FROM bc_predictions WHERE id = :record_id"),
            {"record_id": record_id},
        ).scalar_one()
    assert user_count == 1
    assert prediction_count == 1

    deleted = client.delete(
        "/records",
        headers=headers,
        params={"user_id": payload["user_id"]},
    )
    deleted.raise_for_status()
    assert deleted.json()["deleted"] == 1
    print("PostgreSQL smoke test passed.")


if __name__ == "__main__":
    main()
