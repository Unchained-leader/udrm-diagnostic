"use client";
import { GOLD } from "../constants";

export default function EscalationGauge({ severity }) {
  const s = Math.min(Math.max(severity, 0), 5);
  const pct = (s / 5) * 100;

  const color = s >= 4 ? "#ef4444" : s >= 3 ? "#f59e0b" : s >= 2 ? "#eab308" : "#22c55e";
  const label = s >= 4 ? "High" : s >= 3 ? "Moderate-High" : s >= 2 ? "Moderate" : s >= 1 ? "Low" : "None";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 17, color: "#888" }}>Escalation Severity</span>
        <span style={{ fontSize: 19, fontWeight: 700, color }}>{label} ({s}/5)</span>
      </div>

      {/* Gauge track */}
      <div style={{ position: "relative", height: 24, background: "#1a1a1a", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 12,
          background: `linear-gradient(90deg, #22c55e, #eab308 50%, #ef4444)`,
          backgroundSize: "500% 100%",
          backgroundPosition: `${pct}% 0`,
          transition: "width 0.6s ease",
        }} />
      </div>

      {/* Scale labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#555" }}>
        <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
      </div>

      <p style={{ fontSize: 17, color: "#888", marginTop: 12 }}>
        {s >= 4
          ? "Your pattern has escalated significantly. The brain requires increasing intensity to achieve the same dopamine response. This is neurological tolerance, not moral failure."
          : s >= 2
          ? "Some escalation is present. The brain is beginning to seek more intensity. Root-level intervention can interrupt this trajectory."
          : "Minimal escalation detected. Addressing root causes now prevents future trajectory shifts."}
      </p>
    </div>
  );
}
