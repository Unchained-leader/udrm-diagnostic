"use client";
import { GOLD } from "../constants";

export default function EscalationGauge({ severity, years }) {
  const s = Math.min(Math.max(severity, 0), 5);
  const color = s >= 4 ? "#ef4444" : s >= 3 ? "#f59e0b" : s >= 2 ? "#eab308" : "#22c55e";
  const label = s >= 4 ? "High" : s >= 3 ? "Moderate-High" : s >= 2 ? "Moderate" : s >= 1 ? "Low" : "None";

  // Parse years into a number for the timeline
  const yearNum = parseFloat(String(years).replace(/[^0-9.]/g, "")) || 10;
  const totalYears = Math.max(yearNum + 5, 8); // extend 5 years into the future for projection

  // Build escalation curve data points (past)
  // Escalation follows a logarithmic curve that accelerates over time
  const pastPoints = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 to 1
    const x = t * (yearNum / totalYears) * 100;
    // Escalation curve: starts slow, accelerates based on severity
    const intensity = Math.pow(t, 0.7) * (s / 5) * 60 + 10;
    pastPoints.push({ x, y: Math.min(intensity, 85) });
  }

  // Build projected curve (future, dotted) - continues upward
  const futurePoints = [];
  const lastPast = pastPoints[pastPoints.length - 1];
  const futureSteps = 10;
  for (let i = 0; i <= futureSteps; i++) {
    const t = i / futureSteps;
    const x = lastPast.x + t * ((1 - yearNum / totalYears) * 100);
    // Steeper acceleration in the future
    const intensity = lastPast.y + t * t * (90 - lastPast.y) * 0.8;
    futurePoints.push({ x, y: Math.min(intensity, 92) });
  }

  // SVG dimensions
  const W = 500;
  const H = 180;
  const PAD = { top: 20, bottom: 30, left: 0, right: 0 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const toSVG = (pt) => ({
    sx: PAD.left + (pt.x / 100) * chartW,
    sy: PAD.top + chartH - (pt.y / 100) * chartH,
  });

  // Create smooth path
  const pathFromPoints = (pts) => {
    if (pts.length < 2) return "";
    const coords = pts.map(toSVG);
    let d = `M ${coords[0].sx} ${coords[0].sy}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cpx = (prev.sx + curr.sx) / 2;
      d += ` C ${cpx} ${prev.sy}, ${cpx} ${curr.sy}, ${curr.sx} ${curr.sy}`;
    }
    return d;
  };

  // "Now" marker position
  const nowX = PAD.left + (yearNum / totalYears) * chartW;

  // Year labels
  const yearLabels = [];
  const labelInterval = totalYears <= 10 ? 2 : totalYears <= 20 ? 5 : 10;
  for (let y = 0; y <= totalYears; y += labelInterval) {
    yearLabels.push(y);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 17, color: "#888" }}>Escalation Risk</span>
        <span style={{ fontSize: 19, fontWeight: 700, color }}>{label} ({s}/5)</span>
      </div>

      {/* Timeline chart */}
      <div style={{ background: "#0d0d0d", borderRadius: 10, border: "1px solid #1a1a1a", padding: "16px 16px 8px", overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((pct, i) => (
            <line key={i}
              x1={PAD.left} y1={PAD.top + chartH * (1 - pct)}
              x2={W - PAD.right} y2={PAD.top + chartH * (1 - pct)}
              stroke="#1a1a1a" strokeWidth={1}
            />
          ))}

          {/* Solid past line */}
          <path d={pathFromPoints(pastPoints)} fill="none" stroke={color} strokeWidth={2.5} />

          {/* Gradient fill under past line */}
          <defs>
            <linearGradient id="escFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={pathFromPoints(pastPoints) + ` L ${toSVG(pastPoints[pastPoints.length - 1]).sx} ${PAD.top + chartH} L ${PAD.left} ${PAD.top + chartH} Z`}
            fill="url(#escFill)"
          />

          {/* Dotted future projection */}
          <path d={pathFromPoints(futurePoints)} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="6,4" opacity={0.6} />

          {/* "NOW" marker */}
          <line x1={nowX} y1={PAD.top} x2={nowX} y2={PAD.top + chartH} stroke={GOLD} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
          <rect x={nowX - 18} y={PAD.top - 2} width={36} height={16} rx={3} fill={GOLD} />
          <text x={nowX} y={PAD.top + 10} textAnchor="middle" fontSize={9} fontWeight={700} fill="#000">NOW</text>

          {/* "No intervention" label on projected line */}
          {futurePoints.length > 3 && (() => {
            const labelPt = toSVG(futurePoints[Math.floor(futurePoints.length * 0.6)]);
            return (
              <text x={labelPt.sx} y={labelPt.sy - 10} textAnchor="middle" fontSize={9} fill="#ef4444" opacity={0.7}>
                Default trajectory
              </text>
            );
          })()}

          {/* X-axis year labels */}
          {yearLabels.map((y, i) => {
            const lx = PAD.left + (y / totalYears) * chartW;
            return (
              <text key={i} x={lx} y={H - 4} textAnchor="middle" fontSize={9} fill="#555">
                {y === 0 ? "Start" : `${y}yr`}
              </text>
            );
          })}

          {/* Y-axis labels */}
          <text x={PAD.left + 4} y={PAD.top + 10} fontSize={9} fill="#555">High</text>
          <text x={PAD.left + 4} y={PAD.top + chartH - 4} fontSize={9} fill="#555">Low</text>
        </svg>
      </div>

      <p style={{ fontSize: 17, color: "#888", marginTop: 14, lineHeight: 1.7 }}>
        {s >= 4
          ? `Over ${years || "many"} years, your pattern has escalated significantly. The brain requires increasing intensity to achieve the same dopamine response. Without root-level intervention, this trajectory continues. This is neurological tolerance, not moral failure.`
          : s >= 2
          ? `Over ${years || "many"} years, some escalation is present. The brain is beginning to seek more intensity. The dotted line shows where this trajectory leads without root-level intervention.`
          : `Over ${years || "many"} years, minimal escalation has been detected. Addressing root causes now prevents the trajectory shift shown in the projected line.`}
      </p>
    </div>
  );
}
