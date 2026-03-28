"use client";

const AREAS = [
  { key: "romantic", label: "Romantic Relationship" },
  { key: "health", label: "Physical Health" },
  { key: "financial", label: "Financial Situation" },
  { key: "work", label: "Work Fulfillment" },
  { key: "god", label: "Relationship with God" },
];

export default function StressHeatmap({ analysis }) {
  // Parse the lifeStressAnalysis and raw selections from analysis
  // The AI doesn't return raw selections, but we can infer from the text
  // For now, render the AI analysis text with visual indicators
  const stressText = analysis.lifeStressAnalysis;
  if (!stressText) return null;

  return (
    <div>
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {AREAS.map(area => {
          // Check if the analysis text mentions this area with lack/abundance context
          const textLower = (stressText || "").toLowerCase();
          const hasLack = textLower.includes(area.key) && (textLower.includes("lack") || textLower.includes("strain") || textLower.includes("stress") || textLower.includes("struggling"));
          const hasAbundance = textLower.includes(area.key) && (textLower.includes("abundance") || textLower.includes("stable") || textLower.includes("strong") || textLower.includes("healthy"));

          let color = "#2a2a2a"; // neutral/unknown
          let indicator = "?";
          if (hasLack) { color = "#7f1d1d"; indicator = "STRESS"; }
          if (hasAbundance) { color = "#14532d"; indicator = "STABLE"; }

          return (
            <div key={area.key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", background: "#1a1a1a", borderRadius: 8,
              borderLeft: `3px solid ${hasLack ? "#ef4444" : hasAbundance ? "#22c55e" : "#444"}`,
            }}>
              <span style={{ fontSize: 14, color: "#ccc" }}>{area.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: hasLack ? "#ef4444" : hasAbundance ? "#22c55e" : "#666" }}>{indicator}</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: "#999" }}>{stressText}</p>
    </div>
  );
}
