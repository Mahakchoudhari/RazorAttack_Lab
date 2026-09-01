from __future__ import annotations

import json
import math
import os
import random
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
import pandas as pd

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from sklearn.metrics import (
    average_precision_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from groq import Groq


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

GROQ_MODEL = "openai/gpt-oss-20b"

groq_client = None

if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)


# ============================================================
# PATHS
# ============================================================

ROOT = Path(__file__).resolve().parent

DATA_PATH = ROOT.parent / "data" / "razorattacklab_transactions.csv"

MODEL_DIR = ROOT / "models"


# ============================================================
# LOAD MODELS
# ============================================================

MODEL = joblib.load(
    MODEL_DIR / "xgb_fraud_model.joblib"
)

PREPROCESSOR = joblib.load(
    MODEL_DIR / "preprocessor.joblib"
)

ISOLATION_MODEL = joblib.load(
    MODEL_DIR / "isolation_forest.joblib"
)

ANOMALY_SCALER = joblib.load(
    MODEL_DIR / "anomaly_scaler.joblib"
)


# ============================================================
# LOAD DATA
# ============================================================

DATA = pd.read_csv(DATA_PATH)

DATA["timestamp_utc"] = pd.to_datetime(
    DATA["timestamp_utc"],
    utc=True,
)

DATA = (
    DATA
    .sort_values("timestamp_utc")
    .reset_index(drop=True)
)


# ============================================================
# MODEL INPUT COLUMNS
# ============================================================

MODEL_COLUMNS = list(
    PREPROCESSOR.feature_names_in_
)

ISO_COLUMNS = list(
    ISOLATION_MODEL.feature_names_in_
)


# ============================================================
# HISTORICAL GRAPH DATA
# ============================================================

# Only historical connectivity is used for graph risk.
HISTORY = DATA.iloc[
    : int(len(DATA) * 0.80)
].copy()


DEVICE_STATS = HISTORY.groupby(
    "device_id"
).agg(
    unique_users=("user_id", "nunique"),
    unique_ips=("ip_id", "nunique"),
    total_transactions=("transaction_id", "count"),
)


IP_STATS = HISTORY.groupby(
    "ip_id"
).agg(
    unique_users=("user_id", "nunique"),
    unique_devices=("device_id", "nunique"),
    total_transactions=("transaction_id", "count"),
)


# ============================================================
# FEATURE EXPLANATIONS
# ============================================================

FEATURE_EXPLANATIONS = {

    "amount_inr":
        "Transaction amount",

    "transactions_1h":
        "High transaction velocity in the last hour",

    "transactions_24h":
        "High transaction activity in the last 24 hours",

    "amount_to_average_ratio":
        "Amount is unusual compared with the user's average",

    "failed_attempts_24h":
        "Multiple failed payment attempts",

    "account_age_days":
        "Account age",

    "unique_users_on_device":
        "Multiple users are associated with the same device",

    "unique_accounts_on_ip":
        "Multiple accounts are associated with the same IP",

    "is_new_device":
        "Transaction is coming from a new device",

    "is_new_location":
        "Transaction is coming from a new location",

    "high_amount_deviation":
        "Amount is significantly higher than normal",

    "high_velocity":
        "Unusually high transaction velocity",

    "shared_infrastructure":
        "Device or IP infrastructure is shared across users",

    "new_account_new_device":
        "New account is using a new device",

    "transaction_hour":
        "Transaction time",

    "day_of_week":
        "Transaction day",

    "is_weekend":
        "Transaction occurred during the weekend",

    "is_night":
        "Transaction occurred during nighttime",
}


# ============================================================
# REQUEST MODEL
# ============================================================

class TransactionInput(BaseModel):

    transaction_id: str = "LIVE_TXN_001"

    user_id: str = "U_LIVE_001"

    merchant_id: str = "M0100"

    device_id: str = "D_LIVE_001"

    ip_id: str = "IP_LIVE_001"

    amount_inr: float = Field(
        2500,
        ge=0,
    )

    timestamp_utc: str = (
        "2026-03-01T14:30:00+00:00"
    )

    location: str = "Bengaluru"

    payment_method: str = "UPI"

    merchant_category: str = "ecommerce"

    account_age_days: int = Field(
        180,
        ge=0,
    )

    failed_attempts_24h: int = Field(
        0,
        ge=0,
    )

    transactions_1h: int = Field(
        1,
        ge=0,
    )

    transactions_24h: int = Field(
        3,
        ge=0,
    )

    unique_users_on_device: int = Field(
        1,
        ge=0,
    )

    unique_accounts_on_ip: int = Field(
        1,
        ge=0,
    )

    is_new_device: int = Field(
        0,
        ge=0,
        le=1,
    )

    is_new_location: int = Field(
        0,
        ge=0,
        le=1,
    )

    average_amount_inr: float = Field(
        2000,
        ge=0,
    )

    amount_to_average_ratio: float = Field(
        1.25,
        ge=0,
    )


# ============================================================
# RECORD PREPARATION
# ============================================================

def _as_record(
    payload: TransactionInput | Dict[str, Any]
) -> Dict[str, Any]:

    if isinstance(payload, TransactionInput):

        record = payload.model_dump()

    else:

        record = dict(payload)

    stamp = pd.to_datetime(
        record.get("timestamp_utc"),
        utc=True,
    )

    record["transaction_hour"] = int(
        stamp.hour
    )

    record["day_of_week"] = int(
        stamp.dayofweek
    )

    record["is_weekend"] = int(
        stamp.dayofweek >= 5
    )

    record["is_night"] = int(
        stamp.hour < 6
        or stamp.hour >= 23
    )

    record["high_amount_deviation"] = int(
        record["amount_to_average_ratio"] >= 3
    )

    record["high_velocity"] = int(
        record["transactions_1h"] >= 5
        or record["transactions_24h"] >= 20
    )

    record["shared_infrastructure"] = int(
        record["unique_users_on_device"] >= 3
        or record["unique_accounts_on_ip"] >= 5
    )

    record["new_account_new_device"] = int(
        record["account_age_days"] <= 7
        and record["is_new_device"] == 1
    )

    return record


# ============================================================
# MODEL FRAME
# ============================================================

def _model_frame(
    record: Dict[str, Any]
) -> pd.DataFrame:

    frame = pd.DataFrame([record])

    missing = [
        column
        for column in MODEL_COLUMNS
        if column not in frame
    ]

    if missing:

        raise ValueError(
            f"Missing model fields: {missing}"
        )

    return frame[MODEL_COLUMNS]


# ============================================================
# GRAPH RISK
# ============================================================

def _graph_scores(
    record: Dict[str, Any]
) -> tuple[float, float, float]:

    device = (
        DEVICE_STATS.loc[
            record["device_id"]
        ]
        if record["device_id"]
        in DEVICE_STATS.index
        else None
    )

    ip = (
        IP_STATS.loc[
            record["ip_id"]
        ]
        if record["ip_id"]
        in IP_STATS.index
        else None
    )

    device_score = 0.0

    if device is not None:

        shared_users = min(
            1.0,
            max(
                0.0,
                (
                    float(device["unique_users"])
                    - 1
                ) / 7,
            ),
        )

        shared_ips = min(
            1.0,
            max(
                0.0,
                (
                    float(device["unique_ips"])
                    - 1
                ) / 4,
            ),
        )

        device_score = (
            55 * shared_users
            + 45 * shared_ips
        )

    ip_score = 0.0

    if ip is not None:

        shared_users = min(
            1.0,
            max(
                0.0,
                (
                    float(ip["unique_users"])
                    - 1
                ) / 9,
            ),
        )

        shared_devices = min(
            1.0,
            max(
                0.0,
                (
                    float(ip["unique_devices"])
                    - 1
                ) / 6,
            ),
        )

        ip_score = (
            55 * shared_users
            + 45 * shared_devices
        )

    # Brand-new IDs
    if device is None:

        device_score = min(
            100.0,
            float(
                record[
                    "unique_users_on_device"
                ]
            ) * 12,
        )

    if ip is None:

        ip_score = min(
            100.0,
            float(
                record[
                    "unique_accounts_on_ip"
                ]
            ) * 10,
        )

    graph_score = (
        0.60 * device_score
        + 0.40 * ip_score
    )

    return (
        round(device_score, 2),
        round(ip_score, 2),
        round(graph_score, 2),
    )


# ============================================================
# BASELINE POLICY
# ============================================================

def _policy(
    record: Dict[str, Any],
    final_risk: float,
    graph_risk: float,
) -> str:

    if (
        record["unique_users_on_device"] >= 5
        and record["unique_accounts_on_ip"] >= 5
        and record["shared_infrastructure"] == 1
    ):

        return "BLOCK"

    if (
        (
            record["transactions_1h"] >= 15
            or record["transactions_24h"] >= 30
        )
        and final_risk >= 55
    ):

        return "BLOCK"

    if (
        record["is_new_device"] == 1
        and record["is_new_location"] == 1
        and record["failed_attempts_24h"] >= 3
        and final_risk >= 50
    ):

        return "VERIFY"

    if graph_risk >= 75:

        return "REVIEW"

    if final_risk >= 85:

        return "BLOCK"

    if final_risk >= 65:

        return "REVIEW"

    if final_risk >= 40:

        return "VERIFY"

    return "ALLOW"


# ============================================================
# HARDENED POLICY
# ============================================================

def _hardened_policy(
    record: Dict[str, Any],
    final_risk: float,
    anomaly_flag: int,
) -> str:

    if (
        record["unique_users_on_device"] >= 5
        and record["unique_accounts_on_ip"] >= 5
        and record["shared_infrastructure"] == 1
    ):

        return "BLOCK"

    if (
        record["is_new_device"] == 1
        and record["is_new_location"] == 1
        and record["failed_attempts_24h"] >= 3
        and final_risk >= 50
    ):

        return "BLOCK"

    if (
        record["transactions_1h"] >= 15
        or record["transactions_24h"] >= 30
    ):

        return (
            "BLOCK"
            if final_risk >= 70
            else "VERIFY"
        )

    if (
        record["amount_to_average_ratio"] >= 3
        and record["high_amount_deviation"] == 1
        and anomaly_flag == 1
    ):

        return "REVIEW"

    if final_risk >= 85:

        return "BLOCK"

    if final_risk >= 65:

        return "REVIEW"

    if final_risk >= 40:

        return "VERIFY"

    return "ALLOW"


# ============================================================
# GROQ HELPERS
# ============================================================

def _safe_json_loads(text: str) -> Dict[str, Any]:

    text = text.strip()

    # Remove markdown fences if model adds them.
    if text.startswith("```"):

        text = text.replace(
            "```json",
            "",
            1,
        )

        text = text.replace(
            "```",
            "",
        ).strip()

    try:

        return json.loads(text)

    except Exception:

        return {
            "risk_summary": text,
            "observed_evidence": [],
            "why_suspicious": text,
            "likely_attack_pattern": "Unknown",
            "recommended_action": "Review",
            "attack_story": text,
        }


def _groq_transaction_analysis(
    record: Dict[str, Any],
    scored: Dict[str, Any],
) -> Dict[str, Any]:

    if groq_client is None:

        return {
            "available": False,
            "error": "GROQ_API_KEY is not configured.",
            "risk_summary": "AI analysis unavailable.",
            "observed_evidence": [],
            "why_suspicious": "",
            "likely_attack_pattern": "Unavailable",
            "recommended_action": scored["action"],
            "attack_story": "",
        }

    # --------------------------------------------------------
    # IMPORTANT:
    # Actual fraud label is NOT sent to Groq.
    # --------------------------------------------------------

    evidence = {

        "transaction": {
            "transaction_id":
                record["transaction_id"],

            "amount_inr":
                record["amount_inr"],

            "location":
                record["location"],

            "payment_method":
                record["payment_method"],

            "merchant_category":
                record["merchant_category"],

            "account_age_days":
                record["account_age_days"],

            "failed_attempts_24h":
                record["failed_attempts_24h"],

            "transactions_1h":
                record["transactions_1h"],

            "transactions_24h":
                record["transactions_24h"],

            "unique_users_on_device":
                record["unique_users_on_device"],

            "unique_accounts_on_ip":
                record["unique_accounts_on_ip"],

            "is_new_device":
                bool(record["is_new_device"]),

            "is_new_location":
                bool(record["is_new_location"]),

            "amount_to_average_ratio":
                record["amount_to_average_ratio"],
        },

        "risk_engine": {

            "ml_risk":
                scored["ml_risk"],

            "anomaly_risk":
                scored["anomaly_risk"],

            "graph_risk":
                scored["graph_risk"],

            "device_graph_risk":
                scored["device_graph_risk"],

            "ip_graph_risk":
                scored["ip_graph_risk"],

            "final_risk":
                scored["final_risk"],

            "risk_band":
                scored["risk_band"],

            "anomaly_detected":
                bool(scored["anomaly_flag"]),

            "baseline_action":
                scored["action"],
        },

        "signals":
            scored["signals"],

        "model_evidence":
            scored["top_reasons"],
    }

    system_prompt = """
You are the Risk Analyst AI inside RazorAttackLab,
a proactive payment fraud defense system.

Your job is to analyze observable transaction evidence
produced by deterministic ML, anomaly detection and graph
risk engines.

IMPORTANT RULES:

1. Never claim that a transaction is definitely fraud.
2. Do not invent evidence.
3. Do not mention hidden labels or ground-truth fraud labels.
4. Explain why the transaction is suspicious or not suspicious.
5. Identify a likely attack pattern only when supported by evidence.
6. Distinguish observed evidence from inference.
7. Give an actionable recommendation for a fraud-risk team.
8. Keep the explanation concise enough for a dashboard.
9. Return ONLY valid JSON.

Required JSON structure:

{
  "risk_summary": "2-3 sentence summary",
  "observed_evidence": [
    "evidence point 1",
    "evidence point 2",
    "evidence point 3"
  ],
  "why_suspicious": "Explain the risk using the provided evidence.",
  "likely_attack_pattern": "Pattern name or None identified",
  "recommended_action": "ALLOW / VERIFY / REVIEW / BLOCK with explanation",
  "attack_story": "Short narrative describing how this behavior could represent an attack."
}

The attack story must be framed as a plausible scenario,
not as a confirmed fact.
"""

    user_prompt = f"""
Analyze this RazorAttackLab transaction.

Evidence:

{json.dumps(evidence, indent=2, default=str)}

Return only JSON.
"""

    try:

        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            temperature=0.2,
            max_completion_tokens=900,
        )

        content = (
            response
            .choices[0]
            .message
            .content
        )

        parsed = _safe_json_loads(
            content or ""
        )

        parsed["available"] = True
        parsed["model"] = GROQ_MODEL

        return parsed

    except Exception as exc:

        return {
            "available": False,
            "error": str(exc),
            "risk_summary":
                "AI analysis could not be generated.",
            "observed_evidence": [],
            "why_suspicious": "",
            "likely_attack_pattern":
                "Unavailable",
            "recommended_action":
                scored["action"],
            "attack_story": "",
        }


# ============================================================
# GROQ ATTACK SIMULATION ANALYSIS
# ============================================================

def _groq_attack_analysis(
    simulation: Dict[str, Any]
) -> Dict[str, Any]:

    if groq_client is None:

        return {
            "available": False,
            "error":
                "GROQ_API_KEY is not configured.",
        }

    system_prompt = """
You are the senior AI Risk Analyst for RazorAttackLab.

RazorAttackLab stress-tests a payment defense system
against simulated attacker behavior.

Analyze the aggregate attack simulation results.

You must explain:

1. Which attack patterns are hardest to contain.
2. Where the baseline defense is weak.
3. Whether the hardened defense improves containment.
4. What attacker behavior appears to cause bypasses.
5. What controls should be added next.
6. What residual risk remains.

Do not invent numerical results.
Use only the supplied simulation results.

Return ONLY valid JSON:

{
  "executive_summary": "...",
  "key_findings": [
    "...",
    "...",
    "..."
  ],
  "most_difficult_attack": "...",
  "baseline_weakness": "...",
  "hardened_defense_impact": "...",
  "residual_risk": "...",
  "recommended_controls": [
    "...",
    "...",
    "..."
  ],
  "attack_story": "A concise plausible attacker narrative based on the observed simulation."
}
"""

    user_prompt = f"""
Analyze this RazorAttackLab attack simulation:

{json.dumps(simulation, indent=2, default=str)}

Return only JSON.
"""

    try:

        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            temperature=0.2,
            max_completion_tokens=1000,
        )

        content = (
            response
            .choices[0]
            .message
            .content
        )

        parsed = _safe_json_loads(
            content or ""
        )

        parsed["available"] = True
        parsed["model"] = GROQ_MODEL

        return parsed

    except Exception as exc:

        return {
            "available": False,
            "error": str(exc),
        }


# ============================================================
# SCORE TRANSACTION
# ============================================================

def score_record(
    payload: TransactionInput | Dict[str, Any]
) -> Dict[str, Any]:

    record = _as_record(payload)

    frame = _model_frame(record)

    encoded = PREPROCESSOR.transform(
        frame
    )

    ml_risk = float(
        MODEL
        .predict_proba(encoded)[:, 1][0]
        * 100
    )

    # --------------------------------------------------------
    # Isolation Forest
    # --------------------------------------------------------

    iso_frame = pd.DataFrame(
        [record]
    )[ISO_COLUMNS]

    anomaly_flag = int(
        ISOLATION_MODEL.predict(
            iso_frame
        )[0] == -1
    )

    raw_anomaly = float(
        -ISOLATION_MODEL.score_samples(
            iso_frame
        )[0]
    )

    anomaly_risk = float(
        ANOMALY_SCALER.transform(
            [[raw_anomaly]]
        )[0, 0]
    )

    anomaly_risk = float(
        np.clip(
            anomaly_risk,
            0,
            100,
        )
    )

    # --------------------------------------------------------
    # Graph risk
    # --------------------------------------------------------

    (
        device_risk,
        ip_risk,
        graph_risk,
    ) = _graph_scores(record)

    # --------------------------------------------------------
    # Risk fusion
    # --------------------------------------------------------

    final_risk = float(
        np.clip(
            0.50 * ml_risk
            + 0.20 * anomaly_risk
            + 0.30 * graph_risk,
            0,
            100,
        )
    )

    # --------------------------------------------------------
    # Policies
    # --------------------------------------------------------

    action = _policy(
        record,
        final_risk,
        graph_risk,
    )

    hardened_action = _hardened_policy(
        record,
        final_risk,
        anomaly_flag,
    )

    # --------------------------------------------------------
    # XGBoost feature contributions
    # --------------------------------------------------------

    import xgboost

    contributions = (
        MODEL
        .get_booster()
        .predict(
            xgboost.DMatrix(encoded),
            pred_contribs=True,
        )[0][:-1]
    )

    feature_names = list(
        PREPROCESSOR
        .get_feature_names_out()
    )

    top_reasons = []

    for index in np.argsort(
        np.abs(contributions)
    )[-5:][::-1]:

        name = (
            feature_names[index]
            .replace(
                "remainder__",
                "",
            )
            .replace(
                "categorical__",
                "",
            )
        )

        top_reasons.append(
            {
                "feature": name,

                "impact":
                    "increases risk"
                    if contributions[index] > 0
                    else "decreases risk",

                "importance":
                    round(
                        float(
                            abs(
                                contributions[index]
                            )
                        ),
                        3,
                    ),

                "explanation":
                    FEATURE_EXPLANATIONS.get(
                        name,
                        name,
                    ),
            }
        )

    risk_band = (
        "critical"
        if final_risk >= 85
        else
        "high"
        if final_risk >= 65
        else
        "medium"
        if final_risk >= 40
        else
        "low"
    )

    # --------------------------------------------------------
    # Base result
    # --------------------------------------------------------

    result = {

        "transaction_id":
            record["transaction_id"],

        "amount_inr":
            round(
                float(
                    record["amount_inr"]
                ),
                2,
            ),

        "ml_risk":
            round(
                ml_risk,
                2,
            ),

        "anomaly_flag":
            anomaly_flag,

        "anomaly_risk":
            round(
                anomaly_risk,
                2,
            ),

        "device_graph_risk":
            device_risk,

        "ip_graph_risk":
            ip_risk,

        "graph_risk":
            graph_risk,

        "final_risk":
            round(
                final_risk,
                2,
            ),

        "action":
            action,

        "hardened_action":
            hardened_action,

        "top_reasons":
            top_reasons,

        "risk_band":
            risk_band,

        "signals": {

            "new_device":
                bool(
                    record["is_new_device"]
                ),

            "new_location":
                bool(
                    record["is_new_location"]
                ),

            "high_velocity":
                bool(
                    record["high_velocity"]
                ),

            "shared_infrastructure":
                bool(
                    record[
                        "shared_infrastructure"
                    ]
                ),
        },
    }

    return result


# ============================================================
# EVALUATION METRICS
# ============================================================

def _evaluate_model() -> Dict[str, float]:

    test = DATA.iloc[
        int(len(DATA) * 0.80):
    ].copy()

    frame = pd.DataFrame(
        [
            _as_record(
                row.to_dict()
            )
            for _, row in test.iterrows()
        ]
    )[MODEL_COLUMNS]

    encoded = PREPROCESSOR.transform(
        frame
    )

    probabilities = (
        MODEL
        .predict_proba(encoded)[:, 1]
    )

    truth = (
        test["is_fraud"]
        .astype(int)
    )

    predictions = (
        probabilities >= 0.5
    ).astype(int)

    return {

        "roc_auc":
            round(
                float(
                    roc_auc_score(
                        truth,
                        probabilities,
                    )
                ),
                3,
            ),

        "pr_auc":
            round(
                float(
                    average_precision_score(
                        truth,
                        probabilities,
                    )
                ),
                3,
            ),

        "precision":
            round(
                float(
                    precision_score(
                        truth,
                        predictions,
                        zero_division=0,
                    )
                ),
                3,
            ),

        "recall":
            round(
                float(
                    recall_score(
                        truth,
                        predictions,
                        zero_division=0,
                    )
                ),
                3,
            ),

        "test_transactions":
            int(
                len(test)
            ),
    }


# ============================================================
# SAMPLE DASHBOARD QUEUE
# ============================================================

def _sample_transaction_rows(
    limit: int = 12
) -> List[Dict[str, Any]]:

    candidates = (
        DATA
        .sort_values(
            "amount_inr",
            ascending=False,
        )
        .head(limit)
    )

    results = []

    for _, row in candidates.iterrows():

        clean_row = row.drop(
            labels=[
                "is_fraud",
                "fraud_type",
                "risk_score",
                "recommended_decision",
            ],
            errors="ignore",
        ).to_dict()

        scored = score_record(
            clean_row
        )

        scored.update(
            {
                "user_id":
                    row["user_id"],

                "location":
                    row["location"],

                "payment_method":
                    row["payment_method"],

                # Evaluation metadata is retained
                # for dashboard table display.
                "fraud_type":
                    row["fraud_type"],
            }
        )

        results.append(
            scored
        )

    return results


# ============================================================
# ATTACK GENERATOR
# ============================================================

def _attack_record(
    row: pd.Series,
    scenario: str,
    rng: random.Random,
) -> Dict[str, Any]:

    record = row.drop(
        labels=[
            "is_fraud",
            "fraud_type",
            "risk_score",
            "recommended_decision",
        ],
        errors="ignore",
    ).to_dict()

    record["transaction_id"] = (
        f"SIM_{scenario.upper()}_"
        f"{rng.randint(1000, 9999)}"
    )

    if scenario == "card_testing":

        record.update(
            amount_inr=rng.uniform(
                10,
                500,
            ),

            transactions_1h=rng.randint(
                8,
                20,
            ),

            transactions_24h=rng.randint(
                20,
                45,
            ),

            failed_attempts_24h=rng.randint(
                3,
                10,
            ),
        )

    elif scenario == "account_takeover":

        record.update(
            is_new_device=1,

            is_new_location=1,

            failed_attempts_24h=
                rng.randint(
                    3,
                    10,
                ),

            amount_to_average_ratio=
                rng.uniform(
                    2,
                    7,
                ),

            transactions_1h=
                rng.randint(
                    4,
                    12,
                ),
        )

    elif scenario == "rapid_transactions":

        record.update(
            transactions_1h=
                rng.randint(
                    15,
                    40,
                ),

            transactions_24h=
                rng.randint(
                    30,
                    80,
                ),

            failed_attempts_24h=
                rng.randint(
                    2,
                    8,
                ),
        )

    elif scenario == "refund_abuse":

        record.update(
            amount_to_average_ratio=
                rng.uniform(
                    3,
                    8,
                ),

            transactions_1h=
                rng.randint(
                    5,
                    15,
                ),

            transactions_24h=
                rng.randint(
                    15,
                    40,
                ),

            is_new_location=
                rng.randint(
                    0,
                    1,
                ),
        )

    elif scenario == "coordinated_fraud_ring":

        record.update(
            unique_users_on_device=
                rng.randint(
                    5,
                    12,
                ),

            unique_accounts_on_ip=
                rng.randint(
                    5,
                    12,
                ),

            is_new_device=1,

            is_new_location=1,

            amount_to_average_ratio=
                rng.uniform(
                    2,
                    6,
                ),
        )

    return record


# ============================================================
# ATTACK SIMULATION
# ============================================================

def run_attack_simulation() -> Dict[str, Any]:

    rng = random.Random(42)

    scenarios = [
        "card_testing",
        "account_takeover",
        "rapid_transactions",
        "refund_abuse",
        "coordinated_fraud_ring",
    ]

    results = []

    pool = (
        DATA
        .sample(
            n=100,
            random_state=42,
        )
        .reset_index(drop=True)
    )

    for index, scenario in enumerate(
        scenarios
    ):

        for offset in range(20):

            attack_input = _attack_record(
                pool.iloc[
                    index * 20 + offset
                ],
                scenario,
                rng,
            )

            scored = score_record(
                attack_input
            )

            results.append(
                {
                    "scenario":
                        scenario,

                    **scored,
                }
            )

    report = []

    for scenario in scenarios:

        rows = [
            item
            for item in results
            if item["scenario"]
            == scenario
        ]

        contained = sum(
            item["action"] != "ALLOW"
            for item in rows
        )

        hardened_contained = sum(
            item["hardened_action"]
            != "ALLOW"
            for item in rows
        )

        report.append(
            {
                "scenario":
                    scenario,

                "attacks":
                    len(rows),

                "contained":
                    contained,

                "bypassed":
                    len(rows) - contained,

                "hardened_contained":
                    hardened_contained,

                "hardened_bypassed":
                    len(rows)
                    - hardened_contained,

                "average_risk":
                    round(
                        float(
                            np.mean(
                                [
                                    item[
                                        "final_risk"
                                    ]
                                    for item in rows
                                ]
                            )
                        ),
                        1,
                    ),
            }
        )

    baseline_contained = sum(
        item["action"] != "ALLOW"
        for item in results
    )

    hardened_contained = sum(
        item["hardened_action"] != "ALLOW"
        for item in results
    )

    simulation = {

        "total_attacks":
            len(results),

        "baseline_contained":
            baseline_contained,

        "baseline_bypassed":
            len(results)
            - baseline_contained,

        "hardened_contained":
            hardened_contained,

        "hardened_bypassed":
            len(results)
            - hardened_contained,

        "baseline_containment_rate":
            round(
                baseline_contained
                / len(results)
                * 100,
                2,
            ),

        "hardened_containment_rate":
            round(
                hardened_contained
                / len(results)
                * 100,
                2,
            ),

        "scenarios":
            report,
    }

    # --------------------------------------------------------
    # Groq analyzes aggregate simulation.
    # --------------------------------------------------------

    simulation["ai_analysis"] = (
        _groq_attack_analysis(
            simulation
        )
    )

    return simulation


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="RazorAttackLab API",
    version="2.0.0",
    description=(
        "Proactive AI fraud defense and "
        "adversarial risk analysis API."
    ),
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health() -> Dict[str, Any]:

    return {

        "status":
            "operational",

        "model":
            "xgboost+isolation-forest+graph",

        "groq":
            (
                "connected"
                if groq_client is not None
                else "not_configured"
            ),

        "groq_model":
            GROQ_MODEL,
    }


# ============================================================
# OVERVIEW
# ============================================================

@app.get("/api/overview")
def overview() -> Dict[str, Any]:

    metrics = _evaluate_model()

    queue = _sample_transaction_rows()

    return {

        "metrics":
            metrics,

        "dataset": {

            "transactions":
                int(len(DATA)),

            "fraud_rows":
                int(DATA["is_fraud"].sum()),
        },

        "queue":
            queue,

        "graph": {

            "devices_monitored":
                int(len(DEVICE_STATS)),

            "ips_monitored":
                int(len(IP_STATS)),

            "shared_devices":
                int(
                    (
                        DEVICE_STATS[
                            "unique_users"
                        ] >= 3
                    ).sum()
                ),
        },

        "ai": {

            "provider":
                "Groq",

            "model":
                GROQ_MODEL,

            "available":
                groq_client is not None,
        },
    }


# ============================================================
# TRANSACTIONS
# ============================================================

@app.get(
    "/api/transactions"
)
def transactions(
    limit: int = Query(
        12,
        ge=1,
        le=50,
    )
) -> List[Dict[str, Any]]:

    return _sample_transaction_rows(
        limit
    )


# ============================================================
# SCORE TRANSACTION + GROQ
# ============================================================

@app.post(
    "/api/score"
)
def score_transaction(
    payload: TransactionInput
) -> Dict[str, Any]:

    try:

        record = _as_record(
            payload
        )

        scored = score_record(
            payload
        )

        # ----------------------------------------------------
        # AI explanation
        # ----------------------------------------------------

        ai_analysis = (
            _groq_transaction_analysis(
                record,
                scored,
            )
        )

        scored["ai_analysis"] = (
            ai_analysis
        )

        return scored

    except Exception as exc:

        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc


# ============================================================
# ATTACK SIMULATION
# ============================================================

@app.post(
    "/api/attacks/run"
)
def attacks() -> Dict[str, Any]:

    try:

        return run_attack_simulation()

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


# ============================================================
# METRICS
# ============================================================

@app.get(
    "/api/metrics"
)
def metrics() -> Dict[str, Any]:

    return _evaluate_model()


# ============================================================
# AI STATUS
# ============================================================

@app.get(
    "/api/ai/status"
)
def ai_status() -> Dict[str, Any]:

    return {

        "provider":
            "Groq",

        "model":
            GROQ_MODEL,

        "configured":
            groq_client is not None,

        "status":
            (
                "operational"
                if groq_client is not None
                else "not_configured"
            ),
    }