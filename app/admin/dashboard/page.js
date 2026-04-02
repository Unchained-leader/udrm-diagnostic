"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const API = "/api/analytics";
const HEALTH_API = "/api/health";

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState("dashboard");
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
      const base = `${API}?secret=${encodeURIComponent(s)}&product=${product}&days=${days}`;
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
        setSummary(await sumRes.json());
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
        setSummary(await sumRes.json());
        setData(await viewRes.json());
      }
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
        {tab === "dashboard" && <DashboardHomeView data={data} summary={summary} product={product} days={days} setTab={setTab} />}
        {tab === "funnel" && data && <FunnelView data={data} />}
        {tab === "trends" && <TrendsView product={product} days={days} />}
        {tab === "research" && data && <ResearchView data={data} />}
        {tab === "dropoff" && data && <DropoffView data={data} />}
        {tab === "devices" && data && <DevicesView data={data} />}
        {tab === "cohort" && data && <CohortView data={data} />}
        {tab === "submissions" && <SubmissionsView product={product} days={days} />}
        {tab === "locations" && <LocationsView product={product} />}
        {tab === "health" && <HealthView />}
        {tab === "pipeline" && <PipelineView days={days} />}
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
      <div style={{ ...tileStyle, cursor: "pointer", marginBottom: 16, padding: 0, overflow: "hidden" }}
        onClick={() => setTab("locations")}>
        <div style={{ ...tileTitle, padding: "16px 16px 0" }}>Global Submissions</div>
        <div style={{ height: 400, position: "relative" }}>
          <MiniGlobe product={product} height={400} />
          <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: 4, color: "rgba(197,165,90,0.5)", textTransform: "uppercase", fontFamily: "Montserrat, sans-serif" }}>#UnchainTheWorld</span>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 8, right: 12, fontSize: 10, color: "#555" }}>Click to expand →</div>
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
function MiniGlobe({ product, height }) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const init = async () => {
      if (!window.Globe) return;
      if (globeRef.current) { containerRef.current.innerHTML = ""; globeRef.current = null; }

      const container = containerRef.current;
      const width = container.clientWidth;

      // Fetch country borders
      let countries = { features: [] };
      try {
        const geoRes = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        const worldTopo = await geoRes.json();
        const topoFeature = (topology, obj) => {
          const arcs = topology.arcs;
          const decodeArc = (arcIdx) => {
            const reverse = arcIdx < 0;
            const arc = arcs[reverse ? ~arcIdx : arcIdx];
            let x = 0, y = 0;
            const coords = arc.map(([dx, dy]) => {
              x += dx; y += dy;
              return [
                x * topology.transform.scale[0] + topology.transform.translate[0],
                y * topology.transform.scale[1] + topology.transform.translate[1]
              ];
            });
            if (reverse) coords.reverse();
            return coords;
          };
          const decodeRing = (arcs) => {
            let coords = [];
            arcs.forEach(i => { const c = decodeArc(i); if (coords.length) c.shift(); coords = coords.concat(c); });
            return coords;
          };
          const decodeGeom = (geom) => {
            if (geom.type === "Polygon") return { type: "Polygon", coordinates: geom.arcs.map(decodeRing) };
            if (geom.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: geom.arcs.map(poly => poly.map(decodeRing)) };
            return geom;
          };
          return { type: "FeatureCollection", features: obj.geometries.map(g => ({ type: "Feature", properties: g.properties || {}, geometry: decodeGeom(g) })) };
        };
        countries = topoFeature(worldTopo, worldTopo.objects.countries);
      } catch (e) {}

      // Fetch location data
      let points = [];
      try {
        const secret = sessionStorage.getItem("admin_secret") || "";
        const res = await fetch(`/api/analytics?view=locations&secret=${encodeURIComponent(secret)}&days=90`);
        const d = await res.json();
        points = (d.locations || []).map(loc => ({
          lat: parseFloat(loc.geo_lat), lng: parseFloat(loc.geo_lon),
          size: Math.max(0.3, Math.min(2.5, Math.sqrt(parseInt(loc.count)) * 0.5)),
          color: "#C5A55A",
        }));
      } catch (e) {}

      const globe = window.Globe()
        .backgroundColor("rgba(0,0,0,0)")
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor("rgba(100,100,100,0.2)")
        .atmosphereAltitude(0.1)
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-dark.jpg")
        .width(width)
        .height(height)
        .polygonsData(countries.features)
        .polygonCapColor(() => "rgba(15,15,15,0.95)")
        .polygonSideColor(() => "rgba(30,30,30,0.6)")
        .polygonStrokeColor(() => "rgba(197,165,90,0.3)")
        .polygonAltitude(0.005)
        .pointsData(points)
        .pointLat("lat")
        .pointLng("lng")
        .pointColor("color")
        .pointAltitude(d => d.size * 0.05)
        .pointRadius(d => d.size * 0.4)
        (container);

      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.4;
      globe.controls().enableZoom = false;
      globe.controls().enablePan = false;
      globe.controls().enableRotate = false;
      globeRef.current = globe;
    };

    if (!window.Globe) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/globe.gl";
      script.onload = () => setTimeout(init, 100);
      document.head.appendChild(script);
    } else {
      init();
    }

    return () => { if (globeRef.current) { containerRef.current && (containerRef.current.innerHTML = ""); globeRef.current = null; } };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
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
  const [showCities, setShowCities] = useState(true);
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

  // Load globe.gl and render
  useEffect(() => {
    if (!locData || !globeContainerRef.current) return;

    const initGlobe = async () => {
      if (!window.Globe) return;

      // Clear any existing globe
      if (globeInstanceRef.current) {
        globeContainerRef.current.innerHTML = "";
        globeInstanceRef.current = null;
      }

      const container = globeContainerRef.current;
      const width = container.clientWidth;
      const height = Math.max(600, Math.min(width * 0.65, 800));

      const points = (locData.locations || []).map(loc => ({
        lat: parseFloat(loc.geo_lat),
        lng: parseFloat(loc.geo_lon),
        size: Math.max(0.3, Math.min(2.5, Math.sqrt(parseInt(loc.count)) * 0.5)),
        count: parseInt(loc.count),
        city: loc.geo_city || "Unknown",
        region: loc.geo_region || "",
        country: loc.geo_country || "Unknown",
        color: "#C5A55A",
      }));

      // Fetch country borders GeoJSON (pre-converted, no topojson dependency needed)
      const geoRes = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
      const worldTopo = await geoRes.json();
      // Inline topojson feature extraction (avoids dynamic import)
      const topoFeature = (topology, obj) => {
        const arcs = topology.arcs;
        const decodeArc = (arcIdx) => {
          const reverse = arcIdx < 0;
          const arc = arcs[reverse ? ~arcIdx : arcIdx];
          let x = 0, y = 0;
          const coords = arc.map(([dx, dy]) => {
            x += dx; y += dy;
            return [
              x * topology.transform.scale[0] + topology.transform.translate[0],
              y * topology.transform.scale[1] + topology.transform.translate[1]
            ];
          });
          if (reverse) coords.reverse();
          return coords;
        };
        const decodeRing = (arcs) => {
          let coords = [];
          arcs.forEach(i => { const c = decodeArc(i); if (coords.length) c.shift(); coords = coords.concat(c); });
          return coords;
        };
        const decodeGeom = (geom) => {
          if (geom.type === "Polygon") return { type: "Polygon", coordinates: geom.arcs.map(decodeRing) };
          if (geom.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: geom.arcs.map(poly => poly.map(decodeRing)) };
          return geom;
        };
        return {
          type: "FeatureCollection",
          features: obj.geometries.map(g => ({ type: "Feature", properties: g.properties || {}, geometry: decodeGeom(g) }))
        };
      };
      const countries = topoFeature(worldTopo, worldTopo.objects.countries);

      // Fetch US state boundaries
      let usStates = { type: "FeatureCollection", features: [] };
      try {
        const statesRes = await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
        const statesTopo = await statesRes.json();
        usStates = topoFeature(statesTopo, statesTopo.objects.states);
      } catch (e) { console.warn("Could not load US states:", e); }

      // All 50 US state capitals + DC + key international cities
      const majorCities = [
        // US State Capitals
        { name: "Montgomery", lat: 32.38, lng: -86.30 }, { name: "Juneau", lat: 58.30, lng: -134.42 },
        { name: "Phoenix", lat: 33.45, lng: -112.07 }, { name: "Little Rock", lat: 34.75, lng: -92.29 },
        { name: "Sacramento", lat: 38.58, lng: -121.49 }, { name: "Denver", lat: 39.74, lng: -104.98 },
        { name: "Hartford", lat: 41.76, lng: -72.68 }, { name: "Dover", lat: 39.16, lng: -75.52 },
        { name: "Tallahassee", lat: 30.44, lng: -84.28 }, { name: "Atlanta", lat: 33.75, lng: -84.39 },
        { name: "Honolulu", lat: 21.31, lng: -157.86 }, { name: "Boise", lat: 43.62, lng: -116.20 },
        { name: "Springfield", lat: 39.80, lng: -89.65 }, { name: "Indianapolis", lat: 39.77, lng: -86.16 },
        { name: "Des Moines", lat: 41.59, lng: -93.62 }, { name: "Topeka", lat: 39.05, lng: -95.68 },
        { name: "Frankfort", lat: 38.20, lng: -84.87 }, { name: "Baton Rouge", lat: 30.46, lng: -91.19 },
        { name: "Augusta", lat: 44.31, lng: -69.78 }, { name: "Annapolis", lat: 38.97, lng: -76.49 },
        { name: "Boston", lat: 42.36, lng: -71.06 }, { name: "Lansing", lat: 42.73, lng: -84.56 },
        { name: "Saint Paul", lat: 44.94, lng: -93.09 }, { name: "Jackson", lat: 32.30, lng: -90.18 },
        { name: "Jefferson City", lat: 38.58, lng: -92.17 }, { name: "Helena", lat: 46.60, lng: -112.04 },
        { name: "Lincoln", lat: 40.81, lng: -96.70 }, { name: "Carson City", lat: 39.16, lng: -119.77 },
        { name: "Concord", lat: 43.21, lng: -71.54 }, { name: "Trenton", lat: 40.22, lng: -74.76 },
        { name: "Santa Fe", lat: 35.69, lng: -105.94 }, { name: "Albany", lat: 42.65, lng: -73.76 },
        { name: "Raleigh", lat: 35.78, lng: -78.64 }, { name: "Bismarck", lat: 46.81, lng: -100.78 },
        { name: "Columbus", lat: 39.96, lng: -82.99 }, { name: "Oklahoma City", lat: 35.47, lng: -97.52 },
        { name: "Salem", lat: 44.94, lng: -123.03 }, { name: "Harrisburg", lat: 40.26, lng: -76.88 },
        { name: "Providence", lat: 41.82, lng: -71.41 }, { name: "Columbia", lat: 34.00, lng: -81.03 },
        { name: "Pierre", lat: 44.37, lng: -100.35 }, { name: "Nashville", lat: 36.17, lng: -86.78 },
        { name: "Austin", lat: 30.27, lng: -97.74 }, { name: "Salt Lake City", lat: 40.76, lng: -111.89 },
        { name: "Montpelier", lat: 44.26, lng: -72.58 }, { name: "Richmond", lat: 37.54, lng: -77.43 },
        { name: "Olympia", lat: 47.04, lng: -122.89 }, { name: "Charleston", lat: 38.35, lng: -81.63 },
        { name: "Madison", lat: 43.07, lng: -89.40 }, { name: "Cheyenne", lat: 41.14, lng: -104.82 },
        { name: "Washington DC", lat: 38.91, lng: -77.04 },
        // International cities
        { name: "London", lat: 51.51, lng: -0.13 }, { name: "Paris", lat: 48.86, lng: 2.35 },
        { name: "Tokyo", lat: 35.68, lng: 139.69 }, { name: "Sydney", lat: -33.87, lng: 151.21 },
        { name: "São Paulo", lat: -23.55, lng: -46.63 }, { name: "Toronto", lat: 43.65, lng: -79.38 },
        { name: "Berlin", lat: 52.52, lng: 13.41 }, { name: "Lagos", lat: 6.52, lng: 3.38 },
        { name: "Dubai", lat: 25.20, lng: 55.27 }, { name: "Singapore", lat: 1.35, lng: 103.82 },
        { name: "Mexico City", lat: 19.43, lng: -99.13 }, { name: "Mumbai", lat: 19.08, lng: 72.88 },
      ];

      // Add submission cities as labels too
      const submissionLabels = points.filter(p => p.count >= 1).map(p => ({
        name: p.city !== "Unknown" ? p.city : "",
        lat: p.lat, lng: p.lng
      })).filter(p => p.name);

      // Merge: major cities + submission cities, deduplicate by proximity
      const allLabels = [...majorCities];
      submissionLabels.forEach(sl => {
        const tooClose = allLabels.some(ml => Math.abs(ml.lat - sl.lat) < 1 && Math.abs(ml.lng - sl.lng) < 1);
        if (!tooClose) allLabels.push(sl);
      });
      allLabelsRef.current = allLabels;

      const globe = window.Globe()
        .backgroundColor("#000000")
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor("rgba(100,100,100,0.3)")
        .atmosphereAltitude(0.12)
        .globeImageUrl("//unpkg.com/three-globe/example/img/earth-dark.jpg")
        .width(width)
        .height(height)
        // Country polygons with borders
        .polygonsData([...countries.features, ...usStates.features])
        .polygonCapColor((d) => {
          // US states get slightly different shade so state lines are visible
          const isUSState = usStates.features.includes(d);
          return isUSState ? "rgba(20,20,20,0.7)" : "rgba(15,15,15,0.95)";
        })
        .polygonSideColor(() => "rgba(30,30,30,0.6)")
        .polygonStrokeColor((d) => {
          const isUSState = usStates.features.includes(d);
          return isUSState ? "rgba(197,165,90,0.25)" : "rgba(197,165,90,0.35)";
        })
        .polygonAltitude((d) => {
          const isUSState = usStates.features.includes(d);
          return isUSState ? 0.006 : 0.005;
        })
        // City labels — size scales down as you zoom in
        .labelsData(allLabels)
        .labelLat("lat")
        .labelLng("lng")
        .labelText("name")
        .labelSize(() => {
          if (!globeInstanceRef.current) return 0.3;
          const pov = globeInstanceRef.current.pointOfView();
          const alt = pov ? pov.altitude : 2.5;
          // Closer = smaller labels: ranges from 0.08 (zoomed in) to 0.5 (zoomed out)
          return Math.max(0.08, Math.min(0.5, alt * 0.2));
        })
        .labelDotRadius(() => {
          if (!globeInstanceRef.current) return 0.1;
          const pov = globeInstanceRef.current.pointOfView();
          const alt = pov ? pov.altitude : 2.5;
          return Math.max(0.02, Math.min(0.12, alt * 0.05));
        })
        .labelColor(() => "rgba(197,165,90,0.55)")
        .labelResolution(2)
        .labelAltitude(0.007)
        // Data points
        .pointsData(points)
        .pointLat("lat")
        .pointLng("lng")
        .pointColor("color")
        .pointAltitude(d => d.size * 0.05)
        .pointRadius(d => d.size * 0.4)
        .pointLabel(d => {
          const parts = [d.city, d.region, d.country].filter(Boolean).join(", ");
          return `<div style="background:rgba(0,0,0,0.9);color:#C5A55A;padding:8px 12px;border-radius:6px;font-size:13px;border:1px solid #333;font-family:Montserrat,sans-serif;">
            <div style="font-weight:600;margin-bottom:2px;">${parts}</div>
            <div style="color:#ccc;font-size:11px;">${d.count} submission${d.count !== 1 ? "s" : ""}</div>
          </div>`;
        })
        .onPointClick(d => {
          setSelectedPoint({
            city: d.city,
            region: d.region,
            country: d.country,
            count: d.count,
            lat: d.lat,
            lng: d.lng,
          });
        })
        (container);

      // Auto-rotate
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.5;
      globe.controls().enableZoom = true;

      // Re-render labels on zoom so size updates dynamically
      globe.controls().addEventListener("change", () => {
        globe.labelsData(globe.labelsData());
      });

      // Pause rotation on hover for easier navigation
      container.addEventListener("mouseenter", () => { globe.controls().autoRotate = false; });
      container.addEventListener("mouseleave", () => { globe.controls().autoRotate = true; });

      globeInstanceRef.current = globe;
    };

    if (!window.Globe) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/globe.gl";
      script.onload = () => setTimeout(initGlobe, 100);
      document.head.appendChild(script);
    } else {
      initGlobe();
    }

    return () => {
      if (globeInstanceRef.current) {
        globeContainerRef.current && (globeContainerRef.current.innerHTML = "");
        globeInstanceRef.current = null;
      }
    };
  }, [locData]);

  // Toggle city labels on/off
  useEffect(() => {
    if (globeInstanceRef.current) {
      globeInstanceRef.current.labelsData(showCities ? allLabelsRef.current : []);
    }
  }, [showCities]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (globeInstanceRef.current && globeContainerRef.current) {
        const w = globeContainerRef.current.clientWidth;
        globeInstanceRef.current.width(w);
        globeInstanceRef.current.height(Math.max(600, Math.min(w * 0.65, 800)));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
        {/* City labels toggle */}
        <button onClick={() => setShowCities(!showCities)} style={{
          ...pillStyle(showCities),
          marginLeft: "auto",
          display: "flex", alignItems: "center", gap: 5, fontSize: 11,
        }}>
          <span style={{ fontSize: 14 }}>{showCities ? "🏙️" : "🔵"}</span>
          {showCities ? "Cities On" : "Cities Off"}
        </button>
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

      {/* Top locations list — full width below globe */}
      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13, color: "#888", marginBottom: 8, fontWeight: 500, margin: "0 0 8px" }}>Top Locations</h3>
        {topLocations.length > 0 ? (
          <table style={{ ...S.table, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...S.th, fontSize: 9 }}>#</th>
                <th style={{ ...S.th, fontSize: 9 }}>Location</th>
                <th style={{ ...S.th, fontSize: 9, textAlign: "right" }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {topLocations.map((loc, i) => {
                const label = [loc.geo_city, loc.geo_region, loc.geo_country].filter(Boolean).join(", ");
                return (
                  <tr key={i}>
                    <td style={{ ...S.td, color: "#555", fontSize: 11, width: 24 }}>{i + 1}</td>
                    <td style={{ ...S.td, color: "#ccc", fontSize: 11 }}>{label || "Unknown"}</td>
                    <td style={{ ...S.td, color: "#C5A55A", fontWeight: 600, textAlign: "right", fontSize: 12 }}>{loc.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
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
  const avgCostCents = c.reportsComplete > 0 ? (c.totalCostCents / c.reportsComplete).toFixed(2) : "0";
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
        <PipelineCard label="Rate Limited" value={c.rateLimited} color={c.rateLimited > 0 ? "#FF9800" : "#4CAF50"} />
        <PipelineCard label="Total Cost" value={`$${costDollars}`} color="#c5a55a" />
        <PipelineCard label="Avg Duration" value={`${avgDurationSec}s`} color="#2196F3" />
        <PipelineCard label="Avg Cost/Report" value={`${avgCostCents}¢`} color="#c5a55a" />
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
