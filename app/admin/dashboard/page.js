"use client";
import { useState, useEffect, useCallback } from "react";

const API = "/api/analytics";

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("funnel");
  const [product, setProduct] = useState("udrm");
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";

  const login = () => {
    sessionStorage.setItem("admin_secret", password);
    setAuthed(true);
  };

  const fetchData = useCallback(async () => {
    const s = sessionStorage.getItem("admin_secret");
    if (!s) return;
    setLoading(true);
    try {
      const [sumRes, viewRes] = await Promise.all([
        fetch(`${API}?secret=${encodeURIComponent(s)}&view=summary&product=${product}&days=${days}`),
        fetch(`${API}?secret=${encodeURIComponent(s)}&view=${tab}&product=${product}&days=${days}`),
      ]);
      if (sumRes.status === 401) { setAuthed(false); return; }
      setSummary(await sumRes.json());
      setData(await viewRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [tab, product, days]);

  useEffect(() => {
    if (authed || sessionStorage.getItem("admin_secret")) {
      setAuthed(true);
      fetchData();
    }
  }, [authed, fetchData]);

  // ═══ LOGIN SCREEN ═══
  if (!authed) {
    return (
      <div style={styles.loginWrap}>
        <div style={styles.loginBox}>
          <h1 style={styles.loginTitle}>UNCHAINED ANALYTICS</h1>
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            style={styles.loginInput}
          />
          <button onClick={login} style={styles.loginBtn}>Enter</button>
        </div>
      </div>
    );
  }

  // ═══ DASHBOARD ═══
  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>UNCHAINED ANALYTICS</h1>
        <div style={styles.controls}>
          <select value={product} onChange={e => setProduct(e.target.value)} style={styles.select}>
            <option value="udrm">UDRM Quiz</option>
            <option value="all">All Products</option>
          </select>
          <select value={days} onChange={e => setDays(parseInt(e.target.value))} style={styles.select}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <button onClick={fetchData} style={styles.refreshBtn}>{loading ? "..." : "Refresh"}</button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={styles.cardRow}>
          <SummaryCard label="Quiz Starts" value={summary.quizStarts} color="#c5a55a" />
          <SummaryCard label="Completions" value={summary.completions} color="#4CAF50" />
          <SummaryCard label="Reports Sent" value={summary.reportsGenerated} color="#2196F3" />
          <SummaryCard label="Conversion" value={`${summary.conversionRate}%`} color={parseFloat(summary.conversionRate) > 50 ? "#4CAF50" : parseFloat(summary.conversionRate) > 20 ? "#FF9800" : "#f44336"} />
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        {["funnel", "research", "dropoff", "export"].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
          >
            {t === "funnel" ? "Funnel" : t === "research" ? "Research Data" : t === "dropoff" ? "Drop-off" : "Export CSV"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={styles.content}>
        {tab === "funnel" && data && <FunnelView data={data} />}
        {tab === "research" && data && <ResearchView data={data} />}
        {tab === "dropoff" && data && <DropoffView data={data} />}
        {tab === "export" && <ExportView product={product} days={days} />}
      </div>
    </div>
  );
}

// ═══ SUMMARY CARD ═══
function SummaryCard({ label, value, color }) {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardValue, color }}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  );
}

// ═══ FUNNEL VIEW ═══
function FunnelView({ data }) {
  const { funnel, daily } = data;
  if (!funnel || funnel.length === 0) return <Empty msg="No funnel data yet. Run through the quiz to generate data." />;

  const order = ["quiz_start", "section_1_complete", "section_2_complete", "section_3_complete", "section_4_complete", "section_5_complete", "section_6_complete", "section_7_complete", "reveal_shown", "contact_capture_shown", "contact_capture_complete", "report_generated", "report_emailed"];
  const labels = ["Start", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "Reveal", "Form Shown", "Form Done", "Report Gen", "Emailed"];

  const maxVal = Math.max(...funnel.map(f => parseInt(f.unique_sessions) || 0), 1);
  const funnelMap = {};
  funnel.forEach(f => { funnelMap[f.event_type] = parseInt(f.unique_sessions) || 0; });

  return (
    <div>
      <h2 style={styles.sectionTitle}>Conversion Funnel</h2>
      <div style={styles.funnelWrap}>
        {order.map((key, i) => {
          const val = funnelMap[key] || 0;
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={key} style={styles.funnelRow}>
              <div style={styles.funnelLabel}>{labels[i]}</div>
              <div style={styles.funnelBarBg}>
                <div style={{ ...styles.funnelBar, width: `${pct}%` }} />
              </div>
              <div style={styles.funnelVal}>{val}</div>
            </div>
          );
        })}
      </div>

      {daily && daily.length > 0 && (
        <>
          <h2 style={{ ...styles.sectionTitle, marginTop: 30 }}>Daily Completions</h2>
          <div style={styles.dailyWrap}>
            {daily.map(d => (
              <div key={d.date} style={styles.dailyRow}>
                <span style={styles.dailyDate}>{new Date(d.date).toLocaleDateString()}</span>
                <span style={styles.dailyVal}>{d.completions}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══ RESEARCH VIEW ═══
function ResearchView({ data }) {
  const { distributions, diagnostics, attachments, neuropathways, relational } = data;

  return (
    <div>
      {/* Arousal Template Types */}
      {diagnostics && diagnostics.length > 0 && (
        <div>
          <h2 style={styles.sectionTitle}>Arousal Template Types</h2>
          <BarChart items={diagnostics.map(d => ({ label: d.arousal_template_type || "Unknown", value: parseInt(d.count) }))} color="#c5a55a" />
        </div>
      )}

      {/* Attachment Styles */}
      {attachments && attachments.length > 0 && (
        <div>
          <h2 style={{ ...styles.sectionTitle, marginTop: 30 }}>Attachment Styles</h2>
          <BarChart items={attachments.map(a => ({ label: a.attachment_style || "Unknown", value: parseInt(a.count) }))} color="#2196F3" />
        </div>
      )}

      {/* Neuropathways */}
      {neuropathways && neuropathways.length > 0 && (
        <div>
          <h2 style={{ ...styles.sectionTitle, marginTop: 30 }}>Neuropathways</h2>
          <BarChart items={neuropathways.map(n => ({ label: n.neuropathway || "Unknown", value: parseInt(n.count) }))} color="#4CAF50" />
        </div>
      )}

      {/* Relational Averages */}
      {relational && relational.length > 0 && relational[0].total > 0 && (
        <div>
          <h2 style={{ ...styles.sectionTitle, marginTop: 30 }}>Relational Pattern Averages (n={relational[0].total})</h2>
          <BarChart items={[
            { label: "Codependency", value: parseFloat(relational[0].avg_codependency) || 0 },
            { label: "Enmeshment", value: parseFloat(relational[0].avg_enmeshment) || 0 },
            { label: "Relational Void", value: parseFloat(relational[0].avg_relational_void) || 0 },
            { label: "Leadership Burden", value: parseFloat(relational[0].avg_leadership_burden) || 0 },
          ]} color="#FF9800" maxOverride={3} />
        </div>
      )}

      {/* Answer Distributions */}
      {distributions && distributions.length > 0 && (
        <div>
          <h2 style={{ ...styles.sectionTitle, marginTop: 30 }}>Answer Distributions (Top 30)</h2>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Section</th>
                  <th style={styles.th}>Selection</th>
                  <th style={styles.th}>Count</th>
                </tr>
              </thead>
              <tbody>
                {distributions.slice(0, 30).map((d, i) => (
                  <tr key={i}>
                    <td style={styles.td}>{d.section_num}</td>
                    <td style={styles.td}>{d.selection}</td>
                    <td style={styles.td}>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!diagnostics || diagnostics.length === 0) && <Empty msg="No research data yet. Complete quiz runs will populate this view." />}
    </div>
  );
}

// ═══ DROP-OFF VIEW ═══
function DropoffView({ data }) {
  const { sections, timing } = data;
  if (!sections || sections.length === 0) return <Empty msg="No drop-off data yet." />;

  return (
    <div>
      <h2 style={styles.sectionTitle}>Users Per Section</h2>
      <BarChart items={sections.map(s => ({ label: s.event_type.replace("section_", "S").replace("_complete", ""), value: parseInt(s.users) }))} color="#f44336" />

      {timing && timing.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h2 style={styles.sectionTitle}>Average Time: Start to Completion</h2>
          <div style={styles.timingVal}>{Math.round(timing[0].avg_seconds)}s ({Math.round(timing[0].avg_seconds / 60)}m)</div>
        </div>
      )}
    </div>
  );
}

// ═══ EXPORT VIEW ═══
function ExportView({ product, days }) {
  const secret = sessionStorage.getItem("admin_secret");
  const base = `/api/analytics/export?secret=${encodeURIComponent(secret)}&product=${product}&days=${days}`;

  return (
    <div>
      <h2 style={styles.sectionTitle}>Export Data as CSV</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <a href={`${base}&type=diagnostics`} style={styles.exportBtn}>Download Completed Diagnostics</a>
        <a href={`${base}&type=responses`} style={styles.exportBtn}>Download Quiz Responses</a>
        <a href={`${base}&type=events`} style={styles.exportBtn}>Download All Events</a>
      </div>
    </div>
  );
}

// ═══ SIMPLE BAR CHART ═══
function BarChart({ items, color, maxOverride }) {
  const max = maxOverride || Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ marginTop: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={styles.barRow}>
          <div style={styles.barLabel}>{item.label}</div>
          <div style={styles.barBg}>
            <div style={{ ...styles.bar, width: `${(item.value / max) * 100}%`, background: color }} />
          </div>
          <div style={styles.barVal}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ color: "#666", padding: 40, textAlign: "center", fontSize: 16 }}>{msg}</div>;
}

// ═══ STYLES ═══
const styles = {
  // Layout
  wrap: { minHeight: "100vh", background: "#0a0a0a", color: "#e0e0e0", fontFamily: "'Montserrat', -apple-system, sans-serif", padding: "20px 24px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24, borderBottom: "1px solid #222", paddingBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, color: "#c5a55a", letterSpacing: 2, margin: 0 },
  controls: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  select: { background: "#1a1a1a", color: "#ccc", border: "1px solid #333", borderRadius: 6, padding: "8px 12px", fontSize: 13 },
  refreshBtn: { background: "#c5a55a", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },

  // Summary cards
  cardRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 },
  card: { background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "20px 16px", textAlign: "center" },
  cardValue: { fontSize: 32, fontWeight: 700 },
  cardLabel: { fontSize: 12, color: "#888", marginTop: 6, textTransform: "uppercase", letterSpacing: 1 },

  // Tabs
  tabs: { display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #222", paddingBottom: 0 },
  tab: { background: "transparent", color: "#666", border: "none", borderBottom: "2px solid transparent", padding: "10px 16px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  tabActive: { color: "#c5a55a", borderBottomColor: "#c5a55a" },

  // Content
  content: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: 24, minHeight: 300 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: "#c5a55a", margin: "0 0 12px", letterSpacing: 1 },

  // Funnel
  funnelWrap: { display: "flex", flexDirection: "column", gap: 6 },
  funnelRow: { display: "flex", alignItems: "center", gap: 8 },
  funnelLabel: { width: 90, fontSize: 12, color: "#888", textAlign: "right", flexShrink: 0 },
  funnelBarBg: { flex: 1, height: 24, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" },
  funnelBar: { height: "100%", background: "linear-gradient(90deg, #c5a55a, #9A7730)", borderRadius: 4, transition: "width 0.5s" },
  funnelVal: { width: 40, fontSize: 14, fontWeight: 600, color: "#fff", textAlign: "right" },

  // Daily
  dailyWrap: { display: "flex", flexDirection: "column", gap: 4 },
  dailyRow: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a1a" },
  dailyDate: { fontSize: 13, color: "#888" },
  dailyVal: { fontSize: 14, fontWeight: 600, color: "#4CAF50" },

  // Bar chart
  barRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  barLabel: { width: 160, fontSize: 12, color: "#aaa", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  barBg: { flex: 1, height: 22, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 4, transition: "width 0.5s" },
  barVal: { width: 40, fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "right" },

  // Table
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #333", color: "#c5a55a", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },
  td: { padding: "6px 12px", borderBottom: "1px solid #1a1a1a", color: "#ccc" },

  // Timing
  timingVal: { fontSize: 28, fontWeight: 700, color: "#2196F3" },

  // Export
  exportBtn: { display: "inline-block", background: "#1a1a1a", color: "#c5a55a", border: "1px solid #333", borderRadius: 8, padding: "12px 20px", fontSize: 14, textDecoration: "none", fontWeight: 500, cursor: "pointer" },

  // Login
  loginWrap: { minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" },
  loginBox: { background: "#111", border: "1px solid #222", borderRadius: 12, padding: "40px 32px", textAlign: "center", width: 320 },
  loginTitle: { fontSize: 16, color: "#c5a55a", letterSpacing: 3, marginBottom: 24, fontWeight: 600 },
  loginInput: { width: "100%", background: "#1a1a1a", color: "#ccc", border: "1px solid #333", borderRadius: 8, padding: "12px 14px", fontSize: 14, marginBottom: 12, boxSizing: "border-box" },
  loginBtn: { width: "100%", background: "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};
