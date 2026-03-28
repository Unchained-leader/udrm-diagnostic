"use client";

const GOLD = "#C9A227";

const PATHWAY_DATA = {
  "Arousal": { color: "#ef4444", icon: "⚡", desc: "Seeks stimulation to override emotional pain" },
  "Numbing": { color: "#3b82f6", icon: "🧊", desc: "Shuts down feeling to escape overwhelming stress" },
  "Fantasy": { color: "#a855f7", icon: "💭", desc: "Creates alternate reality to escape present pain" },
  "Deprivation": { color: "#f59e0b", icon: "🕳️", desc: "Fills a void of unmet needs through counterfeit connection" },
};

const MANAGES_DATA = {
  "Pain": { color: "#ef4444" },
  "Anxiety": { color: "#f59e0b" },
  "Shame": { color: "#a855f7" },
  "Terror": { color: "#dc2626" },
};

export default function NeuropathwayDiagram({ neuropathway, manages }) {
  const pw = PATHWAY_DATA[neuropathway] || PATHWAY_DATA["Arousal"];
  const mg = MANAGES_DATA[manages] || MANAGES_DATA["Pain"];

  return (
    <div style={{ padding: "16px", background: "#1a1a1a", borderRadius: 10, border: "1px solid #2a2a2a" }}>
      {/* Flow diagram */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        {/* Trigger */}
        <div style={{
          padding: "10px 16px", borderRadius: 8, background: "#0a0a0a",
          border: `1px solid ${mg.color}44`, textAlign: "center", minWidth: 90,
        }}>
          <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, marginBottom: 4 }}>TRIGGER</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: mg.color }}>{manages || "Pain"}</div>
        </div>

        <div style={{ color: "#444", fontSize: 18 }}>→</div>

        {/* Pathway */}
        <div style={{
          padding: "10px 16px", borderRadius: 8, background: "#0a0a0a",
          border: `1px solid ${pw.color}44`, textAlign: "center", minWidth: 90,
        }}>
          <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, marginBottom: 4 }}>PATHWAY</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: pw.color }}>{pw.icon} {neuropathway || "Unknown"}</div>
        </div>

        <div style={{ color: "#444", fontSize: 18 }}>→</div>

        {/* Behavior */}
        <div style={{
          padding: "10px 16px", borderRadius: 8, background: "#0a0a0a",
          border: `1px solid ${GOLD}44`, textAlign: "center", minWidth: 90,
        }}>
          <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, marginBottom: 4 }}>BEHAVIOR</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>The Cycle</div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#666", textAlign: "center", margin: "12px 0 0", fontStyle: "italic" }}>{pw.desc}</p>
    </div>
  );
}
