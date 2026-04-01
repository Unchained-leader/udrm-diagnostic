"use client";
import { GOLD } from "../constants";

const SUBSTANCE_VICES = [
  { id: "vice_alcohol", label: "Alcohol" },
  { id: "vice_thc", label: "THC / Marijuana" },
  { id: "vice_substances", label: "Other Substances" },
  { id: "vice_nicotine", label: "Nicotine" },
];

const BEHAVIOR_VICES = [
  { id: "sexual_behavior", label: "Sexual Behavior", alwaysActive: true },
  { id: "vice_gambling", label: "Gambling" },
  { id: "vice_gaming", label: "Gaming" },
  { id: "vice_spending", label: "Impulse Spending" },
  { id: "vice_social_media", label: "Doom-Scrolling" },
  { id: "vice_work", label: "Overworking" },
  { id: "vice_overeating", label: "Overeating" },
];

export default function ViceBalanceDiagram({ coCopingBehaviors }) {
  // Determine which vices the user has from coCopingBehaviors array
  const userVices = new Set();
  if (Array.isArray(coCopingBehaviors)) {
    coCopingBehaviors.forEach(item => {
      const name = (item.behavior || "").toLowerCase();
      SUBSTANCE_VICES.forEach(v => { if (name.includes(v.label.toLowerCase().split(" ")[0])) userVices.add(v.id); });
      BEHAVIOR_VICES.forEach(v => { if (name.includes(v.label.toLowerCase().split(" ")[0])) userVices.add(v.id); });
    });
  }

  const userSubstances = SUBSTANCE_VICES.filter(v => userVices.has(v.id));
  const userBehaviors = BEHAVIOR_VICES.filter(v => userVices.has(v.id));
  const hasSubstances = userSubstances.length > 0;
  const hasBehaviors = userBehaviors.length > 0;

  return (
    <div>
      {/* Scale diagram */}
      <div style={{ padding: "20px 16px", background: "#111", borderRadius: 12, border: "1px solid #1f1f1f", marginBottom: 16 }}>
        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "start" }}>
          {/* Substance side */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#ef4444", marginBottom: 12, textTransform: "uppercase", fontWeight: 700 }}>Substance</div>
            <div style={{ display: "grid", gap: 6 }}>
              {SUBSTANCE_VICES.map(v => {
                const active = userVices.has(v.id);
                return (
                  <div key={v.id} style={{
                    padding: "8px 10px", borderRadius: 6, fontSize: 12,
                    background: active ? "#7f1d1d33" : "#1a1a1a",
                    border: `1px solid ${active ? "#ef444466" : "#2a2a2a"}`,
                    color: active ? "#fca5a5" : "#555",
                    fontWeight: active ? 600 : 400,
                  }}>{v.label}</div>
                );
              })}
            </div>
          </div>

          {/* Center divider */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 28 }}>
            <div style={{ width: 1, height: 40, background: "#333" }} />
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "#0a0a0a", border: `2px solid ${GOLD}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: GOLD, fontWeight: 700,
            }}>VS</div>
            <div style={{ width: 1, height: 40, background: "#333" }} />
          </div>

          {/* Behavior side */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#3b82f6", marginBottom: 12, textTransform: "uppercase", fontWeight: 700 }}>Behavior</div>
            <div style={{ display: "grid", gap: 6 }}>
              {BEHAVIOR_VICES.map(v => {
                const active = v.alwaysActive || userVices.has(v.id);
                return (
                  <div key={v.id} style={{
                    padding: "8px 10px", borderRadius: 6, fontSize: 12,
                    background: active ? "#1e3a5f33" : "#1a1a1a",
                    border: `1px solid ${active ? "#3b82f666" : "#2a2a2a"}`,
                    color: active ? "#93c5fd" : "#555",
                    fontWeight: active ? 600 : 400,
                  }}>{v.label}</div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Convergence arrow */}
        <div style={{ textAlign: "center", margin: "16px 0 8px" }}>
          <div style={{ fontSize: 18, color: "#444" }}>↓</div>
          <div style={{
            display: "inline-block", padding: "10px 20px", borderRadius: 8,
            background: "#0a0a0a", border: `1px solid ${GOLD}44`,
          }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, marginBottom: 4 }}>SAME ROOT</div>
            <div style={{ fontSize: 13, color: "#ccc" }}>Different strategies, identical origin</div>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div style={{
        background: "linear-gradient(135deg, #1a1505, #111)",
        borderRadius: 12, padding: "20px", border: `1px solid ${GOLD}33`,
      }}>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc", margin: "0 0 12px" }}>
          Most people look at a behavior like gambling and a substance like alcohol as two very different problems. One is a "behavioral issue." The other is a "substance issue." Different categories, different treatments, different labels.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc", margin: "0 0 12px" }}>
          But they are not different problems. They are different strategies your brain uses to medicate the same root pain.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc", margin: "0 0 12px" }}>
          The substance numbs. The behavior distracts. The scroll dissociates. The spend creates a dopamine hit. The overwork creates a sense of worth. Every single one is aimed at the same target: the root narrative that says something is wrong with you, missing in you, or broken about you.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#ccc", margin: 0 }}>
          That is why white-knuckling one behavior so often causes another to intensify. Remove one escape route and the brain finds another. The only way to stop the cycle is to heal what the brain is running from.
        </p>
      </div>
    </div>
  );
}
