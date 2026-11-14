import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = BASE_DIR / "artifacts" / "breast_cancer_svm.joblib"
META_PATH = BASE_DIR / "artifacts" / "metadata.json"

model = joblib.load(MODEL_PATH)
metadata = json.loads(META_PATH.read_text(encoding="utf-8"))


def configured_origins() -> list[str]:
    default_origins = [
        "https://breast-cancer-svm-frontend.onrender.com",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]
    raw_origins = os.getenv("FRONTEND_ORIGINS", "")
    origins = [origin.strip().rstrip("/") for origin in raw_origins.split(",")]
    return [origin for origin in origins if origin] or default_origins


app = FastAPI(
    title="Breast Cancer SVM Educational API",
    version=metadata["model_version"],
    description="Educational classification demonstration; not a medical diagnosis",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class PredictionRequest(BaseModel):
    features: dict[str, float] = Field(
        ...,
        description="Exactly 30 named numeric features",
    )


class PredictionResponse(BaseModel):
    predicted_class: int
    predicted_label: str
    probability_malignant: float
    probability_benign: float
    model_version: str
    warning: str


def build_vector(payload: PredictionRequest) -> pd.DataFrame:
    expected = metadata["feature_names"]
    received = set(payload.features)
    missing = sorted(set(expected) - received)
    extra = sorted(received - set(expected))

    if missing or extra:
        raise HTTPException(
            status_code=422,
            detail={"missing": missing, "extra": extra},
        )

    values = [payload.features[name] for name in expected]
    if not np.isfinite(values).all():
        raise HTTPException(status_code=422, detail="Features must be finite numbers")

    return pd.DataFrame([values], columns=expected)

@app.get("/")
def root():
    return {
        "service": "Breast Cancer SVM Educational API",
        "docs": "/docs",
        "warning": metadata["warning"],
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_version": metadata["model_version"],
    }


@app.get("/metadata")
def get_metadata():
    return metadata


@app.post("/predict", response_model=PredictionResponse)
def predict(payload: PredictionRequest):
    x = build_vector(payload)
    predicted_class = int(model.predict(x)[0])
    probabilities = model.predict_proba(x)[0]

    classes = [int(value) for value in model.named_steps["svc"].classes_]
    probability_by_class = dict(zip(classes, map(float, probabilities)))
    if set(probability_by_class) != {0, 1}:
        raise HTTPException(status_code=500, detail="Unexpected model classes")

    class_mapping = metadata["class_mapping"]
    predicted_label = class_mapping.get(str(predicted_class))
    if predicted_label is None:
        raise HTTPException(status_code=500, detail="Model returned an unknown class")

    return PredictionResponse(
        predicted_class=predicted_class,
        predicted_label=predicted_label,
        probability_malignant=probability_by_class[0],
        probability_benign=probability_by_class[1],
        model_version=metadata["model_version"],
        warning=metadata["warning"],
    )
