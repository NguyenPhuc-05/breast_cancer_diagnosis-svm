import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main
from app.main import app, metadata


client = TestClient(app)

BENIGN_SAMPLE = {
    "mean radius": 13.54,
    "mean texture": 14.36,
    "mean perimeter": 87.46,
    "mean area": 566.3,
    "mean smoothness": 0.09779,
    "mean compactness": 0.08129,
    "mean concavity": 0.06664,
    "mean concave points": 0.04781,
    "mean symmetry": 0.1885,
    "mean fractal dimension": 0.05766,
    "radius error": 0.2699,
    "texture error": 0.7886,
    "perimeter error": 2.058,
    "area error": 23.56,
    "smoothness error": 0.008462,
    "compactness error": 0.0146,
    "concavity error": 0.02387,
    "concave points error": 0.01315,
    "symmetry error": 0.0198,
    "fractal dimension error": 0.0023,
    "worst radius": 15.11,
    "worst texture": 19.26,
    "worst perimeter": 99.7,
    "worst area": 711.2,
    "worst smoothness": 0.144,
    "worst compactness": 0.1773,
    "worst concavity": 0.239,
    "worst concave points": 0.1288,
    "worst symmetry": 0.2977,
    "worst fractal dimension": 0.07259,
}

MALIGNANT_SAMPLE = {
    "mean radius": 17.99,
    "mean texture": 10.38,
    "mean perimeter": 122.8,
    "mean area": 1001.0,
    "mean smoothness": 0.1184,
    "mean compactness": 0.2776,
    "mean concavity": 0.3001,
    "mean concave points": 0.1471,
    "mean symmetry": 0.2419,
    "mean fractal dimension": 0.07871,
    "radius error": 1.095,
    "texture error": 0.9053,
    "perimeter error": 8.589,
    "area error": 153.4,
    "smoothness error": 0.006399,
    "compactness error": 0.04904,
    "concavity error": 0.05373,
    "concave points error": 0.01587,
    "symmetry error": 0.03003,
    "fractal dimension error": 0.006193,
    "worst radius": 25.38,
    "worst texture": 17.33,
    "worst perimeter": 184.6,
    "worst area": 2019.0,
    "worst smoothness": 0.1622,
    "worst compactness": 0.6656,
    "worst concavity": 0.7119,
    "worst concave points": 0.2654,
    "worst symmetry": 0.4601,
    "worst fractal dimension": 0.1189,
}


def token_for(
    subject: str,
    *,
    audience: str = "project-two-api",
    owner: bool = False,
    expires: timedelta = timedelta(hours=1),
) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": subject,
            "email": f"{subject}@example.test",
            "aud": audience,
            "is_owner": owner,
            "iat": now,
            "exp": now + expires,
        },
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )


def headers_for(subject: str, **kwargs) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(subject, **kwargs)}"}


def test_public_service_health_metadata_and_metrics():
    root = client.get("/")
    assert root.status_code == 200
    assert "not a medical diagnosis" in root.json()["warning"]

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["model_loaded"] is True
    assert health.json()["threshold"] == metadata["threshold"]

    model_metadata = client.get("/metadata")
    assert model_metadata.status_code == 200
    assert len(model_metadata.json()["feature_names"]) == 30

    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert metrics.json()["metrics"]["test"]["sample_count"] == 114
    assert len(metrics.json()["metrics"]["test"]["confusion_matrix"]["matrix"]) == 2


def test_request_id_is_returned_and_safe_client_value_is_preserved():
    generated = client.get("/health")
    assert generated.headers["x-request-id"]

    supplied = client.get("/health", headers={"X-Request-ID": "test-request-123"})
    assert supplied.headers["x-request-id"] == "test-request-123"


def test_protected_endpoints_require_authentication():
    endpoints = [
        ("POST", "/predict"),
        ("GET", "/predictions"),
        ("DELETE", "/predictions"),
        ("GET", "/predictions/export"),
        ("GET", "/admin/predictions"),
    ]
    for method, path in endpoints:
        kwargs = {"json": {"features": BENIGN_SAMPLE}} if method == "POST" else {}
        response = client.request(method, path, **kwargs)
        assert response.status_code == 401, (method, path, response.text)


def test_wrong_audience_and_expired_tokens_are_rejected():
    wrong_audience = client.post(
        "/predict",
        headers=headers_for("user-a", audience="iris-svm-api"),
        json={"features": BENIGN_SAMPLE},
    )
    assert wrong_audience.status_code == 401
    assert "Audience mismatch" in wrong_audience.json()["detail"]

    expired = client.post(
        "/predict",
        headers=headers_for("user-a", expires=timedelta(seconds=-1)),
        json={"features": BENIGN_SAMPLE},
    )
    assert expired.status_code == 401


@pytest.mark.parametrize(
    ("sample", "expected_class", "expected_label"),
    [
        (BENIGN_SAMPLE, 1, "benign"),
        (MALIGNANT_SAMPLE, 0, "malignant"),
    ],
)
def test_regression_samples_follow_locked_threshold(
    sample, expected_class, expected_label
):
    response = client.post(
        "/predict",
        headers=headers_for("regression-user"),
        json={"features": sample},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["predicted_class"] == expected_class
    assert body["predicted_label"] == expected_label
    assert body["decision"] == expected_label
    assert body["threshold"] == metadata["threshold"]
    assert 0.0 <= body["probability_malignant"] <= 1.0
    assert 0.0 <= body["probability_benign"] <= 1.0
    assert abs(
        body["probability_malignant"] + body["probability_benign"] - 1.0
    ) < 1e-6
    assert "not a medical diagnosis" in body["warning"]


def test_prediction_survives_history_storage_outage(monkeypatch):
    def unavailable(*args, **kwargs):
        raise HTTPException(status_code=503, detail="History unavailable")

    monkeypatch.setattr(main, "history_request", unavailable)
    response = client.post(
        "/predict",
        headers=headers_for("user-a"),
        json={"features": BENIGN_SAMPLE},
    )
    assert response.status_code == 200
    assert response.json()["predicted_label"] == "benign"


def test_missing_and_extra_features_return_named_lists():
    missing_payload = dict(BENIGN_SAMPLE)
    missing_payload.pop("mean radius")
    missing = client.post(
        "/predict",
        headers=headers_for("user-a"),
        json={"features": missing_payload},
    )
    assert missing.status_code == 422
    assert missing.json()["detail"]["missing"] == ["mean radius"]
    assert missing.json()["detail"]["extra"] == []

    extra_payload = dict(BENIGN_SAMPLE, unknown_feature=1.0)
    extra = client.post(
        "/predict",
        headers=headers_for("user-a"),
        json={"features": extra_payload},
    )
    assert extra.status_code == 422
    assert extra.json()["detail"]["extra"] == ["unknown_feature"]


@pytest.mark.parametrize("invalid_value", ["not-a-number", None, [], {}])
def test_wrong_feature_types_return_invalid_field_list(invalid_value):
    payload = dict(BENIGN_SAMPLE)
    payload["mean radius"] = invalid_value
    response = client.post(
        "/predict",
        headers=headers_for("user-a"),
        json={"features": payload},
    )
    assert response.status_code == 422
    assert "mean radius" in response.json()["detail"]["invalid"]


def test_non_finite_and_out_of_range_features_are_rejected_by_name():
    raw_body = json.dumps({"features": BENIGN_SAMPLE}).replace(
        '"mean radius": 13.54', '"mean radius": 1e999'
    )
    non_finite = client.post(
        "/predict",
        headers={
            **headers_for("user-a"),
            "Content-Type": "application/json",
        },
        content=raw_body,
    )
    assert non_finite.status_code == 422
    assert non_finite.json()["detail"]["invalid"] == ["mean radius"]

    payload = dict(BENIGN_SAMPLE)
    payload["mean radius"] = 1000.0
    out_of_range = client.post(
        "/predict",
        headers=headers_for("user-a"),
        json={"features": payload},
    )
    assert out_of_range.status_code == 422
    assert out_of_range.json()["detail"]["out_of_range"] == ["mean radius"]


def test_missing_features_object_lists_all_required_fields():
    response = client.post(
        "/predict", headers=headers_for("user-a"), json={}
    )
    assert response.status_code == 422
    assert response.json()["detail"]["missing"] == sorted(metadata["feature_names"])


def test_user_history_isolation_delete_and_excel_export():
    headers_a = headers_for("user-a")
    headers_b = headers_for("user-b")
    client.post("/predict", headers=headers_a, json={"features": BENIGN_SAMPLE})
    client.post("/predict", headers=headers_b, json={"features": MALIGNANT_SAMPLE})
    client.post("/predict", headers=headers_b, json={"features": BENIGN_SAMPLE})

    history_a = client.get("/predictions", headers=headers_a)
    history_b = client.get("/predictions", headers=headers_b)
    assert history_a.status_code == 200 and len(history_a.json()) == 1
    assert history_b.status_code == 200 and len(history_b.json()) == 2
    assert "user_id" not in history_a.json()[0]

    export = client.get("/predictions/export", headers=headers_b)
    assert export.status_code == 200
    assert "spreadsheetml" in export.headers["content-type"]
    assert export.content.startswith(b"PK")

    cleared = client.delete("/predictions", headers=headers_a)
    assert cleared.json()["deleted"] == 1
    assert client.get("/predictions", headers=headers_a).json() == []
    assert len(client.get("/predictions", headers=headers_b).json()) == 2


def test_admin_requires_owner_and_correct_audience():
    client.post(
        "/predict",
        headers=headers_for("regular"),
        json={"features": BENIGN_SAMPLE},
    )
    forbidden = client.get(
        "/admin/predictions", headers=headers_for("regular", owner=False)
    )
    assert forbidden.status_code == 403

    owner = client.get(
        "/admin/predictions", headers=headers_for("owner", owner=True)
    )
    assert owner.status_code == 200
    assert len(owner.json()) == 1
    assert "user_id" not in owner.json()[0]

    wrong_service_owner = client.get(
        "/admin/predictions",
        headers=headers_for("owner", owner=True, audience="iris-svm-api"),
    )
    assert wrong_service_owner.status_code == 401


def test_request_size_limit_is_enforced_before_payload_parsing():
    response = client.post(
        "/predict",
        headers={
            **headers_for("user-a"),
            "Content-Type": "application/json",
        },
        content="x" * 70000,
    )
    assert response.status_code == 413
    assert response.headers["x-request-id"]


def test_per_user_rate_limit(monkeypatch):
    monkeypatch.setattr(main, "request_limiter", main.PerUserRateLimiter(1, 60))
    headers = headers_for("limited-user")
    first = client.post("/predict", headers=headers, json={"features": BENIGN_SAMPLE})
    second = client.post("/predict", headers=headers, json={"features": BENIGN_SAMPLE})
    assert first.status_code == 200
    assert second.status_code == 429


def test_cors_allows_only_configured_origin():
    allowed = client.get("/health", headers={"Origin": "http://localhost:5500"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5500"
    blocked = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in blocked.headers


def test_logs_do_not_contain_medical_style_payload(caplog):
    caplog.set_level(logging.INFO, logger="bc_svm_api")
    response = client.post(
        "/predict",
        headers=headers_for("user-a"),
        json={"features": MALIGNANT_SAMPLE},
    )
    assert response.status_code == 200
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "1001.0" not in messages
    assert "mean radius" not in messages
    assert "path=/predict" in messages


def test_service_refuses_to_import_without_a_strong_jwt_secret():
    repo_root = Path(__file__).resolve().parents[3]
    environment = dict(os.environ)
    environment.pop("JWT_SECRET", None)
    environment["PYTHONPATH"] = str(repo_root)
    result = subprocess.run(
        [sys.executable, "-c", "import shared.auth"],
        cwd=repo_root,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode != 0
    assert "missing or shorter than 32 characters" in result.stderr


def test_feature_names_match_regression_samples():
    assert set(BENIGN_SAMPLE) == set(metadata["feature_names"])
    assert set(MALIGNANT_SAMPLE) == set(metadata["feature_names"])
