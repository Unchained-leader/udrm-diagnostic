"use client";
import { useState } from "react";

const GOLD = "#C9A227";

export default function ReportSelector({ reports, activeIndex, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  if (!reports || reports.length <= 1) return null;

  const active = reports[activeIndex];
  const formatDate = (iso) => {
    if (!iso) return "Unknown date";
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Toggle bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", background: "#111", borderRadius: expanded ? "10px 10px 0 0" : 10,
          border: `1px solid ${GOLD}33`, cursor: "pointer",
        }}
      >
        <div>
          <span style={{ fontSize: 12, color: GOLD, letterSpacing: 1, marginRight: 8 }}>REPORT</span>
          <span style={{ fontSize: 14, color: "#ccc" }}>{formatDate(active?.generatedAt)}</span>
          <span style={{ fontSize: 12, color: "#666", marginLeft: 8 }}>({reports.length} total)</span>
        </div>
        <span style={{ color: "#666", fontSize: 16, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>&#9662;</span>
      </div>

      {/* Report list */}
      {expanded && (
        <div style={{
          background: "#0a0a0a", borderRadius: "0 0 10px 10px",
          border: `1px solid ${GOLD}33`, borderTop: "none",
          maxHeight: 300, overflowY: "auto",
        }}>
          {reports.map((r, i) => (
            <div
              key={i}
              onClick={() => { onSelect(i); setExpanded(false); }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 16px", cursor: "pointer",
                background: i === activeIndex ? `${GOLD}11` : "transparent",
                borderBottom: i < reports.length - 1 ? "1px solid #1f1f1f" : "none",
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: i === activeIndex ? GOLD : "#ccc", fontWeight: i === activeIndex ? 600 : 400 }}>
                  {formatDate(r.generatedAt)}
                  {i === reports.length - 1 && <span style={{ fontSize: 11, color: "#22c55e", marginLeft: 8 }}>Latest</span>}
                  {i === 0 && reports.length > 1 && <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>First</span>}
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {r.arousalTemplateType || "—"} / {r.neuropathway || "—"}
                </div>
              </div>
              {i === activeIndex && <div style={{ width: 8, height: 8, borderRadius: "50%", background: GOLD }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
