import json

from fastapi.testclient import TestClient

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


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["model_loaded"] is True


def test_metadata_has_expected_schema():
    response = client.get("/metadata")
    assert response.status_code == 200
    body = response.json()
    assert len(body["feature_names"]) == 30
    assert body["class_mapping"] == {"0": "malignant", "1": "benign"}


def test_predict_benign_sample_and_probabilities():
    response = client.post("/predict", json={"features": BENIGN_SAMPLE})
    assert response.status_code == 200

    body = response.json()
    assert body["predicted_label"] == "benign"
    assert 0.0 <= body["probability_malignant"] <= 1.0
    assert 0.0 <= body["probability_benign"] <= 1.0
    assert abs(
        body["probability_malignant"] + body["probability_benign"] - 1.0
    ) < 1e-6


def test_predict_rejects_missing_features():
    response = client.post(
        "/predict",
        json={"features": {"mean radius": 10.0}},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["missing"]


def test_predict_rejects_extra_features():
    payload = dict(BENIGN_SAMPLE)
    payload["unknown feature"] = 1.0
    response = client.post("/predict", json={"features": payload})
    assert response.status_code == 422
    assert response.json()["detail"]["extra"] == ["unknown feature"]


def test_predict_rejects_wrong_value_type():
    payload = dict(BENIGN_SAMPLE)
    payload["mean radius"] = "not-a-number"
    response = client.post("/predict", json={"features": payload})
    assert response.status_code == 422


def test_predict_rejects_non_finite_number():
    raw_body = json.dumps({"features": BENIGN_SAMPLE}).replace(
        '"mean radius": 13.54',
        '"mean radius": 1e999',
    )
    response = client.post(
        "/predict",
        content=raw_body,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


def test_feature_names_match_sample():
    assert set(BENIGN_SAMPLE) == set(metadata["feature_names"])
