from datetime import datetime, timezone

from fastapi.testclient import TestClient

from database.db import SessionLocal
from database.models import BcUser
from database.service import app


client = TestClient(app)
TOKEN = "bc-data-test-token-that-is-longer-than-32-bytes"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def record_payload(user_id: str, label: str = "benign") -> dict:
    probability_malignant = 0.12 if label == "benign" else 0.91
    return {
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model_version": "2.0.0",
        "predicted_label": label,
        "probability_malignant": probability_malignant,
        "probability_benign": 1.0 - probability_malignant,
        "threshold": 0.301136760495,
        "features": {f"feature_{index}": float(index + 1) for index in range(30)},
    }


def test_health_is_public_and_checks_database():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_protected_routes_return_401_and_403():
    missing = client.get("/records", params={"user_id": "user-a"})
    assert missing.status_code == 401

    malformed = client.get(
        "/records",
        params={"user_id": "user-a"},
        headers={"Authorization": "Basic abc"},
    )
    assert malformed.status_code == 401

    invalid = client.get(
        "/records",
        params={"user_id": "user-a"},
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert invalid.status_code == 403


def test_record_crud_and_profile_registration():
    created = client.post("/records", json=record_payload("user-a"), headers=HEADERS)
    assert created.status_code == 200
    assert created.json()["id"] > 0

    second = client.post(
        "/records",
        json=record_payload("user-a", "malignant"),
        headers=HEADERS,
    )
    assert second.status_code == 200

    history = client.get(
        "/records",
        params={"user_id": "user-a", "limit": 10},
        headers=HEADERS,
    )
    assert history.status_code == 200
    rows = history.json()
    assert [row["predicted_label"] for row in rows] == ["malignant", "benign"]
    assert len(rows[0]["features"]) == 30
    assert "user_id" not in rows[0]

    with SessionLocal() as session:
        assert session.query(BcUser).filter_by(user_id="user-a").count() == 1

    deleted = client.delete(
        "/records", params={"user_id": "user-a"}, headers=HEADERS
    )
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "cleared", "deleted": 2}
    assert client.get(
        "/records", params={"user_id": "user-a"}, headers=HEADERS
    ).json() == []


def test_user_history_isolation_and_scoped_delete():
    client.post("/records", json=record_payload("user-a"), headers=HEADERS)
    client.post(
        "/records", json=record_payload("user-b", "malignant"), headers=HEADERS
    )
    client.post("/records", json=record_payload("user-b"), headers=HEADERS)

    history_a = client.get(
        "/records", params={"user_id": "user-a"}, headers=HEADERS
    ).json()
    history_b = client.get(
        "/records", params={"user_id": "user-b"}, headers=HEADERS
    ).json()
    assert len(history_a) == 1
    assert len(history_b) == 2

    client.delete("/records", params={"user_id": "user-a"}, headers=HEADERS)
    assert client.get(
        "/records", params={"user_id": "user-a"}, headers=HEADERS
    ).json() == []
    assert len(
        client.get(
            "/records", params={"user_id": "user-b"}, headers=HEADERS
        ).json()
    ) == 2


def test_admin_records_are_limited_and_do_not_expose_user_identity():
    client.post("/records", json=record_payload("user-a"), headers=HEADERS)
    client.post("/records", json=record_payload("user-b"), headers=HEADERS)

    response = client.get("/admin/records", params={"limit": 1}, headers=HEADERS)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert "user_id" not in response.json()[0]
    assert client.get(
        "/admin/records", params={"limit": 501}, headers=HEADERS
    ).status_code == 422


def test_record_validation_rejects_wrong_feature_count_and_probability_sum():
    payload = record_payload("user-a")
    payload["features"].pop("feature_0")
    assert client.post("/records", json=payload, headers=HEADERS).status_code == 422

    payload = record_payload("user-a")
    payload["probability_benign"] = 0.5
    assert client.post("/records", json=payload, headers=HEADERS).status_code == 422
