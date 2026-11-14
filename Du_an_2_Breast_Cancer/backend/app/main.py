"""Breast Cancer SVM educational API with shared JWT authentication."""

from __future__ import annotations

import io
import json
import logging
import math
import os
import sys
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
REPO_ROOT = PROJECT_DIR.parent
for import_path in (PROJECT_DIR, REPO_ROOT):
    if str(import_path) not in sys.path:
        sys.path.append(str(import_path))

from app.history import history_request
from shared.auth import get_current_user


logger = logging.getLogger("bc_svm_api")

MODEL_PATH = BACKEND_DIR / "artifacts" / "breast_cancer_svm.joblib"
METADATA_PATH = BACKEND_DIR / "artifacts" / "metadata.json"
model = joblib.load(MODEL_PATH)
metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))

MAX_REQUEST_BYTES = int(os.getenv("MAX_REQUEST_BYTES", "65536"))


def configured_origins() -> list[str]:
    default_origins = [
        "https://bc-svm-frontend.onrender.com",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]
    raw_origins = os.getenv("FRONTEND_ORIGINS", "")
    origins = [origin.strip().rstrip("/") for origin in raw_origins.split(",")]
    return [origin for origin in origins if origin] or default_origins


class PerUserRateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, user_id: str) -> None:
        now = time.monotonic()
        with self._lock:
            events = self._events[user_id]
            while events and now - events[0] >= self.window_seconds:
                events.popleft()
            if len(events) >= self.limit:
                raise HTTPException(
                    status_code=429,
                    detail="Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.",
                )
            events.append(now)


request_limiter = PerUserRateLimiter(
    limit=int(os.getenv("RATE_LIMIT_REQUESTS", "60")),
    window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")),
)


def rate_limited_user(current_user: dict = Depends(get_current_user)) -> dict:
    request_limiter.check(str(current_user["id"]))
    return current_user


app = FastAPI(
    title="Breast Cancer SVM Educational API",
    version=metadata["model_version"],
    description=(
        "Educational classification demonstration only; not a medical diagnosis"
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


def _safe_request_id(value: str | None) -> str:
    if value and len(value) <= 128 and all(
        character.isalnum() or character in "-_." for character in value
    ):
        return value
    return str(uuid.uuid4())


@app.middleware("http")
async def request_controls(request: Request, call_next):
    request_id = _safe_request_id(request.headers.get("X-Request-ID"))
    body = await request.body()
    if len(body) > MAX_REQUEST_BYTES:
        response = JSONResponse(
            status_code=413,
            content={"detail": "Request body is too large"},
        )
    else:
        response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request_id=%s method=%s path=%s status=%s",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
    )
    return response


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    features: dict[str, StrictFloat | StrictInt] = Field(
        ...,
        description="Exactly 30 named numeric features",
    )


class PredictionResponse(BaseModel):
    predicted_class: int
    predicted_label: Literal["malignant", "benign"]
    probability_malignant: float
    probability_benign: float
    threshold: float
    decision: Literal["malignant", "benign"]
    model_version: str
    warning: str


def validation_detail(
    *,
    missing=None,
    extra=None,
    invalid=None,
    out_of_range=None,
) -> dict:
    return {
        "missing": sorted(missing or []),
        "extra": sorted(extra or []),
        "invalid": sorted(invalid or []),
        "out_of_range": sorted(out_of_range or []),
    }


@app.exception_handler(RequestValidationError)
async def request_validation_handler(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    del request
    missing: set[str] = set()
    extra: set[str] = set()
    invalid: set[str] = set()
    expected = set(metadata["feature_names"])

    for issue in error.errors():
        location = [str(part) for part in issue.get("loc", ()) if part != "body"]
        if "features" in location:
            feature_index = location.index("features") + 1
            field = (
                location[feature_index]
                if feature_index < len(location)
                else "features"
            )
        else:
            field = location[-1] if location else "body"
        issue_type = issue.get("type", "")
        if issue_type == "missing" and field == "features":
            missing.update(expected)
        elif issue_type == "extra_forbidden":
            extra.add(field)
        else:
            invalid.add(field)

    return JSONResponse(
        status_code=422,
        content={
            "detail": validation_detail(
                missing=missing,
                extra=extra,
                invalid=invalid,
            )
        },
    )


def build_vector(payload: PredictionRequest) -> tuple[pd.DataFrame, dict[str, float]]:
    expected = metadata["feature_names"]
    received = set(payload.features)
    missing = set(expected) - received
    extra = received - set(expected)
    if missing or extra:
        raise HTTPException(
            status_code=422,
            detail=validation_detail(missing=missing, extra=extra),
        )

    invalid: list[str] = []
    out_of_range: list[str] = []
    normalized: dict[str, float] = {}
    for name in expected:
        value = float(payload.features[name])
        if not math.isfinite(value):
            invalid.append(name)
            continue
        limits = metadata["feature_ranges"][name]
        if value < limits["minimum"] or value > limits["maximum"]:
            out_of_range.append(name)
        normalized[name] = value

    if invalid or out_of_range:
        raise HTTPException(
            status_code=422,
            detail=validation_detail(
                invalid=invalid,
                out_of_range=out_of_range,
            ),
        )
    return pd.DataFrame([normalized], columns=expected), normalized


def predict_values(features: pd.DataFrame) -> dict:
    probabilities = model.predict_proba(features)[0]
    classes = [int(value) for value in model.named_steps["svc"].classes_]
    probability_by_class = dict(zip(classes, map(float, probabilities)))
    if set(probability_by_class) != {0, 1}:
        raise HTTPException(status_code=500, detail="Unexpected model classes")

    threshold = float(metadata["threshold"])
    probability_malignant = probability_by_class[0]
    decision = "malignant" if probability_malignant >= threshold else "benign"
    predicted_class = 0 if decision == "malignant" else 1
    return {
        "predicted_class": predicted_class,
        "predicted_label": decision,
        "probability_malignant": probability_malignant,
        "probability_benign": probability_by_class[1],
        "threshold": threshold,
        "decision": decision,
        "model_version": metadata["model_version"],
        "warning": metadata["warning"],
    }


@app.get("/")
def root():
    return {
        "service": "Breast Cancer SVM Educational API",
        "docs": "/docs",
        "model_version": metadata["model_version"],
        "warning": metadata["warning"],
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_version": metadata["model_version"],
        "threshold": metadata["threshold"],
    }


@app.get("/metadata")
def get_metadata():
    return metadata


@app.get("/metrics")
def get_metrics():
    return {
        "model_version": metadata["model_version"],
        "threshold": metadata["threshold"],
        "threshold_selection": metadata["threshold_selection"],
        "metrics": metadata["metrics"],
        "warning": metadata["warning"],
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(
    payload: PredictionRequest,
    current_user: dict = Depends(rate_limited_user),
):
    vector, normalized = build_vector(payload)
    result = predict_values(vector)

    try:
        history_request(
            "POST",
            "/records",
            payload={
                "user_id": str(current_user["id"]),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "model_version": result["model_version"],
                "predicted_label": result["predicted_label"],
                "probability_malignant": result["probability_malignant"],
                "probability_benign": result["probability_benign"],
                "threshold": result["threshold"],
                "features": normalized,
            },
            readiness_timeout=12,
        )
    except HTTPException as error:
        if error.status_code != 503:
            raise
        logger.warning("request history storage unavailable after successful inference")

    return PredictionResponse(**result)


@app.get("/predictions")
def get_predictions(
    limit: int = Query(default=50, ge=1, le=500),
    current_user: dict = Depends(rate_limited_user),
):
    return history_request(
        "GET",
        "/records",
        params={"user_id": str(current_user["id"]), "limit": limit},
    )


@app.delete("/predictions")
def delete_predictions(current_user: dict = Depends(rate_limited_user)):
    return history_request(
        "DELETE",
        "/records",
        params={"user_id": str(current_user["id"])},
    )


@app.get("/predictions/export")
def export_predictions(current_user: dict = Depends(rate_limited_user)):
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed") from None

    rows = history_request(
        "GET",
        "/records",
        params={"user_id": str(current_user["id"]), "limit": 500},
    )
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "BC SVM Predictions"
    headers = [
        "ID",
        "Created At",
        "Predicted Label",
        "P(Malignant)",
        "P(Benign)",
        "Threshold",
        "Model Version",
        *metadata["feature_names"],
    ]
    sheet.append(headers)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(
        start_color="0F766E", end_color="0F766E", fill_type="solid"
    )
    for cell in sheet[1]:
        cell.font = header_font
        cell.fill = header_fill

    for row in rows:
        sheet.append(
            [
                row["id"],
                row["created_at"],
                row["predicted_label"],
                row["probability_malignant"],
                row["probability_benign"],
                row["threshold"],
                row["model_version"],
                *[row["features"][name] for name in metadata["feature_names"]],
            ]
        )
    for column in sheet.columns:
        width = max(len(str(cell.value or "")) for cell in column) + 2
        sheet.column_dimensions[column[0].column_letter].width = min(width, 28)

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": (
                "attachment; filename=breast_cancer_svm_predictions.xlsx"
            )
        },
    )


@app.get("/admin/predictions")
def admin_predictions(
    limit: int = Query(default=200, ge=1, le=500),
    current_user: dict = Depends(rate_limited_user),
):
    if not current_user.get("is_owner"):
        raise HTTPException(
            status_code=403,
            detail="Chỉ chủ sở hữu mới có quyền truy cập",
        )
    return history_request("GET", "/admin/records", params={"limit": limit})
