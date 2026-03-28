"use client";

const GOLD = "#C9A227";

const AREAS = [
  { key: "romantic", label: "Romantic Relationship" },
  { key: "health", label: "Physical Health" },
  { key: "financial", label: "Financial Situation" },
  { key: "work", label: "Work Fulfillment" },
  { key: "god", label: "Relationship with God" },
];

function StabilityMeter({ value, label }) {
  // value: -1 (unstable), 0 (unknown), 1 (stable)
  const isStable = value === 1;
  const isUnstable = value === -1;
  const color = isStable ? "#22c55e" : isUnstable ? "#ef4444" : "#444";
  const bg = isStable ? "#14532d22" : isUnstable ? "#7f1d1d22" : "#1a1a1a";
  const statusText = isStable ? "STABLE" : isUnstable ? "UNSTABLE" : "UNKNOWN";
  const barWidth = isStable ? "85%" : isUnstable ? "30%" : "50%";

  return (
    <div style={{ background: bg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${color}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: "#ccc" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color }}>{statusText}</span>
      </div>
      <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          width: barWidth, height: "100%", borderRadius: 3,
          background: isStable
            ? "linear-gradient(90deg, #166534, #22c55e)"
            : isUnstable
            ? "linear-gradient(90deg, #ef4444, #dc2626)"
            : "linear-gradient(90deg, #444, #555)",
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

export default function StressHeatmap({ analysis }) {
  const stressText = analysis.lifeStressAnalysis;
  if (!stressText) return null;

  const textLower = (stressText || "").toLowerCase();

  const areaData = AREAS.map(area => {
    const mentioned = textLower.includes(area.key);
    const lackWords = ["lack", "strain", "stress", "struggling", "pressure", "unstable", "deficit", "empty", "disconnected", "distant"];
    const abundanceWords = ["abundance", "stable", "strong", "healthy", "thriving", "solid", "gift", "grounded", "secure"];
    const hasLack = mentioned && lackWords.some(w => textLower.includes(w));
    const hasAbundance = mentioned && abundanceWords.some(w => textLower.includes(w));
    // If both detected, use context proximity or default to the stronger signal
    let value = 0;
    if (hasLack && !hasAbundance) value = -1;
    else if (hasAbundance && !hasLack) value = 1;
    else if (hasLack && hasAbundance) {
      // Check which word is closer to the area key in the text
      const keyIdx = textLower.indexOf(area.key);
      const lackIdx = Math.min(...lackWords.map(w => { const i = textLower.indexOf(w); return i === -1 ? 9999 : Math.abs(i - keyIdx); }));
      const abundIdx = Math.min(...abundanceWords.map(w => { const i = textLower.indexOf(w); return i === -1 ? 9999 : Math.abs(i - keyIdx); }));
      value = lackIdx < abundIdx ? -1 : 1;
    }
    return { ...area, value };
  });

  const unstableCount = areaData.filter(a => a.value === -1).length;
  const stableCount = areaData.filter(a => a.value === 1).length;
  const totalKnown = unstableCount + stableCount;
  const stabilityPct = totalKnown > 0 ? Math.round((stableCount / totalKnown) * 100) : 50;

  return (
    <div>
      {/* Overall stability gauge */}
      <div style={{ marginBottom: 20, padding: "16px", background: "#111", borderRadius: 10, border: "1px solid #1f1f1f" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#888" }}>Overall Life Stability</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: stabilityPct >= 60 ? "#22c55e" : stabilityPct >= 40 ? "#f59e0b" : "#ef4444" }}>{stabilityPct}%</span>
        </div>
        <div style={{ height: 10, background: "#1a1a1a", borderRadius: 5, overflow: "hidden" }}>
          <div style={{
            width: `${stabilityPct}%`, height: "100%", borderRadius: 5,
            background: stabilityPct >= 60
              ? "linear-gradient(90deg, #166534, #22c55e)"
              : stabilityPct >= 40
              ? "linear-gradient(90deg, #92400e, #f59e0b)"
              : "linear-gradient(90deg, #991b1b, #ef4444)",
            transition: "width 0.8s ease",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#555" }}>
          <span>Unstable</span><span>Stable</span>
        </div>
      </div>

      {/* Individual area meters */}
      <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
        {areaData.map(area => (
          <StabilityMeter key={area.key} value={area.value} label={area.label} />
        ))}
      </div>

      {/* AI analysis text */}
      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#999", marginBottom: 20 }}>{stressText}</p>

      {/* Insight section */}
      <div style={{
        background: "linear-gradient(135deg, #1a1505, #111)",
        borderRadius: 12, padding: "20px", border: `1px solid ${GOLD}33`,
      }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, marginBottom: 12, textTransform: "uppercase" }}>What This Means</div>

        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc", margin: "0 0 12px" }}>
          Most people unknowingly try to stabilize their unwanted desires and behaviors by stabilizing these categories in life. But it actually works the opposite way.
        </p>

        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc", margin: "0 0 12px" }}>
          When you address your root issues, you stabilize behavior, and behavior brings stability to these areas.
        </p>

        <div style={{
          background: "#0a0a0a", borderRadius: 10, padding: "16px 18px",
          border: `1px solid ${GOLD}44`, margin: "16px 0",
        }}>
          <div style={{ fontSize: 12, color: GOLD, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>THE #1 TREND</div>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ddd", margin: 0 }}>
            In the 10,000+ clients we have worked with, the #1 trend is increased income, fulfillment, and relationship health as a direct result of healing root issues.
          </p>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc", margin: "12px 0 0" }}>
          Every single person who takes the first steps towards freedom does so from a place of being unstable in multiple areas of life. The leap of faith in unstable times is a rite of passage.
        </p>
      </div>
    </div>
  );
}
