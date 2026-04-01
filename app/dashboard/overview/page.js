"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ResultCard from "../components/ResultCard";

const ScoreRadar = dynamic(() => import("../components/ScoreRadar"), { ssr: false });
const RelationalBars = dynamic(() => import("../components/RelationalBars"), { ssr: false });
const StressHeatmap = dynamic(() => import("../components/StressHeatmap"), { ssr: false });
const EscalationGauge = dynamic(() => import("../components/EscalationGauge"), { ssr: false });
const ScorecardBreakdown = dynamic(() => import("../components/ScorecardBreakdown"), { ssr: false });
const NeuropathwayDiagram = dynamic(() => import("../components/NeuropathwayDiagram"), { ssr: false });
const ViceBalanceDiagram = dynamic(() => import("../components/ViceBalanceDiagram"), { ssr: false });
const TrendOverlay = dynamic(() => import("../components/TrendOverlay"), { ssr: false });
import ReportSelector from "../components/ReportSelector";
import { GOLD } from "../constants";

// Fix censored words in stored analysis data
function uncensor(text) {
  if (typeof text !== "string") return text;
  return text.replace(/p\*rn/gi, "porn").replace(/p\*rnography/gi, "pornography");
}

function uncensorDeep(obj) {
  if (typeof obj === "string") return uncensor(obj);
  if (Array.isArray(obj)) return obj.map(uncensorDeep);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = uncensorDeep(v);
    return out;
  }
  return obj;
}

function ContentBlock({ title, body, borderColor }) {
  if (!body) return null;
  const text = uncensor(typeof body === "string" ? body : String(body));
  const paragraphs = text.split("\n").filter(p => p.trim());
  return (
    <div style={{
      background: "#1a1a1a", borderRadius: 10, padding: "16px 18px",
      border: `1px solid ${borderColor || "#2a2a2a"}`, marginBottom: 10,
    }}>
      <div style={{ fontSize: 19, fontWeight: 600, color: borderColor || "#fff", marginBottom: 10 }}>{uncensor(title)}</div>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ margin: "0 0 8px", fontSize: 17, lineHeight: 1.7, color: "#999" }}>{p}</p>
      ))}
    </div>
  );
}

function ResourceCard({ priority, label, price, title, body, link }) {
  const isPrimary = priority === 1;
  const isFree = price === "FREE";
  return (
    <div style={{
      background: "#111", borderRadius: 10, padding: "20px",
      border: `1px solid ${isPrimary ? GOLD + "66" : "#2a2a2a"}`,
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, textTransform: "uppercase" }}>{label}</div>
        <div style={{
          padding: "4px 12px", borderRadius: 4, fontSize: 13, fontWeight: 700,
          background: isFree ? "#14532d" : "#3d2e0a",
          color: isFree ? "#22c55e" : GOLD,
        }}>{price}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{title}</div>
      <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: "0 0 16px" }}>{body}</p>
      <a href={link} target="_blank" rel="noopener noreferrer" style={{
        display: "block", textAlign: "center", padding: "12px",
        background: isPrimary ? "linear-gradient(135deg, #DFC468, #9A7730)" : "none",
        border: isPrimary ? "none" : `1px solid ${GOLD}`,
        color: isPrimary ? "#000" : GOLD,
        fontSize: 13, fontWeight: 700, borderRadius: 8, textDecoration: "none", letterSpacing: 1,
      }}>{isFree ? "ACCESS NOW" : "GET STARTED"}</a>
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState(null);
  const [activeReportIndex, setActiveReportIndex] = useState(-1); // -1 = latest
  const [showTrends, setShowTrends] = useState(false);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [revealedSections, setRevealedSections] = useState(-1); // -1 = not started, increments to reveal sections
  const [freshReveal, setFreshReveal] = useState(false); // true = animate sections in
  const keyInsightRef = useRef(null);
  const nextStepsRef = useRef(null);
  const bridgeRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    let pollTimer = null;
    let cancelled = false;
    let wasPolling = false;

    function fetchResults() {
      fetch("/api/dashboard/results")
        .then(r => r.json())
        .then(d => {
          if (cancelled) return;
          if (d.error) {
            if (d.error.includes("authenticated") || d.error.includes("expired")) {
              router.push("/dashboard/login");
              return;
            }
            // If processing status unknown, show processing screen and poll
            if (d.error.includes("processing") || d.error.includes("No results found")) {
              wasPolling = true;
              setProcessing(true);
              setProcessingStatus({ step: "analyzing", message: "Analyzing your responses..." });
              setLoading(false);
              pollTimer = setTimeout(fetchResults, 4000);
              return;
            }
            setError(d.error);
          } else if (d.processing) {
            // Report is being generated (no existing reports) — show processing screen and poll
            wasPolling = true;
            setProcessing(true);
            setProcessingStatus(d.status || { step: "analyzing", message: "Analyzing your responses..." });
            setLoading(false);
            pollTimer = setTimeout(fetchResults, 4000);
            return;
          } else if (d.newReportProcessing) {
            // Existing user with old reports, but a NEW report is building — show building screen and poll
            wasPolling = true;
            setProcessing(true);
            setProcessingStatus(d.processingStatus || { step: "analyzing", message: "Analyzing your responses..." });
            setData(d); // populate data so old reports are accessible if needed
            setLoading(false);
            pollTimer = setTimeout(fetchResults, 4000);
            return;
          } else {
            if (d.analysis) d.analysis = uncensorDeep(d.analysis);
            if (d.reports) d.reports = d.reports.map(r => r.analysis ? { ...r, analysis: uncensorDeep(r.analysis) } : r);
            // If we were polling (processing), trigger fresh reveal animation
            if (wasPolling) setFreshReveal(true);
            setProcessing(false);
            setProcessingStatus(null);
            setData(d);
            if (d.reports) setActiveReportIndex(d.reports.length - 1);
          }
          setLoading(false);
        })
        .catch(() => { if (!cancelled) { setError("Failed to load results."); setLoading(false); } });
    }

    fetchResults();
    return () => { cancelled = true; if (pollTimer) clearTimeout(pollTimer); };
  }, [router]);

  // Progressive reveal: animate sections in one-by-one
  const TOTAL_SECTIONS = 50;
  useEffect(() => {
    if (!freshReveal || !data) return;
    // Start revealing sections one by one
    setRevealedSections(0);
    let current = 0;
    const timer = setInterval(() => {
      current++;
      setRevealedSections(current);
      if (current >= TOTAL_SECTIONS) clearInterval(timer);
    }, 800);
    return () => clearInterval(timer);
  }, [freshReveal, data]);

  // Auto-incrementing reveal index — no more manual numbering
  const revealCounter = useRef(0);
  revealCounter.current = 0; // reset each render so indices are stable
  const nextRevealIdx = () => revealCounter.current++;

  // Sticky CTA: show after Key Insight, hide at Next Steps
  useEffect(() => {
    if (stickyDismissed) return;
    const keyEl = keyInsightRef.current;
    const nextEl = nextStepsRef.current;
    if (!keyEl || !nextEl) return;

    let keyVisible = false;
    let nextVisible = false;

    const update = () => setShowStickyCta(keyVisible && !nextVisible && !stickyDismissed);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.target === keyEl) keyVisible = e.isIntersecting || e.boundingClientRect.top < 0;
        if (e.target === nextEl) nextVisible = e.isIntersecting;
      });
      update();
    }, { threshold: 0.1 });

    observer.observe(keyEl);
    observer.observe(nextEl);
    return () => observer.disconnect();
  }, [stickyDismissed, data]);

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

  if (!data && !processing) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ color: "#555", fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  const reports = data?.reports || [];
  const activeIdx = activeReportIndex >= 0 && activeReportIndex < reports.length ? activeReportIndex : reports.length - 1;
  const activeReport = reports[activeIdx] || {};
  const a = activeReport.analysis || data?.analysis;
  const name = data?.name || "there";
  const activeReportUrl = activeReport.reportUrl || data?.reportUrl;
  const activeGeneratedAt = activeReport.generatedAt || data?.generatedAt;

  if (processing || !a) {
    const statusMsg = processingStatus?.message || "Analyzing your responses...";
    const statusStep = processingStatus?.step || "analyzing";
    const progressMessages = [
      { step: "analyzing", label: "Analyzing your responses", detail: "Your conversation is being read at the root level. Every answer you gave is being mapped." },
      { step: "complete", label: "Building your root map", detail: "Your personalized diagnostic sections are being assembled now." },
      { step: "pdf_ready", label: "Generating your PDF report", detail: "A downloadable copy of your full report is being created." },
      { step: "emailed", label: "Sending your report", detail: "Your report is being delivered to your inbox now." },
    ];
    const currentProgress = progressMessages.find(p => p.step === statusStep) || progressMessages[0];
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", maxWidth: 440, padding: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/unchained-logo.png" alt="Unchained Leader" style={{ height: 40, width: "auto", marginBottom: 24 }} />
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>YOUR SECURE PORTAL</div>
          <div style={{ color: "#ccc", fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Building Your Root Map Live</div>

          {/* Spinner */}
          <div style={{ marginBottom: 32 }}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%", margin: "0 auto 20px",
              border: `2px solid ${GOLD}44`,
              borderTopColor: GOLD,
              animation: "spin 1.2s linear infinite",
            }} />
            <div style={{ color: "#ccc", fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{currentProgress.label}</div>
            <div style={{ color: "#777", fontSize: 17, lineHeight: 1.6 }}>{currentProgress.detail}</div>
          </div>

          {/* Progress steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", maxWidth: 300, margin: "0 auto" }}>
            {progressMessages.map((p, i) => {
              const isActive = p.step === statusStep;
              const isPast = progressMessages.indexOf(progressMessages.find(pm => pm.step === statusStep)) > i;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                    background: isPast ? GOLD : isActive ? `${GOLD}44` : "#222",
                    border: isActive ? `2px solid ${GOLD}` : isPast ? "none" : "1px solid #333",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: isPast ? "#000" : isActive ? GOLD : "#555",
                    fontWeight: 700,
                  }}>{isPast ? "✓" : i + 1}</div>
                  <div style={{ fontSize: 13, color: isActive ? "#ccc" : isPast ? "#888" : "#555" }}>{p.label}</div>
                </div>
              );
            })}
          </div>

          <div style={{ color: "#555", fontSize: 12, marginTop: 32 }}>Your results will appear on this page. This typically takes 2–3 minutes.</div>

          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </div>
    );
  }

  // Reveal wrapper — sections fade in progressively or show instantly
  const isRevealing = freshReveal && revealedSections >= 0;
  const Reveal = ({ idx, children }) => isRevealing ? (
    <div style={{
      opacity: revealedSections >= idx ? 1 : 0,
      transform: revealedSections >= idx ? "translateY(0)" : "translateY(20px)",
      transition: "opacity 0.6s ease, transform 0.6s ease",
    }}>{children}</div>
  ) : <>{children}</>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, paddingBottom: 16, borderBottom: "1px solid #1f1f1f" }}>
        <div>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Unchained Leader</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Your Root Mapping Results</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {reports.length > 1 && (
            <button onClick={() => setShowTrends(!showTrends)} style={{
              padding: "8px 16px", background: showTrends ? `${GOLD}22` : "none",
              border: `1px solid ${showTrends ? GOLD : "#333"}`, color: showTrends ? GOLD : "#888",
              fontSize: 12, borderRadius: 6, cursor: "pointer", fontWeight: showTrends ? 700 : 400,
            }}>{showTrends ? "VIEW REPORT" : "TRENDS"}</button>
          )}
          {activeReportUrl && (
            <a href={activeReportUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", background: "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", fontSize: 12, fontWeight: 700, borderRadius: 6, textDecoration: "none", letterSpacing: 1 }}>PDF REPORT</a>
          )}
          <button onClick={handleLogout} style={{ padding: "8px 16px", background: "none", border: "1px solid #333", color: "#888", fontSize: 12, borderRadius: 6, cursor: "pointer" }}>Sign Out</button>
        </div>
      </div>

      {/* Report Selector */}
      <ReportSelector reports={reports} activeIndex={activeIdx} onSelect={(i) => { setActiveReportIndex(i); setShowTrends(false); }} />

      {/* Trend Overlay View */}
      {showTrends && reports.length > 1 ? (
        <div style={{ display: "grid", gap: 16 }}>
          <ResultCard title="Progress Over Time" gold>
            <div style={{ fontSize: 17, color: "#888", marginBottom: 16 }}>
              {reports.length} assessments from {new Date(reports[0]?.generatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })} to {new Date(reports[reports.length - 1]?.generatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </div>
            <TrendOverlay reports={reports} />
          </ResultCard>
        </div>
      ) : (
      <>
      {/* Cover / Hero Section */}
      <Reveal idx={nextRevealIdx()}>
      <div style={{
        textAlign: "center", padding: "40px 20px 32px",
        background: "linear-gradient(180deg, #111 0%, #0a0a0a 100%)",
        borderRadius: 16, border: `1px solid ${GOLD}22`, marginBottom: 24,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/unchained-logo.png" alt="Unchained Leader" style={{ height: 50, width: "auto", marginBottom: 20 }} />
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#fff", lineHeight: 1.3 }}>UNWANTED DESIRE</h1>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 20px", color: "#fff", lineHeight: 1.3 }}>ROOT MAPPING</h1>
        <div style={{ width: 60, height: 2, background: GOLD, margin: "0 auto 20px" }} />
        <div style={{ fontSize: 19, color: "#ccc" }}>Personalized for {name}</div>
        <div style={{ fontSize: 17, color: "#888", marginTop: 6 }}>{activeGeneratedAt ? new Date(activeGeneratedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
        <div style={{ fontSize: 11, color: "#555", letterSpacing: 3, marginTop: 12 }}>CONFIDENTIAL</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 16, maxWidth: 500, margin: "16px auto 0", lineHeight: 1.5 }}>
          This diagnostic was developed by Mason Cain, PSAP, PMAP, credentialed through the International Institute for Trauma and Addiction Professionals. Unchained Leader is a LegitScript-certified program.
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/legitscript-badge.png" alt="LegitScript Certified" style={{ maxWidth: 200, width: "100%", height: "auto", marginTop: 16 }} />
        <div style={{ fontSize: 9, color: "#555", marginTop: 20, maxWidth: 520, margin: "20px auto 0", lineHeight: 1.6 }}>
          DISCLAIMER: This report is not intended for clinical use. It is not a diagnosis, a treatment plan, or a substitute for professional counseling or therapy. It is a personalized educational resource designed to help increase understanding of unwanted behaviors and increase hope that freedom is possible. If you are in crisis or experiencing thoughts of self-harm, please contact the 988 Suicide &amp; Crisis Lifeline immediately.
        </div>
      </div>
      </Reveal>

      {/* Grid layout */}
      <div style={{ display: "grid", gap: 16 }}>

        {/* Arousal Template */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard title="Your Arousal Template Archetype" subtitle={a.arousalTemplateType || "Unknown"} gold>
          {a.arousalTemplateSecondary && <div style={{ fontSize: 17, color: "#888", marginBottom: 8 }}>Secondary: {a.arousalTemplateSecondary}</div>}
          <p style={{ fontSize: 17, color: "#999", lineHeight: 1.7, marginTop: 10, marginBottom: 0 }}>As you read the report below, you will start to understand what this means, why it is so important, and how this new clarity will lead you to freedom.</p>
        </ResultCard>
        </Reveal>

        {/* Scorecard Radar */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard title="Your Diagnostic Scorecard">
          <ScoreRadar analysis={a} />
        </ResultCard>
        </Reveal>

        {/* Scorecard Breakdown Bars */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard title="Scorecard Breakdown">
          <ScorecardBreakdown analysis={a} />
        </ResultCard>
        </Reveal>

        {/* Imprinting Origin */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard title="Your Arousal Template Origin">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 4 }}>FIRST EXPOSURE</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Age {a.imprintingAge || "?"}</div>
            </div>
            <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 4 }}>CONTEXT</div>
              <div style={{ fontSize: 17, color: "#ccc" }}>{a.imprintingContext || "Unknown"}</div>
            </div>
          </div>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: 0 }}>{a.imprintingFusion}</p>
        </ResultCard>
        </Reveal>

        {/* Neuropathway */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard title="Your Addiction Neuropathway" subtitle={a.neuropathway || "Unknown"}>
          <div style={{ fontSize: 17, color: "#888", marginBottom: 12 }}>Manages: {a.neuropathwayManages || "Unknown"}</div>
          <NeuropathwayDiagram neuropathway={a.neuropathway} manages={a.neuropathwayManages} />
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: "12px 0 0" }}>{a.neuropathwayExplanation}</p>
        </ResultCard>
        </Reveal>

        {/* Escalation Gauge */}
        {a.escalationPresent && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Escalation Risk">
            <EscalationGauge severity={Number(a.escalationSeverity) || 0} years={a.yearsFighting || a.patternYears || "many"} />
          </ResultCard>
          </Reveal>
        )}

        {/* Prepare Your Mind — Mason's personal message */}
        <Reveal idx={nextRevealIdx()}>
        <div style={{
          background: "#111111",
          borderRadius: 16,
          padding: "40px 32px",
          borderLeft: `3px solid ${GOLD}`,
          margin: "0 0 20px",
        }}>
          <h3 style={{ fontFamily: "'Cinzel', serif", color: GOLD, fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
            Prepare Your Mind
          </h3>
          <div style={{ fontSize: 17, lineHeight: 1.8, color: "#999" }}>
            <p style={{ marginBottom: 16 }}>What we are about to dive into may feel extremely heavy and I want to expose a lie that I bought for most of my life.</p>
            <p style={{ marginBottom: 16 }}>I believed I was one of the few men with a mind as twisted as mine was.</p>
            <p style={{ marginBottom: 16 }}>God exposed this lie for me in a powerful way, so I want to share that gift with you.</p>
            <p style={{ marginBottom: 16 }}>As I&apos;m writing this, over 500,000 have connected with Unchained Leader products in some form.</p>
            <p style={{ marginBottom: 16 }}>Over 10,000 have come through our core programs.</p>
            <p style={{ marginBottom: 16 }}>Thousands of men are working towards conquering the very things this report is going to uncover for you, and I&apos;ve watched thousands of men break these exact chains.</p>
            <p style={{ marginBottom: 16 }}>Even that, is a small portion of the millions of others who haven&apos;t taken steps towards freedom like you&apos;re doing today.</p>
            <p style={{ marginBottom: 16 }}>You are one of the majority who are battling these exact things, not the minority like I felt for most my life.</p>
            <p style={{ marginBottom: 16, color: GOLD, fontWeight: 600 }}>Lean into the light.</p>
            <p style={{ marginBottom: 24 }}>The freedom God had for me, is for you too.</p>
            <p style={{ fontStyle: "italic", color: GOLD, fontSize: 18 }}>&mdash; Mason</p>
          </div>
        </div>
        </Reveal>

        {/* Behavior Root Map — fully expanded */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard title="Behavior-Root Map">
          <div style={{ fontSize: 17, color: "#888", marginBottom: 12 }}>Each behavior traced to its psychological root</div>
          {(a.behaviorRootMap || []).map((item, i) => (
            <ContentBlock key={i} title={item.behavior} body={item.root} borderColor={GOLD} />
          ))}
        </ResultCard>
        </Reveal>

        {/* Confusing Patterns — fully expanded */}
        {a.confusingPatternsDecoded && a.confusingPatternsDecoded.length > 0 && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Confusing Patterns Decoded" gold>
            <div style={{ fontSize: 17, color: "#888", marginBottom: 12 }}>Patterns you may have never told anyone about</div>
            {a.confusingPatternsDecoded.map((item, i) => (
              <ContentBlock key={i} title={item.pattern} body={item.explanation} borderColor={GOLD} />
            ))}
          </ResultCard>
          </Reveal>
        )}

        {/* Gap-widening */}
        {a.confusingPatternsDecoded && a.confusingPatternsDecoded.length > 0 && (
          <Reveal idx={nextRevealIdx()}>
          <div style={{ textAlign: "center", padding: "12px 20px", fontSize: 17, fontStyle: "italic", color: `${GOLD}99`, lineHeight: 1.7 }}>
            These patterns did not form by accident. They were encoded in a system designed to stay hidden.
          </div>
          </Reveal>
        )}

        {/* Attachment Style */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard title="Your Attachment Style" subtitle={a.attachmentStyle || "Unknown"}>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: "0 0 12px" }}>{a.attachmentFuels}</p>
          {a.godAttachment && (
            <div style={{ padding: "12px 16px", background: "#1a1a1a", borderRadius: 8, borderLeft: `3px solid ${GOLD}` }}>
              <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1, marginBottom: 6 }}>HOW THIS SHOWS UP WITH GOD</div>
              <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: 0 }}>{a.godAttachment}</p>
            </div>
          )}
        </ResultCard>
        </Reveal>

        {/* Spiritual Integration */}
        {a.purityCultureImpact && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Spiritual Integration">
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: 0 }}>{a.purityCultureImpact}</p>
          </ResultCard>
          </Reveal>
        )}

        {/* Generational Context */}
        {a.generationalLens && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Your Generational Context" subtitle={a.generationalCohort || "Your Cohort"}>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: "0 0 12px" }}>{a.generationalLens}</p>
            <div style={{ textAlign: "center", padding: "10px 16px", fontSize: 17, fontStyle: "italic", color: `${GOLD}99`, lineHeight: 1.7 }}>
              You did not choose the generation you were born into. But you are choosing what happens next.
            </div>
          </ResultCard>
          </Reveal>
        )}

        {/* Relational Patterns */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard title="Relational Pattern Scores">
          <RelationalBars analysis={a} />
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {a.codependencyExplanation && <div style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, fontSize: 17, lineHeight: 1.6, color: "#999" }}><strong style={{ color: "#ccc" }}>Codependency:</strong> {a.codependencyExplanation}</div>}
            {a.enmeshmentExplanation && <div style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, fontSize: 17, lineHeight: 1.6, color: "#999" }}><strong style={{ color: "#ccc" }}>Enmeshment:</strong> {a.enmeshmentExplanation}</div>}
            {a.relationalVoidExplanation && <div style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, fontSize: 17, lineHeight: 1.6, color: "#999" }}><strong style={{ color: "#ccc" }}>Relational Void:</strong> {a.relationalVoidExplanation}</div>}
            {a.leadershipBurdenExplanation && <div style={{ padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, fontSize: 17, lineHeight: 1.6, color: "#999" }}><strong style={{ color: "#ccc" }}>Leadership Burden:</strong> {a.leadershipBurdenExplanation}</div>}
          </div>
        </ResultCard>

        {/* Gap-widening */}
        <div style={{ textAlign: "center", padding: "12px 20px", fontSize: 17, fontStyle: "italic", color: `${GOLD}99`, lineHeight: 1.7 }}>
          The relational patterns in your life are not separate from your behavior. They are the soil it grows in.
        </div>
        </Reveal>

        {/* Isolation Indicator */}
        {a.isolationScore > 0 && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Isolation Level">
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
              <div style={{ flex: 1, background: "#1a1a1a", borderRadius: 8, height: 20, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min((Number(a.isolationScore) / 5) * 100, 100)}%`,
                  height: "100%",
                  background: Number(a.isolationScore) >= 4 ? "linear-gradient(90deg, #ef4444, #dc2626)" : Number(a.isolationScore) >= 2 ? "linear-gradient(90deg, #f59e0b, #d97706)" : "linear-gradient(90deg, #22c55e, #16a34a)",
                  borderRadius: 8,
                  transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", minWidth: 40, textAlign: "right" }}>{a.isolationScore}/5</div>
            </div>
            <div style={{ fontSize: 17, color: "#888" }}>
              {a.isolationLevel ? `Level: ${a.isolationLevel}` : `${Number(a.isolationScore) >= 4 ? "High isolation — the cycle thrives in secrecy" : Number(a.isolationScore) >= 2 ? "Moderate isolation detected" : "Low isolation"}`}
            </div>
          </ResultCard>
          </Reveal>
        )}

        {/* Life Stress Landscape */}
        {a.lifeStressAnalysis && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Your Stress Landscape">
            <StressHeatmap analysis={a} />
          </ResultCard>
          </Reveal>
        )}

        {/* Gap-widening */}
        {a.lifeStressAnalysis && (
          <Reveal idx={nextRevealIdx()}>
          <div style={{ textAlign: "center", padding: "12px 20px", fontSize: 17, fontStyle: "italic", color: `${GOLD}99`, lineHeight: 1.7 }}>
            Root-level healing does not just address behavior. It rebuilds your capacity to carry the weight of real life.
          </div>
          </Reveal>
        )}

        {/* Co-Coping Behaviors — fully expanded */}
        {a.coCopingBehaviors && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Your Brain's Other Escape Routes">
            <div style={{ fontSize: 17, color: "#888", marginBottom: 12 }}>Other ways your brain attempts to solve the same root problems</div>
            {Array.isArray(a.coCopingBehaviors) ? a.coCopingBehaviors.map((item, i) => (
              <ContentBlock key={i} title={item.behavior} body={item.connection} borderColor={GOLD} />
            )) : (
              <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: 0 }}>{String(a.coCopingBehaviors)}</p>
            )}
          </ResultCard>
          </Reveal>
        )}

        {/* Substance vs Behavior Vice Diagram */}
        {a.coCopingBehaviors && Array.isArray(a.coCopingBehaviors) && a.coCopingBehaviors.length > 0 && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Substance vs. Behavior — Same Root">
            <ViceBalanceDiagram coCopingBehaviors={a.coCopingBehaviors} />
          </ResultCard>
          </Reveal>
        )}

        {/* Gap-widening */}
        {a.coCopingBehaviors && Array.isArray(a.coCopingBehaviors) && a.coCopingBehaviors.length > 0 && (
          <Reveal idx={nextRevealIdx()}>
          <div style={{ textAlign: "center", padding: "12px 20px", fontSize: 17, fontStyle: "italic", color: `${GOLD}99`, lineHeight: 1.7 }}>
            You cannot win whack-a-mole with your nervous system. Every time you shut down one behavior without addressing the root, your brain finds another.
          </div>
          </Reveal>
        )}

        {/* Strategy Audit — fully expanded */}
        {a.strategyBreakdowns && a.strategyBreakdowns.length > 0 && (
          <Reveal idx={nextRevealIdx()}>
          <ResultCard title="Strategy Audit">
            <div style={{ fontSize: 17, color: "#888", marginBottom: 12 }}>
              {a.strategiesCount || 0} strategies tried over {a.yearsFighting || "many"} years
            </div>
            {a.strategyBreakdowns.map((s, i) => (
              <ContentBlock key={i} title={s.strategy} body={`Targeted: ${s.targeted}\n\n${s.explanation}`} borderColor={GOLD} />
            ))}
          </ResultCard>
          </Reveal>
        )}

        {/* Gap-widening after Strategy Audit */}
        {a.strategyBreakdowns && a.strategyBreakdowns.length > 0 && (
          <Reveal idx={nextRevealIdx()}>
          <div style={{ textAlign: "center", padding: "12px 20px", fontSize: 17, fontStyle: "italic", color: `${GOLD}99`, lineHeight: 1.7 }}>
            Every strategy on this list was aimed at managing behavior. Not one reached the root. That is not a failure of effort. It is a failure of targeting.
          </div>
          </Reveal>
        )}

        {/* Full Picture Bridge — synthesizes everything into one devastating paragraph */}
        <Reveal idx={nextRevealIdx()}>
        <div ref={bridgeRef} style={{
          background: "#0d0d0d", borderRadius: 12, padding: "28px 24px",
          borderTop: `3px solid ${GOLD}`, marginBottom: 0,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>YOUR FULL PICTURE</div>
          <p style={{ fontSize: 17, lineHeight: 1.8, color: "#bbb", margin: "0 0 20px", textAlign: "center" }}>
            Here is what your diagnostic revealed: A root narrative of &ldquo;{a.rootNarrativeStatement || "a core wound"}&rdquo; formed in childhood, encoded into a {a.arousalTemplateType || "specific"} arousal template at age {a.imprintingAge || "unknown"}, running through the {a.neuropathway || "primary"} neuropathway, reinforced by {a.attachmentStyle || "your"} attachment, and defended against by {a.strategiesCount || "multiple"} strategies over {a.yearsFighting || "many"} years. None of those strategies failed because of you. They failed because they were aimed at a system they could not see.
          </p>
          <p style={{ fontSize: 19, lineHeight: 1.8, color: "#fff", margin: 0, textAlign: "center", fontWeight: 600 }}>
            You can see the system now. Most men never get this far. But seeing the prison does not open the door.
          </p>
        </div>
        </Reveal>

        {/* Key Insight */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard ref={keyInsightRef} gold style={{ borderColor: `${GOLD}66` }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: GOLD, textTransform: "uppercase", marginBottom: 12 }}>Key Insight</div>
          {(a.keyInsight || "").split(/(?<=\.)\s+/).reduce((acc, sentence, i, arr) => {
            const chunkSize = 3;
            const ci = Math.floor(i / chunkSize);
            if (!acc[ci]) acc[ci] = [];
            acc[ci].push(sentence);
            if (i === arr.length - 1) return acc.map((chunk, j) => (
              <p key={j} style={{ fontSize: 17, lineHeight: 1.8, color: "#ddd", margin: 0, marginBottom: j < acc.length - 1 ? 14 : 0 }}>{chunk.join(" ")}</p>
            ));
            return acc;
          }, [])}
        </ResultCard>
        </Reveal>

        {/* Closing Statement */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard style={{ background: "linear-gradient(135deg, #1a1505, #111)" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, textTransform: "uppercase", marginBottom: 14, textAlign: "center" }}>WHAT THIS MEANS</div>
          <p style={{ fontSize: 19, lineHeight: 1.8, color: "#ccc", margin: "0 0 20px", textAlign: "center", fontStyle: "italic" }}>{a.closingStatement}</p>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "#fff", margin: 0, textAlign: "center", fontWeight: 600 }}>The path is laid out. The question is whether you will take the first step.</p>
        </ResultCard>
        </Reveal>

        {/* Transformation Roadmap */}
        <Reveal idx={nextRevealIdx()}>
        <ResultCard style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "28px 24px 0", textAlign: "center" }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>Romans 12:2</div>
            <h3 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 6px", letterSpacing: 1 }}>Do Not Conform. Transform.</h3>
            <p style={{ fontSize: 17, color: "#777", margin: "0 0 24px", fontStyle: "italic", lineHeight: 1.6 }}>
              &ldquo;Do not conform to the pattern of this world, but be transformed by the renewing of your mind.&rdquo;
            </p>
          </div>

          {/* Roadmap */}
          <div style={{ padding: "0 24px 28px", position: "relative" }}>
            {/* Vertical line */}
            <div style={{ position: "absolute", left: 47, top: 0, bottom: 28, width: 2, background: "linear-gradient(to bottom, " + GOLD + ", #333 37%, #222 100%)" }} />

            {[
              { phase: 1, title: "Understanding", desc: "Your diagnostic revealed the system of root narratives driving your pattern.", progress: 37, active: true, complete: false },
              { phase: 2, title: "Identifying Your Unique Roots", desc: "Map every root narrative encoded across your story, including the ones you cannot see on your own.", progress: 0, active: false, complete: false },
              { phase: 3, title: "Solving Your Unique Roots", desc: "Restructure each root narrative at the neurological and spiritual level through guided RNR.", progress: 0, active: false, complete: false },
              { phase: 4, title: "Living Without Controlling Urges", desc: "Experience life where unwanted desires no longer have control over you.", progress: 0, active: false, complete: false },
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 16, marginBottom: i < 3 ? 24 : 0, position: "relative", zIndex: 1 }}>
                {/* Circle marker */}
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  background: step.active ? GOLD : "#1a1a1a",
                  border: step.active ? "none" : "2px solid #333",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                  color: step.active ? "#000" : "#555",
                  marginTop: 2,
                }}>
                  {step.phase}
                </div>
                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, letterSpacing: 1.5, color: step.active ? GOLD : "#555", textTransform: "uppercase" }}>Phase {step.phase}</span>
                    {step.active && <span style={{ fontSize: 9, letterSpacing: 1, color: "#000", background: GOLD, padding: "2px 8px", borderRadius: 3, fontWeight: 700 }}>YOU ARE HERE</span>}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 600, color: step.active ? "#fff" : "#666", marginBottom: 6 }}>{step.title}</div>
                  <p style={{ fontSize: 17, lineHeight: 1.6, color: step.active ? "#999" : "#444", margin: 0 }}>{step.desc}</p>
                  {step.active && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#777", marginBottom: 4 }}>
                        <span>Progress</span>
                        <span style={{ color: GOLD }}>{step.progress}% complete</span>
                      </div>
                      <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: step.progress + "%", background: `linear-gradient(90deg, ${GOLD}, ${GOLD}88)`, borderRadius: 2 }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Divider line between Phase 1 and Phase 2-4 */}
            <div style={{ margin: "0 0 0 44px", padding: "16px 0 0", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${GOLD}44, transparent)` }} />
              </div>
              <div style={{ fontSize: 15, color: "#888", lineHeight: 1.6, marginTop: 8, paddingLeft: 0 }}>
                <span style={{ color: GOLD }}>Phase 1</span> is what this report gave you: understanding. <span style={{ color: GOLD }}>Phases 2, 3, and 4</span> are what your recommended next steps below are designed to take you through.
              </div>
            </div>
          </div>
        </ResultCard>
        </Reveal>

        {/* Next Steps & Resources */}
        <Reveal idx={nextRevealIdx()}>
        <div ref={nextStepsRef} style={{ display: "grid", gap: 0 }}>
          {/* Personalized recommendation */}
          <ResultCard title="Your Recommended Next Step">
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "#999", margin: "0 0 16px" }}>
              {name}, based on your {a.arousalTemplateType || "primary"} pattern, {a.neuropathway || "identified"} neuropathway, and {a.attachmentStyle || "your"} attachment style, this is the recommended next step for your specific diagnostic:
            </p>
            <ResourceCard
              priority={1}
              label="PRIORITY 1 — YOUR NEXT STEP"
              price="FREE"
              title="Watch the Art of Freedom Training"
              body={`${name}, your diagnostic revealed ${a.arousalTemplateType || "your primary pattern"} as your primary pattern with ${a.neuropathway || "a specific neuropathway"} as the driving mechanism. The Art of Freedom Training walks you through the exact process used to address unwanted behaviors at the root level, not the behavioral level where everything you have tried has been aimed. After the training, you can apply to speak with one of our certified support coaches about our 90 Days to Freedom core program. Your diagnostic is the map of the maze. This training shows you the door out.`}
              link="https://unchained-leader.com/aof"
            />
            <div style={{ fontSize: 14, color: "#666", textAlign: "center", marginTop: 4 }}>
              Trusted by over 10,000 men across 33 countries. LegitScript-certified.
            </div>
          </ResultCard>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
            <div style={{ fontSize: 11, letterSpacing: 2, color: "#555", whiteSpace: "nowrap" }}>ADDITIONAL RESOURCES</div>
            <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
          </div>

          {/* Secondary options — more compact */}
          <div style={{ display: "grid", gap: 12, padding: "8px 0" }}>
            <ResourceCard
              priority={2}
              label="OPTION 2"
              price="$27"
              title="Book a 30-Minute Clarity Call"
              body="Your report identified patterns that go deeper than any PDF can resolve. On a 30-minute Clarity Call, a certified Unchained Leader coach who has walked this exact road will review your full diagnostic, show you the specific reason each strategy you have tried was aimed at the wrong target, and build a custom plan based on your specific root narrative and attachment style. He will have your complete data in front of him before the call starts."
              link="https://unchained-leader.com/clarity-call"
            />
            <ResourceCard
              priority={3}
              label="OPTION 3"
              price="FREE"
              title="7-Day Devotional: 7 Lies of the Divided Leader"
              body="A 7-day guided experience that dismantles the most common lies keeping Christian men stuck in the cycle. Each day fuses Scripture with neuroscience to reframe how you see your struggle, your identity, and your path to freedom. Built specifically for men like you."
              link="https://unchained-leader.com/7-lies"
            />
            <ResourceCard
              priority={4}
              label="OPTION 4"
              price="$27"
              title="The Unchained Leader Black Book"
              body="The complete Unchained Leader framework in your hands. Covers the neuroscience of unwanted behavior, the root narrative system, the shame loop, the strategy autopsy, and the path to Root Narrative Restructuring. Written by Mason Cain from 17 years of personal experience and extensive research."
              link="https://unchained-leader.com/black-book"
            />
          </div>
        </div>
        </Reveal>

        {/* PDF Download */}
        {activeReportUrl && (
          <Reveal idx={nextRevealIdx()}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <a href={activeReportUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-block", padding: "14px 40px",
              background: "linear-gradient(135deg, #DFC468, #9A7730)",
              color: "#000", fontSize: 14, fontWeight: 700, borderRadius: 8,
              textDecoration: "none", letterSpacing: 1,
            }}>DOWNLOAD FULL PDF REPORT</a>
          </div>
          </Reveal>
        )}

      </div>
      </>)}

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "40px 0 20px", borderTop: "1px solid #1f1f1f", marginTop: 40 }}>
        <div style={{ color: GOLD, fontSize: 11, letterSpacing: 2 }}>#LIVEUNCHAINED</div>
        <div style={{ color: "#444", fontSize: 11, marginTop: 8 }}>Your results are private and confidential.</div>
      </div>

      {/* Sticky CTA bar — appears after Key Insight, hides at Next Steps */}
      {showStickyCta && !stickyDismissed && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1000,
          background: "#111", borderTop: `2px solid ${GOLD}`,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.6)",
          padding: "12px 20px",
          display: "flex", justifyContent: "center", alignItems: "center", gap: 16,
        }}>
          <span style={{ fontSize: 17, color: "#ccc" }}>Ready to take the next step?</span>
          <a href="https://unchained-leader.com/aof" target="_blank" rel="noopener noreferrer" style={{
            padding: "10px 24px", background: "linear-gradient(135deg, #DFC468, #9A7730)",
            color: "#000", fontSize: 12, fontWeight: 700, borderRadius: 6,
            textDecoration: "none", letterSpacing: 1,
          }}>WATCH THE FREE TRAINING</a>
          <button onClick={() => setStickyDismissed(true)} style={{
            background: "none", border: "none", color: "#555", fontSize: 18,
            cursor: "pointer", padding: "0 4px", lineHeight: 1,
          }}>&times;</button>
        </div>
      )}
    </div>
  );
}
