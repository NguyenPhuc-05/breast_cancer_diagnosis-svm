"""Independent storage service for Breast Cancer SVM prediction history."""

from __future__ import annotations

import json
import math
import os
from datetime import datetime
from secrets import compare_digest
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import text

from database.db import SessionLocal
from database.models import BcPrediction, register_bc_user


class RecordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=1, max_length=100)
    created_at: datetime
    model_version: str = Field(min_length=1, max_length=50)
    predicted_label: Literal["malignant", "benign"]
    probability_malignant: float = Field(ge=0.0, le=1.0)
    probability_benign: float = Field(ge=0.0, le=1.0)
    threshold: float = Field(ge=0.0, le=1.0)
    features: dict[str, float] = Field(min_length=30, max_length=30)

    @field_validator("features")
    @classmethod
    def validate_features(cls, features: dict[str, float]) -> dict[str, float]:
        if not all(math.isfinite(value) for value in features.values()):
            raise ValueError("Features must be finite numbers")
        return features

    @model_validator(mode="after")
    def validate_probability_sum(self):
        if not math.isclose(
            self.probability_malignant + self.probability_benign,
            1.0,
            abs_tol=1e-6,
        ):
            raise ValueError("Class probabilities must sum to one")
        return self


def authorize(authorization: str = Header(default="")) -> None:
    configured_token = os.environ.get("BC_DATA_TOKEN", "")
    if not authorization:
        raise HTTPException(status_code=401, detail="Service authentication required")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer authentication required")

    supplied = authorization.removeprefix("Bearer ")
    token_is_valid = len(configured_token) >= 32 and compare_digest(
        supplied.encode("utf-8"), configured_token.encode("utf-8")
    )
    if not token_is_valid:
        raise HTTPException(status_code=403, detail="Invalid service credential")


def create_record(payload: RecordInput) -> dict:
    with SessionLocal.begin() as session:
        register_bc_user(session, payload.user_id, payload.created_at)
        record = BcPrediction(
            user_id=payload.user_id,
            created_at=payload.created_at,
            model_version=payload.model_version,
            predicted_label=payload.predicted_label,
            probability_malignant=payload.probability_malignant,
            probability_benign=payload.probability_benign,
            threshold=payload.threshold,
            features_json=json.dumps(
                payload.features,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ),
        )
        session.add(record)
        session.flush()
        return {"id": record.id}


def serialize_record(record: BcPrediction) -> dict:
    return {
        "id": record.id,
        "created_at": record.created_at.isoformat(),
        "model_version": record.model_version,
        "predicted_label": record.predicted_label,
        "probability_malignant": record.probability_malignant,
        "probability_benign": record.probability_benign,
        "threshold": record.threshold,
        "features": json.loads(record.features_json),
    }


def read_records(
    user_id: str = Query(min_length=1, max_length=100),
    limit: int = Query(default=50, ge=1, le=500),
) -> list[dict]:
    with SessionLocal() as session:
        records = (
            session.query(BcPrediction)
            .filter(BcPrediction.user_id == user_id)
            .order_by(BcPrediction.id.desc())
            .limit(limit)
            .all()
        )
        return [serialize_record(record) for record in records]


def delete_records(
    user_id: str = Query(min_length=1, max_length=100),
) -> dict:
    with SessionLocal.begin() as session:
        deleted = (
            session.query(BcPrediction)
            .filter(BcPrediction.user_id == user_id)
            .delete(synchronize_session=False)
        )
    return {"status": "cleared", "deleted": int(deleted)}


def read_all_records(
    limit: int = Query(default=200, ge=1, le=500),
) -> list[dict]:
    with SessionLocal() as session:
        records = (
            session.query(BcPrediction)
            .order_by(BcPrediction.id.desc())
            .limit(limit)
            .all()
        )
        return [serialize_record(record) for record in records]


app = FastAPI(
    title="Breast Cancer SVM Data Service",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
protected = APIRouter(dependencies=[Depends(authorize)])
protected.add_api_route("/records", create_record, methods=["POST"])
protected.add_api_route(
    "/records",
    read_records,
    methods=["GET"],
    response_model=list[dict],
)
protected.add_api_route("/records", delete_records, methods=["DELETE"])
protected.add_api_route(
    "/admin/records",
    read_all_records,
    methods=["GET"],
    response_model=list[dict],
)
app.include_router(protected)


@app.get("/health")
def health() -> dict:
    with SessionLocal() as session:
        session.execute(text("SELECT 1"))
    return {"status": "ok"}
