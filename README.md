# ⚡ RazorAttackLab — AI Payment Fraud Defense & Stress Testing System

<p align="center">
  <b>A Multi-Layer AI Payment Risk System that Detects Fraud, Tests Its Own Defense, and Improves Policy</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/XGBoost-ML-red?style=for-the-badge" alt="XGBoost">
  <img src="https://img.shields.io/badge/Isolation%20Forest-Anomaly-orange?style=for-the-badge" alt="Isolation Forest">
  <img src="https://img.shields.io/badge/Graph%20Risk-Network-purple?style=for-the-badge" alt="Graph Risk">
  <img src="https://img.shields.io/badge/SHAP-Explainability-green?style=for-the-badge" alt="SHAP">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

---

## 🌐 Live Application

> 🚧 Deployment in progress

| Service | Status |
|---------|--------|
| Dashboard | 🚧 Coming Soon |
| API Documentation | 🚧 Coming Soon |

---

## 📌 Project Overview

**RazorAttackLab** is not just a fraud detection model — it is a **fraud-defense stress-testing system**.

Most fraud systems check a transaction *after* it arrives:

```text
Payment → Fraud Model → Allow / Block
```

RazorAttackLab goes several steps further:

```text
Payment
→ ML Risk Check (XGBoost)
→ Anomaly Detection (Isolation Forest)
→ Device/IP Network Risk (Graph Layer)
→ Final Risk Fusion
→ Explainable Decision
→ Attack Simulation
→ Adversarial Testing
→ Policy Hardening
```

> *"I built an AI payment-risk system that not only detects fraud, but stress-tests its own defense, discovers weaknesses, and improves policy based on observable behavior."*

---

## 🎯 Key Highlights

- **3-layer risk fusion** — ML + Anomaly + Graph combined into one final risk score
- **Attack simulation** — 5 fraud scenarios × 20 attacks = 100 simulated attacks
- **Adversarial testing** — tests how attackers can evade the system
- **Policy hardening** — bypass rate reduced from 39% → 34% after improvements
- **Explainable AI** — SHAP-based human-readable risk reasons
- **No real customer data** — fully synthetic, privacy-safe dataset

---

## 🧩 Problem Statement

Digital payment fraud occurs in many forms:

- Card testing — small payments to verify stolen cards
- Account takeover — genuine account accessed from new device
- Device sharing — multiple accounts from one device
- IP clustering — multiple suspicious accounts from same IP
- Adversarial evasion — attacker modifies behavior to bypass detection

A single model cannot perfectly detect all of these. RazorAttackLab combines **three different perspectives** to make more robust decisions.

---

## 📊 Dataset

Fully **synthetic dataset** — computer-generated demo data. No real customer or Razorpay data used.

| Property | Value |
|----------|-------|
| Total Transactions | 20,000 |
| Fraud / Anomaly Rows | 1,553 |
| Fraud Rate | 7.76% |
| Problem Type | Classification + Anomaly Detection |

### Fraud Patterns Simulated

| Pattern | Description |
|---------|-------------|
| Card Testing | Small payments to test stolen cards |
| Account Takeover | Access from new device + location |
| Rapid Transactions | High velocity in short time |
| Refund Abuse | Exploit refund mechanisms |
| Coordinated Fraud Ring | Multiple accounts sharing device/IP |
| Emerging Anomaly | New unknown fraud behavior |

### Key Features

| Feature | Description |
|---------|-------------|
| `amount_inr` | Transaction amount |
| `account_age_days` | How old the account is |
| `transactions_1h` | Payments in last 1 hour |
| `failed_attempts_24h` | Failed attempts in last 24 hours |
| `is_new_device` | New device flag |
| `is_new_location` | New location flag |
| `unique_users_on_device` | Users sharing same device |
| `unique_accounts_on_ip` | Accounts on same IP |

---

## 🔧 Feature Engineering

Raw timestamps and IDs are transformed into meaningful signals:

| Engineered Feature | Description |
|--------------------|-------------|
| Transaction hour | Time of day |
| Is weekend | Weekend flag |
| Is night | Night-time transaction |
| Amount deviation | How far amount is from user's average |
| Transaction velocity | Speed of transactions |
| Shared device/IP flag | Infrastructure sharing signals |
| New account + new device combo | High-risk combination |

> A ₹20,000 payment alone is not fraud. But ₹20,000 + new device + new location + 8 failed attempts + amount 6x above average = high risk.

---

## 🤖 Model Architecture

### Layer 1 — XGBoost (Known Pattern Detection)

```text
Transaction Features → XGBoost → Fraud Probability (ML Risk Score)
```

| Metric | Score |
|--------|-------|
| ROC-AUC | 0.924 |
| PR-AUC | 0.844 |
| Fraud Precision | 94% |
| Fraud Recall | 76% |

Data split by time (80% older → train, 20% newer → test) to simulate real production conditions.

---

### Layer 2 — Isolation Forest (Anomaly Detection)

Detects transactions that are unusual — even if they don't match known fraud patterns.

```text
"Is this transaction very different from normal transactions?"
```

Outputs: `anomaly_flag` + `anomaly_risk_score`

---

### Layer 3 — Graph Risk (Network Analysis)

Detects coordinated fraud rings via shared device/IP relationships:

```text
User A ─┐
User B ─┼── Same Device ── Same IP
User C ─┘
```

Shared infrastructure increases risk score and triggers verification — not automatic blocking.

---

### Final Risk Fusion

| Component | Weight |
|-----------|--------|
| ML Risk (XGBoost) | 50% |
| Anomaly Risk (Isolation Forest) | 20% |
| Graph Risk (Network) | 30% |

```text
Final Risk = 0.50 × ML + 0.20 × Anomaly + 0.30 × Graph
```

---

## 🛡️ Policy Engine

| Risk Level | Action |
|------------|--------|
| Low | ✅ ALLOW |
| Medium | 🔍 VERIFY |
| High | 👀 REVIEW |
| Critical | 🚫 BLOCK |

Policy also considers observable signals — shared infrastructure, high velocity, new device + location + failed attempts, unusual amount, anomaly flag.

---

## 💥 Attack Simulation & Adversarial Testing

### Attack Simulation

```text
5 fraud scenarios × 20 attacks = 100 simulated attacks
```

Every attack runs through the complete pipeline and results are analyzed.

### Adversarial Testing

Simulates how attackers try to evade detection by:
- Reducing transaction velocity
- Avoiding new-device signals
- Keeping amounts closer to normal
- Hiding failed attempts

### Results

| Phase | Contained | Bypassed |
|-------|-----------|----------|
| Before Hardening | 61% | 39% |
| After Hardening | 66% | 34% |

> Bypass rate reduced by 5% after policy hardening based on stress-test findings.

---

## 🔍 Explainability (SHAP)

When a transaction is blocked, the system provides human-readable reasons:

```text
Risk score high because:
✦ Amount is 6x above user's average
✦ Same device connected to multiple users
✦ Transaction velocity is high
✦ New location detected
✦ Multiple failed attempts in 24 hours
```

Uses SHAP when available; falls back to XGBoost native contribution values.

---

## 🔄 Project Workflow

```text
Synthetic Payment Data (20,000 transactions)
              │
              ▼
    Feature Engineering
              │
              ▼
   XGBoost (Known Patterns)
              │
              ▼
  Isolation Forest (Anomalies)
              │
              ▼
   Graph Risk (Device/IP Network)
              │
              ▼
     Final Risk Score Fusion
              │
              ▼
    Explainable Decision (SHAP)
              │
              ▼
      Policy Engine (Action)
              │
              ▼
    Attack Simulation (100 attacks)
              │
              ▼
    Adversarial Testing
              │
              ▼
      Policy Hardening
```


## 🚀 How to Run

### 1. Clone the Repository
```bash
git clone https://github.com/Mahakchoudhari/RazorAttack_Lab.git
cd RazorAttack_Lab
```

### 2. Add Groq API Key
```bash
echo "GROQ_API_KEY=your_key_here" > .env
```

### 3. Run the Notebook
```bash
pip install -r requirements.txt
jupyter notebook RazorAttackLab_FIXED.ipynb
```

### 4. Run FastAPI Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### 5. Run React Frontend
```bash
cd frontend
npm install
npm run dev
```


---

## 👩‍💻 Author

**Mahak Choudhari**
B.Tech — Artificial Intelligence & Machine Learning 
[GitHub](https://github.com/Mahakchoudhari) | [LinkedIn](https://linkedin.com/in/mahakchoudhari)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
