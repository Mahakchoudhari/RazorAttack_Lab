"""
RazorAttackLab — Fraud Detection API
=====================================
Standalone FastAPI backend that loads the models/artifacts trained in the
Jupyter notebook (Phase 16 — Model Persistence) and exposes a scoring API
for a separately-built frontend.

Run:
    uvicorn main:app --reload --port 8000

Requires the following files to exist (created by notebook Phase 16):
    ../models/xgboost_fraud_model.pkl
    ../models/preprocessor.pkl
    ../models/isolation_forest.pkl
    ../models/meta_stacker.pkl
    ../models/device_score_map.pkl
    ../models/ip_score_map.pkl
    ../models/merchant_score_map.pkl
    ../models/payment_method_score_map.pkl
    ../models/xgboost_feature_columns.pkl
    ../models/isolation_forest_features.pkl
    ../models/stack_features.pkl
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("razorattacklab")

# Resolve models/ relative to THIS FILE's location (backend/models),
# not the current working directory — so it works no matter where
# you launch uvicorn from (project root, backend/, etc.)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.getenv("MODEL_DIR", os.path.join(BASE_DIR, "models"))

# Policy thresholds — kept in one place so backend & frontend can agree
BLOCK_THRESHOLD = 85
REVIEW_THRESHOLD = 65
VERIFY_THRESHOLD = 40


# ------------------------------------------------------------------
# App setup
# ------------------------------------------------------------------

app = FastAPI(
    title="RazorAttackLab Fraud Scoring API",
    description="Multi-layer fraud detection: XGBoost + Isolation Forest + Graph Risk + Meta Stacker",
    version="1.0.0",
)

# Allow a separately-hosted frontend (React/Vite/Next etc.) to call this API.
# Tighten allow_origins to your actual frontend URL before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Artifacts — populated on startup
artifacts = {}


# ------------------------------------------------------------------
# Startup: load all trained artifacts once
# ------------------------------------------------------------------

@app.on_event("startup")
def load_artifacts():
    required_files = {
        "model": "xgboost_fraud_model.pkl",
        "preprocessor": "preprocessor.pkl",
        "isolation_model": "isolation_forest.pkl",
        "meta_model": "meta_stacker.pkl",
        "device_score_map": "device_score_map.pkl",
        "ip_score_map": "ip_score_map.pkl",
        "merchant_score_map": "merchant_score_map.pkl",
        "payment_method_score_map": "payment_method_score_map.pkl",
        "xgb_columns": "xgboost_feature_columns.pkl",
        "iso_features": "isolation_forest_features.pkl",
        "stack_features": "stack_features.pkl",
    }

    missing = []
    for key, filename in required_files.items():
        path = os.path.join(MODEL_DIR, filename)
        if not os.path.exists(path):
            missing.append(path)
            continue
        artifacts[key] = joblib.load(path)

    if missing:
        logger.warning(
            "Some model artifacts are missing. Run notebook Phase 16 first.\n"
            "Missing files:\n  " + "\n  ".join(missing)
        )
    else:
        logger.info("✅ All RazorAttackLab artifacts loaded successfully.")


# ------------------------------------------------------------------
# Request / response schemas
# ------------------------------------------------------------------

class TransactionInput(BaseModel):
    """
    Raw transaction fields — same as what the frontend collects
    from a payment form. Engineered features (hour, velocity flags,
    etc.) are computed server-side, so the frontend does NOT need
    to know about the ML feature engineering.
    """

    user_id: str = Field(..., example="U00575")
    merchant_id: str = Field(..., example="M0173")
    device_id: str = Field(..., example="D02225")
    ip_id: str = Field(..., example="IP03001")

    amount_inr: float = Field(..., gt=0, example=1250.50)
    average_amount_inr: float = Field(..., gt=0, example=950.00)

    timestamp_utc: Optional[str] = Field(
        None, description="ISO 8601 timestamp; defaults to now (UTC)",
        example="2026-08-30T10:27:00+00:00"
    )

    location: str = Field(..., example="Mumbai")
    payment_method: str = Field(..., example="UPI")
    merchant_category: str = Field(..., example="ecommerce")

    account_age_days: int = Field(..., ge=0, example=180)
    failed_attempts_24h: int = Field(0, ge=0, example=0)
    transactions_1h: int = Field(0, ge=0, example=1)
    transactions_24h: int = Field(0, ge=0, example=3)

    unique_users_on_device: int = Field(1, ge=0, example=1)
    unique_accounts_on_ip: int = Field(1, ge=0, example=1)

    is_new_device: int = Field(0, ge=0, le=1, example=0)
    is_new_location: int = Field(0, ge=0, le=1, example=0)

    # Optional — set to 1 if your frontend/session layer detects
    # a city change within a short window for the same user.
    impossible_travel: int = Field(0, ge=0, le=1, example=0)


class RiskScoreBreakdown(BaseModel):
    ml_risk: float
    anomaly_risk: float
    anomaly_flag: int
    graph_risk: float
    device_graph_risk: float
    ip_graph_risk: float
    merchant_risk: float
    payment_method_risk: float
    meta_risk_score: float


class ScoreResponse(BaseModel):
    transaction_id_echo: Optional[str] = None
    risk_scores: RiskScoreBreakdown
    final_risk_score: float
    recommended_action: str
    reasons: list[str]


# ------------------------------------------------------------------
# Feature engineering (mirrors notebook Phase 2)
# ------------------------------------------------------------------

def engineer_features(txn: TransactionInput) -> pd.DataFrame:
    ts = (
        pd.to_datetime(txn.timestamp_utc, utc=True)
        if txn.timestamp_utc
        else pd.Timestamp.now(tz=timezone.utc)
    )

    amount_to_average_ratio = (
        txn.amount_inr / txn.average_amount_inr if txn.average_amount_inr > 0 else 1.0
    )

    row = {
        "user_id": txn.user_id,
        "merchant_id": txn.merchant_id,
        "device_id": txn.device_id,
        "ip_id": txn.ip_id,
        "amount_inr": txn.amount_inr,
        "location": txn.location,
        "payment_method": txn.payment_method,
        "merchant_category": txn.merchant_category,
        "account_age_days": txn.account_age_days,
        "failed_attempts_24h": txn.failed_attempts_24h,
        "transactions_1h": txn.transactions_1h,
        "transactions_24h": txn.transactions_24h,
        "unique_users_on_device": txn.unique_users_on_device,
        "unique_accounts_on_ip": txn.unique_accounts_on_ip,
        "is_new_device": txn.is_new_device,
        "is_new_location": txn.is_new_location,
        "average_amount_inr": txn.average_amount_inr,
        "amount_to_average_ratio": amount_to_average_ratio,
        "transaction_hour": ts.hour,
        "day_of_week": ts.dayofweek,
    }

    row["is_weekend"] = int(row["day_of_week"] >= 5)
    row["is_night"] = int(row["transaction_hour"] < 6 or row["transaction_hour"] >= 23)
    row["high_amount_deviation"] = int(amount_to_average_ratio >= 3)
    row["high_velocity"] = int(txn.transactions_1h >= 5 or txn.transactions_24h >= 20)
    row["shared_infrastructure"] = int(
        txn.unique_users_on_device >= 3 or txn.unique_accounts_on_ip >= 5
    )
    row["new_account_new_device"] = int(
        txn.account_age_days <= 7 and txn.is_new_device == 1
    )
    row["impossible_travel"] = txn.impossible_travel

    return pd.DataFrame([row])


def build_reasons(scores: RiskScoreBreakdown, row: dict) -> list[str]:
    """Human-readable evidence, similar to notebook's attack-story generator."""
    reasons = []

    if scores.ml_risk >= 70:
        reasons.append("ML model flags strong fraud-like transaction pattern.")
    if scores.anomaly_flag == 1:
        reasons.append("Transaction behaviour is statistically anomalous.")
    if scores.device_graph_risk >= 50:
        reasons.append("Device is linked to a high-risk / shared fraud network.")
    if scores.ip_graph_risk >= 50:
        reasons.append("IP address is shared across multiple risky accounts.")
    if scores.merchant_risk >= 50:
        reasons.append("Merchant has an elevated historical fraud rate.")
    if row.get("high_velocity"):
        reasons.append("Unusually high transaction velocity in a short window.")
    if row.get("high_amount_deviation"):
        reasons.append("Transaction amount is far above the user's usual average.")
    if row.get("new_account_new_device"):
        reasons.append("New account combined with a new device.")
    if row.get("impossible_travel"):
        reasons.append("Impossible travel pattern detected for this user.")

    if not reasons:
        reasons.append("No significant risk signals detected.")

    return reasons


def decide_action(final_risk: float) -> str:
    if final_risk >= BLOCK_THRESHOLD:
        return "BLOCK"
    elif final_risk >= REVIEW_THRESHOLD:
        return "REVIEW"
    elif final_risk >= VERIFY_THRESHOLD:
        return "VERIFY"
    return "ALLOW"


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@app.get("/")
def root():
    return {
        "service": "RazorAttackLab Fraud Scoring API",
        "status": "ok",
        "artifacts_loaded": len(artifacts) > 0,
        "docs": "/docs",
    }


@app.get("/health")
def health_check():
    missing = [
        key for key in [
            "model", "preprocessor", "isolation_model", "meta_model",
            "device_score_map", "ip_score_map", "merchant_score_map",
            "payment_method_score_map", "xgb_columns", "iso_features", "stack_features",
        ]
        if key not in artifacts
    ]
    return {
        "status": "healthy" if not missing else "degraded",
        "missing_artifacts": missing,
        "model_dir_resolved": os.path.abspath(MODEL_DIR),
    }


@app.get("/sample-transaction")
def sample_transaction():
    """Returns an example payload the frontend can use for testing the form."""
    return TransactionInput(
        user_id="U00575",
        merchant_id="M0173",
        device_id="D02225",
        ip_id="IP03001",
        amount_inr=1250.50,
        average_amount_inr=950.00,
        location="Mumbai",
        payment_method="UPI",
        merchant_category="ecommerce",
        account_age_days=180,
        failed_attempts_24h=0,
        transactions_1h=1,
        transactions_24h=3,
        unique_users_on_device=1,
        unique_accounts_on_ip=1,
        is_new_device=0,
        is_new_location=0,
        impossible_travel=0,
    )


@app.post("/score-transaction", response_model=ScoreResponse)
def score_transaction(txn: TransactionInput):
    if not artifacts:
        raise HTTPException(
            status_code=503,
            detail="Model artifacts not loaded. Run notebook Phase 16 to generate ../models/ first.",
        )

    try:
        row_df = engineer_features(txn)
        row = row_df.iloc[0].to_dict()

        # ---------------- 1. ML risk (XGBoost) ----------------
        X_ml = row_df[artifacts["xgb_columns"]]
        X_ml_encoded = artifacts["preprocessor"].transform(X_ml)
        fraud_probability = artifacts["model"].predict_proba(X_ml_encoded)[:, 1][0]
        ml_risk = float(fraud_probability * 100)

        # ---------------- 2. Anomaly risk (Isolation Forest) ----------------
        X_iso = row_df[artifacts["iso_features"]]
        anomaly_flag = int(artifacts["isolation_model"].predict(X_iso)[0] == -1)
        raw_anomaly = artifacts["isolation_model"].decision_function(X_iso)[0]
        anomaly_risk = float(np.clip((-raw_anomaly) * 100, 0, 100))

        # ---------------- 3. Graph risk (device / IP) ----------------
        device_risk = float(artifacts["device_score_map"].get(txn.device_id, 0))
        ip_risk = float(artifacts["ip_score_map"].get(txn.ip_id, 0))
        graph_risk = 0.6 * device_risk + 0.4 * ip_risk

        # ---------------- 4. Merchant / payment-method risk ----------------
        merchant_risk = float(artifacts["merchant_score_map"].get(txn.merchant_id, 0))
        payment_risk = float(artifacts["payment_method_score_map"].get(txn.payment_method, 0))

        # ---------------- 5. Meta stacker -> final probability ----------------
        stack_input = pd.DataFrame([{
            "ml_risk_score": ml_risk,
            "anomaly_risk_score": anomaly_risk,
            "graph_risk_score": graph_risk,
            "merchant_risk_score": merchant_risk,
            "payment_method_risk_score": payment_risk,
            "impossible_travel": txn.impossible_travel,
        }])[artifacts["stack_features"]]

        meta_probability = artifacts["meta_model"].predict_proba(stack_input)[:, 1][0]
        final_risk = round(float(meta_probability * 100), 2)

        action = decide_action(final_risk)

        breakdown = RiskScoreBreakdown(
            ml_risk=round(ml_risk, 2),
            anomaly_risk=round(anomaly_risk, 2),
            anomaly_flag=anomaly_flag,
            graph_risk=round(graph_risk, 2),
            device_graph_risk=round(device_risk, 2),
            ip_graph_risk=round(ip_risk, 2),
            merchant_risk=round(merchant_risk, 2),
            payment_method_risk=round(payment_risk, 2),
            meta_risk_score=final_risk,
        )

        reasons = build_reasons(breakdown, row)

        return ScoreResponse(
            transaction_id_echo=None,
            risk_scores=breakdown,
            final_risk_score=final_risk,
            recommended_action=action,
            reasons=reasons,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Scoring failed")
        raise HTTPException(status_code=500, detail=f"Scoring error: {exc}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
