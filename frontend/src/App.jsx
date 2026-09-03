import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

const defaultTransaction = {
  transaction_id: "LIVE_TXN_001",
  user_id: "U_LIVE_001",
  merchant_id: "M0100",
  device_id: "D_LIVE_001",
  ip_id: "IP_LIVE_001",
  amount_inr: 2500,
  timestamp_utc: "2026-03-01T14:30:00+00:00",
  location: "Bengaluru",
  payment_method: "UPI",
  merchant_category: "ecommerce",
  account_age_days: 180,
  failed_attempts_24h: 0,
  transactions_1h: 1,
  transactions_24h: 3,
  unique_users_on_device: 1,
  unique_accounts_on_ip: 1,
  is_new_device: 0,
  is_new_location: 0,
  average_amount_inr: 2000,
  amount_to_average_ratio: 1.25,
};

const RISK_HISTORY_LIMIT = 100;
const RISK_CHART_WINDOW = 20;
const RISK_HISTORY_STORAGE_KEY = "razorattacklab-risk-history-v1";

const scenarioLabels = {
  card_testing: "Card testing",
  account_takeover: "Account takeover",
  rapid_transactions: "Rapid transactions",
  refund_abuse: "Refund abuse",
  coordinated_fraud_ring: "Fraud ring",
};

function Icon({ name }) {
  const paths = {
    grid:
      "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",

    shield:
      "M12 3 20 6v5c0 5.2-3.4 8.5-8 10-4.6-1.5-8-4.8-8-10V6l8-3Zm-3.2 9 2.1 2.1 4.5-4.5",

    pulse:
      "M3 12h4l2-6 4 12 2-6h6M4 4v16M20 4v16",

    network:
      "M6 6h.01M18 6h.01M12 18h.01M6 6l6 12M18 6l-6 12M6 6h12",

    activity:
      "M3 12h4l2-5 4 10 3-7 2 2h3M5 5v14M19 5v14",

    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0-8 8Zm0-5v3m0 8v8M4.9 4.9 7 7m10 10 2.1 2.1M3 12h3m12 0h3M4.9 19.1 7 17m10-10 2.1-2.1",
  };

  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}

function RiskRing({ score = 0 }) {
  const safeScore = Number(score) || 0;

  const color =
    safeScore >= 85
      ? "#ff6b6b"
      : safeScore >= 65
        ? "#ffb45b"
        : "#5fe0bc";

  const dash = Math.max(0, Math.min(100, safeScore)) * 2.35;

  return (
    <div
      className="risk-ring"
      style={{
        "--risk-color": color,
        "--risk-dash": `${dash}`,
      }}
    >
      <svg viewBox="0 0 100 100">
        <circle className="ring-track" cx="50" cy="50" r="37" />
        <circle className="ring-value" cx="50" cy="50" r="37" />
      </svg>

      <div className="ring-label">
        <strong>{Math.round(safeScore)}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}

function ActionBadge({ action }) {
  const value = action || "—";

  return (
    <span
      className={`action-badge ${
        value === "—" ? "" : String(value).toLowerCase()
      }`}
    >
      {value}
    </span>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  detail,
  tone = "teal",
  icon,
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon name={icon} />
      </div>

      <div>
        <p>{label}</p>

        <div className="metric-value">
          {value}
          <small>{suffix}</small>
        </div>

        <span className="metric-detail">{detail}</span>
      </div>
    </article>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  min = 0,
}) {
  return (
    <label className="field">
      <span>{label}</span>

      <input
        type={type}
        min={min}
        value={value ?? ""}
        onChange={(event) => {
          const nextValue =
            type === "number"
              ? Number(event.target.value)
              : event.target.value;

          onChange(name, nextValue);
        }}
      />
    </label>
  );
}

function AIStatus({ analysis }) {
  if (!analysis) return null;

  return (
    <span
      className={`mini-status ${
        analysis.available ? "" : "offline"
      }`}
    >
      <span className="status-pulse" />
      {analysis.available ? "GROQ AI" : "AI unavailable"}
    </span>
  );
}

function AITransactionAnalysis({ analysis }) {
  if (!analysis) return null;

  if (!analysis.available) {
    return (
      <div className="ai-unavailable">
        <strong>AI Risk Analyst unavailable</strong>

        <p>
          Configure <code>GROQ_API_KEY</code> in the FastAPI
          backend environment.
        </p>
      </div>
    );
  }

  return (
    <section className="ai-analysis-card">
      <div className="ai-header">
        <div>
          <span className="eyebrow">AI RISK ANALYST</span>
          <h2>Attack intelligence</h2>
        </div>

        <AIStatus analysis={analysis} />
      </div>

      <div className="ai-summary">
        <span className="ai-spark">✦</span>

        <div>
          <span className="ai-label">RISK SUMMARY</span>

          <p>
            {analysis.risk_summary || "No summary returned."}
          </p>
        </div>
      </div>

      <div className="ai-analysis-grid">
        <div className="ai-column">
          <span className="ai-label">OBSERVED EVIDENCE</span>

          <div className="evidence-list">
            {(analysis.observed_evidence || []).map(
              (evidence, index) => (
                <div className="evidence-item" key={index}>
                  <span>✓</span>
                  <p>{evidence}</p>
                </div>
              )
            )}
          </div>
        </div>

        <div className="ai-column">
          <span className="ai-label">WHY SUSPICIOUS</span>

          <p className="ai-body">
            {analysis.why_suspicious ||
              "No explanation returned."}
          </p>
        </div>
      </div>

      <div className="ai-insight-row">
        <div className="ai-insight">
          <span className="ai-label">
            LIKELY ATTACK PATTERN
          </span>

          <strong>
            {analysis.likely_attack_pattern ||
              "None identified"}
          </strong>
        </div>

        <div className="ai-insight">
          <span className="ai-label">
            RECOMMENDED ACTION
          </span>

          <strong>
            {analysis.recommended_action || "Review"}
          </strong>
        </div>
      </div>

      <div className="attack-story">
        <div className="attack-story-title">
          <span className="ai-spark">✦</span>
          <span className="ai-label">ATTACK STORY</span>
        </div>

        <p>
          {analysis.attack_story ||
            "No attack narrative returned."}
        </p>
      </div>
    </section>
  );
}

function AIAttackAnalysis({ analysis }) {
  if (!analysis) return null;

  if (!analysis.available) {
    return (
      <div className="ai-unavailable">
        <strong>Attack intelligence unavailable</strong>

        <p>
          Groq analysis could not be generated for this
          simulation.
        </p>
      </div>
    );
  }

  return (
    <section className="panel ai-attack-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">GROQ RISK ANALYST</span>
          <h2>Simulation intelligence</h2>
        </div>

        <AIStatus analysis={analysis} />
      </div>

      <div className="ai-summary">
        <span className="ai-spark">✦</span>

        <div>
          <span className="ai-label">
            EXECUTIVE SUMMARY
          </span>

          <p>
            {analysis.executive_summary ||
              "No executive summary returned."}
          </p>
        </div>
      </div>

      <div className="ai-analysis-grid">
        <div className="ai-column">
          <span className="ai-label">KEY FINDINGS</span>

          <div className="evidence-list">
            {(analysis.key_findings || []).map(
              (finding, index) => (
                <div className="evidence-item" key={index}>
                  <span>✓</span>
                  <p>{finding}</p>
                </div>
              )
            )}
          </div>
        </div>

        <div className="ai-column">
          <span className="ai-label">
            HARDEST ATTACK
          </span>

          <p className="ai-body">
            {analysis.most_difficult_attack ||
              "Not identified."}
          </p>

          <span className="ai-label">
            BASELINE WEAKNESS
          </span>

          <p className="ai-body">
            {analysis.baseline_weakness ||
              "Not identified."}
          </p>
        </div>
      </div>

      <div className="ai-insight-row">
        <div className="ai-insight">
          <span className="ai-label">
            HARDENED DEFENSE IMPACT
          </span>

          <strong>
            {analysis.hardened_defense_impact ||
              "Not available"}
          </strong>
        </div>

        <div className="ai-insight">
          <span className="ai-label">RESIDUAL RISK</span>

          <strong>
            {analysis.residual_risk ||
              "Not available"}
          </strong>
        </div>
      </div>

      <div className="attack-story">
        <div className="attack-story-title">
          <span className="ai-spark">✦</span>

          <span className="ai-label">
            PLAUSIBLE ATTACK STORY
          </span>
        </div>

        <p>
          {analysis.attack_story ||
            "No narrative returned."}
        </p>
      </div>

      <div className="controls-box">
        <span className="ai-label">
          RECOMMENDED CONTROLS
        </span>

        <div className="control-list">
          {(analysis.recommended_controls || []).map(
            (control, index) => (
              <div className="control-item" key={index}>
                <span>
                  {String(index + 1).padStart(2, "0")}
                </span>

                <p>{control}</p>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

/* =========================================================
   RISK HISTORY
   ========================================================= */

function createEventId(item, fallbackTime = Date.now()) {
  if (!item) {
    return `risk-${fallbackTime}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  return (
    item.event_id ||
    item.risk_event_id ||
    item.id ||
    item.live_event_id ||
    null
  );
}

function normalizeRiskPoint(item, fallbackTime = Date.now()) {
  const parsedTime = item?.timestamp
    ? new Date(item.timestamp).getTime()
    : item?.timestamp_utc
      ? new Date(item.timestamp_utc).getTime()
      : NaN;

  const recordedAt =
    Number(item?.recorded_at) ||
    (Number.isFinite(parsedTime)
      ? parsedTime
      : fallbackTime);

  const existingEventId = createEventId(
    item,
    recordedAt
  );

  return {
    ...item,
    recorded_at: recordedAt,
    event_id:
      existingEventId ||
      `risk-${recordedAt}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
  };
}

function mergeRiskHistory(existing, incoming) {
  const map = new Map();

  [...existing, ...incoming].forEach((item) => {
    if (!item) return;

    const normalized = normalizeRiskPoint(item);

    const key =
      normalized.event_id ||
      `risk-${normalized.recorded_at}-${Math.random()}`;

    map.set(key, normalized);
  });

  return Array.from(map.values())
    .sort((a, b) => {
      const aTime = Number(a.recorded_at) || 0;
      const bTime = Number(b.recorded_at) || 0;

      return aTime - bTime;
    })
    .slice(-RISK_HISTORY_LIMIT);
}

function mergeQueueRecords(liveRecords, backendRecords) {
  /*
   * IMPORTANT:
   * A transaction can be scored more than once. Every successful live
   * scoring event has a unique event_id, so it must remain a separate
   * queue row even when transaction_id is reused.
   *
   * Backend queue records are still deduplicated by transaction_id.
   * Live records are added on top and therefore always win over an
   * older backend copy of the same transaction.
   */
  const map = new Map();

  // Add backend records first. This gives live records priority when the
  // same transaction also exists in the backend queue.
  [...backendRecords].forEach((item, index) => {
    if (!item) return;

    const transactionId =
      item.transaction_id ||
      `queue-${item.recorded_at || Date.now()}-${index}`;

    const key = `backend:${transactionId}`;

    map.set(key, item);
  });

  // Sort live events newest-first. DO NOT use transaction_id as the key
  // here because the same transaction_id may be scored multiple times.
  const sortedLiveRecords = [...liveRecords]
    .filter(Boolean)
    .sort(
      (a, b) =>
        (Number(b?.recorded_at) || 0) -
        (Number(a?.recorded_at) || 0)
    );

  sortedLiveRecords.forEach((item, index) => {
    const uniqueLiveId =
      item.event_id ||
      item.live_event_id ||
      `live-${item.recorded_at || Date.now()}-${index}`;

    map.set(`live:${uniqueLiveId}`, item);
  });

  return Array.from(map.values())
    .sort(
      (a, b) =>
        (Number(b?.recorded_at) || 0) -
        (Number(a?.recorded_at) || 0)
    )
    .slice(0, 50);
}

/* =========================================================
   RISK GRAPH HELPERS
   ========================================================= */

/*
 * Convert a risk value into the SVG Y coordinate.
 *
 * Chart:
 * 100 -> top
 * 0   -> bottom
 */
function riskToY(value) {
  const risk = Math.max(
    0,
    Math.min(100, Number(value) || 0)
  );

  return 210 - risk * 1.85;
}

function getChartX(points, index) {
  if (points.length <= 1) return 360;

  return (
    (index / (points.length - 1)) *
    720
  );
}

function buildRiskPolyline(points, field) {
  if (!points.length) return "";

  return points
    .map((item, index) => {
      const x = getChartX(points, index);
      const y = riskToY(item?.[field]);

      return `${x},${y}`;
    })
    .join(" ");
}

/*
 * Every risk signal gets its own live point.
 *
 * This is the important difference from the previous version:
 *
 * FINAL    -> final_risk
 * ML       -> ml_risk
 * ANOMALY  -> anomaly_risk
 * GRAPH    -> graph_risk
 */
function RiskSignalPoints({
  points,
  field,
  className,
}) {
  return (
    <>
      {points.map((point, index) => {
        const x = getChartX(points, index);
        const y = riskToY(point?.[field]);

        const isLatest =
          index === points.length - 1;

        return (
          <g
            key={`${point.event_id}-${field}-${index}`}
            className={`risk-signal-point-group ${className}`}
          >
            {isLatest && (
              <circle
                className="fusion-live-point-glow"
                cx={x}
                cy={y}
                r="8"
              />
            )}

            <circle
              className={`fusion-live-point ${className}`}
              cx={x}
              cy={y}
              r={isLatest ? 5 : 3.2}
            />
          </g>
        );
      })}
    </>
  );
}

/* =========================================================
   NETWORK GRAPH
   ========================================================= */

function NetworkGraphVisual({ overview, score }) {
  const graph = overview?.graph || {};

  const deviceCount =
    Number(graph.devices_monitored) || 0;

  const ipCount =
    Number(graph.ips_monitored) || 0;

  const sharedDevices =
    Number(graph.shared_devices) || 0;

  const graphRisk =
    Number(score?.graph_risk) || 0;

  const safeGraphRisk = Math.max(
    0,
    Math.min(100, graphRisk)
  );

  const currentDevice =
    score?.device_id ||
    score?.transaction?.device_id ||
    "D_LIVE_001";

  const currentIp =
    score?.ip_id ||
    score?.transaction?.ip_id ||
    "IP_LIVE_001";

  const currentMerchant =
    score?.merchant_id ||
    score?.transaction?.merchant_id ||
    "M0100";

  const currentUser =
    score?.user_id ||
    score?.transaction?.user_id ||
    "U_LIVE_001";

  return (
    <div
      className="network-graph-shell"
      style={{
        position: "relative",
        width: "100%",
        minHeight: "420px",
        borderRadius: "20px",
        overflow: "hidden",
        background:
          "radial-gradient(circle at 50% 45%, rgba(95,224,188,0.09), transparent 35%), linear-gradient(135deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008))",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <svg
        viewBox="0 0 900 420"
        width="100%"
        height="420"
        role="img"
        aria-label="Entity relationship network graph"
        style={{
          display: "block",
          width: "100%",
          height: "420px",
        }}
      >
        <defs>
          <filter
            id="graphGlow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur
              stdDeviation="5"
              result="blur"
            />

            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <radialGradient id="coreGradient">
            <stop
              offset="0%"
              stopColor="#5fe0bc"
              stopOpacity="0.28"
            />

            <stop
              offset="100%"
              stopColor="#5fe0bc"
              stopOpacity="0"
            />
          </radialGradient>

          <linearGradient
            id="graphLineGradient"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop
              offset="0%"
              stopColor="#5fe0bc"
              stopOpacity="0.25"
            />

            <stop
              offset="50%"
              stopColor="#9c8cff"
              stopOpacity="0.75"
            />

            <stop
              offset="100%"
              stopColor="#ff8b6b"
              stopOpacity="0.25"
            />
          </linearGradient>
        </defs>

        {Array.from({ length: 10 }).map((_, index) => (
          <line
            key={`vertical-${index}`}
            x1={index * 100}
            y1="0"
            x2={index * 100}
            y2="420"
            stroke="rgba(255,255,255,0.035)"
            strokeWidth="1"
          />
        ))}

        {Array.from({ length: 6 }).map((_, index) => (
          <line
            key={`horizontal-${index}`}
            x1="0"
            y1={index * 84}
            x2="900"
            y2={index * 84}
            stroke="rgba(255,255,255,0.035)"
            strokeWidth="1"
          />
        ))}

        <circle
          cx="450"
          cy="210"
          r="120"
          fill="url(#coreGradient)"
        />

        <line
          x1="450"
          y1="210"
          x2="220"
          y2="95"
          stroke="url(#graphLineGradient)"
          strokeWidth="2"
        />

        <line
          x1="450"
          y1="210"
          x2="680"
          y2="95"
          stroke="url(#graphLineGradient)"
          strokeWidth="2"
        />

        <line
          x1="450"
          y1="210"
          x2="210"
          y2="320"
          stroke="url(#graphLineGradient)"
          strokeWidth="2"
        />

        <line
          x1="450"
          y1="210"
          x2="690"
          y2="320"
          stroke="url(#graphLineGradient)"
          strokeWidth="2"
        />

        <line
          x1="220"
          y1="95"
          x2="680"
          y2="95"
          stroke="rgba(156,140,255,0.25)"
          strokeWidth="1.5"
          strokeDasharray="6 8"
        />

        <line
          x1="210"
          y1="320"
          x2="690"
          y2="320"
          stroke="rgba(255,139,107,0.25)"
          strokeWidth="1.5"
          strokeDasharray="6 8"
        />

        <circle
          cx="450"
          cy="210"
          r="86"
          fill="none"
          stroke="#5fe0bc"
          strokeOpacity="0.12"
          strokeWidth="1"
          strokeDasharray="5 8"
        />

        <circle
          cx="450"
          cy="210"
          r="108"
          fill="none"
          stroke="#9c8cff"
          strokeOpacity="0.08"
          strokeWidth="1"
          strokeDasharray="3 12"
        />

        {/* USER */}
        <g>
          <circle
            cx="220"
            cy="95"
            r="34"
            fill="rgba(95,224,188,0.08)"
            stroke="#5fe0bc"
            strokeWidth="1.5"
          />

          <circle
            cx="220"
            cy="95"
            r="26"
            fill="rgba(95,224,188,0.06)"
          />

          <text
            x="220"
            y="91"
            textAnchor="middle"
            fill="#5fe0bc"
            fontSize="12"
            fontWeight="700"
          >
            USER
          </text>

          <text
            x="220"
            y="108"
            textAnchor="middle"
            fill="rgba(255,255,255,0.65)"
            fontSize="9"
          >
            {String(currentUser).slice(0, 14)}
          </text>
        </g>

        {/* IP */}
        <g>
          <circle
            cx="680"
            cy="95"
            r="34"
            fill="rgba(156,140,255,0.08)"
            stroke="#9c8cff"
            strokeWidth="1.5"
          />

          <circle
            cx="680"
            cy="95"
            r="26"
            fill="rgba(156,140,255,0.06)"
          />

          <text
            x="680"
            y="91"
            textAnchor="middle"
            fill="#9c8cff"
            fontSize="12"
            fontWeight="700"
          >
            IP
          </text>

          <text
            x="680"
            y="108"
            textAnchor="middle"
            fill="rgba(255,255,255,0.65)"
            fontSize="9"
          >
            {String(currentIp).slice(0, 14)}
          </text>
        </g>

        {/* DEVICE */}
        <g filter="url(#graphGlow)">
          <circle
            cx="450"
            cy="210"
            r="54"
            fill="rgba(95,224,188,0.08)"
            stroke="#5fe0bc"
            strokeWidth="2"
          />

          <circle
            cx="450"
            cy="210"
            r="43"
            fill="rgba(95,224,188,0.04)"
            stroke="rgba(95,224,188,0.25)"
            strokeWidth="1"
          />

          <text
            x="450"
            y="205"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="14"
            fontWeight="800"
          >
            DEVICE
          </text>

          <text
            x="450"
            y="222"
            textAnchor="middle"
            fill="rgba(255,255,255,0.65)"
            fontSize="9"
          >
            {String(currentDevice).slice(0, 15)}
          </text>
        </g>

        {/* MERCHANT */}
        <g>
          <circle
            cx="210"
            cy="320"
            r="34"
            fill="rgba(255,180,91,0.08)"
            stroke="#ffb45b"
            strokeWidth="1.5"
          />

          <text
            x="210"
            y="316"
            textAnchor="middle"
            fill="#ffb45b"
            fontSize="11"
            fontWeight="700"
          >
            MERCHANT
          </text>

          <text
            x="210"
            y="330"
            textAnchor="middle"
            fill="rgba(255,255,255,0.65)"
            fontSize="9"
          >
            {String(currentMerchant).slice(0, 14)}
          </text>
        </g>

        {/* SHARED INFRASTRUCTURE */}
        <g>
          <circle
            cx="690"
            cy="320"
            r="34"
            fill="rgba(255,107,107,0.08)"
            stroke="#ff6b6b"
            strokeWidth="1.5"
          />

          <text
            x="690"
            y="316"
            textAnchor="middle"
            fill="#ff6b6b"
            fontSize="10"
            fontWeight="700"
          >
            SHARED
          </text>

          <text
            x="690"
            y="330"
            textAnchor="middle"
            fill="rgba(255,255,255,0.65)"
            fontSize="9"
          >
            INFRASTRUCTURE
          </text>
        </g>

        {/* CENTER RISK BADGE */}
        <g>
          <rect
            x="390"
            y="275"
            width="120"
            height="42"
            rx="12"
            fill="rgba(8,12,20,0.92)"
            stroke={
              safeGraphRisk >= 65
                ? "#ff6b6b"
                : "#5fe0bc"
            }
            strokeOpacity="0.55"
          />

          <text
            x="450"
            y="291"
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize="8"
            fontWeight="700"
          >
            CURRENT GRAPH RISK
          </text>

          <text
            x="450"
            y="307"
            textAnchor="middle"
            fill={
              safeGraphRisk >= 65
                ? "#ff6b6b"
                : "#5fe0bc"
            }
            fontSize="14"
            fontWeight="800"
          >
            {Math.round(safeGraphRisk)} / 100
          </text>
        </g>
      </svg>

      <div
        style={{
          position: "absolute",
          top: "18px",
          left: "18px",
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            padding: "7px 10px",
            borderRadius: "999px",
            background: "rgba(8,12,20,0.82)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#b9c3d4",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          {deviceCount.toLocaleString()} DEVICES
        </span>

        <span
          style={{
            padding: "7px 10px",
            borderRadius: "999px",
            background: "rgba(8,12,20,0.82)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#b9c3d4",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          {ipCount.toLocaleString()} IPS
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          right: "18px",
          top: "18px",
          padding: "8px 11px",
          borderRadius: "999px",
          background:
            sharedDevices > 0
              ? "rgba(255,107,107,0.10)"
              : "rgba(95,224,188,0.08)",
          border:
            sharedDevices > 0
              ? "1px solid rgba(255,107,107,0.28)"
              : "1px solid rgba(95,224,188,0.22)",
          color:
            sharedDevices > 0
              ? "#ff8a8a"
              : "#79e7ca",
          fontSize: "10px",
          fontWeight: 800,
          letterSpacing: "0.08em",
        }}
      >
        {sharedDevices.toLocaleString()} SHARED DEVICES
      </div>
    </div>
  );
}

function loadStoredRiskHistory() {
  try {
    const raw = window.localStorage.getItem(
      RISK_HISTORY_STORAGE_KEY
    );

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(Boolean)
      .map((item) => normalizeRiskPoint(item))
      .sort(
        (a, b) =>
          (Number(a.recorded_at) || 0) -
          (Number(b.recorded_at) || 0)
      )
      .slice(-RISK_HISTORY_LIMIT);
  } catch (err) {
    console.warn("Unable to restore risk history", err);
    return [];
  }
}

function RiskHistoryNavigator({
  totalPoints,
  windowSize,
  startIndex,
  onChange,
}) {
  const maxStart = Math.max(
    0,
    totalPoints - windowSize
  );

  if (totalPoints <= windowSize) {
    return (
      <div className="risk-history-meta">
        <span>
          {totalPoints} event{totalPoints === 1 ? "" : "s"} tracked
        </span>
        <span>Live window</span>
      </div>
    );
  }

  const visibleFrom = startIndex + 1;
  const visibleTo = Math.min(
    startIndex + windowSize,
    totalPoints
  );

  return (
    <div className="risk-history-navigator">
      <div className="risk-history-meta">
        <span>
          Events {visibleFrom}–{visibleTo} of {totalPoints}
        </span>

        <span>
          Drag to browse history · latest auto-focuses after scoring
        </span>
      </div>

      <input
        className="risk-history-slider"
        type="range"
        min="0"
        max={maxStart}
        step="1"
        value={Math.min(startIndex, maxStart)}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
        aria-label="Browse risk event history"
      />

      <div className="risk-history-slider-labels">
        <span>Oldest</span>
        <span>Newest</span>
      </div>
    </div>
  );
}

function App() {
  const [overview, setOverview] = useState(null);
  const [transaction, setTransaction] =
    useState(defaultTransaction);
  const [score, setScore] = useState(null);
  const [attackReport, setAttackReport] =
    useState(null);
  const [riskHistory, setRiskHistory] = useState(loadStoredRiskHistory);
  const [chartStartIndex, setChartStartIndex] = useState(0);
  const scoreEventCounter = useRef(0);
  const [liveTransactions, setLiveTransactions] =
    useState([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [runningAttacks, setRunningAttacks] =
    useState(false);
  const [activeView, setActiveView] =
    useState("Overview");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] =
    useState(null);
  const [showAllTransactions, setShowAllTransactions] =
    useState(false);

  /* =========================================================
     OVERVIEW
     ========================================================= */

  const loadOverview = async () => {
    try {
      setError("");

      const response = await fetch(
        `${API_BASE}/overview`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Backend did not respond"
        );
      }

      setOverview(data);

      setStreaming(true);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Overview error:", err);

      setStreaming(false);

      setError(
        "Backend offline or overview API failed. Start FastAPI on port 8000."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  // Persist only genuine scored events. Editing the form never touches
  // this history, so the chart is event-driven rather than input-driven.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        RISK_HISTORY_STORAGE_KEY,
        JSON.stringify(riskHistory)
      );
    } catch (err) {
      console.warn("Unable to persist risk history", err);
    }
  }, [riskHistory]);

  /* =========================================================
     TRANSACTION
     ========================================================= */

  const updateTransaction = (name, value) => {
    setTransaction((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const scoreLiveTransaction = async () => {
    setScoring(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/score`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(transaction),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Unable to score transaction"
        );
      }

      setScore(data);

      /*
       * IMPORTANT:
       *
       * Every score is treated as a separate event.
       *
       * Example:
       *
       * LIVE_TXN_001 -> 20
       * LIVE_TXN_001 -> 65
       * LIVE_TXN_001 -> 91
       *
       * All three remain on the risk graph.
       */
      scoreEventCounter.current += 1;
      const eventRecordedAt = Date.now();

      // Each successful score is a NEW graph event, even when the
      // transaction_id is reused. This keeps repeated experiments visible.
      const livePoint = normalizeRiskPoint({
        ...transaction,
        ...data,
        ...(data.live_event || {}),
        recorded_at: eventRecordedAt,
        event_id: `live-score-${eventRecordedAt}-${scoreEventCounter.current}`,
      }, eventRecordedAt);

      setRiskHistory((current) => {
        const nextHistory = mergeRiskHistory(
          current,
          [livePoint]
        );

        setChartStartIndex(
          Math.max(0, nextHistory.length - RISK_CHART_WINDOW)
        );

        return nextHistory;
      });

      setLiveTransactions((current) =>
        mergeRiskHistory(
          current,
          [livePoint]
        )
      );

      setOverview((current) => {
        if (!current) return current;

        return {
          ...current,
          queue: mergeQueueRecords(
            [livePoint],
            current.queue || []
          ),
        };
      });

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Score error:", err);

      setError(
        err.message ||
          "Transaction scoring failed."
      );
    } finally {
      setScoring(false);
    }
  };

  /* =========================================================
     ATTACK LAB
     ========================================================= */

  const runAttackLab = async () => {
    setRunningAttacks(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/attacks/run`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Attack simulation failed"
        );
      }

      setAttackReport(data);

      await loadOverview();
    } catch (err) {
      console.error(
        "Attack simulation error:",
        err
      );

      setError(
        err.message ||
          "Attack simulation failed."
      );
    } finally {
      setRunningAttacks(false);
    }
  };

  /* =========================================================
     DERIVED STATE
     ========================================================= */

  const backendQueue =
    overview?.queue || [];

  const queue = mergeQueueRecords(
    liveTransactions,
    backendQueue
  );

  // The history can hold 100 scored events. The viewport shows 20 at a
  // time and can be moved horizontally with the slider below the chart.
  const safeChartStart = Math.min(
    chartStartIndex,
    Math.max(0, riskHistory.length - RISK_CHART_WINDOW)
  );

  const chartPoints = riskHistory.slice(
    safeChartStart,
    safeChartStart + RISK_CHART_WINDOW
  );

  const metrics =
    overview?.metrics || {};

  const maxRisk = Math.max(
    ...queue.map(
      (item) =>
        Number(item.final_risk) || 0
    ),
    1
  );

  const currentScore = score || {
    final_risk: 0,
    ml_risk: 0,
    anomaly_risk: 0,
    graph_risk: 0,
    action: "—",
    top_reasons: [],
  };

  const totalAttacks =
    Number(
      attackReport?.total_attacks
    ) || 0;

  const hardenedContained =
    Number(
      attackReport?.hardened_contained
    ) || 0;

  const baselineContained =
    Number(
      attackReport?.baseline_contained
    ) || 0;

  const containedRate =
    totalAttacks > 0
      ? Math.round(
          (hardenedContained /
            totalAttacks) *
            100
        )
      : null;

  const baselineRate =
    totalAttacks > 0
      ? Math.round(
          (baselineContained /
            totalAttacks) *
            100
        )
      : null;

  const activeTitle = useMemo(() => {
    switch (activeView) {
      case "Risk Lab":
        return "Live risk lab";

      case "Attack Simulator":
        return "Attack simulator";

      case "Network Graph":
        return "Network intelligence";

      case "Model Health":
        return "Model health";

      case "Settings":
        return "System settings";

      default:
        return "Risk command center";
    }
  }, [activeView]);

  /* =========================================================
     NETWORK GRAPH PAGE
     ========================================================= */

  const renderNetworkGraph = () => {
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow accent">
              ENTITY INTELLIGENCE
            </span>

            <h1>
              Network intelligence
            </h1>

            <p>
              Visualize how users, devices, IPs and
              merchants connect inside the payment
              ecosystem.
            </p>
          </div>

          <div className="heading-actions">
            <span className="last-sync">
              {lastUpdated
                ? `Last sync · ${lastUpdated.toLocaleTimeString()}`
                : "Last sync · —"}
            </span>

            <span className="fusion-live-status">
              <span className="status-pulse" />
              LIVE
            </span>
          </div>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">
                ENTITY RELATIONSHIPS
              </span>

              <h2>Network graph</h2>
            </div>

            <span className="mini-status">
              LIVE
            </span>
          </div>

          <div className="graph-stat-grid">
            <div className="graph-stat">
              <span>
                DEVICES MONITORED
              </span>

              <strong>
                {overview?.graph
                  ?.devices_monitored
                  ?.toLocaleString() ||
                  "—"}
              </strong>
            </div>

            <div className="graph-stat">
              <span>
                IPS MONITORED
              </span>

              <strong>
                {overview?.graph
                  ?.ips_monitored
                  ?.toLocaleString() ||
                  "—"}
              </strong>
            </div>

            <div className="graph-stat">
              <span>
                SHARED DEVICES
              </span>

              <strong>
                {overview?.graph
                  ?.shared_devices
                  ?.toLocaleString() ||
                  "—"}
              </strong>
            </div>

            <div className="graph-stat">
              <span>
                CURRENT GRAPH RISK
              </span>

              <strong>
                {Math.round(
                  Number(
                    currentScore.graph_risk
                  ) || 0
                )}
              </strong>
            </div>
          </div>

          <NetworkGraphVisual
            overview={overview}
            score={score}
          />

          <p className="panel-description">
            Graph risk evaluates historical device and
            IP connectivity before combining it with
            behavioral ML and anomaly signals.
          </p>
        </section>
      </>
    );
  };

  /* =========================================================
     MODEL HEALTH
     ========================================================= */

  const renderModelHealth = () => {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              SYSTEM
            </span>

            <h2>Model health</h2>
          </div>

          <span className="mini-status">
            OPERATIONAL
          </span>
        </div>

        <div className="health-list">
          <div className="health-item">
            <span>
              <i className="status-pulse" />
              XGBoost classifier
            </span>

            <strong>Active</strong>
          </div>

          <div className="health-item">
            <span>
              <i className="status-pulse" />
              Isolation Forest
            </span>

            <strong>Active</strong>
          </div>

          <div className="health-item">
            <span>
              <i className="status-pulse" />
              Entity graph
            </span>

            <strong>Active</strong>
          </div>

          <div className="health-item">
            <span>
              <i className="status-pulse" />
              Groq Risk Analyst
            </span>

            <strong>
              {overview?.ai?.available
                ? "Connected"
                : "Not configured"}
            </strong>
          </div>
        </div>

        <div className="model-metric-grid">
          <div>
            <span>ROC-AUC</span>
            <strong>
              {metrics.roc_auc ?? "—"}
            </strong>
          </div>

          <div>
            <span>PR-AUC</span>
            <strong>
              {metrics.pr_auc ?? "—"}
            </strong>
          </div>

          <div>
            <span>PRECISION</span>
            <strong>
              {metrics.precision ?? "—"}
            </strong>
          </div>

          <div>
            <span>RECALL</span>
            <strong>
              {metrics.recall ?? "—"}
            </strong>
          </div>
        </div>
      </section>
    );
  };

  /* =========================================================
     SETTINGS
     ========================================================= */

  const renderSettings = () => {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              SYSTEM CONFIGURATION
            </span>

            <h2>Settings</h2>
          </div>
        </div>

        <div className="settings-list">
          <div className="setting-row">
            <div>
              <strong>
                API endpoint
              </strong>

              <span>
                FastAPI backend
              </span>
            </div>

            <code>{API_BASE}</code>
          </div>

          <div className="setting-row">
            <div>
              <strong>
                AI provider
              </strong>

              <span>
                Risk explanation engine
              </span>
            </div>

            <code>
              {overview?.ai?.provider ||
                "Groq"}
            </code>
          </div>

          <div className="setting-row">
            <div>
              <strong>AI model</strong>

              <span>
                Language model used by Risk Analyst
              </span>
            </div>

            <code>
              {overview?.ai?.model ||
                "openai/gpt-oss-20b"}
            </code>
          </div>
        </div>
      </section>
    );
  };

  /* =========================================================
     UI
     ========================================================= */

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span>R</span>
          </div>

          <div>
            <strong>
              RazorAttack
            </strong>

            <span>
              LAB / 01
            </span>
          </div>
        </div>

        <div className="workspace-switcher">
          <span className="eyebrow">
            WORKSPACE
          </span>

          <div className="workspace-name">
            Payments Defense{" "}
            <span>⌄</span>
          </div>
        </div>

        <nav className="nav-list">
          <span className="nav-caption">
            COMMAND CENTER
          </span>

          {[
            ["Overview", "grid"],
            ["Risk Lab", "shield"],
            [
              "Attack Simulator",
              "pulse",
            ],
            [
              "Network Graph",
              "network",
            ],
          ].map(
            ([label, icon]) => {
              return (
                <button
                  key={label}
                  className={
                    activeView === label
                      ? "nav-item active"
                      : "nav-item"
                  }
                  onClick={() =>
                    setActiveView(
                      label
                    )
                  }
                >
                  <Icon name={icon} />

                  <span>
                    {label}
                  </span>
                </button>
              );
            }
          )}

          <span className="nav-caption lower">
            SYSTEM
          </span>

          <button
            className={
              activeView ===
              "Model Health"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              setActiveView(
                "Model Health"
              )
            }
          >
            <Icon name="activity" />

            <span>
              Model health
            </span>
          </button>

          <button
            className={
              activeView ===
              "Settings"
                ? "nav-item active"
                : "nav-item"
            }
            onClick={() =>
              setActiveView(
                "Settings"
              )
            }
          >
            <Icon name="settings" />

            <span>
              Settings
            </span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="system-status">
            <span className="status-pulse" />
            All systems operational
          </div>

          <div className="profile">
            <div className="avatar">
              M
            </div>

            <div>
              <strong>
                Mahak
              </strong>

              <span>
                AI Risk Analyst
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>
              RazorAttackLab
            </span>

            <b>/</b>

            <strong>
              {activeTitle}
            </strong>
          </div>

          <div className="topbar-actions">
            <div className="live-status">
              <span className="status-pulse" />
              Pipeline live
            </div>

            <button
              className="icon-button"
              aria-label="Activity"
            >
              <Icon name="activity" />
            </button>

            <button className="avatar small">
              M
            </button>
          </div>
        </header>

        <section className="content-wrap">
          {/* =================================================
              OVERVIEW
          ================================================= */}

          {activeView ===
            "Overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow accent">
                    PROACTIVE DEFENSE /
                    OVERVIEW
                  </span>

                  <h1>
                    Risk command center{" "}
                    <span className="heading-dot" />
                  </h1>

                  <p>
                    Detect patterns.
                    Stress-test defenses.
                    Make safer payment
                    decisions.
                  </p>
                </div>

                <div className="heading-actions">
                  <span className="last-sync">
                    {lastUpdated
                      ? `Last sync · ${lastUpdated.toLocaleTimeString()}`
                      : "Last sync · —"}
                  </span>

                  <button
                    className="primary-button"
                    onClick={
                      runAttackLab
                    }
                    disabled={
                      runningAttacks
                    }
                  >
                    <Icon name="pulse" />

                    {runningAttacks
                      ? "Running..."
                      : "Run stress test"}
                  </button>
                </div>
              </div>

              {error && (
                <div className="error-banner">
                  <span>!</span>

                  {error}

                  <button
                    onClick={
                      loadOverview
                    }
                  >
                    Retry
                  </button>
                </div>
              )}

              <div className="metric-grid">
                <MetricCard
                  label="Fraud recall"
                  value={
                    metrics.recall != null
                      ? Math.round(
                          Number(
                            metrics.recall
                          ) * 100
                        )
                      : "—"
                  }
                  suffix="%"
                  detail="Known fraud caught"
                  tone="teal"
                  icon="pulse"
                />

                <MetricCard
                  label="PR-AUC"
                  value={
                    metrics.pr_auc ??
                    "—"
                  }
                  detail="Imbalanced evaluation"
                  tone="violet"
                  icon="activity"
                />

                <MetricCard
                  label="Networks monitored"
                  value={
                    overview?.graph
                      ?.devices_monitored
                      ?.toLocaleString() ||
                    "—"
                  }
                  detail={
                    overview?.graph
                      ?.shared_devices !=
                    null
                      ? `${overview.graph.shared_devices} shared devices flagged`
                      : "Graph telemetry"
                  }
                  tone="orange"
                  icon="network"
                />

                <MetricCard
                  label="Hardened containment"
                  value={
                    containedRate !=
                    null
                      ? containedRate
                      : "—"
                  }
                  suffix={
                    containedRate !=
                    null
                      ? "%"
                      : ""
                  }
                  detail={
                    attackReport
                      ? "Latest simulated attack run"
                      : "Run attack lab to measure"
                  }
                  tone="red"
                  icon="shield"
                />
              </div>

              <div className="dashboard-grid">
                {/* =================================================
                    RISK OVERVIEW
                ================================================= */}

                <section className="panel risk-overview">
                  <div className="panel-header">
                    <div>
                      <span className="eyebrow">
                        SIGNAL FUSION
                      </span>

                      <h2>
                        Risk overview
                      </h2>
                    </div>

                    <div className="fusion-live-status">
                      <span className="status-pulse" />

                      {streaming
                        ? "LIVE · 3s"
                        : "CONNECTING"}
                    </div>
                  </div>

                  {/* CURRENT SIGNAL VALUES */}
                  <div className="fusion-current-grid">
                    <div className="fusion-current-card final">
                      <span className="fusion-current-dot" />
                      <div>
                        <small>FINAL</small>
                        <strong>
                          {Math.round(
                            Number(
                              currentScore.final_risk
                            ) || 0
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="fusion-current-card ml">
                      <span className="fusion-current-dot" />
                      <div>
                        <small>ML</small>
                        <strong>
                          {Math.round(
                            Number(
                              currentScore.ml_risk
                            ) || 0
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="fusion-current-card anomaly">
                      <span className="fusion-current-dot" />
                      <div>
                        <small>ANOMALY</small>
                        <strong>
                          {Math.round(
                            Number(
                              currentScore.anomaly_risk
                            ) || 0
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="fusion-current-card graph">
                      <span className="fusion-current-dot" />
                      <div>
                        <small>GRAPH</small>
                        <strong>
                          {Math.round(
                            Number(
                              currentScore.graph_risk
                            ) || 0
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="chart-area">
                    <div className="chart-y">
                      <span>100</span>
                      <span>75</span>
                      <span>50</span>
                      <span>25</span>
                      <span>0</span>
                    </div>

                    <div className="chart">
                      <div className="chart-grid-lines">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>

                      {chartPoints.length > 0 ? (
                        <svg
                          viewBox="0 0 720 220"
                          preserveAspectRatio="none"
                          className="line-chart fusion-chart"
                          aria-label="Live risk fusion signals"
                          role="img"
                        >
                          {/* FINAL RISK */}
                          <polyline
                            className="fusion-line fusion-final"
                            points={buildRiskPolyline(
                              chartPoints,
                              "final_risk"
                            )}
                            fill="none"
                          />

                          {/* ML RISK */}
                          <polyline
                            className="fusion-line fusion-ml"
                            points={buildRiskPolyline(
                              chartPoints,
                              "ml_risk"
                            )}
                            fill="none"
                          />

                          {/* ANOMALY RISK */}
                          <polyline
                            className="fusion-line fusion-anomaly"
                            points={buildRiskPolyline(
                              chartPoints,
                              "anomaly_risk"
                            )}
                            fill="none"
                          />

                          {/* GRAPH RISK */}
                          <polyline
                            className="fusion-line fusion-graph"
                            points={buildRiskPolyline(
                              chartPoints,
                              "graph_risk"
                            )}
                            fill="none"
                          />

                          {/* FINAL POINTS */}
                          <RiskSignalPoints
                            points={chartPoints}
                            field="final_risk"
                            className="final"
                          />

                          {/* ML POINTS */}
                          <RiskSignalPoints
                            points={chartPoints}
                            field="ml_risk"
                            className="ml"
                          />

                          {/* ANOMALY POINTS */}
                          <RiskSignalPoints
                            points={chartPoints}
                            field="anomaly_risk"
                            className="anomaly"
                          />

                          {/* GRAPH POINTS */}
                          <RiskSignalPoints
                            points={chartPoints}
                            field="graph_risk"
                            className="graph"
                          />
                        </svg>
                      ) : (
                        <EmptyState
                          title="Waiting for model data"
                          description="Live ML, anomaly and graph signals will appear here after the first risk event. Score a transaction below or run the attack lab."
                        />
                      )}
                    </div>
                  </div>

                  <RiskHistoryNavigator
                    totalPoints={riskHistory.length}
                    windowSize={RISK_CHART_WINDOW}
                    startIndex={safeChartStart}
                    onChange={setChartStartIndex}
                  />

                  {/* =================================================
                      LEGEND
                  ================================================= */}

                  <div className="chart-legend fusion-legend">
                    <span className="fusion-legend-item final">
                      <i className="legend-line" />
                      Final risk
                    </span>

                    <span className="fusion-legend-item ml">
                      <i className="legend-line" />
                      ML risk
                    </span>

                    <span className="fusion-legend-item anomaly">
                      <i className="legend-line" />
                      Anomaly risk
                    </span>

                    <span className="fusion-legend-item graph">
                      <i className="legend-line" />
                      Graph risk
                    </span>

                    <span className="chart-insight">
                      {riskHistory.length} scored events tracked
                    </span>
                  </div>
                </section>

                {/* ARCHITECTURE */}

                <section className="panel architecture-panel">
                  <div className="panel-header">
                    <div>
                      <span className="eyebrow">
                        DEFENSE STACK
                      </span>

                      <h2>
                        Signal architecture
                      </h2>
                    </div>

                    <span className="mini-status">
                      LIVE
                    </span>
                  </div>

                  <div className="stack-list">
                    <div className="stack-item">
                      <div className="stack-number">
                        01
                      </div>

                      <div>
                        <strong>
                          Behavioral ML
                        </strong>

                        <span>
                          XGBoost classifier
                        </span>
                      </div>

                      <b className="stack-score">
                        50
                        <span>%</span>
                      </b>
                    </div>

                    <div className="stack-item">
                      <div className="stack-number">
                        02
                      </div>

                      <div>
                        <strong>
                          Unsupervised anomaly
                        </strong>

                        <span>
                          Isolation Forest
                        </span>
                      </div>

                      <b className="stack-score">
                        20
                        <span>%</span>
                      </b>
                    </div>

                    <div className="stack-item">
                      <div className="stack-number">
                        03
                      </div>

                      <div>
                        <strong>
                          Entity graph
                        </strong>

                        <span>
                          Device + IP relationships
                        </span>
                      </div>

                      <b className="stack-score">
                        30
                        <span>%</span>
                      </b>
                    </div>
                  </div>

                  <div className="fusion-callout">
                    <span className="fusion-icon">
                      ✦
                    </span>

                    <div>
                      <strong>
                        Unified risk score
                      </strong>

                      <span>
                        One explainable decision
                        layer
                      </span>
                    </div>

                    <span className="arrow">
                      →
                    </span>
                  </div>
                </section>
              </div>

              {/* QUEUE + ATTACK */}

              <div className="lower-grid">
                <section className="panel queue-panel">
                  <div className="panel-header">
                    <div>
                      <span className="eyebrow">
                        REAL-TIME QUEUE
                      </span>

                      <h2>
                        Priority transactions
                      </h2>
                    </div>

                    <button
                      className="text-button"
                      onClick={() =>
                        setShowAllTransactions(
                          (current) =>
                            !current
                        )
                      }
                    >
                      {showAllTransactions
                        ? "Show less ←"
                        : "View all →"}
                    </button>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>TRANSACTION</th>
                          <th>AMOUNT</th>
                          <th>RISK SIGNAL</th>
                          <th>DECISION</th>
                          <th />
                        </tr>
                      </thead>

                      <tbody>
                        {loading ? (
                          <tr>
                            <td
                              colSpan="5"
                              className="table-empty"
                            >
                              Loading model queue...
                            </td>
                          </tr>
                        ) : queue.length === 0 ? (
                          <tr>
                            <td
                              colSpan="5"
                              className="table-empty"
                            >
                              No transactions returned.
                            </td>
                          </tr>
                        ) : (
                          (showAllTransactions
                            ? queue
                            : queue.slice(0, 6)
                          ).map((item) => {
                            const risk =
                              Number(
                                item.final_risk
                              ) || 0;

                            const riskWidth =
                              Math.min(
                                100,
                                Math.max(
                                  0,
                                  (risk /
                                    maxRisk) *
                                    100
                                )
                              );

                            return (
                              <tr
                                key={
                                  item.event_id ||
                                  item.live_event_id ||
                                  item.transaction_id
                                }
                              >
                                <td>
                                  <div className="tx-cell">
                                    <span className="tx-icon">
                                      ↗
                                    </span>

                                    <div>
                                      <strong>
                                        {
                                          item.transaction_id
                                        }
                                      </strong>

                                      <small>
                                        {item.user_id ||
                                          "synthetic"}{" "}
                                        ·{" "}
                                        {item.payment_method ||
                                          "—"}
                                      </small>
                                    </div>
                                  </div>
                                </td>

                                <td>
                                  <strong>
                                    ₹
                                    {Number(
                                      item.amount_inr
                                    ).toLocaleString(
                                      "en-IN",
                                      {
                                        maximumFractionDigits: 0,
                                      }
                                    )}
                                  </strong>
                                </td>

                                <td>
                                  <div className="risk-cell">
                                    <div className="risk-bar">
                                      <i
                                        style={{
                                          width: `${riskWidth}%`,
                                        }}
                                      />
                                    </div>

                                    <strong>
                                      {Math.round(
                                        risk
                                      )}
                                    </strong>
                                  </div>
                                </td>

                                <td>
                                  <ActionBadge
                                    action={
                                      item.action
                                    }
                                  />
                                </td>

                                <td>
                                  <button className="row-more">
                                    •••
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="panel attack-panel">
                  <div className="panel-header">
                    <div>
                      <span className="eyebrow">
                        ATTACK LAB
                      </span>

                      <h2>
                        Defense readiness
                      </h2>
                    </div>

                    <button
                      className="refresh-button"
                      onClick={
                        runAttackLab
                      }
                      disabled={
                        runningAttacks
                      }
                    >
                      ↻
                    </button>
                  </div>

                  <div className="readiness-number">
                    <strong>
                      {containedRate != null
                        ? `${containedRate}%`
                        : "—"}
                    </strong>

                    <span>
                      {attackReport
                        ? "contained after hardening"
                        : "run a stress test"}
                    </span>
                  </div>

                  <div className="scenario-bars">
                    {(
                      attackReport?.scenarios ||
                      []
                    ).map((item) => {
                      const averageRisk =
                        Number(
                          item.average_risk
                        ) || 0;

                      return (
                        <div
                          className="scenario-row"
                          key={
                            item.scenario
                          }
                        >
                          <span>
                            {scenarioLabels[
                              item.scenario
                            ] ||
                              item.scenario}
                          </span>

                          <div className="scenario-track">
                            <i
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    averageRisk
                                  )
                                )}%`,
                              }}
                            />
                          </div>

                          <b>
                            {Number(
                              item.hardened_contained
                            ) || 0}
                            <small>/20</small>
                          </b>
                        </div>
                      );
                    })}
                  </div>

                  {!attackReport && (
                    <EmptyState
                      title="No simulation yet"
                      description="Run the attack lab to compare baseline and hardened containment."
                    />
                  )}

                  <button
                    className="outline-button full"
                    onClick={
                      runAttackLab
                    }
                    disabled={
                      runningAttacks
                    }
                  >
                    <Icon name="pulse" />

                    {runningAttacks
                      ? "Running simulation..."
                      : "Run 100 attack scenarios"}
                  </button>
                </section>
              </div>

              {/* LIVE RISK LAB */}

              <div className="risk-lab-strip">
                <div className="strip-intro">
                  <span className="eyebrow accent">
                    LIVE RISK LAB
                  </span>

                  <h2>
                    Score a transaction
                  </h2>

                  <p>
                    Send an observable payment
                    pattern through the complete
                    defense stack.
                  </p>
                </div>

                <div className="score-form">
                  <Field
                    label="Amount (₹)"
                    name="amount_inr"
                    value={
                      transaction.amount_inr
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <Field
                    label="Tx / hour"
                    name="transactions_1h"
                    value={
                      transaction.transactions_1h
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <Field
                    label="Failed / 24h"
                    name="failed_attempts_24h"
                    value={
                      transaction.failed_attempts_24h
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <Field
                    label="Users / device"
                    name="unique_users_on_device"
                    value={
                      transaction.unique_users_on_device
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <Field
                    label="Accounts / IP"
                    name="unique_accounts_on_ip"
                    value={
                      transaction.unique_accounts_on_ip
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <button
                    className="primary-button score-button"
                    onClick={
                      scoreLiveTransaction
                    }
                    disabled={
                      scoring
                    }
                  >
                    {scoring
                      ? "Scoring..."
                      : "Score payment →"}
                  </button>
                </div>

                <div className="score-result">
                  <RiskRing
                    score={
                      currentScore.final_risk
                    }
                  />

                  <div className="score-meta">
                    <span className="eyebrow">
                      LIVE DECISION
                    </span>

                    <h3>
                      {currentScore.action ===
                      "—"
                        ? "Awaiting input"
                        : currentScore.action}
                    </h3>

                    <p>
                      {score
                        ? `${currentScore.risk_band || "Live"} risk · model + anomaly + graph`
                        : "Enter a pattern and run the model"}
                    </p>
                  </div>
                </div>
              </div>

              {score && (
                <section className="panel explanation-panel">
                  <div className="panel-header">
                    <div>
                      <span className="eyebrow">
                        MODEL EXPLANATION
                      </span>

                      <h2>
                        Why this transaction was
                        scored{" "}
                        {Math.round(
                          Number(
                            score.final_risk
                          ) || 0
                        )}
                        /100
                      </h2>
                    </div>

                    <ActionBadge
                      action={
                        score.action
                      }
                    />
                  </div>

                  <div className="explanation-grid">
                    <div className="score-breakdown">
                      <div>
                        <span>ML risk</span>

                        <strong>
                          {Math.round(
                            Number(
                              score.ml_risk
                            ) || 0
                          )}
                        </strong>

                        <i>
                          <b
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  Number(
                                    score.ml_risk
                                  ) || 0
                                )
                              )}%`,
                            }}
                          />
                        </i>
                      </div>

                      <div>
                        <span>
                          Anomaly risk
                        </span>

                        <strong>
                          {Math.round(
                            Number(
                              score.anomaly_risk
                            ) || 0
                          )}
                        </strong>

                        <i>
                          <b
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  Number(
                                    score.anomaly_risk
                                  ) || 0
                                )
                              )}%`,
                            }}
                          />
                        </i>
                      </div>

                      <div>
                        <span>
                          Graph risk
                        </span>

                        <strong>
                          {Math.round(
                            Number(
                              score.graph_risk
                            ) || 0
                          )}
                        </strong>

                        <i>
                          <b
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  Number(
                                    score.graph_risk
                                  ) || 0
                                )
                              )}%`,
                            }}
                          />
                        </i>
                      </div>
                    </div>

                    <div className="reason-list">
                      {(
                        score.top_reasons ||
                        []
                      )
                        .slice(0, 4)
                        .map(
                          (
                            reason,
                            index
                          ) => (
                            <div
                              className="reason-item"
                              key={
                                reason.feature ||
                                index
                              }
                            >
                              <span>
                                {reason.impact ===
                                "increases risk"
                                  ? "+"
                                  : "−"}
                              </span>

                              <div>
                                <strong>
                                  {
                                    reason.feature
                                  }
                                </strong>

                                <p>
                                  {
                                    reason.explanation
                                  }
                                </p>
                              </div>
                            </div>
                          )
                        )}
                    </div>
                  </div>
                </section>
              )}

              {score && (
                <AITransactionAnalysis
                  analysis={
                    score.ai_analysis
                  }
                />
              )}

              {attackReport && (
                <AIAttackAnalysis
                  analysis={
                    attackReport.ai_analysis
                  }
                />
              )}

              <footer className="footer-note">
                <span>
                  <i className="status-pulse" />
                  Synthetic data environment
                </span>

                <span>
                  RazorAttackLab v2.0 · XGBoost +
                  Isolation Forest + Graph Risk +
                  Groq Risk Analyst
                </span>
              </footer>
            </>
          )}

          {/* =================================================
              RISK LAB
          ================================================= */}

          {activeView ===
            "Risk Lab" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow accent">
                    LIVE RISK LAB
                  </span>

                  <h1>
                    Transaction intelligence
                  </h1>

                  <p>
                    Evaluate a payment against
                    behavioral, anomaly and graph
                    risk signals.
                  </p>
                </div>
              </div>

              <div className="risk-lab-strip standalone">
                <div className="score-form">
                  <Field
                    label="Amount (₹)"
                    name="amount_inr"
                    value={
                      transaction.amount_inr
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <Field
                    label="Tx / hour"
                    name="transactions_1h"
                    value={
                      transaction.transactions_1h
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <Field
                    label="Failed / 24h"
                    name="failed_attempts_24h"
                    value={
                      transaction.failed_attempts_24h
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <Field
                    label="Users / device"
                    name="unique_users_on_device"
                    value={
                      transaction.unique_users_on_device
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <Field
                    label="Accounts / IP"
                    name="unique_accounts_on_ip"
                    value={
                      transaction.unique_accounts_on_ip
                    }
                    onChange={
                      updateTransaction
                    }
                    type="number"
                  />

                  <button
                    className="primary-button"
                    onClick={
                      scoreLiveTransaction
                    }
                    disabled={
                      scoring
                    }
                  >
                    {scoring
                      ? "Analyzing..."
                      : "Run risk analysis →"}
                  </button>
                </div>
              </div>

              {score ? (
                <>
                  <section className="panel explanation-panel">
                    <div className="panel-header">
                      <div>
                        <span className="eyebrow">
                          LIVE DECISION
                        </span>

                        <h2>
                          Risk score{" "}
                          {Math.round(
                            Number(
                              score.final_risk
                            ) || 0
                          )}
                          /100
                        </h2>
                      </div>

                      <ActionBadge
                        action={
                          score.action
                        }
                      />
                    </div>

                    <div className="risk-lab-result">
                      <RiskRing
                        score={
                          score.final_risk
                        }
                      />

                      <div>
                        <span className="eyebrow">
                          RISK BAND
                        </span>

                        <h2>
                          {score.risk_band ||
                            "Unknown"}
                        </h2>

                        <p>
                          Hardened decision:{" "}
                          <strong>
                            {score.hardened_action ||
                              "Review"}
                          </strong>
                        </p>
                      </div>
                    </div>
                  </section>

                  <AITransactionAnalysis
                    analysis={
                      score.ai_analysis
                    }
                  />
                </>
              ) : (
                <EmptyState
                  title="No transaction scored"
                  description="Enter transaction behavior above and run the risk engine."
                />
              )}
            </>
          )}

          {/* =================================================
              ATTACK SIMULATOR
          ================================================= */}

          {activeView ===
            "Attack Simulator" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow accent">
                    ADVERSARIAL DEFENSE
                  </span>

                  <h1>
                    Attack simulator
                  </h1>

                  <p>
                    Stress-test the payment
                    defense stack against
                    multiple attacker behaviors.
                  </p>
                </div>

                <button
                  className="primary-button"
                  onClick={
                    runAttackLab
                  }
                  disabled={
                    runningAttacks
                  }
                >
                  <Icon name="pulse" />

                  {runningAttacks
                    ? "Running..."
                    : "Run simulation"}
                </button>
              </div>

              {attackReport ? (
                <>
                  <div className="metric-grid">
                    <MetricCard
                      label="Total attacks"
                      value={
                        attackReport.total_attacks ??
                        0
                      }
                      detail="Synthetic adversarial events"
                      tone="violet"
                      icon="pulse"
                    />

                    <MetricCard
                      label="Baseline containment"
                      value={
                        baselineRate ??
                        0
                      }
                      suffix="%"
                      detail="Original defense"
                      tone="orange"
                      icon="shield"
                    />

                    <MetricCard
                      label="Hardened containment"
                      value={
                        containedRate ??
                        0
                      }
                      suffix="%"
                      detail="Defense after hardening"
                      tone="teal"
                      icon="shield"
                    />

                    <MetricCard
                      label="Residual bypasses"
                      value={
                        attackReport.hardened_bypassed ??
                        "—"
                      }
                      detail="Attacks still allowed"
                      tone="red"
                      icon="activity"
                    />
                  </div>

                  <section className="panel attack-table-panel">
                    <div className="panel-header">
                      <div>
                        <span className="eyebrow">
                          SCENARIO ANALYSIS
                        </span>

                        <h2>
                          Baseline vs hardened
                        </h2>
                      </div>
                    </div>

                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>SCENARIO</th>
                            <th>ATTACKS</th>
                            <th>BASELINE</th>
                            <th>HARDENED</th>
                            <th>AVG RISK</th>
                          </tr>
                        </thead>

                        <tbody>
                          {(
                            attackReport.scenarios ||
                            []
                          ).map(
                            (item) => {
                              const scenarioName =
                                scenarioLabels[
                                  item.scenario
                                ] ||
                                item.scenario ||
                                "Unknown";

                              const attacks =
                                Number(
                                  item.attacks
                                ) ||
                                0;

                              const contained =
                                Number(
                                  item.contained
                                ) ||
                                0;

                              const hardenedContained =
                                Number(
                                  item.hardened_contained
                                ) ||
                                0;

                              const averageRisk =
                                Number(
                                  item.average_risk
                                ) ||
                                0;

                              return (
                                <tr
                                  key={
                                    item.scenario
                                  }
                                >
                                  <td>
                                    <strong>
                                      {
                                        scenarioName
                                      }
                                    </strong>
                                  </td>

                                  <td>
                                    {
                                      attacks
                                    }
                                  </td>

                                  <td>
                                    {
                                      contained
                                    }
                                    /20
                                  </td>

                                  <td>
                                    {
                                      hardenedContained
                                    }
                                    /20
                                  </td>

                                  <td>
                                    <strong>
                                      {averageRisk.toFixed(
                                        1
                                      )}
                                    </strong>
                                  </td>
                                </tr>
                              );
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <AIAttackAnalysis
                    analysis={
                      attackReport.ai_analysis
                    }
                  />
                </>
              ) : (
                <EmptyState
                  title="Attack lab ready"
                  description="Run 100 synthetic attack scenarios to generate baseline, hardened and Groq risk intelligence."
                />
              )}
            </>
          )}

          {/* =================================================
              NETWORK GRAPH
          ================================================= */}

          {activeView ===
            "Network Graph" &&
            renderNetworkGraph()}

          {/* =================================================
              MODEL HEALTH
          ================================================= */}

          {activeView ===
            "Model Health" &&
            renderModelHealth()}

          {/* =================================================
              SETTINGS
          ================================================= */}

          {activeView ===
            "Settings" &&
            renderSettings()}
        </section>
      </main>
    </div>
  );
}

export default App;