"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const API = "/api/analytics";
const HEALTH_API = "/api/health";

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("funnel");
  const [product, setProduct] = useState("udrm");
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const intervalRef = useRef(null);

  const getSecret = () => typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";

  const login = () => {
    sessionStorage.setItem("admin_secret", password);
    setAuthed(true);
  };

  const fetchData = useCallback(async () => {
    const s = getSecret();
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
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [tab, product, days]);

  useEffect(() => {
    if (authed || (typeof window !== "undefined" && sessionStorage.getItem("admin_secret"))) {
      setAuthed(true);
      fetchData();
    }
  }, [authed, fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && authed) {
      intervalRef.current = setInterval(fetchData, 60000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, authed, fetchData]);

  // ═══ LOGIN ═══
  if (!authed) {
    return (
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <h1 style={S.loginTitle}>UNCHAINED ANALYTICS</h1>
          <input type="password" placeholder="Admin Password" value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} style={S.loginInput} />
          <button onClick={login} style={S.loginBtn}>Enter</button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "funnel", label: "Funnel" },
    { id: "trends", label: "Trends" },
    { id: "research", label: "Research" },
    { id: "dropoff", label: "Drop-off" },
    { id: "devices", label: "Devices" },
    { id: "cohort", label: "Cohort" },
    { id: "health", label: "System Health" },
    { id: "export", label: "Export" },
  ];

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <h1 style={S.title}>UNCHAINED ANALYTICS</h1>
        <div style={S.controls}>
          <select value={product} onChange={e => setProduct(e.target.value)} style={S.select}>
            <option value="udrm">UDRM Quiz</option>
            <option value="all">All Products</option>
          </select>
          <select value={days} onChange={e => setDays(parseInt(e.target.value))} style={S.select}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
          <label style={S.autoLabel}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
          <button onClick={fetchData} style={S.refreshBtn}>{loading ? "..." : "Refresh"}</button>
          {lastRefresh && <span style={S.lastRefresh}>Updated {lastRefresh.toLocaleTimeString()}</span>}
        </div>
      </div>

      {summary && (
        <div style={S.cardRow}>
          <Card label="Quiz Starts" value={summary.quizStarts} color="#c5a55a" />
          <Card label="Completions" value={summary.completions} color="#4CAF50" />
          <Card label="Reports Sent" value={summary.reportsGenerated} color="#2196F3" />
          <Card label="Conversion" value={`${summary.conversionRate}%`}
            color={parseFloat(summary.conversionRate) > 50 ? "#4CAF50" : parseFloat(summary.conversionRate) > 20 ? "#FF9800" : "#f44336"} />
        </div>
      )}

      <div style={S.tabs}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...S.tab, ...(tab === t.id ? S.tabActive : {}) }}>{t.label}</button>
        ))}
      </div>

      <div style={S.content}>
        {tab === "funnel" && data && <FunnelView data={data} />}
        {tab === "trends" && <TrendsView product={product} days={days} />}
        {tab === "research" && data && <ResearchView data={data} />}
        {tab === "dropoff" && data && <DropoffView data={data} />}
        {tab === "devices" && data && <DevicesView data={data} />}
        {tab === "cohort" && data && <CohortView data={data} />}
        {tab === "health" && <HealthView />}
        {tab === "export" && <ExportView product={product} days={days} />}
      </div>
    </div>
  );
}

function Card({ label, value, color }) {
  return (
    <div style={S.card}>
      <div style={{ ...S.cardValue, color }}>{value}</div>
      <div style={S.cardLabel}>{label}</div>
    </div>
  );
}

// ═══ FUNNEL ═══
function FunnelView({ data }) {
  const { funnel, daily } = data;
  if (!funnel || funnel.length === 0) return <Empty msg="No funnel data yet." />;

  const order = ["quiz_start","section_1_complete","section_2_complete","section_3_complete","section_4_complete","section_5_complete","section_6_complete","section_7_complete","reveal_shown","contact_capture_shown","contact_capture_complete","report_generated","report_emailed"];
  const labels = ["Start","S1","S2","S3","S4","S5","S6","S7","Reveal","Form Shown","Form Done","Report Gen","Emailed"];

  const fMap = {};
  funnel.forEach(f => { fMap[f.event_type] = parseInt(f.unique_sessions) || 0; });
  const maxVal = Math.max(...order.map(k => fMap[k] || 0), 1);

  return (
    <div>
      <h2 style={S.sectionTitle}>Conversion Funnel</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {order.map((key, i) => {
          const val = fMap[key] || 0;
          const prev = i > 0 ? (fMap[order[i - 1]] || 0) : val;
          const dropPct = prev > 0 ? ((val / prev) * 100).toFixed(0) : "—";
          return (
            <div key={key} style={S.funnelRow}>
              <div style={S.funnelLabel}>{labels[i]}</div>
              <div style={S.funnelBarBg}>
                <div style={{ ...S.funnelBar, width: `${(val / maxVal) * 100}%` }} />
              </div>
              <div style={S.funnelVal}>{val}</div>
              <div style={{ width: 50, fontSize: 11, color: parseInt(dropPct) < 70 ? "#f44336" : "#4CAF50", textAlign: "right" }}>
                {i > 0 ? `${dropPct}%` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {daily && daily.length > 0 && (
        <>
          <h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Daily Completions</h2>
          {daily.map(d => (
            <div key={d.date} style={S.dailyRow}>
              <span style={S.dailyDate}>{new Date(d.date).toLocaleDateString()}</span>
              <span style={S.dailyVal}>{d.completions}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ═══ TRENDS (Period-over-Period Line Graph) ═══
function TrendsView({ product, days }) {
  const [trendData, setTrendData] = useState(null);
  const [metric, setMetric] = useState("quiz_start");
  const [showOverlay, setShowOverlay] = useState(true);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const metricLabels = {
    quiz_start: "Quiz Starts",
    contact_capture_complete: "Completions",
    report_generated: "Reports Generated",
  };

  useEffect(() => {
    const s = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";
    if (!s) return;
    fetch(`/api/analytics?secret=${encodeURIComponent(s)}&view=trends&product=${product}&days=${days}&metric=${metric}`)
      .then(r => r.json())
      .then(setTrendData)
      .catch(console.error);
  }, [product, days, metric]);

  useEffect(() => {
    if (!trendData || !canvasRef.current) return;
    // Load Chart.js from CDN if not already loaded
    if (!window.Chart) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      script.onload = () => renderChart();
      document.head.appendChild(script);
    } else {
      renderChart();
    }
  }, [trendData, showOverlay, metric]);

  function renderChart() {
    if (!window.Chart || !canvasRef.current || !trendData) return;
    if (chartRef.current) chartRef.current.destroy();

    const { multiCurrent, multiPrevious } = trendData;
    const metrics = ["quiz_start", "contact_capture_complete", "report_generated"];
    const colors = {
      quiz_start: { current: "#c5a55a", prev: "rgba(197,165,90,0.3)" },
      contact_capture_complete: { current: "#4CAF50", prev: "rgba(76,175,80,0.3)" },
      report_generated: { current: "#2196F3", prev: "rgba(33,150,243,0.3)" },
    };

    // Build date labels from current period
    const allDates = new Set();
    for (const m of metrics) {
      (multiCurrent[m] || []).forEach(d => allDates.add(d.date.split("T")[0]));
    }
    const dateLabels = [...allDates].sort();
    const shortLabels = dateLabels.map(d => {
      const dt = new Date(d + "T12:00:00");
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });

    const datasets = [];
    for (const m of metrics) {
      const currentMap = {};
      (multiCurrent[m] || []).forEach(d => { currentMap[d.date.split("T")[0]] = parseInt(d.count); });
      datasets.push({
        label: metricLabels[m] + " (Current)",
        data: dateLabels.map(d => currentMap[d] || 0),
        borderColor: colors[m].current,
        backgroundColor: colors[m].current + "20",
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointRadius: 3,
      });

      if (showOverlay) {
        const prevArr = multiPrevious[m] || [];
        // Align previous period to current period dates (by offset)
        const prevData = dateLabels.map((_, i) => {
          return i < prevArr.length ? parseInt(prevArr[i].count) : 0;
        });
        datasets.push({
          label: metricLabels[m] + " (Previous " + days + "d)",
          data: prevData,
          borderColor: colors[m].prev,
          borderDash: [5, 5],
          borderWidth: 1.5,
          tension: 0.3,
          fill: false,
          pointRadius: 0,
        });
      }
    }

    chartRef.current = new window.Chart(canvasRef.current, {
      type: "line",
      data: { labels: shortLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#aaa", font: { size: 11 } },
            position: "bottom",
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#888", font: { size: 10 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#888", stepSize: 1 },
          },
        },
      },
    });
  }

  return (
    <div>
      <h2 style={S.sectionTitle}>Performance Trends</h2>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ color: "#aaa", fontSize: 13 }}>
          <input type="checkbox" checked={showOverlay} onChange={e => setShowOverlay(e.target.checked)}
            style={{ marginRight: 6 }} />
          Show previous {days}-day overlay
        </label>
      </div>
      <div style={{ height: 350, background: "#0d0d0d", borderRadius: 8, padding: 12, border: "1px solid #222" }}>
        <canvas ref={canvasRef} />
      </div>
      {!trendData && <div style={{ color: "#666", marginTop: 12, fontSize: 13 }}>Loading trend data...</div>}
      <p style={{ color: "#666", fontSize: 11, marginTop: 8 }}>
        Solid lines = current {days} days. Dashed lines = previous {days} days. Toggle overlay to compare periods.
      </p>
    </div>
  );
}

// ═══ RESEARCH ═══
function ResearchView({ data }) {
  const { distributions, diagnostics, attachments, neuropathways, relational } = data;
  return (
    <div>
      {diagnostics?.length > 0 && (<><h2 style={S.sectionTitle}>Arousal Template Types</h2>
        <BarChart items={diagnostics.map(d => ({ label: d.arousal_template_type || "Unknown", value: parseInt(d.count) }))} color="#c5a55a" /></>)}
      {attachments?.length > 0 && (<><h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Attachment Styles</h2>
        <BarChart items={attachments.map(a => ({ label: a.attachment_style || "Unknown", value: parseInt(a.count) }))} color="#2196F3" /></>)}
      {neuropathways?.length > 0 && (<><h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Neuropathways</h2>
        <BarChart items={neuropathways.map(n => ({ label: n.neuropathway || "Unknown", value: parseInt(n.count) }))} color="#4CAF50" /></>)}
      {relational?.[0]?.total > 0 && (<><h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Relational Averages (n={relational[0].total})</h2>
        <BarChart items={[
          { label: "Codependency", value: parseFloat(relational[0].avg_codependency) || 0 },
          { label: "Enmeshment", value: parseFloat(relational[0].avg_enmeshment) || 0 },
          { label: "Relational Void", value: parseFloat(relational[0].avg_relational_void) || 0 },
          { label: "Leadership Burden", value: parseFloat(relational[0].avg_leadership_burden) || 0 },
        ]} color="#FF9800" maxOverride={3} /></>)}
      {distributions?.length > 0 && (<><h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Top Answer Selections</h2>
        <table style={S.table}><thead><tr><th style={S.th}>Section</th><th style={S.th}>Selection</th><th style={S.th}>Count</th></tr></thead>
        <tbody>{distributions.slice(0, 30).map((d, i) => (<tr key={i}><td style={S.td}>{d.section_num}</td><td style={S.td}>{d.selection}</td><td style={S.td}>{d.count}</td></tr>))}</tbody></table></>)}
      {(!diagnostics || diagnostics.length === 0) && <Empty msg="No research data yet." />}
    </div>
  );
}

// ═══ DROPOFF ═══
function DropoffView({ data }) {
  const { sections } = data;
  if (!sections?.length) return <Empty msg="No drop-off data yet." />;

  const sorted = [...sections].sort((a, b) => a.event_type.localeCompare(b.event_type));
  const items = sorted.map((s, i) => {
    const users = parseInt(s.users);
    const prev = i > 0 ? parseInt(sorted[i - 1].users) : users;
    const convPct = prev > 0 ? ((users / prev) * 100).toFixed(1) : "100";
    const dropPct = prev > 0 ? (100 - (users / prev) * 100).toFixed(1) : "0";
    return { label: s.event_type.replace("section_", "S").replace("_complete", ""), users, convPct, dropPct };
  });

  return (
    <div>
      <h2 style={S.sectionTitle}>Section-by-Section Retention</h2>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Section</th><th style={S.th}>Users</th><th style={S.th}>Retention</th><th style={S.th}>Drop-off</th></tr></thead>
        <tbody>{items.map((item, i) => (
          <tr key={i}>
            <td style={S.td}>{item.label}</td>
            <td style={S.td}>{item.users}</td>
            <td style={{ ...S.td, color: parseFloat(item.convPct) >= 80 ? "#4CAF50" : parseFloat(item.convPct) >= 60 ? "#FF9800" : "#f44336", fontWeight: 600 }}>{item.convPct}%</td>
            <td style={{ ...S.td, color: parseFloat(item.dropPct) > 20 ? "#f44336" : "#4CAF50" }}>{i > 0 ? `${item.dropPct}%` : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ═══ DEVICES ═══
function DevicesView({ data }) {
  const { devices, browsers } = data || {};
  if (!devices) return <Empty msg="No device data yet." />;

  const deviceItems = Object.entries(devices).filter(([_, v]) => v > 0).map(([k, v]) => ({ label: k, value: v }));
  const browserItems = Object.entries(browsers || {}).filter(([_, v]) => v > 0).map(([k, v]) => ({ label: k, value: v }));

  return (
    <div>
      <h2 style={S.sectionTitle}>Device Types</h2>
      {deviceItems.length > 0 ? <BarChart items={deviceItems} color="#9C27B0" /> : <Empty msg="No device data." />}
      <h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Browsers</h2>
      {browserItems.length > 0 ? <BarChart items={browserItems} color="#00BCD4" /> : <Empty msg="No browser data." />}
    </div>
  );
}

// ═══ COHORT ═══
function CohortView({ data }) {
  const { thisWeek, lastWeek } = data || {};
  if (!thisWeek) return <Empty msg="No cohort data yet." />;

  const metrics = ["quiz_start", "contact_capture_complete", "report_generated"];
  const labels = ["Quiz Starts", "Completions", "Reports"];

  return (
    <div>
      <h2 style={S.sectionTitle}>This Week vs Last Week</h2>
      <table style={S.table}>
        <thead><tr><th style={S.th}>Metric</th><th style={S.th}>This Week</th><th style={S.th}>Last Week</th><th style={S.th}>Change</th></tr></thead>
        <tbody>{metrics.map((m, i) => {
          const tw = thisWeek[m] || 0;
          const lw = lastWeek[m] || 0;
          const change = lw > 0 ? (((tw - lw) / lw) * 100).toFixed(0) : tw > 0 ? "+100" : "0";
          const changeColor = parseInt(change) > 0 ? "#4CAF50" : parseInt(change) < 0 ? "#f44336" : "#888";
          return (
            <tr key={m}>
              <td style={S.td}>{labels[i]}</td>
              <td style={{ ...S.td, fontWeight: 600 }}>{tw}</td>
              <td style={S.td}>{lw}</td>
              <td style={{ ...S.td, color: changeColor, fontWeight: 600 }}>{parseInt(change) > 0 ? "+" : ""}{change}%</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

// ═══ HEALTH ═══
function HealthView() {
  const [health, setHealth] = useState(null);
  const [history, setHistory] = useState(null);
  const [checking, setChecking] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    try {
      const r = await fetch(HEALTH_API);
      setHealth(await r.json());
    } catch (e) { setHealth({ status: "error", error: e.message }); }
    setChecking(false);
  };

  const loadHistory = async () => {
    const s = sessionStorage.getItem("admin_secret");
    try {
      const r = await fetch(`${API}?secret=${encodeURIComponent(s)}&view=health`);
      setHistory(await r.json());
    } catch (e) {}
  };

  useEffect(() => { runCheck(); loadHistory(); }, []);

  const statusColor = (s) => s === "up" || s === "healthy" ? "#4CAF50" : s === "degraded" ? "#FF9800" : "#f44336";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={S.sectionTitle}>Live System Status</h2>
        <button onClick={runCheck} style={S.refreshBtn}>{checking ? "Checking..." : "Run Health Check"}</button>
      </div>

      {health && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: statusColor(health.status), marginBottom: 12 }}>
            {health.status === "healthy" ? "All Systems Operational" : "System Degraded"}
          </div>
          {health.services && Object.entries(health.services).map(([name, svc]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor(svc.status) }} />
              <div style={{ width: 100, fontWeight: 500, color: "#ccc", textTransform: "capitalize" }}>{name}</div>
              <div style={{ color: statusColor(svc.status), fontWeight: 600 }}>{svc.status}</div>
              {svc.latency && <div style={{ color: "#666", fontSize: 12 }}>{svc.latency}ms</div>}
              {svc.error && <div style={{ color: "#f44336", fontSize: 12 }}>{svc.error}</div>}
            </div>
          ))}
        </div>
      )}

      {history && (
        <>
          <h2 style={S.sectionTitle}>Uptime: {history.uptimePct}% ({history.totalChecks} checks)</h2>
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 8 }}>
            {history.history.slice(0, 50).reverse().map((h, i) => (
              <div key={i} title={`${new Date(h.timestamp).toLocaleString()}: ${h.status}${h.downServices?.length ? " - Down: " + h.downServices.join(", ") : ""}`}
                style={{ width: 14, height: 28, borderRadius: 2, background: h.status === "healthy" ? "#4CAF50" : "#f44336" }} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Last 50 checks (hover for details)</div>
        </>
      )}
    </div>
  );
}

// ═══ EXPORT ═══
function ExportView({ product, days }) {
  const secret = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";
  const base = `/api/analytics/export?secret=${encodeURIComponent(secret)}&product=${product}&days=${days}`;
  return (
    <div>
      <h2 style={S.sectionTitle}>Export Data as CSV</h2>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <a href={`${base}&type=diagnostics`} style={S.exportBtn}>Completed Diagnostics</a>
        <a href={`${base}&type=responses`} style={S.exportBtn}>Quiz Responses</a>
        <a href={`${base}&type=events`} style={S.exportBtn}>All Events</a>
      </div>
    </div>
  );
}

// ═══ COMPONENTS ═══
function BarChart({ items, color, maxOverride }) {
  const max = maxOverride || Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ marginTop: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={S.barRow}>
          <div style={S.barLabel}>{item.label}</div>
          <div style={S.barBg}><div style={{ ...S.bar, width: `${(item.value / max) * 100}%`, background: color }} /></div>
          <div style={S.barVal}>{typeof item.value === "number" && item.value % 1 !== 0 ? item.value.toFixed(1) : item.value}</div>
        </div>
      ))}
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ color: "#555", padding: 30, textAlign: "center", fontSize: 15 }}>{msg}</div>;
}

// ═══ STYLES ═══
const S = {
  wrap: { minHeight: "100vh", background: "#0a0a0a", color: "#e0e0e0", fontFamily: "'Montserrat', -apple-system, sans-serif", padding: "16px 20px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 20, borderBottom: "1px solid #222", paddingBottom: 14 },
  title: { fontSize: 18, fontWeight: 700, color: "#c5a55a", letterSpacing: 2, margin: 0 },
  controls: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  select: { background: "#1a1a1a", color: "#ccc", border: "1px solid #333", borderRadius: 6, padding: "7px 10px", fontSize: 12 },
  refreshBtn: { background: "#c5a55a", color: "#000", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  autoLabel: { fontSize: 11, color: "#888", display: "flex", alignItems: "center", gap: 4 },
  lastRefresh: { fontSize: 10, color: "#555" },
  cardRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 },
  card: { background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "16px 12px", textAlign: "center" },
  cardValue: { fontSize: 28, fontWeight: 700 },
  cardLabel: { fontSize: 11, color: "#888", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  tabs: { display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid #222", overflowX: "auto" },
  tab: { background: "transparent", color: "#555", border: "none", borderBottom: "2px solid transparent", padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  tabActive: { color: "#c5a55a", borderBottomColor: "#c5a55a" },
  content: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: 20, minHeight: 250 },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "#c5a55a", margin: "0 0 10px", letterSpacing: 1 },
  funnelRow: { display: "flex", alignItems: "center", gap: 6 },
  funnelLabel: { width: 80, fontSize: 11, color: "#888", textAlign: "right", flexShrink: 0 },
  funnelBarBg: { flex: 1, height: 22, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" },
  funnelBar: { height: "100%", background: "linear-gradient(90deg, #c5a55a, #9A7730)", borderRadius: 3 },
  funnelVal: { width: 30, fontSize: 13, fontWeight: 600, color: "#fff", textAlign: "right" },
  dailyRow: { display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1a1a1a" },
  dailyDate: { fontSize: 12, color: "#888" },
  dailyVal: { fontSize: 13, fontWeight: 600, color: "#4CAF50" },
  barRow: { display: "flex", alignItems: "center", gap: 6, marginBottom: 5 },
  barLabel: { width: 140, fontSize: 11, color: "#aaa", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  barBg: { flex: 1, height: 20, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 3 },
  barVal: { width: 35, fontSize: 12, fontWeight: 600, color: "#fff", textAlign: "right" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "7px 10px", borderBottom: "1px solid #333", color: "#c5a55a", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  td: { padding: "5px 10px", borderBottom: "1px solid #1a1a1a", color: "#ccc" },
  exportBtn: { display: "inline-block", background: "#1a1a1a", color: "#c5a55a", border: "1px solid #333", borderRadius: 8, padding: "10px 18px", fontSize: 13, textDecoration: "none", fontWeight: 500 },
  loginWrap: { minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" },
  loginBox: { background: "#111", border: "1px solid #222", borderRadius: 12, padding: "36px 28px", textAlign: "center", width: 300 },
  loginTitle: { fontSize: 15, color: "#c5a55a", letterSpacing: 3, marginBottom: 20, fontWeight: 600 },
  loginInput: { width: "100%", background: "#1a1a1a", color: "#ccc", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 10, boxSizing: "border-box" },
  loginBtn: { width: "100%", background: "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
};
