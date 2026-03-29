"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { GOLD } from "../constants";

const DIMENSIONS = [
  { key: "scorecardBehaviorCount", label: "Behaviors", max: 7, color: "#ef4444" },
  { key: "scorecardContentThemeCount", label: "Content Themes", max: 10, color: "#f59e0b" },
  { key: "scorecardChildhoodWoundScore", label: "Childhood", max: 5, color: "#8b5cf6" },
  { key: "scorecardAttachmentSeverity", label: "Attachment", max: 5, color: "#3b82f6" },
  { key: "scorecardSpiritualDisconnect", label: "Spiritual", max: 5, color: "#22c55e" },
  { key: "scorecardRelationalBurden", label: "Relational", max: 5, color: "#ec4899" },
  { key: "escalationSeverity", label: "Escalation", max: 5, color: "#f97316" },
  { key: "isolationScore", label: "Isolation", max: 5, color: "#06b6d4" },
];

const RELATIONAL = [
  { key: "codependencyScore", label: "Codependency", color: GOLD },
  { key: "enmeshmentScore", label: "Enmeshment", color: "#DFC468" },
  { key: "relationalVoidScore", label: "Relational Void", color: "#9A7730" },
  { key: "leadershipBurdenScore", label: "Leadership Burden", color: "#B8860B" },
];

function formatDate(iso) {
  if (!iso) return "?";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload) return null;
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "#ccc", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {p.value}%
        </div>
      ))}
    </div>
  );
}

export default function TrendOverlay({ reports }) {
  if (!reports || reports.length < 2) return null;

  // Build data for scorecard dimensions over time
  const scorecardData = reports.map(r => {
    const a = r.analysis || {};
    const row = { date: formatDate(r.generatedAt) };
    DIMENSIONS.forEach(d => {
      const val = Number(a[d.key]) || 0;
      row[d.label] = Math.round((val / d.max) * 100);
    });
    return row;
  });

  // Build data for relational scores over time
  const relationalData = reports.map(r => {
    const a = r.analysis || {};
    const row = { date: formatDate(r.generatedAt) };
    RELATIONAL.forEach(d => {
      row[d.label] = Number(a[d.key]) || 0;
    });
    return row;
  });

  // Key changes summary
  const first = reports[0]?.analysis || {};
  const latest = reports[reports.length - 1]?.analysis || {};
  const changes = DIMENSIONS.map(d => {
    const firstVal = Math.round(((Number(first[d.key]) || 0) / d.max) * 100);
    const latestVal = Math.round(((Number(latest[d.key]) || 0) / d.max) * 100);
    const diff = latestVal - firstVal;
    return { ...d, firstVal, latestVal, diff };
  }).filter(c => c.diff !== 0).sort((a, b) => a.diff - b.diff);

  return (
    <div>
      {/* Changes summary */}
      {changes.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>Changes from first to latest report</div>
          {changes.map(c => (
            <div key={c.key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 14px", background: "#1a1a1a", borderRadius: 6,
              borderLeft: `3px solid ${c.diff < 0 ? "#22c55e" : "#ef4444"}`,
            }}>
              <span style={{ fontSize: 13, color: "#ccc" }}>{c.label}</span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: c.diff < 0 ? "#22c55e" : "#ef4444",
              }}>
                {c.diff > 0 ? "+" : ""}{c.diff}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Scorecard trend line chart */}
      <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Diagnostic Scores Over Time</div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={scorecardData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
          <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} axisLine={{ stroke: "#333" }} />
          <YAxis domain={[0, 100]} tick={{ fill: "#666", fontSize: 11 }} axisLine={{ stroke: "#333" }} tickFormatter={v => `${v}%`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10, color: "#888" }} />
          {DIMENSIONS.map(d => (
            <Line key={d.key} type="monotone" dataKey={d.label} stroke={d.color} strokeWidth={2} dot={{ r: 4, fill: d.color }} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Relational scores trend */}
      <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, marginBottom: 8, marginTop: 24, textTransform: "uppercase" }}>Relational Patterns Over Time</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={relationalData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
          <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} axisLine={{ stroke: "#333" }} />
          <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tick={{ fill: "#666", fontSize: 11 }} axisLine={{ stroke: "#333" }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10, color: "#888" }} />
          {RELATIONAL.map(d => (
            <Line key={d.key} type="monotone" dataKey={d.label} stroke={d.color} strokeWidth={2} dot={{ r: 4, fill: d.color }} />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Template & pathway changes */}
      <div style={{ fontSize: 12, color: GOLD, letterSpacing: 1, marginBottom: 8, marginTop: 24, textTransform: "uppercase" }}>Pattern Changes</div>
      <div style={{ display: "grid", gap: 6 }}>
        {reports.map((r, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "100px 1fr 1fr 1fr", gap: 8,
            padding: "10px 14px", background: "#1a1a1a", borderRadius: 6,
            fontSize: 12, alignItems: "center",
            borderLeft: i === reports.length - 1 ? `3px solid ${GOLD}` : "3px solid #333",
          }}>
            <span style={{ color: "#888" }}>{formatDate(r.generatedAt)}</span>
            <span style={{ color: "#ccc" }}>{r.arousalTemplateType || "—"}</span>
            <span style={{ color: "#ccc" }}>{r.neuropathway || "—"}</span>
            <span style={{ color: "#ccc" }}>{r.attachmentStyle || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
