"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ResultCard from "../components/ResultCard";
import ExpandableCard from "../components/ExpandableCard";

const ScoreRadar = dynamic(() => import("../components/ScoreRadar"), { ssr: false });
const RelationalBars = dynamic(() => import("../components/RelationalBars"), { ssr: false });
const StressHeatmap = dynamic(() => import("../components/StressHeatmap"), { ssr: false });

const GOLD = "#C9A227";

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/dashboard/results")
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          if (d.error.includes("authenticated") || d.error.includes("expired")) {
            router.push("/dashboard/login");
            return;
          }
          setError(d.error);
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load results."); setLoading(false); });
  }, [router]);

  async function handleLogout() {
    await fetch("/api/dashboard/logout", { method: "POST" });
    router.push("/dashboard/login");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>UNCHAINED LEADER</div>
          <div style={{ color: "#888", fontSize: 15 }}>Loading your results...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", maxWidth: 400, padding: 40 }}>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>UNCHAINED LEADER</div>
          <div style={{ color: "#ef4444", fontSize: 15 }}>{error}</div>
          <button onClick={() => router.push("/dashboard/login")} style={{ marginTop: 20, padding: "10px 24px", background: "none", border: `1px solid ${GOLD}`, color: GOLD, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Back to Login</button>
        </div>
      </div>
    );
  }

  const a = data.analysis;
  const name = data.name || "there";

  if (!a) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", maxWidth: 400, padding: 40 }}>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, marginBottom: 12 }}>UNCHAINED LEADER</div>
          <div style={{ color: "#ccc", fontSize: 16, marginBottom: 8 }}>Your report is still processing.</div>
          <div style={{ color: "#888", fontSize: 14 }}>This can take up to 5 minutes. Please check back shortly.</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: "10px 24px", background: "none", border: `1px solid ${GOLD}`, color: GOLD, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Refresh</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #1f1f1f" }}>
        <div>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Unchained Leader</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Your Root Mapping Results</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {data.reportUrl && (
            <a href={data.reportUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", background: "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", fontSize: 12, fontWeight: 700, borderRadius: 6, textDecoration: "none", letterSpacing: 1 }}>PDF REPORT</a>
          )}
          <button onClick={handleLogout} style={{ padding: "8px 16px", background: "none", border: "1px solid #333", color: "#888", fontSize: 12, borderRadius: 6, cursor: "pointer" }}>Sign Out</button>
        </div>
      </div>

      {/* Welcome */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{name}, here are your results.</h1>
        <p style={{ color: "#888", fontSize: 15, marginTop: 8 }}>Your Unwanted Desire Root Mapping decoded.</p>
      </div>

      {/* Grid layout */}
      <div style={{ display: "grid", gap: 16 }}>

        {/* Arousal Template */}
        <ResultCard title="Your Arousal Template" subtitle={a.arousalTemplateType || "Unknown"} gold>
          {a.arousalTemplateSecondary && <div style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>Secondary: {a.arousalTemplateSecondary}</div>}
          <div style={{ fontSize: 14, color: GOLD, fontStyle: "italic", marginTop: 8 }}>Root Narrative: "{a.rootNarrativeStatement}"</div>
          {a.whatBrainCounterfeits && <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>What your brain counterfeits: {a.whatBrainCounterfeits}</div>}
        </ResultCard>

        {/* Scorecard Radar */}
        <ResultCard title="Your Diagnostic Scorecard">
          <ScoreRadar analysis={a} />
        </ResultCard>

        {/* Imprinting Origin */}
        <ResultCard title="Your Arousal Template Origin">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 4 }}>FIRST EXPOSURE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>Age {a.imprintingAge || "?"}</div>
            </div>
            <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 4 }}>CONTEXT</div>
              <div style={{ fontSize: 14, color: "#ccc" }}>{a.imprintingContext || "Unknown"}</div>
            </div>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#999", margin: 0 }}>{a.imprintingFusion}</p>
        </ResultCard>

        {/* Neuropathway */}
        <ResultCard title="Your Addiction Neuropathway" subtitle={a.neuropathway || "Unknown"}>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Manages: {a.neuropathwayManages || "Unknown"}</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#999", margin: 0 }}>{a.neuropathwayExplanation}</p>
        </ResultCard>

        {/* Behavior Root Map */}
        <ResultCard title="Behavior-Root Map">
          <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>Each behavior traced to its psychological root</div>
          {(a.behaviorRootMap || []).map((item, i) => (
            <ExpandableCard key={i} title={item.behavior} body={item.root} borderColor={GOLD} />
          ))}
        </ResultCard>

        {/* Confusing Patterns */}
        {a.confusingPatternsDecoded && a.confusingPatternsDecoded.length > 0 && (
          <ResultCard title="Confusing Patterns Decoded" gold>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>Patterns you may have never told anyone about</div>
            {a.confusingPatternsDecoded.map((item, i) => (
              <ExpandableCard key={i} title={item.pattern} body={item.explanation} borderColor={GOLD} />
            ))}
          </ResultCard>
        )}

        {/* Attachment Style */}
        <ResultCard title="Your Attachment Style" subtitle={a.attachmentStyle || "Unknown"}>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#999", margin: "0 0 12px" }}>{a.attachmentFuels}</p>
          {a.godAttachment && (
            <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: 8, borderLeft: `3px solid ${GOLD}` }}>
              <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1, marginBottom: 6 }}>HOW THIS SHOWS UP WITH GOD</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: "#999", margin: 0 }}>{a.godAttachment}</p>
            </div>
          )}
        </ResultCard>

        {/* Spiritual Integration */}
        {a.purityCultureImpact && (
          <ResultCard title="Spiritual Integration">
            <p style={{ fontSize: 14, lineHeight: 1.7, color: "#999", margin: 0 }}>{a.purityCultureImpact}</p>
          </ResultCard>
        )}

        {/* Relational Patterns */}
        <ResultCard title="Relational Pattern Scores">
          <RelationalBars analysis={a} />
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {a.codependencyExplanation && <div style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: "#999" }}><strong style={{ color: "#ccc" }}>Codependency:</strong> {a.codependencyExplanation}</div>}
            {a.enmeshmentExplanation && <div style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: "#999" }}><strong style={{ color: "#ccc" }}>Enmeshment:</strong> {a.enmeshmentExplanation}</div>}
            {a.relationalVoidExplanation && <div style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: "#999" }}><strong style={{ color: "#ccc" }}>Relational Void:</strong> {a.relationalVoidExplanation}</div>}
            {a.leadershipBurdenExplanation && <div style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: "#999" }}><strong style={{ color: "#ccc" }}>Leadership Burden:</strong> {a.leadershipBurdenExplanation}</div>}
          </div>
        </ResultCard>

        {/* Life Stress Landscape */}
        {a.lifeStressAnalysis && (
          <ResultCard title="Your Stress Landscape">
            <StressHeatmap analysis={a} />
          </ResultCard>
        )}

        {/* Co-Coping Behaviors */}
        {a.coCopingBehaviors && (
          <ResultCard title="Your Brain's Other Escape Routes">
            <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>Other ways your brain attempts to solve the same root problems</div>
            {Array.isArray(a.coCopingBehaviors) ? a.coCopingBehaviors.map((item, i) => (
              <ExpandableCard key={i} title={item.behavior} body={item.connection} borderColor="#C9A227" />
            )) : (
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "#999", margin: 0 }}>{String(a.coCopingBehaviors)}</p>
            )}
          </ResultCard>
        )}

        {/* Strategy Autopsy */}
        {a.strategyBreakdowns && a.strategyBreakdowns.length > 0 && (
          <ResultCard title="Strategy Audit">
            <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
              {a.strategiesCount || 0} strategies tried over {a.yearsFighting || "many"} years
            </div>
            {a.strategyBreakdowns.map((s, i) => (
              <ExpandableCard key={i} title={s.strategy} body={`Targeted: ${s.targeted}\n\n${s.explanation}`} borderColor="#666" />
            ))}
          </ResultCard>
        )}

        {/* Key Insight */}
        <ResultCard gold style={{ borderColor: `${GOLD}66` }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: GOLD, textTransform: "uppercase", marginBottom: 12 }}>Key Insight</div>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: "#ddd", margin: 0 }}>{a.keyInsight}</p>
        </ResultCard>

        {/* Closing Statement */}
        <ResultCard style={{ background: "linear-gradient(135deg, #1a1505, #111)" }}>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: "#ccc", margin: 0, textAlign: "center", fontStyle: "italic" }}>{a.closingStatement}</p>
        </ResultCard>

        {/* PDF Download */}
        {data.reportUrl && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <a href={data.reportUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-block", padding: "14px 40px",
              background: "linear-gradient(135deg, #DFC468, #9A7730)",
              color: "#000", fontSize: 14, fontWeight: 700, borderRadius: 8,
              textDecoration: "none", letterSpacing: 1,
            }}>DOWNLOAD FULL PDF REPORT</a>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "40px 0 20px", borderTop: "1px solid #1f1f1f", marginTop: 40 }}>
        <div style={{ color: GOLD, fontSize: 11, letterSpacing: 2 }}>#LIVEUNCHAINED</div>
        <div style={{ color: "#444", fontSize: 11, marginTop: 8 }}>Your results are private and confidential.</div>
      </div>
    </div>
  );
}
