"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart as RLineChart, Line, CartesianGrid } from "recharts";

const API = "/api/analytics";
const HEALTH_API = "/api/health";

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [product, setProduct] = useState("udrm");
  const [days, setDays] = useState(30);
  const [dateMode, setDateMode] = useState("preset"); // "preset" or "custom"
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [source, setSource] = useState(""); // "" = all sources
  const [availableSources, setAvailableSources] = useState([]);
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
      let base = `${API}?secret=${encodeURIComponent(s)}&product=${product}&days=${days}`;
      if (dateMode === "custom" && startDate) {
        base += `&startDate=${startDate}`;
        if (endDate) base += `&endDate=${endDate}`;
      } else if (days === 0) {
        // "Today" — from midnight today
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        base += `&startDate=${today}`;
      } else if (days === 1) {
        // "Yesterday" — only yesterday's data
        const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        base += `&startDate=${yesterday}&endDate=${yesterday}`;
      }
      if (source) base += `&source=${encodeURIComponent(source)}`;
      if (tab === "dashboard") {
        // Dashboard home needs data from multiple views
        const [sumRes, funnelRes, researchRes, dropoffRes, devicesRes, cohortRes] = await Promise.all([
          fetch(`${base}&view=summary`),
          fetch(`${base}&view=funnel`),
          fetch(`${base}&view=research`),
          fetch(`${base}&view=dropoff`),
          fetch(`${base}&view=devices`),
          fetch(`${base}&view=cohort`),
        ]);
        if (sumRes.status === 401) { setAuthed(false); return; }
        const sumData = await sumRes.json();
        setSummary(sumData);
        if (sumData.sources) setAvailableSources(sumData.sources);
        const [funnel, research, dropoff, devices, cohort] = await Promise.all([
          funnelRes.json(), researchRes.json(), dropoffRes.json(), devicesRes.json(), cohortRes.json(),
        ]);
        // Merge all into one data object
        setData({ ...funnel, ...research, ...dropoff, ...devices, ...cohort });
      } else {
        const [sumRes, viewRes] = await Promise.all([
          fetch(`${base}&view=summary`),
          fetch(`${base}&view=${tab}`),
        ]);
        if (sumRes.status === 401) { setAuthed(false); return; }
        const sumData2 = await sumRes.json();
        setSummary(sumData2);
        if (sumData2.sources) setAvailableSources(sumData2.sources);
        setData(await viewRes.json());
      }
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [tab, product, days, dateMode, startDate, endDate, source]);

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
          <img src="/images/unchained-logo.png" alt="Unchained Leader" style={{ height: 40, marginBottom: 12 }} />
          <h1 style={S.loginTitle}>UNCHAINED ANALYTICS</h1>
          <input type="password" placeholder="Admin Password" value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} style={S.loginInput} />
          <button onClick={login} style={S.loginBtn}>Enter</button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "funnel", label: "Funnel" },
    { id: "trends", label: "Trends" },
    { id: "research", label: "Research" },
    { id: "dropoff", label: "Drop-off" },
    { id: "devices", label: "Devices" },
    { id: "cohort", label: "Cohort" },
    { id: "submissions", label: "Submissions" },
    { id: "locations", label: "Locations" },
    { id: "health", label: "System Health" },
    { id: "pipeline", label: "Pipeline" },
    { id: "referrers", label: "Referrers" },
    { id: "chat", label: "AI Analyst" },
    { id: "export", label: "Export" },
    { id: "clients", label: "Clients" },
  ];

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/images/unchained-logo.png" alt="Unchained Leader" style={{ height: 32 }} />
          <h1 style={S.title}>UNCHAINED ANALYTICS</h1>
        </div>
        <div style={S.controls}>
          <select value={source} onChange={e => setSource(e.target.value)} style={{ ...S.select, borderColor: source ? "#c5a55a" : "#333", color: source ? "#c5a55a" : "#ccc" }}>
            <option value="">All Sources</option>
            {availableSources.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={product} onChange={e => setProduct(e.target.value)} style={S.select}>
            <option value="udrm">UDRM Quiz</option>
            <option value="all">All Products</option>
          </select>
          <select value={dateMode === "custom" ? "custom" : days} onChange={e => {
            const v = e.target.value;
            if (v === "custom") {
              setDateMode("custom");
              if (!startDate) {
                const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
                setStartDate(today);
                setEndDate(today);
              }
            } else {
              setDateMode("preset");
              setDays(parseInt(v));
            }
          }} style={S.select}>
            <option value={0}>Today</option>
            <option value={1}>Yesterday</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
            <option value="custom">Custom Range</option>
          </select>
          {dateMode === "custom" && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ ...S.select, width: 130 }} />
              <span style={{ color: "#555", fontSize: 11 }}>to</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                style={{ ...S.select, width: 130 }} />
            </span>
          )}
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
        {tab === "dashboard" && <DashboardHomeView data={data} summary={summary} product={product} days={days} setTab={setTab} />}
        {tab === "funnel" && data && <FunnelView data={data} />}
        {tab === "trends" && <TrendsView product={product} days={days} />}
        {tab === "research" && data && <ResearchView data={data} days={days} dateMode={dateMode} startDate={startDate} endDate={endDate} />}
        {tab === "dropoff" && data && <DropoffView data={data} />}
        {tab === "devices" && data && <DevicesView data={data} />}
        {tab === "cohort" && data && <CohortView data={data} />}
        {tab === "submissions" && <SubmissionsView product={product} days={days} />}
        {tab === "locations" && <LocationsView product={product} />}
        {tab === "health" && <HealthView />}
        {tab === "pipeline" && <PipelineView days={days} />}
        {tab === "referrers" && <ReferrersView product={product} days={days} />}
        {tab === "chat" && <ChatView />}
        {tab === "export" && <ExportView product={product} days={days} />}
        {tab === "clients" && <ClientsView />}
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

// ═══ DASHBOARD HOME ═══
function DashboardHomeView({ data, summary, product, days, setTab }) {
  const tileStyle = {
    background: "#111", border: "1px solid #222", borderRadius: 12,
    padding: 16, cursor: "pointer", overflow: "hidden", position: "relative",
    transition: "border-color 0.2s",
  };
  const tileHover = { borderColor: "#C5A55A" };
  const tileTitle = {
    fontSize: 11, color: "#C5A55A", textTransform: "uppercase", letterSpacing: 2,
    fontWeight: 600, marginBottom: 10,
  };
  const TileWrap = ({ label, tabId, children, style, span2 }) => {
    const [hovered, setHovered] = useState(false);
    return (
      <div style={{ ...tileStyle, ...(hovered ? tileHover : {}), ...style, ...(span2 ? { gridColumn: "span 2" } : {}) }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={() => setTab(tabId)}>
        <div style={tileTitle}>{label}</div>
        <div style={{ pointerEvents: "none" }}>{children}</div>
        <div style={{ position: "absolute", bottom: 8, right: 12, fontSize: 10, color: "#555" }}>Click to expand →</div>
      </div>
    );
  };

  // Build funnel bar chart inline
  const funnelOrder = ["quiz_start","section_1_complete","section_2_complete","section_3_complete","section_4_complete","section_5_complete","section_6_complete","section_7_complete","reveal_shown","contact_capture_shown","contact_capture_complete","report_generated","report_emailed"];
  const funnelLabels = ["Start","S1","S2","S3","S4","S5","S6","S7","Reveal","Form","Done","Report","Email"];
  const fMap = {};
  (data?.funnel || []).forEach(f => { fMap[f.event_type] = parseInt(f.unique_sessions) || 0; });
  const fMaxVal = Math.max(...funnelOrder.map(k => fMap[k] || 0), 1);

  // Dropoff data
  const sections = data?.sections || [];
  const dropSorted = [...sections].sort((a, b) => a.event_type.localeCompare(b.event_type));
  const dropItems = dropSorted.map((s, i) => {
    const users = parseInt(s.users);
    const prev = i > 0 ? parseInt(dropSorted[i - 1].users) : users;
    const dropPct = prev > 0 ? (100 - (users / prev) * 100).toFixed(1) : "0";
    return { label: s.event_type.replace("section_", "S").replace("_complete", ""), users, dropPct };
  });

  // Devices
  const deviceItems = Object.entries(data?.devices || {}).filter(([_, v]) => v > 0).map(([k, v]) => ({ label: k, value: v }));
  const browserItems = Object.entries(data?.browsers || {}).filter(([_, v]) => v > 0).map(([k, v]) => ({ label: k, value: v }));

  // Research
  const diagnostics = data?.diagnostics || [];
  const attachments = data?.attachments || [];

  // Cohort
  const thisWeek = data?.thisWeek || {};
  const lastWeek = data?.lastWeek || {};
  const cohortMetrics = ["quiz_start", "contact_capture_complete", "report_generated"];
  const cohortLabels = ["Quiz Starts", "Completions", "Reports"];

  return (
    <div>
      {/* Globe — full width at top */}
      <div style={{ ...tileStyle, marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ ...tileTitle, padding: "16px 16px 0", cursor: "pointer" }} onClick={() => setTab("locations")}>Global Submissions</div>
        <div style={{ height: 400, position: "relative" }}>
          <MiniGlobe product={product} height={400} />
          <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 4, color: "rgba(197,165,90,0.5)", textTransform: "uppercase", fontFamily: "Montserrat, sans-serif" }}>#UnchainTheWorld</span>
          </div>
        </div>
        <div style={{ cursor: "pointer", padding: "6px 12px", textAlign: "right", fontSize: 10, color: "#555" }} onClick={() => setTab("locations")}>Click to expand →</div>
      </div>

      {/* Tile grid — 2 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>

        {/* Funnel — full chart */}
        <TileWrap label="Conversion Funnel" tabId="funnel" span2>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {funnelOrder.map((key, i) => {
              const val = fMap[key] || 0;
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 40, fontSize: 10, color: "#888", textAlign: "right", flexShrink: 0 }}>{funnelLabels[i]}</div>
                  <div style={{ flex: 1, height: 16, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(val / fMaxVal) * 100}%`, background: "linear-gradient(90deg, #C5A55A, #9A7730)", borderRadius: 4 }} />
                  </div>
                  <div style={{ width: 30, fontSize: 11, color: "#C5A55A", fontWeight: 600, textAlign: "right" }}>{val}</div>
                </div>
              );
            })}
          </div>
        </TileWrap>

        {/* Trends — line chart */}
        <TileWrap label="Performance Trends" tabId="trends" span2>
          <MiniTrendsChart product={product} days={days} />
        </TileWrap>

        {/* Research — bar charts */}
        <TileWrap label="Arousal Templates" tabId="research">
          {diagnostics.length > 0 ? (
            <BarChart items={diagnostics.map(d => ({ label: d.arousal_template_type || "?", value: parseInt(d.count) }))} color="#c5a55a" />
          ) : <div style={{ color: "#555", fontSize: 12 }}>No data yet</div>}
        </TileWrap>

        <TileWrap label="Attachment Styles" tabId="research">
          {attachments.length > 0 ? (
            <BarChart items={attachments.map(a => ({ label: a.attachment_style || "?", value: parseInt(a.count) }))} color="#2196F3" />
          ) : <div style={{ color: "#555", fontSize: 12 }}>No data yet</div>}
        </TileWrap>

        {/* Drop-off — retention table */}
        <TileWrap label="Section Retention" tabId="dropoff">
          {dropItems.length > 0 ? (
            <div style={{ fontSize: 11 }}>
              {dropItems.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, alignItems: "center" }}>
                  <span style={{ color: "#aaa" }}>{item.label}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "#ccc", fontWeight: 600 }}>{item.users}</span>
                    {i > 0 && <span style={{ color: parseFloat(item.dropPct) > 20 ? "#f44336" : "#4CAF50", fontSize: 10 }}>-{item.dropPct}%</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : <div style={{ color: "#555", fontSize: 12 }}>No data yet</div>}
        </TileWrap>

        {/* Devices — bar charts */}
        <TileWrap label="Devices & Browsers" tabId="devices">
          {deviceItems.length > 0 ? (
            <div>
              <BarChart items={deviceItems} color="#9C27B0" />
              {browserItems.length > 0 && <div style={{ marginTop: 8 }}><BarChart items={browserItems} color="#00BCD4" /></div>}
            </div>
          ) : <div style={{ color: "#555", fontSize: 12 }}>No data yet</div>}
        </TileWrap>

        {/* Referrers — top sources */}
        <TileWrap label="Top Traffic Sources" tabId="referrers">
          <MiniReferrersTile product={product} days={days} />
        </TileWrap>

        {/* Cohort — week over week */}
        <TileWrap label="This Week vs Last Week" tabId="cohort">
          <table style={{ ...S.table, fontSize: 11 }}>
            <thead><tr><th style={{ ...S.th, fontSize: 9 }}>Metric</th><th style={{ ...S.th, fontSize: 9 }}>This Wk</th><th style={{ ...S.th, fontSize: 9 }}>Last Wk</th><th style={{ ...S.th, fontSize: 9 }}>Δ</th></tr></thead>
            <tbody>{cohortMetrics.map((m, i) => {
              const tw = thisWeek[m] || 0;
              const lw = lastWeek[m] || 0;
              const chg = lw > 0 ? (((tw - lw) / lw) * 100).toFixed(0) : tw > 0 ? "+100" : "0";
              const chgC = parseInt(chg) > 0 ? "#4CAF50" : parseInt(chg) < 0 ? "#f44336" : "#888";
              return (
                <tr key={m}>
                  <td style={{ ...S.td, fontSize: 11 }}>{cohortLabels[i]}</td>
                  <td style={{ ...S.td, fontWeight: 600, fontSize: 11 }}>{tw}</td>
                  <td style={{ ...S.td, fontSize: 11 }}>{lw}</td>
                  <td style={{ ...S.td, color: chgC, fontWeight: 600, fontSize: 11 }}>{parseInt(chg) > 0 ? "+" : ""}{chg}%</td>
                </tr>
              );
            })}</tbody>
          </table>
        </TileWrap>

        {/* System Health */}
        <TileWrap label="System Health" tabId="health">
          <HealthMiniTile />
        </TileWrap>

      </div>
    </div>
  );
}

// Mini trends chart for dashboard tile
function MiniTrendsChart({ product, days }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [trendData, setTrendData] = useState(null);

  useEffect(() => {
    const s = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";
    if (!s) return;
    fetch(`/api/analytics?secret=${encodeURIComponent(s)}&view=trends&product=${product}&days=${days}&metric=quiz_start`)
      .then(r => r.json()).then(setTrendData).catch(() => {});
  }, [product, days]);

  useEffect(() => {
    if (!trendData || !canvasRef.current) return;
    const render = () => {
      if (!window.Chart || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();
      const { multiCurrent } = trendData;
      const metrics = ["quiz_start", "contact_capture_complete", "report_generated"];
      const labels = { quiz_start: "Starts", contact_capture_complete: "Completions", report_generated: "Reports" };
      const colors = { quiz_start: "#c5a55a", contact_capture_complete: "#4CAF50", report_generated: "#2196F3" };
      const allDates = new Set();
      for (const m of metrics) (multiCurrent[m] || []).forEach(d => allDates.add(d.date.split("T")[0]));
      const dateLabels = [...allDates].sort();
      const shortLabels = dateLabels.map(d => { const dt = new Date(d + "T12:00:00"); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); });
      const datasets = metrics.map(m => {
        const map = {}; (multiCurrent[m] || []).forEach(d => { map[d.date.split("T")[0]] = parseInt(d.count); });
        return { label: labels[m], data: dateLabels.map(d => map[d] || 0), borderColor: colors[m], borderWidth: 2, tension: 0.3, fill: false, pointRadius: 2 };
      });
      chartRef.current = new window.Chart(canvasRef.current, {
        type: "line", data: { labels: shortLabels, datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#aaa", font: { size: 10 } }, position: "bottom" } },
          scales: { x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#888", font: { size: 9 }, maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#888", stepSize: 1, font: { size: 9 } } } } }
      });
    };
    if (!window.Chart) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
      script.onload = () => setTimeout(render, 100);
      document.head.appendChild(script);
    } else render();
  }, [trendData]);

  return (
    <div style={{ height: 220, background: "#0d0d0d", borderRadius: 8, padding: 8 }}>
      <canvas ref={canvasRef} />
      {!trendData && <div style={{ color: "#555", fontSize: 12, textAlign: "center", paddingTop: 80 }}>Loading trends...</div>}
    </div>
  );
}

// Mini globe for dashboard home (simplified, no interactions needed)
// ---- D3 Globe Helper ----
const loadD3Scripts = () => {
  return new Promise((resolve, reject) => {
    if (window.d3 && window.topojson) { resolve(); return; }
    let loaded = 0;
    const check = () => { loaded++; if (loaded === 2) { window.d3 && window.topojson ? resolve() : reject(new Error("D3 load failed")); } };
    if (!window.topojson) {
      const s1 = document.createElement("script");
      s1.src = "https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js";
      s1.onload = check; s1.onerror = () => reject(new Error("topojson load failed"));
      document.head.appendChild(s1);
    } else { loaded++; }
    if (!window.d3) {
      const s2 = document.createElement("script");
      s2.src = "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js";
      s2.onload = check; s2.onerror = () => reject(new Error("d3 load failed"));
      document.head.appendChild(s2);
    } else { loaded++; }
    if (loaded === 2) resolve();
  });
};

// ═══ SHARED GLOBE RENDERER ═══
// Used by both MiniGlobe (home tile) and LocationsView (locations tab).
// Returns { cleanup } to cancel animation frame.
function renderGlobe(container, { points, countries, usStates, w, h, uniqueId }) {
  const d3 = window.d3;
  container.innerHTML = "";

  // Deep space background
  Object.assign(container.style, { background: "radial-gradient(ellipse at center, #0d0d18 0%, #060610 40%, #020208 100%)", borderRadius: "8px", border: "1px solid #222" });

  const svg = d3.select(container).append("svg").attr("width", w).attr("height", h)
    .style("display", "block").style("border-radius", "8px");

  const baseScale = Math.min(w, h) / 2.3;
  const projection = d3.geoOrthographic().scale(baseScale).translate([w / 2, h / 2]).clipAngle(90);
  const path = d3.geoPath(projection);
  let currentZoom = 1;

  // ── Starfield ──
  const defs = svg.append("defs");

  if (!document.getElementById("globe-twinkle-style")) {
    const style = document.createElement("style");
    style.id = "globe-twinkle-style";
    style.textContent = `
      @keyframes globe-twinkle {
        0%, 100% { opacity: var(--star-min); }
        50% { opacity: var(--star-max); }
      }
    `;
    document.head.appendChild(style);
  }

  const starGroup = svg.append("g");
  const starCount = 200;
  const globeR = projection.scale();
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < starCount; i++) {
    let sx, sy;
    do {
      sx = Math.random() * w;
      sy = Math.random() * h;
    } while (Math.hypot(sx - cx, sy - cy) < globeR * 1.22);

    const size = Math.random() < 0.08 ? (1.2 + Math.random() * 1.0) : (0.3 + Math.random() * 0.9);
    const minOpacity = 0.1 + Math.random() * 0.2;
    const maxOpacity = 0.5 + Math.random() * 0.5;
    const duration = 2 + Math.random() * 4;
    const delay = Math.random() * 5;
    const color = Math.random() < 0.7 ? "#ffffff" :
                  Math.random() < 0.5 ? "#C5A55A" : "#aabbff";

    starGroup.append("circle")
      .attr("cx", sx).attr("cy", sy).attr("r", size)
      .attr("fill", color)
      .style("--star-min", minOpacity)
      .style("--star-max", maxOpacity)
      .style("animation", `globe-twinkle ${duration}s ease-in-out ${delay}s infinite`);
  }

  // Atmosphere glow
  const atmoGrad = defs.append("radialGradient").attr("id", `atmo-${uniqueId}`);
  atmoGrad.append("stop").attr("offset", "75%").attr("stop-color", "#C5A55A").attr("stop-opacity", 0.12);
  atmoGrad.append("stop").attr("offset", "100%").attr("stop-color", "#C5A55A").attr("stop-opacity", 0);
  const atmoCircle = svg.append("circle").attr("cx", w/2).attr("cy", h/2).attr("r", projection.scale() * 1.18).attr("fill", `url(#atmo-${uniqueId})`);

  // Globe sphere — black ocean with gold rim
  const globeSphere = svg.append("circle").attr("cx", w/2).attr("cy", h/2).attr("r", projection.scale()).attr("fill", "#0a0a0a").attr("stroke", "#C5A55A").attr("stroke-width", 0.8).attr("stroke-opacity", 0.6);

  // Graticule (grid lines) — subtle gold
  const graticule = d3.geoGraticule10();
  svg.append("path").datum(graticule).attr("d", path).attr("fill", "none").attr("stroke", "#C5A55A").attr("stroke-width", 0.15).attr("stroke-opacity", 0.12);

  // Country paths — black land, gold borders
  const countryPaths = svg.append("g").selectAll("path").data(countries.features).join("path").attr("d", path).attr("fill", "#111111").attr("stroke", "#C5A55A").attr("stroke-width", 0.4).attr("stroke-opacity", 0.5);

  // US state boundaries — gold, thinner
  const statePaths = svg.append("g").selectAll("path").data(usStates.features).join("path").attr("d", path).attr("fill", "none").attr("stroke", "#C5A55A").attr("stroke-width", 0.25).attr("stroke-opacity", 0.3);

  // Data points
  const pointGroup = svg.append("g");
  const pointCircles = pointGroup.selectAll("circle").data(points).join("circle")
    .attr("r", d => Math.max(1.5, Math.min(5, Math.sqrt(d.count) * 0.7)))
    .attr("fill", "#C5A55A").attr("opacity", 0.75).attr("cursor", "pointer");

  // Tooltip
  const tooltip = d3.select(container).append("div")
    .style("position", "absolute").style("background", "rgba(0,0,0,0.85)")
    .style("color", "#fff").style("padding", "8px 12px").style("border-radius", "6px")
    .style("font-size", "12px").style("pointer-events", "none").style("display", "none")
    .style("z-index", "1000").style("border", "1px solid #C5A55A").style("line-height", "1.5");

  svg.select("path[d]").classed("graticule-path", true);

  const updatePositions = () => {
    const rot = projection.rotate();
    const s = projection.scale();
    globeSphere.attr("r", s);
    atmoCircle.attr("r", s * 1.18);
    countryPaths.attr("d", path);
    statePaths.attr("d", path);
    svg.select(".graticule-path").attr("d", path(graticule));

    // Dots shrink gently with zoom but stay visible — floor of 2.5px
    const dotScale = Math.max(0.5, 1 / Math.pow(currentZoom, 0.25));
    pointCircles.each(function(d) {
      const dist = d3.geoDistance(d.coords, [-rot[0], -rot[1]]);
      const p = projection(d.coords);
      const visible = dist < Math.PI / 2 && p;
      const r = Math.max(2.5, Math.max(1.5, Math.min(5, Math.sqrt(d.count) * 0.7)) * dotScale);
      d3.select(this).attr("cx", p ? p[0] : 0).attr("cy", p ? p[1] : 0).attr("r", r).attr("display", visible ? null : "none");
    });
  };

  // Hover events
  pointCircles
    .on("mouseenter", function(event, d) {
      d3.select(this).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 1);
      let html = "<b>" + d.city + "</b>";
      if (d.region) html += "<br/>" + d.region + (d.country && d.country !== d.region ? ", " + d.country : "");
      else if (d.country) html += "<br/>" + d.country;
      html += "<br/><span style='color:#C5A55A'>" + d.count + " submissions</span>";
      const rect = container.getBoundingClientRect();
      tooltip.html(html).style("display", "block")
        .style("left", (event.clientX - rect.left + 12) + "px")
        .style("top", (event.clientY - rect.top - 10) + "px");
    })
    .on("mousemove", function(event) {
      const rect = container.getBoundingClientRect();
      tooltip.style("left", (event.clientX - rect.left + 12) + "px").style("top", (event.clientY - rect.top - 10) + "px");
    })
    .on("mouseleave", function() {
      d3.select(this).attr("opacity", 0.75).attr("stroke", "none");
      tooltip.style("display", "none");
    });

  // Interaction state
  let currentRotation = [0, -15];
  let isEngaged = false;
  let isDragging = false;
  projection.rotate(currentRotation);
  updatePositions();

  const clampZoom = (z) => Math.max(0.5, Math.min(40, z));

  // ── Mouse drag to rotate (desktop only) ──
  let dragStartCoords = [0, 0];
  let dragStartRotation = [0, 0];
  svg.call(d3.drag()
    .filter(event => event.type === "mousedown")
    .on("start", function(event) {
      isDragging = true;
      dragStartCoords = [event.x, event.y];
      dragStartRotation = [...currentRotation];
    })
    .on("drag", function(event) {
      if (!isDragging) return;
      const dx = event.x - dragStartCoords[0];
      const dy = event.y - dragStartCoords[1];
      const sensitivity = 0.4 / currentZoom;
      currentRotation = [dragStartRotation[0] + dx * sensitivity, Math.max(-60, Math.min(60, dragStartRotation[1] - dy * sensitivity))];
      projection.rotate(currentRotation);
      updatePositions();
    })
    .on("end", () => { isDragging = false; })
  );

  // ── Mouse wheel zoom (desktop) ──
  const svgNode = svg.node();
  svgNode.addEventListener("wheel", function(event) {
    event.preventDefault();
    const delta = -event.deltaY * 0.004;
    currentZoom = clampZoom(currentZoom * (1 + delta));
    projection.scale(baseScale * currentZoom);
    updatePositions();
  }, { passive: false });

  // ── Touch: single-finger rotate + two-finger pinch zoom (mobile) ──
  let touchStartCoords = null;
  let touchStartRotation = null;
  let pinchStartDist = null;
  let pinchStartZoom = null;
  let lastTouchCount = 0;

  const getTouchDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const initDrag = (touch) => {
    isDragging = true;
    touchStartCoords = [touch.clientX, touch.clientY];
    touchStartRotation = [...currentRotation];
    pinchStartDist = null;
  };

  const initPinch = (t1, t2) => {
    isDragging = false;
    touchStartCoords = null;
    pinchStartDist = getTouchDist(t1, t2);
    pinchStartZoom = currentZoom;
  };

  svgNode.addEventListener("touchstart", function(event) {
    event.preventDefault();
    isEngaged = true;
    lastTouchCount = event.touches.length;
    if (event.touches.length === 1) { initDrag(event.touches[0]); }
    else if (event.touches.length >= 2) { initPinch(event.touches[0], event.touches[1]); }
  }, { passive: false });

  svgNode.addEventListener("touchmove", function(event) {
    event.preventDefault();
    const count = event.touches.length;

    if (count !== lastTouchCount) {
      lastTouchCount = count;
      if (count === 1) { initDrag(event.touches[0]); return; }
      else if (count >= 2) { initPinch(event.touches[0], event.touches[1]); return; }
    }

    if (count === 1 && touchStartCoords) {
      const dx = event.touches[0].clientX - touchStartCoords[0];
      const dy = event.touches[0].clientY - touchStartCoords[1];
      const sensitivity = 0.4 / currentZoom;
      currentRotation = [touchStartRotation[0] + dx * sensitivity, Math.max(-60, Math.min(60, touchStartRotation[1] - dy * sensitivity))];
      projection.rotate(currentRotation);
      updatePositions();
    } else if (count >= 2 && pinchStartDist) {
      const dist = getTouchDist(event.touches[0], event.touches[1]);
      currentZoom = clampZoom(pinchStartZoom * (dist / pinchStartDist));
      projection.scale(baseScale * currentZoom);
      updatePositions();
    }
  }, { passive: false });

  svgNode.addEventListener("touchend", function(event) {
    const count = event.touches.length;
    lastTouchCount = count;
    if (count === 0) {
      isDragging = false; isEngaged = false;
      touchStartCoords = null; pinchStartDist = null;
    } else if (count === 1) { initDrag(event.touches[0]); }
  }, { passive: true });

  svgNode.addEventListener("touchcancel", function() {
    isDragging = false; isEngaged = false;
    lastTouchCount = 0; touchStartCoords = null; pinchStartDist = null;
  }, { passive: true });

  // Pause spin on hover (desktop)
  svgNode.addEventListener("mouseenter", () => { isEngaged = true; });
  svgNode.addEventListener("mouseleave", () => { isEngaged = false; });

  // Auto-rotate
  let animFrameId = null;
  const spin = () => {
    if (!isEngaged && !isDragging && currentZoom <= 1) {
      currentRotation[0] = (currentRotation[0] + 0.15) % 360;
      projection.rotate(currentRotation);
      updatePositions();
    }
    animFrameId = requestAnimationFrame(spin);
  };
  animFrameId = requestAnimationFrame(spin);

  return { cleanup: () => { if (animFrameId) cancelAnimationFrame(animFrameId); } };
}

// Shared helper: fetch topology + US states data
async function fetchGlobeTopology() {
  const [topoRes, statesRes] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"),
    fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
  ]);
  const topojson = window.topojson;
  const [topoData, statesData] = await Promise.all([topoRes.json(), statesRes.json()]);
  return {
    countries: topojson.feature(topoData, topoData.objects.countries),
    usStates: topojson.feature(statesData, statesData.objects.states),
  };
}

function MiniGlobe({ product, height = 280 }) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await loadD3Scripts();
        if (cancelled || !containerRef.current) return;
        const container = containerRef.current;
        const w = container.offsetWidth || 400;
        const h = height;

        const secret = sessionStorage.getItem("admin_secret") || "";
        const [{ countries, usStates }, locJson] = await Promise.all([
          fetchGlobeTopology(),
          fetch("/api/analytics?view=locations&secret=" + encodeURIComponent(secret) + "&days=90").then(r => r.json()),
        ]);
        if (cancelled || !containerRef.current) return;

        const points = (locJson.locations || []).map(l => ({
          coords: [parseFloat(l.geo_lon), parseFloat(l.geo_lat)],
          count: parseInt(l.count) || 1,
          city: l.geo_city || "Unknown",
          region: l.geo_region || "",
          country: l.geo_country || "Unknown",
        }));

        globeRef.current = renderGlobe(container, { points, countries, usStates, w, h, uniqueId: "mini" });
      } catch (e) { console.warn("MiniGlobe init error:", e); }
    };
    init();
    return () => {
      cancelled = true;
      if (globeRef.current) globeRef.current.cleanup();
      globeRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [height]);

  return <div ref={containerRef} style={{ width: "100%", height, position: "relative" }} />;
}

// Mini health check for dashboard tile
function HealthMiniTile() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  if (!health) return <div style={{ color: "#555", fontSize: 12 }}>Checking...</div>;

  const services = health.services || {};
  return (
    <div style={{ fontSize: 12 }}>
      {Object.entries(services).map(([name, svc]) => (
        <div key={name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#aaa" }}>{name}</span>
          <span style={{ color: svc.status === "up" ? "#4CAF50" : svc.status === "degraded" ? "#FF9800" : "#f44336", fontWeight: 600 }}>
            {svc.status === "up" ? "●" : svc.status === "degraded" ? "◐" : "○"} {svc.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function MiniReferrersTile({ product, days }) {
  const [refData, setRefData] = useState(null);
  useEffect(() => {
    const s = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";
    if (!s) return;
    fetch(`${API}?secret=${encodeURIComponent(s)}&view=referrers&product=${product}&days=${days}`)
      .then(r => r.json()).then(setRefData).catch(() => {});
  }, [product, days]);

  if (!refData) return <div style={{ color: "#555", fontSize: 12 }}>Loading...</div>;
  if (!refData.domains || refData.domains.length === 0) return <div style={{ color: "#555", fontSize: 12 }}>No referrer data yet</div>;

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: "#888", fontSize: 10 }}>{refData.referrerPct}% referred</span>
        <span style={{ color: "#555", fontSize: 10 }}>{refData.withReferrer}/{refData.totalSessions} sessions</span>
      </div>
      {refData.domains.slice(0, 5).map((d, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{d.label}</span>
          <span style={{ color: "#c5a55a", fontWeight: 600 }}>{d.value}</span>
        </div>
      ))}
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
    fetch(`${API}?secret=${encodeURIComponent(s)}&view=trends&product=${product}&days=${days}&metric=${metric}`)
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
function ResearchView({ data, days, dateMode, startDate, endDate }) {
  const researchRef = useRef(null);
  if (!data) return <Empty msg="Loading research data..." />;
  const { distributions, diagnostics, attachments, neuropathways, relational } = data;

  // Date range label
  const dateLabel = (() => {
    if (dateMode === "custom" && startDate) {
      const s = new Date(startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const e = endDate ? new Date(endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Present";
      return `${s} – ${e}`;
    }
    if (days === 0) return "Today";
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  })();

  const exportPDF = async () => {
    const el = researchRef.current;
    if (!el) return;

    const btn = el.querySelector(".research-export-btn");
    if (btn) { btn.textContent = "Generating PDF..."; btn.disabled = true; }

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Narrow to mobile width so bars and text fill the page
      const origOverflow = el.style.overflow;
      const origHeight = el.style.height;
      const origWidth = el.style.width;
      const origMaxWidth = el.style.maxWidth;
      const origPadding = el.style.padding;
      el.style.overflow = "visible";
      el.style.height = "auto";
      el.style.width = "500px";
      el.style.maxWidth = "500px";
      el.style.padding = "20px 16px";

      // Show the print title header, hide the export button
      const printTitle = el.querySelector(".research-print-title");
      if (printTitle) printTitle.style.display = "block";
      if (btn) btn.style.display = "none";

      // Wait for layout reflow at new width
      await new Promise(r => setTimeout(r, 500));

      // Measure section positions WHILE at 500px width (before capture)
      const sections = el.querySelectorAll(".research-chart-section, .research-diagnostic-section, .research-header, .research-quiz-header");
      const elRect = el.getBoundingClientRect();
      const sectionBounds = [];
      sections.forEach(s => {
        const r = s.getBoundingClientRect();
        sectionBounds.push({ top: r.top - elRect.top, bottom: r.bottom - elRect.top });
      });

      // Capture the entire element as one canvas
      const SCALE = 2;
      const fullCanvas = await html2canvas(el, {
        scale: SCALE,
        useCORS: false,
        allowTaint: true,
        backgroundColor: "#0a0a0a",
        logging: false,
      });

      // Restore DOM
      if (printTitle) printTitle.style.display = "none";
      if (btn) { btn.style.display = ""; btn.textContent = "Export PDF"; btn.disabled = false; }
      el.style.overflow = origOverflow;
      el.style.height = origHeight;
      el.style.width = origWidth;
      el.style.maxWidth = origMaxWidth;
      el.style.padding = origPadding;

      // Full bleed letter page (no margins — content fills edge to edge)
      const PAGE_W = 612;
      const PAGE_H = 792;
      const PAD = 20; // small inner padding in pts
      const CONTENT_W = PAGE_W - PAD * 2;
      const CONTENT_H = PAGE_H - PAD * 2;

      const imgW = fullCanvas.width;
      const imgH = fullCanvas.height;
      const pxScale = CONTENT_W / imgW; // canvas px → PDF pts
      const pxPerPage = CONTENT_H / pxScale; // canvas px that fit on one page

      // Scale section bounds to canvas pixels (multiply by html2canvas scale)
      const scaledSections = sectionBounds.map(s => ({
        top: s.top * SCALE,
        bottom: s.bottom * SCALE,
      }));

      // Build intelligent page breaks at section boundaries
      const breakPoints = [0];
      let cursor = 0;
      while (cursor + pxPerPage < imgH) {
        let idealBreak = cursor + pxPerPage;
        let bestBreak = idealBreak;

        // Walk backward from the ideal break to find a section boundary
        // that doesn't split a section in half
        for (let i = scaledSections.length - 1; i >= 0; i--) {
          const sec = scaledSections[i];
          // If this section starts before the ideal break and ends after it,
          // break BEFORE this section starts
          if (sec.top < idealBreak && sec.bottom > idealBreak) {
            bestBreak = sec.top;
            break;
          }
          // If this section ends cleanly before the ideal break, break after it
          if (sec.bottom <= idealBreak && sec.bottom > cursor + pxPerPage * 0.3) {
            bestBreak = sec.bottom;
            break;
          }
        }

        // Don't allow a break that makes zero progress
        if (bestBreak <= cursor) bestBreak = idealBreak;
        breakPoints.push(bestBreak);
        cursor = bestBreak;
      }
      breakPoints.push(imgH);

      // Create multi-page PDF with full bleed background
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

      for (let i = 0; i < breakPoints.length - 1; i++) {
        if (i > 0) pdf.addPage();

        // Full bleed background
        pdf.setFillColor(10, 10, 10);
        pdf.rect(0, 0, PAGE_W, PAGE_H, "F");

        const srcY = Math.round(breakPoints[i]);
        const srcH = Math.round(breakPoints[i + 1] - srcY);
        if (srcH <= 0) continue;

        // Slice the captured canvas for this page
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = imgW;
        pageCanvas.height = srcH;
        const ctx = pageCanvas.getContext("2d");
        ctx.drawImage(fullCanvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);

        const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
        const drawH = srcH * pxScale;
        pdf.addImage(pageImgData, "JPEG", PAD, PAD, CONTENT_W, drawH);
      }

      const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      pdf.save(`Unchained_Research_Report_${date}.pdf`);
    } catch (e) {
      console.error("PDF export error:", e);
      if (btn) { btn.textContent = "Export PDF"; btn.disabled = false; }
    }
  };

  // Map option IDs to human-readable labels and group by question category
  const labelMap = {
    // Demographics
    male: "Male", female: "Female",
    age_18_24: "18-24", age_25_34: "25-34", age_35_44: "35-44", age_45_54: "45-54",
    age_55_64: "55-64", age_65_74: "65-74", age_75_84: "75-84", age_85_plus: "85+",
    // Sexual behaviors
    viewing_porn: "Viewing Porn", scrolling_social: "Scrolling Social Media", fantasy_daydream: "Fantasy/Daydream",
    compulsive_mb: "Compulsive MB", sexting: "Sexting", physical_acting: "Physical Acting Out", massage_parlors: "Massage Parlors",
    // Other vices
    vice_alcohol: "Alcohol", vice_thc: "THC/Cannabis", vice_substances: "Substances", vice_overeating: "Overeating",
    vice_gambling: "Gambling", vice_gaming: "Gaming", vice_spending: "Spending", vice_social_media: "Social Media",
    vice_work: "Workaholism", vice_nicotine: "Nicotine", vice_none: "None",
    // Frequency
    daily: "Daily", several_week: "Several/Week", weekly: "Weekly", few_month: "Few/Month", binge_purge: "Binge/Purge",
    // Escalation
    need_more_extreme: "Need More Extreme", crossed_lines: "Crossed Lines", added_behaviors: "Added Behaviors", stayed_same: "Stayed Same",
    // Content themes
    val_desired: "Feeling Desired", val_amateur: "Amateur/Real", pow_dominance: "Dominance", pow_degradation: "Degradation",
    sur_someone_control: "Someone In Control", sur_dominated: "Being Dominated", tab_wrong: "Taboo/Wrong",
    tab_secrecy: "Secrecy", tab_incest: "Incest Themes", voy_watching: "Voyeurism", voy_partner: "Partner Watching",
    ten_emotional: "Emotional/Tender", nov_new: "Novelty/New", nov_search: "Searching for New", nov_anime: "Anime/Hentai",
    conf_race: "Racial Themes", conf_samesex: "Same-Sex", conf_trans: "Trans", conf_pain: "Pain/BDSM",
    conf_crossdressing: "Crossdressing", cat_lesbian: "Lesbian", cat_milf: "MILF", cat_youth: "Youthful",
    cat_group: "Group", cat_bodytype: "Body Type", cat_solo: "Solo", cat_pov: "POV",
    // Emotional function
    calm_stress: "Calm Stress", feel_less_alone: "Feel Less Alone", feel_powerful: "Feel Powerful",
    numb_checkout: "Numb/Checkout", feel_wanted: "Feel Wanted", escape_reality: "Escape Reality",
    manage_anger: "Manage Anger", feel_something: "Feel Something", after_conflict: "After Conflict",
    after_serving: "After Serving Others", distant_god: "Distant from God", spiritual_growth: "Spiritual Struggle",
    // Life stress
    life_romantic_abundance: "Romance: Abundance", life_romantic_lack: "Romance: Lack",
    life_health_abundance: "Health: Abundance", life_health_lack: "Health: Lack",
    life_financial_abundance: "Finances: Abundance", life_financial_lack: "Finances: Lack",
    life_work_abundance: "Work: Abundance", life_work_lack: "Work: Lack",
    life_god_abundance: "God: Abundance", life_god_lack: "God: Lack",
    // First exposure
    under_8: "Under 8", age_8_11: "8-11", age_12_14: "12-14", age_15_plus: "15+",
    // Exposure method
    found_own: "Found on Own", peer_showed: "Peer Showed", older_showed: "Older Person Showed",
    abused: "Abused/Exposed", parent_collection: "Parent's Collection", witnessed: "Witnessed", dont_remember: "Don't Remember",
    // Home environment
    home_warm: "Warm & Safe", home_cold: "Cold/Distant", home_unpredictable: "Unpredictable",
    home_conflict: "High Conflict", home_controlled: "Controlling", home_conditional: "Conditional Love", home_no_emotions: "No Emotions Allowed",
    // Father
    dad_close: "Close/Connected", dad_distant: "Distant/Absent", dad_critical: "Critical/Harsh",
    dad_approval: "Approval-Based", dad_sexual: "Had Sexual Issues",
    // Mother
    mom_close: "Close/Connected", mom_enmeshed: "Enmeshed/Overinvolved", mom_distant: "Distant/Absent",
    mom_critical: "Critical/Controlling", mom_responsible: "Felt Responsible For",
    // Church
    church_shameful: "Sex = Shameful", church_purity: "Purity Culture", church_thoughts_sin: "Thoughts = Sin",
    church_good_kid: "Had to Be Good", church_conditional: "Conditional Acceptance",
    // Attachment
    anx_leave: "Fear of Leaving", anx_reassurance: "Need Reassurance", anx_conflict_end: "Fear Conflict = End",
    avoid_pull_away: "Pull Away When Close", avoid_sexual_easy: "Sexual > Emotional", avoid_withdraw: "Withdraw Under Stress",
    fear_crave_push: "Crave Then Push", fear_both: "Want Both/Neither", fear_swing: "Swing Between Extremes",
    sec_comfortable: "Comfortable Close", sec_conflict_ok: "Conflict Doesn't Threaten", sec_trust: "Trust Partner",
    god_disappointed: "God Disappointed", god_avoid: "Avoid God After Acting Out",
    god_grace_cant_feel: "Know Grace, Can't Feel", god_like_father: "God Like Father", god_performance: "Performance-Based Faith",
    // Relational patterns
    cod_needs: "Ignore Own Needs", cod_responsible: "Responsible for Others' Feelings", cod_worth: "Worth = Usefulness",
    enm_parent_emotions: "Managed Parent's Emotions", enm_therapist: "Therapist in Relationships", enm_boundaries: "Weak Boundaries",
    void_no_one: "No One Really Knows Me", void_perform: "Perform to Connect", void_never_told: "Never Told Anyone",
    lead_disqualified: "Feel Disqualified", lead_no_one_serves: "No One Serves Me", lead_lose_position: "Fear Losing Position",
    // Strategies
    strat_filters: "Content Filters", strat_accountability: "Accountability Partner", strat_prayer: "Prayer/Fasting",
    strat_willpower: "Willpower/White-knuckling", strat_therapy: "Therapy/Counseling", strat_group: "Support Group",
    strat_rehab: "Rehab/Intensive", strat_program: "Online Program", strat_confession: "Confession",
    strat_books: "Books/Podcasts", strat_cold_turkey: "Cold Turkey", strat_medication: "Medication",
    strat_deliverance: "Deliverance Ministry", strat_environment: "Changed Environment", strat_dating: "Started Dating/Marriage", strat_nothing: "Nothing Yet",
    // Years fighting
    years_under2: "Under 2 Years", years_2_5: "2-5 Years", years_5_10: "5-10 Years", years_10_20: "10-20 Years", years_20_plus: "20+ Years",
  };

  // Define question categories with their option IDs grouped
  // Build a lookup from selection ID → count (must be first so respondent counts can use it)
  const selectionCounts = {};
  (distributions || []).forEach(d => {
    selectionCounts[d.selection] = (selectionCounts[d.selection] || 0) + parseInt(d.count);
  });

  // Helper: sum counts for a list of IDs (gives respondent total for single-select questions)
  const sumIds = (ids) => ids.reduce((s, id) => s + (selectionCounts[id] || 0), 0);

  // Per-section respondent counts derived from single-select questions in each section
  const sec0 = sumIds(["male", "female"]); // Gender
  const sec1 = sumIds(["daily", "several_week", "weekly", "few_month", "binge_purge"]); // Frequency
  const sec4 = sumIds(["life_romantic_abundance", "life_romantic_lack"]); // one Life Stress pair
  const sec5 = sumIds(["under_8", "age_8_11", "age_12_14", "age_15_plus"]); // Age of First Exposure
  const sec9 = sumIds(["years_under2", "years_2_5", "years_5_10", "years_10_20", "years_20_plus"]); // Years Fighting

  const categories = [
    { title: "Gender", color: "#9C27B0", ids: ["male", "female"] },
    { title: "Age Range", color: "#673AB7", ids: ["age_18_24","age_25_34","age_35_44","age_45_54","age_55_64","age_65_74","age_75_84","age_85_plus"] },
    { title: "Sexual Behaviors", color: "#f44336", multi: sec1, ids: ["viewing_porn","scrolling_social","fantasy_daydream","compulsive_mb","sexting","physical_acting","massage_parlors"] },
    { title: "Other Vices / Coping", color: "#E91E63", multi: sec1, ids: ["vice_alcohol","vice_thc","vice_substances","vice_overeating","vice_gambling","vice_gaming","vice_spending","vice_social_media","vice_work","vice_nicotine","vice_none"] },
    { title: "Frequency", color: "#FF5722", ids: ["daily","several_week","weekly","few_month","binge_purge"] },
    { title: "Escalation Pattern", color: "#FF9800", multi: sec1, ids: ["need_more_extreme","crossed_lines","added_behaviors","stayed_same"] },
    { title: "Content Themes (Pornography Types)", color: "#c5a55a", compact: true, multi: sec1, ids: ["val_desired","val_amateur","pow_dominance","pow_degradation","sur_someone_control","sur_dominated","tab_wrong","tab_secrecy","tab_incest","voy_watching","voy_partner","ten_emotional","nov_new","nov_search","nov_anime","conf_race","conf_samesex","conf_trans","conf_pain","conf_crossdressing","cat_lesbian","cat_milf","cat_youth","cat_group","cat_bodytype","cat_solo","cat_pov"] },
    { title: "Emotional Function", color: "#00BCD4", multi: sec1, ids: ["calm_stress","feel_less_alone","feel_powerful","numb_checkout","feel_wanted","escape_reality","manage_anger","feel_something","after_conflict","after_serving","distant_god","spiritual_growth"] },
    { title: "Life Stress Areas", color: "#8BC34A", multi: sec4, ids: ["life_romantic_abundance","life_romantic_lack","life_health_abundance","life_health_lack","life_financial_abundance","life_financial_lack","life_work_abundance","life_work_lack","life_god_abundance","life_god_lack"] },
    { title: "Age of First Exposure", color: "#f44336", ids: ["under_8","age_8_11","age_12_14","age_15_plus"] },
    { title: "How First Exposure Happened", color: "#E91E63", multi: sec5, ids: ["found_own","peer_showed","older_showed","abused","parent_collection","witnessed","dont_remember"] },
    { title: "Home Environment", color: "#795548", multi: sec5, ids: ["home_warm","home_cold","home_unpredictable","home_conflict","home_controlled","home_conditional","home_no_emotions"] },
    { title: "Father Relationship", color: "#607D8B", multi: sec5, ids: ["dad_close","dad_distant","dad_critical","dad_approval","dad_sexual"] },
    { title: "Mother Relationship", color: "#9E9E9E", multi: sec5, ids: ["mom_close","mom_enmeshed","mom_distant","mom_critical","mom_responsible"] },
    { title: "Church / Faith Background", color: "#FF9800", multi: sec5, ids: ["church_shameful","church_purity","church_thoughts_sin","church_good_kid","church_conditional"] },
    { title: "Attachment Patterns", color: "#2196F3", multi: sec5, ids: ["anx_leave","anx_reassurance","anx_conflict_end","avoid_pull_away","avoid_sexual_easy","avoid_withdraw","fear_crave_push","fear_both","fear_swing","sec_comfortable","sec_conflict_ok","sec_trust","god_disappointed","god_avoid","god_grace_cant_feel","god_like_father","god_performance"] },
    { title: "Relational Patterns", color: "#3F51B5", multi: sec5, ids: ["cod_needs","cod_responsible","cod_worth","enm_parent_emotions","enm_therapist","enm_boundaries","void_no_one","void_perform","void_never_told","lead_disqualified","lead_no_one_serves","lead_lose_position"] },
    { title: "Strategies Tried", color: "#4CAF50", multi: sec9, ids: ["strat_filters","strat_accountability","strat_prayer","strat_willpower","strat_therapy","strat_group","strat_rehab","strat_program","strat_confession","strat_books","strat_cold_turkey","strat_medication","strat_deliverance","strat_environment","strat_dating","strat_nothing"] },
    { title: "Years Fighting", color: "#009688", ids: ["years_under2","years_2_5","years_5_10","years_10_20","years_20_plus"] },
  ];

  return (
    <div ref={researchRef}>
      {/* PDF header — visible on screen as a toolbar, expanded in print */}
      <div className="research-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div className="research-print-title" style={{ display: "none" }}>
            <img src="/images/unchained-logo.png" alt="Unchained Leader" style={{ height: 28, marginBottom: 6 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: "#c5a55a", letterSpacing: 2 }}>UNCHAINED ANALYTICS — RESEARCH REPORT</div>
          </div>
          <div style={{ fontSize: 13, color: "#888" }}>Date Range: <span style={{ color: "#ccc", fontWeight: 500 }}>{dateLabel}</span></div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Generated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
        <button onClick={exportPDF} className="research-export-btn" style={{ ...S.refreshBtn, fontSize: 13, padding: "8px 18px" }}>Export PDF</button>
      </div>

      {/* Diagnostic results (from completed reports) */}
      {diagnostics?.length > 0 && (<div className="research-diagnostic-section"><h2 style={S.sectionTitle}>Arousal Template Types</h2>
        <BarChart items={diagnostics.map(d => ({ label: d.arousal_template_type || "Unknown", value: parseInt(d.count) }))} color="#c5a55a" /></div>)}
      {attachments?.length > 0 && (<div className="research-diagnostic-section"><h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Attachment Styles</h2>
        <BarChart items={attachments.map(a => ({ label: a.attachment_style || "Unknown", value: parseInt(a.count) }))} color="#2196F3" /></div>)}
      {neuropathways?.length > 0 && (<div className="research-diagnostic-section"><h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Neuropathways</h2>
        <BarChart items={neuropathways.map(n => ({ label: n.neuropathway || "Unknown", value: parseInt(n.count) }))} color="#4CAF50" /></div>)}
      {relational?.[0]?.total > 0 && (<div className="research-diagnostic-section"><h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Relational Averages (n={relational[0].total})</h2>
        <BarChart items={[
          { label: "Codependency", value: parseFloat(relational[0].avg_codependency) || 0 },
          { label: "Enmeshment", value: parseFloat(relational[0].avg_enmeshment) || 0 },
          { label: "Relational Void", value: parseFloat(relational[0].avg_relational_void) || 0 },
          { label: "Leadership Burden", value: parseFloat(relational[0].avg_leadership_burden) || 0 },
        ]} color="#FF9800" maxOverride={3} /></div>)}

      {/* Quiz response breakdowns by category */}
      {distributions?.length > 0 && (<>
        <div className="research-quiz-header" style={{ marginTop: 32, marginBottom: 8, borderTop: "1px solid #222", paddingTop: 24 }}>
          <h2 style={S.sectionTitle}>Quiz Response Breakdowns</h2>
          <p style={{ color: "#555", fontSize: 12, margin: "0 0 16px" }}>Every selection from all quiz sections, organized by category</p>
        </div>
        {categories.map((cat, ci) => {
          const items = cat.ids
            .map(id => ({ label: labelMap[id] || id, value: selectionCounts[id] || 0 }))
            .filter(item => item.value > 0)
            .sort((a, b) => b.value - a.value);
          if (items.length === 0) return null;
          return (
            <div key={ci} className="research-chart-section" style={{ marginTop: ci > 0 ? 20 : 0 }}>
              <h3 style={{ fontSize: 13, color: cat.color, fontWeight: 600, margin: "0 0 8px", letterSpacing: 0.5 }}>{cat.title}</h3>
              <BarChart items={items} color={cat.color} compact={cat.compact} percentBase={cat.multi > 0 ? cat.multi : undefined} />
            </div>
          );
        })}
      </>)}

      {(!diagnostics || diagnostics.length === 0) && (!distributions || distributions.length === 0) && <Empty msg="No research data yet." />}
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

// ═══ SUBMISSIONS (Geo / Location) ═══
function SubmissionsView({ product, days }) {
  const [subData, setSubData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";
    if (!s) return;
    setLoading(true);
    fetch(`${API}?secret=${encodeURIComponent(s)}&view=submissions&product=${product}&days=${days}&limit=50`)
      .then(r => r.json())
      .then(d => { setSubData(d); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, [product, days]);

  if (loading) return <div style={{ color: "#666", padding: 20 }}>Loading submissions...</div>;
  if (!subData) return <Empty msg="No submission data available." />;

  const { submissions, total, locationBreakdown } = subData;

  const formatLocation = (row) => {
    const parts = [row.geo_city, row.geo_region, row.geo_country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Unknown";
  };

  return (
    <div>
      <h2 style={S.sectionTitle}>Recent Submissions ({total} total)</h2>

      {locationBreakdown && locationBreakdown.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, color: "#888", marginBottom: 8, fontWeight: 500 }}>Top Locations</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {locationBreakdown.map((loc, i) => {
              const label = [loc.geo_city, loc.geo_region, loc.geo_country].filter(Boolean).join(", ");
              return (
                <div key={i} style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#ccc" }}>
                  {label || "Unknown"} <span style={{ color: "#c5a55a", fontWeight: 600, marginLeft: 4 }}>{loc.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {submissions && submissions.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Date</th>
                <th style={S.th}>Name</th>
                <th style={S.th}>Email</th>
                <th style={S.th}>Source</th>
                <th style={S.th}>Location</th>
                <th style={S.th}>IP</th>
                <th style={S.th}>Type</th>
                <th style={S.th}>Attachment</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((row, i) => (
                <tr key={row.id || i}>
                  <td style={{ ...S.td, whiteSpace: "nowrap", fontSize: 11 }}>
                    {new Date(row.created_at).toLocaleDateString()}{" "}
                    <span style={{ color: "#555" }}>{new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td style={{ ...S.td, fontWeight: 500 }}>{row.name || "—"}</td>
                  <td style={{ ...S.td, fontSize: 11, color: "#999" }}>{row.email || row.session_id}</td>
                  <td style={{ ...S.td, fontSize: 11, color: row.traffic_source && row.traffic_source !== "direct" ? "#4CAF50" : "#555", fontWeight: 500 }}>
                    {row.traffic_source || "direct"}
                  </td>
                  <td style={S.td}>
                    <span style={{ color: formatLocation(row) !== "Unknown" ? "#c5a55a" : "#555" }}>
                      {formatLocation(row)}
                    </span>
                    {row.geo_lat && row.geo_lon && (
                      <span style={{ fontSize: 10, color: "#444", marginLeft: 4 }}>
                        ({Number(row.geo_lat).toFixed(1)}, {Number(row.geo_lon).toFixed(1)})
                      </span>
                    )}
                  </td>
                  <td style={{ ...S.td, fontSize: 11, color: "#666", fontFamily: "monospace" }}>{row.ip_address || "—"}</td>
                  <td style={{ ...S.td, fontSize: 11 }}>{row.arousal_template_type || "—"}</td>
                  <td style={{ ...S.td, fontSize: 11 }}>{row.attachment_style || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty msg="No submissions in this time period." />
      )}
    </div>
  );
}

// ═══ LOCATIONS (3D Globe) ═══
function LocationsView({ product }) {
  const [locData, setLocData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const globeContainerRef = useRef(null);
  const globeInstanceRef = useRef(null);
  const allLabelsRef = useRef([]);

  const fetchLocations = useCallback(() => {
    const s = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";
    if (!s) return;
    setLoading(true);
    setSelectedPoint(null);
    let url = `${API}?secret=${encodeURIComponent(s)}&view=locations&product=${product}`;
    if (timeFilter === "custom" && customStart && customEnd) {
      url += `&startDate=${customStart}&endDate=${customEnd}`;
    } else if (timeFilter === "all") {
      url += `&days=36500`;
    } else {
      url += `&days=${timeFilter}`;
    }
    fetch(url)
      .then(r => r.json())
      .then(d => { setLocData(d); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, [product, timeFilter, customStart, customEnd]);

  useEffect(() => {
    if (timeFilter !== "custom") fetchLocations();
  }, [fetchLocations, timeFilter]);

  // Render globe using shared renderer
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        if (!locData || !globeContainerRef.current) return;
        await loadD3Scripts();
        if (cancelled) return;
        const container = globeContainerRef.current;
        const cw = container.offsetWidth || 900;
        const w = cw;
        const h = Math.max(600, Math.min(cw * 0.65, 800));

        const { countries, usStates } = await fetchGlobeTopology();
        if (cancelled || !globeContainerRef.current) return;

        const points = (locData.locations || []).map(l => ({
          coords: [parseFloat(l.geo_lon), parseFloat(l.geo_lat)],
          count: parseInt(l.count) || 1,
          city: l.geo_city || "Unknown",
          region: l.geo_region || "",
          country: l.geo_country || "Unknown",
        }));

        globeInstanceRef.current = renderGlobe(container, { points, countries, usStates, w, h, uniqueId: "lv" });
      } catch (e) { console.warn("LocationsView globe error:", e); }
    };
    init();
    return () => {
      cancelled = true;
      if (globeInstanceRef.current) globeInstanceRef.current.cleanup();
      globeInstanceRef.current = null;
      if (globeContainerRef.current) globeContainerRef.current.innerHTML = "";
    };
  }, [locData]);

  const filterPresets = [
    { label: "7 Days", value: "7" },
    { label: "30 Days", value: "30" },
    { label: "60 Days", value: "60" },
    { label: "90 Days", value: "90" },
    { label: "All Time", value: "all" },
    { label: "Custom", value: "custom" },
  ];

  const pillStyle = (active) => ({
    background: active ? "linear-gradient(135deg, #DFC468, #9A7730)" : "#1a1a1a",
    color: active ? "#000" : "#888",
    border: active ? "none" : "1px solid #333",
    borderRadius: 20,
    padding: "6px 16px",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    transition: "all 0.2s",
  });

  const summary = locData?.summary || {};
  const topLocations = locData?.topLocations || [];

  return (
    <div>
      <h2 style={S.sectionTitle}>Global Submission Map</h2>

      {/* Time filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {filterPresets.map(p => (
          <button key={p.value} onClick={() => setTimeFilter(p.value)} style={pillStyle(timeFilter === p.value)}>
            {p.label}
          </button>
        ))}
        {timeFilter === "custom" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 4 }}>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              style={{ background: "#1a1a1a", color: "#ccc", border: "1px solid #333", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "inherit" }} />
            <span style={{ color: "#555", fontSize: 12 }}>to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              style={{ background: "#1a1a1a", color: "#ccc", border: "1px solid #333", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "inherit" }} />
            <button onClick={fetchLocations} disabled={!customStart || !customEnd}
              style={{ ...pillStyle(true), opacity: (!customStart || !customEnd) ? 0.5 : 1 }}>Apply</button>
          </div>
        )}
      </div>

      {/* Summary stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#C5A55A" }}>{summary.total_submissions || 0}</div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Total Submissions</div>
        </div>
        <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#4CAF50" }}>{summary.unique_countries || 0}</div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Countries</div>
        </div>
        <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#2196F3" }}>{summary.unique_cities || 0}</div>
          <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Cities</div>
        </div>
      </div>

      {/* Globe full-width */}
      <div>
        <div style={{ width: "100%" }}>
          <div ref={globeContainerRef}
            style={{ width: "100%", background: "#000", borderRadius: 12, border: "1px solid #222", overflow: "hidden", minHeight: 600 }}>
            {loading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: "#555" }}>
                Loading globe...
              </div>
            )}
          </div>
          <p style={{ color: "#555", fontSize: 11, marginTop: 6 }}>
            Drag to rotate, scroll to zoom, click points for details. Gold points sized by submission count.
          </p>
          {/* Selected point detail */}
          {selectedPoint && (
            <div style={{ background: "#141414", border: "1px solid #C5A55A", borderRadius: 8, padding: "12px 16px", marginTop: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#C5A55A" }}>
                {[selectedPoint.city, selectedPoint.region, selectedPoint.country].filter(Boolean).join(", ")}
              </div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
                {selectedPoint.count} submission{selectedPoint.count !== 1 ? "s" : ""} &middot;
                Coords: {selectedPoint.lat.toFixed(2)}, {selectedPoint.lng.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top locations bar chart — full width below globe */}
      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13, color: "#888", marginBottom: 12, fontWeight: 500, margin: "0 0 12px" }}>Top Locations</h3>
        {topLocations.length > 0 ? (() => {
          const maxCount = Math.max(...topLocations.map(l => l.count));
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topLocations.slice(0, 20).map((loc, i) => {
                const label = [loc.geo_city, loc.geo_region, loc.geo_country].filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } }).join(", ");
                const pct = maxCount > 0 ? (loc.count / maxCount) * 100 : 0;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#555", fontSize: 10, width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ color: "#ccc", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label || "Unknown"}</span>
                        <span style={{ color: "#C5A55A", fontSize: 11, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{loc.count}</span>
                      </div>
                      <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #C5A55A, #E8D48B)", borderRadius: 3, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })() : (
          <div style={{ color: "#555", fontSize: 12, padding: 16, textAlign: "center" }}>
            {loading ? "Loading..." : "No location data in this period."}
          </div>
        )}
      </div>
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

// ═══ PIPELINE ═══
function PipelineView({ days }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPipeline = async () => {
    setLoading(true);
    try {
      const s = sessionStorage.getItem("admin_secret");
      const r = await fetch(`${API}?secret=${encodeURIComponent(s)}&view=pipeline&days=${days}`);
      setData(await r.json());
    } catch (e) { console.error("Pipeline fetch error:", e); }
    setLoading(false);
  };

  useEffect(() => { fetchPipeline(); }, [days]);

  if (loading) return <div style={{ color: "#666", padding: 40 }}>Loading pipeline metrics...</div>;
  if (!data || data.error) return <div style={{ color: "#f44336", padding: 40 }}>Failed to load pipeline data. Run the migration first.</div>;

  const c = data.counts || {};
  const cap = data.capacity || {};
  const vel = data.velocity || {};
  const capColor = cap.pctUsed > 80 ? "#f44336" : cap.pctUsed > 50 ? "#FF9800" : "#4CAF50";
  const costDollars = (c.totalCostCents / 100).toFixed(2);
  const avgCostDollars = c.reportsComplete > 0 ? (c.totalCostCents / c.reportsComplete / 100).toFixed(2) : "0.00";
  const avgDurationSec = (c.avgDurationMs / 1000).toFixed(1);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={S.sectionTitle}>Pipeline Monitoring</h2>
        <button onClick={fetchPipeline} style={S.refreshBtn}>Refresh</button>
      </div>

      {/* Top metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <PipelineCard label="Reports Generated" value={c.reportsComplete} color="#4CAF50" />
        <PipelineCard label="Failed" value={c.reportsFailed} color={c.reportsFailed > 0 ? "#f44336" : "#4CAF50"} />
        <PipelineCard label="Recovered" value={`${data.recovery?.recoveredEmails || 0}/${data.recovery?.totalFailedEmails || 0}`}
          color={parseFloat(data.recovery?.recoveryPct || 100) >= 90 ? "#4CAF50" : parseFloat(data.recovery?.recoveryPct || 100) >= 50 ? "#FF9800" : "#f44336"} />
        <PipelineCard label="Recovery Rate" value={`${data.recovery?.recoveryPct || "100"}%`}
          color={parseFloat(data.recovery?.recoveryPct || 100) >= 90 ? "#4CAF50" : parseFloat(data.recovery?.recoveryPct || 100) >= 50 ? "#FF9800" : "#f44336"} />
        <PipelineCard label="Rate Limited" value={c.rateLimited} color={c.rateLimited > 0 ? "#FF9800" : "#4CAF50"} />
        <PipelineCard label="Total Cost" value={`$${costDollars}`} color="#c5a55a" />
        <PipelineCard label="Avg Duration" value={`${avgDurationSec}s`} color="#2196F3" />
        <PipelineCard label="Avg Cost/Report" value={`$${avgCostDollars}`} color="#c5a55a" />
        <PipelineCard label="Emails Sent Today" value={data.emailsToday} color="#2196F3" />
      </div>

      {/* Capacity gauge */}
      <div style={{ background: "#111", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #222" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: "#999", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>Output TPM Capacity (last 60s)</span>
          <span style={{ color: capColor, fontWeight: 700, fontSize: 18 }}>{cap.pctUsed}%</span>
        </div>
        <div style={{ width: "100%", height: 10, background: "#1a1a1a", borderRadius: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 5, background: capColor, width: `${Math.min(cap.pctUsed, 100)}%`, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ color: "#555", fontSize: 11 }}>{(cap.currentOutputTPM || 0).toLocaleString()} tokens</span>
          <span style={{ color: "#555", fontSize: 11 }}>Tier limit: {(cap.tpmLimit || 0).toLocaleString()} TPM</span>
        </div>
      </div>

      {/* Velocity */}
      <div style={{ background: "#111", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #222" }}>
        <div style={{ color: "#999", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Current Velocity</div>
        <div style={{ display: "flex", gap: 24 }}>
          <div><span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>{vel.last1min}</span><span style={{ color: "#555", fontSize: 12, marginLeft: 6 }}>last 1 min</span></div>
          <div><span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>{vel.last5min}</span><span style={{ color: "#555", fontSize: 12, marginLeft: 6 }}>last 5 min</span></div>
          <div><span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>{vel.last60min}</span><span style={{ color: "#555", fontSize: 12, marginLeft: 6 }}>last hour</span></div>
        </div>
      </div>

      {/* Token breakdown */}
      <div style={{ background: "#111", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #222" }}>
        <div style={{ color: "#999", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Token Usage ({days}d)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ color: "#666", fontSize: 11 }}>Input Tokens (total)</div>
            <div style={{ color: "#ccc", fontSize: 18, fontWeight: 600 }}>{c.totalInputTokens?.toLocaleString()}</div>
            <div style={{ color: "#555", fontSize: 11 }}>avg {c.avgInputTokens?.toLocaleString()}/report</div>
          </div>
          <div>
            <div style={{ color: "#666", fontSize: 11 }}>Output Tokens (total)</div>
            <div style={{ color: "#ccc", fontSize: 18, fontWeight: 600 }}>{c.totalOutputTokens?.toLocaleString()}</div>
            <div style={{ color: "#555", fontSize: 11 }}>avg {c.avgOutputTokens?.toLocaleString()}/report</div>
          </div>
        </div>
      </div>

      {/* Reports per hour chart */}
      {data.hourly && data.hourly.length > 0 && (
        <div style={{ background: "#111", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #222" }}>
          <div style={{ color: "#999", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Reports Per Hour (24h)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
            {data.hourly.map((h, i) => {
              const maxReports = Math.max(...data.hourly.map(x => parseInt(x.reports) || 0), 1);
              const barH = Math.max(2, (parseInt(h.reports) / maxReports) * 70);
              const hasFailures = parseInt(h.failures) > 0;
              return (
                <div key={i} title={`${new Date(h.hour).toLocaleString()}: ${h.reports} reports${hasFailures ? `, ${h.failures} failures` : ""}`}
                  style={{ flex: 1, height: barH, borderRadius: 2, background: hasFailures ? "#f44336" : "#4CAF50", minWidth: 4 }} />
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>Hover for details. Red = failures in that hour.</div>
        </div>
      )}

      {/* Rate limit events */}
      {data.rateLimitEvents && data.rateLimitEvents.length > 0 && (
        <div style={{ background: "#111", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #222" }}>
          <div style={{ color: "#FF9800", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Rate Limit Events ({data.rateLimitEvents.length})</div>
          {data.rateLimitEvents.slice(0, 10).map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid #1a1a1a", fontSize: 12 }}>
              <span style={{ color: "#666", minWidth: 140 }}>{new Date(e.created_at).toLocaleString()}</span>
              <span style={{ color: "#999" }}>{e.email}</span>
              <span style={{ color: "#FF9800" }}>{e.error_message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Failure events */}
      {data.failureEvents && data.failureEvents.length > 0 && (
        <div style={{ background: "#111", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #222" }}>
          <div style={{ color: "#f44336", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Failures ({data.failureEvents.length})</div>
          {data.failureEvents.slice(0, 10).map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid #1a1a1a", fontSize: 12 }}>
              <span style={{ color: "#666", minWidth: 140 }}>{new Date(e.created_at).toLocaleString()}</span>
              <span style={{ color: "#999" }}>{e.email}</span>
              <span style={{ color: "#f44336" }}>{e.error_message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recovery details */}
      {data.recovery && data.recovery.totalFailedEmails > 0 && (
        <div style={{ background: "#111", borderRadius: 8, padding: 16, marginBottom: 24, border: "1px solid #222" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: "#4CAF50", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>
              Recovery Details
            </div>
            <div style={{ fontSize: 12 }}>
              <span style={{ color: "#4CAF50", fontWeight: 600 }}>{data.recovery.recoveredEmails} recovered</span>
              {data.recovery.unrecoveredEmails > 0 && (
                <span style={{ color: "#f44336", fontWeight: 600, marginLeft: 12 }}>{data.recovery.unrecoveredEmails} unrecovered</span>
              )}
            </div>
          </div>

          {/* Recovery rate bar */}
          <div style={{ width: "100%", height: 8, background: "#1a1a1a", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ height: "100%", borderRadius: 4, background: parseFloat(data.recovery.recoveryPct) >= 90 ? "#4CAF50" : parseFloat(data.recovery.recoveryPct) >= 50 ? "#FF9800" : "#f44336", width: `${data.recovery.recoveryPct}%` }} />
          </div>

          {/* Recently recovered reports */}
          {data.recoveredRecent && data.recoveredRecent.length > 0 && (
            <>
              <div style={{ color: "#666", fontSize: 11, marginBottom: 8, letterSpacing: 1 }}>RECENTLY RECOVERED</div>
              {data.recoveredRecent.slice(0, 10).map((r, i) => {
                const recoverySec = parseInt(r.recovery_seconds) || 0;
                const recoveryLabel = recoverySec < 60 ? `${recoverySec}s` : recoverySec < 3600 ? `${Math.round(recoverySec / 60)}m` : `${(recoverySec / 3600).toFixed(1)}h`;
                return (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid #1a1a1a", fontSize: 12, alignItems: "center" }}>
                    <span style={{ color: "#666", minWidth: 140 }}>{new Date(r.recovered_at).toLocaleString()}</span>
                    <span style={{ color: "#999", flex: 1 }}>{r.email}</span>
                    <span style={{ color: "#4CAF50", fontWeight: 600, fontSize: 11 }}>Recovered in {recoveryLabel}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineCard({ label, value, color }) {
  return (
    <div style={{ background: "#111", borderRadius: 8, padding: "14px 16px", border: "1px solid #222" }}>
      <div style={{ color: "#666", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || "#fff", fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ═══ EXPORT ═══
// ═══ AI ANALYST CHART + MARKDOWN ═══
const CHART_COLORS = ["#DFC468", "#c5a55a", "#2196F3", "#4CAF50", "#FF9800", "#9C27B0", "#f44336", "#00BCD4", "#E91E63", "#607D8B"];

const chartTooltipStyle = {
  contentStyle: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#ccc", fontSize: 12 },
  itemStyle: { color: "#ccc" },
  labelStyle: { color: "#c5a55a", fontWeight: 600 },
};

function AnalystChart({ chart }) {
  const { type, title, data, xLabel, yLabel } = chart;
  if (!data || data.length === 0) return null;

  const chartData = data.map(d => ({ name: d.label, value: d.value }));

  return (
    <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 12, padding: "16px 12px", margin: "10px 0" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#c5a55a", marginBottom: 12, letterSpacing: 0.5 }}>{title}</div>
      {(type === "bar") && (
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
          <RBarChart data={chartData} layout="horizontal" margin={{ top: 4, right: 12, left: 8, bottom: xLabel ? 24 : 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 10 }} axisLine={{ stroke: "#333" }} tickLine={false} angle={data.length > 6 ? -35 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 60 : 30} label={xLabel ? { value: xLabel, position: "insideBottom", offset: -4, fill: "#666", fontSize: 10 } : undefined} />
            <YAxis tick={{ fill: "#888", fontSize: 10 }} axisLine={{ stroke: "#333" }} tickLine={false} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "#666", fontSize: 10 } : undefined} />
            <Tooltip {...chartTooltipStyle} cursor={{ fill: "rgba(197,165,90,0.08)" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </RBarChart>
        </ResponsiveContainer>
      )}
      {(type === "horizontal_bar") && (
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
          <RBarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#888", fontSize: 10 }} axisLine={{ stroke: "#333" }} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#aaa", fontSize: 11 }} axisLine={{ stroke: "#333" }} tickLine={false} width={120} />
            <Tooltip {...chartTooltipStyle} cursor={{ fill: "rgba(197,165,90,0.08)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </RBarChart>
        </ResponsiveContainer>
      )}
      {type === "pie" && (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: "#444" }} style={{ fontSize: 10, fill: "#ccc" }}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip {...chartTooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      )}
      {type === "line" && (
        <ResponsiveContainer width="100%" height={220}>
          <RLineChart data={chartData} margin={{ top: 4, right: 12, left: 8, bottom: xLabel ? 24 : 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 10 }} axisLine={{ stroke: "#333" }} tickLine={false} angle={data.length > 8 ? -35 : 0} textAnchor={data.length > 8 ? "end" : "middle"} height={data.length > 8 ? 50 : 30} label={xLabel ? { value: xLabel, position: "insideBottom", offset: -4, fill: "#666", fontSize: 10 } : undefined} />
            <YAxis tick={{ fill: "#888", fontSize: 10 }} axisLine={{ stroke: "#333" }} tickLine={false} label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "#666", fontSize: 10 } : undefined} />
            <Tooltip {...chartTooltipStyle} />
            <Line type="monotone" dataKey="value" stroke="#DFC468" strokeWidth={2} dot={{ fill: "#DFC468", r: 3 }} activeDot={{ r: 5, fill: "#c5a55a" }} />
          </RLineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  const inlineFormat = (str) => {
    // Process bold, then italic
    const parts = [];
    let remaining = str;
    let key = 0;
    const regex = /\*\*(.+?)\*\*/g;
    let match;
    let lastIndex = 0;
    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIndex) parts.push(remaining.slice(lastIndex, match.index));
      parts.push(<strong key={key++} style={{ color: "#e0e0e0", fontWeight: 700 }}>{match[1]}</strong>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < remaining.length) parts.push(remaining.slice(lastIndex));
    return parts.length > 0 ? parts : str;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #333", margin: "12px 0" }} />);
      i++;
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(<div key={i} style={{ fontSize: 14, fontWeight: 700, color: "#DFC468", marginTop: 14, marginBottom: 6, letterSpacing: 0.3 }}>{inlineFormat(line.slice(4))}</div>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<div key={i} style={{ fontSize: 15, fontWeight: 700, color: "#DFC468", marginTop: 16, marginBottom: 8, letterSpacing: 0.3 }}>{inlineFormat(line.slice(3))}</div>);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <div key={`bq-${i}`} style={{ borderLeft: "3px solid #c5a55a", paddingLeft: 12, margin: "10px 0", color: "#bbb", fontStyle: "italic", fontSize: 13, lineHeight: 1.6 }}>
          {quoteLines.map((ql, qi) => <div key={qi}>{inlineFormat(ql)}</div>)}
        </div>
      );
      continue;
    }

    // Table
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableRows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        tableRows.push(lines[i]);
        i++;
      }
      // Filter out separator rows (|---|---|)
      const dataRows = tableRows.filter(r => !/^\|[\s\-:|]+\|$/.test(r.trim()));
      if (dataRows.length > 0) {
        const parseRow = (r) => r.split("|").filter((_, ci, arr) => ci > 0 && ci < arr.length - 1).map(c => c.trim());
        const headerCells = parseRow(dataRows[0]);
        const bodyRows = dataRows.slice(1).map(parseRow);
        elements.push(
          <div key={`tbl-${i}`} style={{ overflowX: "auto", margin: "10px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>{headerCells.map((h, hi) => <th key={hi} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid #444", color: "#c5a55a", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>{inlineFormat(h)}</th>)}</tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                    {row.map((cell, ci) => <td key={ci} style={{ padding: "5px 10px", borderBottom: "1px solid #1a1a1a", color: "#ccc" }}>{inlineFormat(cell)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Unordered list
    if (/^[\-\*] /.test(line.trim())) {
      const listItems = [];
      while (i < lines.length && /^[\-\*] /.test(lines[i].trim())) {
        listItems.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={{ margin: "6px 0", paddingLeft: 20, listStyle: "none" }}>
          {listItems.map((item, li) => (
            <li key={li} style={{ padding: "2px 0", fontSize: 13, lineHeight: 1.6, color: "#ccc", position: "relative", paddingLeft: 14 }}>
              <span style={{ position: "absolute", left: 0, color: "#c5a55a" }}>•</span>
              {inlineFormat(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line.trim())) {
      const listItems = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} style={{ margin: "6px 0", paddingLeft: 20, listStyle: "none", counterReset: "item" }}>
          {listItems.map((item, li) => (
            <li key={li} style={{ padding: "2px 0", fontSize: 13, lineHeight: 1.6, color: "#ccc", position: "relative", paddingLeft: 18 }}>
              <span style={{ position: "absolute", left: 0, color: "#c5a55a", fontWeight: 600, fontSize: 12 }}>{li + 1}.</span>
              {inlineFormat(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(<div key={i} style={{ fontSize: 13, lineHeight: 1.7, color: "#ccc", margin: "3px 0" }}>{inlineFormat(line)}</div>);
    i++;
  }

  return elements;
}

// ═══ AI ANALYST CHAT ═══
function ChatView() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const secret = sessionStorage.getItem("admin_secret") || "";
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret,
          messages: newMessages.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.text || "" })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response,
        csvDownload: data.csvDownload || null,
        charts: data.charts || null,
        usage: data.usage || null,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Error: ${e.message}`,
      }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleVoice = () => {
    if (listening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Speech recognition not supported in this browser. Try Chrome."); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onstart = () => setListening(true);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const chatStyles = {
    wrap: { display: "flex", flexDirection: "column", height: "calc(100vh - 280px)", minHeight: 400 },
    messageArea: { flex: 1, overflowY: "auto", padding: "16px 0", display: "flex", flexDirection: "column", gap: 12 },
    userMsg: { alignSelf: "flex-end", background: "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", padding: "10px 16px", borderRadius: "16px 16px 4px 16px", maxWidth: "80%", fontSize: 14, lineHeight: 1.5, fontWeight: 500 },
    assistantMsg: { alignSelf: "flex-start", background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#ccc", padding: "14px 18px", borderRadius: "16px 16px 16px 4px", maxWidth: "90%", fontSize: 14, lineHeight: 1.7 },
    inputWrap: { display: "flex", gap: 8, padding: "12px 0 0", borderTop: "1px solid #222" },
    input: { flex: 1, background: "#1a1a1a", color: "#ccc", border: "1px solid #333", borderRadius: 12, padding: "12px 16px", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none", minHeight: 48, maxHeight: 120 },
    sendBtn: { background: "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", border: "none", borderRadius: 12, padding: "0 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", flexShrink: 0, opacity: loading ? 0.5 : 1 },
    csv: { display: "inline-block", background: "#1a1a1a", border: "1px solid #4CAF50", color: "#4CAF50", borderRadius: 8, padding: "8px 14px", fontSize: 12, textDecoration: "none", fontWeight: 600, marginTop: 8 },
    usage: { fontSize: 10, color: "#444", marginTop: 6 },
    empty: { color: "#444", textAlign: "center", padding: 60, fontSize: 14, lineHeight: 2 },
  };

  return (
    <div style={chatStyles.wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h2 style={S.sectionTitle}>AI Analyst</h2>
          <p style={{ color: "#555", fontSize: 11, margin: 0 }}>Powered by Claude Opus — ask anything about your data</p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{ ...S.select, cursor: "pointer", fontSize: 11 }}>Clear Chat</button>
        )}
      </div>

      <div style={chatStyles.messageArea}>
        {messages.length === 0 && (
          <div style={chatStyles.empty}>
            <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.3 }}>Ask me anything about your data</div>
            <div>Examples:</div>
            <div style={{ color: "#666" }}>"How many people completed the quiz this week?"</div>
            <div style={{ color: "#666" }}>"Export a CSV of every man who said they have a healthy financial life"</div>
            <div style={{ color: "#666" }}>"What's the most common content theme for men aged 25-34?"</div>
            <div style={{ color: "#666" }}>"Show conversion rate by traffic source"</div>
            <div style={{ color: "#666" }}>"What percentage of users who selected viewing_porn also selected vice_alcohol?"</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            <div style={msg.role === "user" ? chatStyles.userMsg : chatStyles.assistantMsg}>
              {msg.role === "assistant" ? (
                <div>
                  {msg.charts && msg.charts.map((chart, ci) => (
                    <AnalystChart key={ci} chart={chart} />
                  ))}
                  {renderMarkdown(msg.content)}
                </div>
              ) : (
                msg.content
              )}
            </div>
            {msg.csvDownload && (
              <a href={msg.csvDownload.dataUri} download={msg.csvDownload.filename} style={chatStyles.csv}>
                Download {msg.csvDownload.filename} ({msg.csvDownload.rowCount} rows)
              </a>
            )}
            {msg.usage && (
              <div style={chatStyles.usage}>{msg.usage.inputTokens?.toLocaleString()} in / {msg.usage.outputTokens?.toLocaleString()} out tokens</div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ ...chatStyles.assistantMsg, opacity: 0.6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="spinner" style={{ width: 16, height: 16, border: "2px solid #333", borderTop: "2px solid #c5a55a", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <span style={{ color: "#888", fontSize: 13 }}>Analyzing your data...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={chatStyles.inputWrap}>
        <button onClick={toggleVoice} title={listening ? "Stop listening" : "Voice input"} style={{
          background: listening ? "#f44336" : "#222", border: listening ? "2px solid #f44336" : "1px solid #333",
          borderRadius: 12, width: 48, height: 48, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          animation: listening ? "pulse 1.5s ease-in-out infinite" : "none",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={listening ? "#fff" : "#888"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? "Listening..." : "Ask about your quiz data, trends, exports..."}
          style={{ ...chatStyles.input, borderColor: listening ? "#f44336" : "#333" }}
          rows={1}
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={chatStyles.sendBtn}>
          {loading ? "..." : "Send"}
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(244,67,54,0.4); } 50% { box-shadow: 0 0 0 10px rgba(244,67,54,0); } }` }} />
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
function BarChart({ items, color, maxOverride, compact, percentBase }) {
  const safeItems = Array.isArray(items) ? items : [];
  if (safeItems.length === 0) return null;
  const max = maxOverride || Math.max(...safeItems.map(i => i.value), 1);
  const total = percentBase || safeItems.reduce((sum, i) => sum + i.value, 0);
  const showPct = !maxOverride && total > 0; // skip percentages for score-based charts
  if (compact) {
    // Two-column compact layout for large datasets
    const mid = Math.ceil(safeItems.length / 2);
    const col1 = safeItems.slice(0, mid);
    const col2 = safeItems.slice(mid);
    const compactRow = { display: "flex", alignItems: "center", gap: 4, marginBottom: 2 };
    const compactLabel = { width: 110, fontSize: 9, color: "#aaa", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
    const compactBg = { flex: 1, height: 12, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" };
    const compactVal = { width: 60, fontSize: 10, fontWeight: 600, color: "#fff", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 3 };
    const renderCol = (col) => col.map((item, i) => (
      <div key={i} style={compactRow}>
        <div style={compactLabel}>{item.label}</div>
        <div style={compactBg}><div style={{ height: "100%", width: `${(item.value / max) * 100}%`, background: color, borderRadius: 2 }} /></div>
        <div style={compactVal}>
          <span>{item.value}</span>
          {showPct && <span style={{ color: "#4DA6FF", fontWeight: 400 }}>({((item.value / total) * 100).toFixed(0)}%)</span>}
        </div>
      </div>
    ));
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
        <div>{renderCol(col1)}</div>
        <div>{renderCol(col2)}</div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8 }}>
      {safeItems.map((item, i) => (
        <div key={i} style={S.barRow}>
          <div style={S.barLabel}>{item.label}</div>
          <div style={S.barBg}><div style={{ ...S.bar, width: `${(item.value / max) * 100}%`, background: color }} /></div>
          <div style={{ ...S.barVal, width: "auto", minWidth: 35, display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <span>{typeof item.value === "number" && item.value % 1 !== 0 ? item.value.toFixed(1) : item.value}</span>
            {showPct && <span style={{ color: "#4DA6FF", fontSize: 11, fontWeight: 400 }}>({((item.value / total) * 100).toFixed(1)}%)</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ color: "#555", padding: 30, textAlign: "center", fontSize: 15 }}>{msg}</div>;
}

// ═══ REFERRERS ═══
function ReferrersView({ product, days }) {
  const [refData, setRefData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";
    if (!s) return;
    setLoading(true);
    fetch(`${API}?secret=${encodeURIComponent(s)}&view=referrers&product=${product}&days=${days}`)
      .then(r => r.json())
      .then(d => { setRefData(d); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, [product, days]);

  if (loading) return <div style={{ color: "#666", padding: 20 }}>Loading referrer data...</div>;
  if (!refData || refData.totalSessions === 0) return <Empty msg="No referrer data yet. Data will appear once quiz visitors start arriving with referrer URLs or UTM parameters." />;

  const { totalSessions, withReferrer, referrerPct, domains, utmSources, utmMediums, utmCampaigns, dailyTrend, conversions, recent } = refData;

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={S.card}>
          <div style={{ ...S.cardValue, color: "#c5a55a", fontSize: 24 }}>{totalSessions}</div>
          <div style={S.cardLabel}>Total Sessions</div>
        </div>
        <div style={S.card}>
          <div style={{ ...S.cardValue, color: "#4CAF50", fontSize: 24 }}>{withReferrer}</div>
          <div style={S.cardLabel}>With Referrer</div>
        </div>
        <div style={S.card}>
          <div style={{ ...S.cardValue, color: "#2196F3", fontSize: 24 }}>{referrerPct}%</div>
          <div style={S.cardLabel}>Referred Traffic</div>
        </div>
        <div style={S.card}>
          <div style={{ ...S.cardValue, color: "#9C27B0", fontSize: 24 }}>{domains.length > 0 ? domains[0].label : "—"}</div>
          <div style={S.cardLabel}>Top Source</div>
        </div>
      </div>

      {/* Top Referrer Domains */}
      <h2 style={S.sectionTitle}>Top Referrer Domains</h2>
      {domains.length > 0 ? <BarChart items={domains.slice(0, 15)} color="#c5a55a" /> : <Empty msg="No referrer domains recorded yet." />}

      {/* UTM Sources */}
      {utmSources.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={S.sectionTitle}>UTM Sources</h2>
          <BarChart items={utmSources.slice(0, 10)} color="#4CAF50" />
        </div>
      )}

      {/* UTM Mediums */}
      {utmMediums.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={S.sectionTitle}>UTM Mediums</h2>
          <BarChart items={utmMediums.slice(0, 10)} color="#2196F3" />
        </div>
      )}

      {/* Conversion by Source */}
      {conversions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={S.sectionTitle}>Conversion by Source</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Source</th>
                  <th style={S.th}>Sessions</th>
                  <th style={S.th}>Completed</th>
                  <th style={S.th}>Conv. Rate</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((row, i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, fontWeight: 500, color: "#c5a55a" }}>{row.source}</td>
                    <td style={S.td}>{row.sessions}</td>
                    <td style={S.td}>{row.completed}</td>
                    <td style={{ ...S.td, fontWeight: 600, color: parseFloat(row.rate) >= 50 ? "#4CAF50" : parseFloat(row.rate) >= 20 ? "#FF9800" : "#f44336" }}>
                      {row.rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UTM Campaigns */}
      {utmCampaigns.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={S.sectionTitle}>UTM Campaigns</h2>
          <BarChart items={utmCampaigns.slice(0, 10)} color="#FF9800" />
        </div>
      )}

      {/* Daily Referrer Trend */}
      {dailyTrend.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={S.sectionTitle}>Daily Referrer Trend</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {dailyTrend.slice(-30).map((day, i) => {
              const maxVal = Math.max(...dailyTrend.map(d => d.total), 1);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 80, fontSize: 11, color: "#888", textAlign: "right", flexShrink: 0 }}>
                    {new Date(day.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <div style={{ flex: 1, height: 18, background: "#1a1a1a", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                    <div style={{ height: "100%", width: `${(day.total / maxVal) * 100}%`, background: "linear-gradient(90deg, #333, #555)", borderRadius: 3 }} />
                    <div style={{ height: "100%", width: `${(day.withRef / maxVal) * 100}%`, background: "linear-gradient(90deg, #c5a55a, #9A7730)", borderRadius: 3, position: "absolute", top: 0, left: 0 }} />
                  </div>
                  <span style={{ width: 60, fontSize: 11, color: "#ccc", textAlign: "right" }}>
                    {day.withRef}/{day.total}
                  </span>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 16, marginTop: 6, paddingLeft: 86 }}>
              <span style={{ fontSize: 10, color: "#c5a55a" }}>■ Referred</span>
              <span style={{ fontSize: 10, color: "#555" }}>■ Total</span>
            </div>
          </div>
        </div>
      )}

      {/* Recent Referrers Table */}
      {recent.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={S.sectionTitle}>Recent Referrers</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Source</th>
                  <th style={S.th}>UTM Source</th>
                  <th style={S.th}>UTM Medium</th>
                  <th style={S.th}>UTM Campaign</th>
                  <th style={S.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row, i) => (
                  <tr key={i}>
                    <td style={{ ...S.td, whiteSpace: "nowrap", fontSize: 11 }}>
                      {new Date(row.date).toLocaleDateString()}{" "}
                      <span style={{ color: "#555" }}>{new Date(row.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </td>
                    <td style={{ ...S.td, fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={row.referrerUrl || "Direct"}>
                      {row.referrerDomain}
                    </td>
                    <td style={{ ...S.td, color: row.utmSource ? "#4CAF50" : "#444" }}>{row.utmSource || "—"}</td>
                    <td style={{ ...S.td, color: row.utmMedium ? "#2196F3" : "#444" }}>{row.utmMedium || "—"}</td>
                    <td style={{ ...S.td, color: row.utmCampaign ? "#FF9800" : "#444" }}>{row.utmCampaign || "—"}</td>
                    <td style={S.td}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                        background: row.completed ? "rgba(76,175,80,0.15)" : "rgba(255,152,0,0.15)",
                        color: row.completed ? "#4CAF50" : "#FF9800" }}>
                        {row.completed ? "Completed" : "Started"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ CLIENT LOOKUP ═══
function ClientsView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState(null); // email of expanded row
  const getSecret = () => typeof window !== "undefined" ? sessionStorage.getItem("admin_secret") : "";

  const search = async () => {
    if (!query || query.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/clients?secret=${encodeURIComponent(getSecret())}&q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.clients);
      }
    } catch (e) { console.error(e); }
    setSearching(false);
  };

  const viewDashboard = async (email) => {
    try {
      const res = await fetch(`/api/admin/impersonate?secret=${encodeURIComponent(getSecret())}&email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        window.open(data.url, "_blank");
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      {/* Search bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          type="text" placeholder="Search by name or email..."
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          style={{ flex: 1, padding: "12px 16px", background: "#111", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15 }}
        />
        <button onClick={search} disabled={searching}
          style={{ padding: "12px 24px", background: "#c5a55a", color: "#000", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: searching ? 0.6 : 1 }}>
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Results */}
      {results && results.length === 0 && (
        <div style={{ color: "#666", textAlign: "center", padding: 40 }}>No clients found for "{query}"</div>
      )}
      {results && results.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{results.length} client{results.length > 1 ? "s" : ""} found</div>
          {results.map(client => (
            <div key={client.email} style={{ background: "#111", borderRadius: 10, border: "1px solid #222", overflow: "hidden" }}>
              {/* Main row — stacks on mobile */}
              <div style={{ padding: "14px 16px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === client.email ? null : client.email)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{client.name || "Unknown"}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{client.email}</div>
                    {client.location && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{client.location}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#c5a55a" }}>{client.reportCount}</div>
                      <div style={{ fontSize: 10, color: "#666" }}>REPORTS</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {client.latestReportDate ? new Date(client.latestReportDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </div>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); viewDashboard(client.email); }}
                  style={{ marginTop: 10, width: "100%", padding: "10px 14px", background: "none", border: "1px solid #c5a55a", color: "#c5a55a", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: 1 }}>
                  VIEW DASHBOARD
                </button>
              </div>

              {/* Expanded detail */}
              {expanded === client.email && (
                <div style={{ padding: "0 16px 14px", borderTop: "1px solid #1f1f1f" }}>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 12, marginBottom: 8, letterSpacing: 1 }}>DIAGNOSTIC PROFILE</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
                    <div style={{ padding: "8px 10px", background: "#0a0a0a", borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: "#555" }}>TEMPLATE</div>
                      <div style={{ fontSize: 13, color: "#ccc", marginTop: 2 }}>{client.arousalTemplateType || "—"}</div>
                    </div>
                    <div style={{ padding: "8px 10px", background: "#0a0a0a", borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: "#555" }}>NEUROPATHWAY</div>
                      <div style={{ fontSize: 13, color: "#ccc", marginTop: 2 }}>{client.neuropathway || "—"}</div>
                    </div>
                    <div style={{ padding: "8px 10px", background: "#0a0a0a", borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: "#555" }}>ATTACHMENT</div>
                      <div style={{ fontSize: 13, color: "#ccc", marginTop: 2 }}>{client.attachmentStyle || "—"}</div>
                    </div>
                  </div>

                  {/* Report history */}
                  {client.allReports.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 8, letterSpacing: 1 }}>REPORT HISTORY</div>
                      {client.allReports.map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1a1a1a" }}>
                          <div>
                            <span style={{ fontSize: 12, color: "#888" }}>Report #{r.index}</span>
                            <span style={{ fontSize: 12, color: "#555", marginLeft: 8 }}>
                              {r.generatedAt ? new Date(r.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                            </span>
                          </div>
                          {r.reportUrl && (
                            <a href={r.reportUrl} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, color: "#c5a55a", textDecoration: "none" }}>PDF ↗</a>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!results && (
        <div style={{ color: "#555", textAlign: "center", padding: 60, fontSize: 15 }}>
          Search for a client by name or email to view their records, reports, and dashboard.
        </div>
      )}
    </div>
  );
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
