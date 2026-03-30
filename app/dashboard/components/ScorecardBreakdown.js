"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts";
import { GOLD } from "../constants";

export default function ScorecardBreakdown({ analysis }) {
  const a = analysis;
  const data = [
    { name: "Behaviors", val: Math.min(Number(a.scorecardBehaviorCount) || 0, 7), max: 7 },
    { name: "Content Themes", val: Math.min(Number(a.scorecardContentThemeCount) || 0, 10), max: 10 },
    { name: "Emotional Functions", val: Number(a.scorecardEmotionalFunctionCount) || 0, max: 10 },
    { name: "Childhood Wounds", val: Number(a.scorecardChildhoodWoundScore) || 0, max: 5 },
    { name: "Attachment", val: Number(a.scorecardAttachmentSeverity) || 0, max: 5 },
    { name: "Spiritual", val: Number(a.scorecardSpiritualDisconnect) || 0, max: 5 },
    { name: "Relational", val: Number(a.scorecardRelationalBurden) || 0, max: 5 },
    { name: "Escalation", val: Number(a.escalationSeverity) || 0, max: 5 },
  ].map(d => ({
    ...d,
    pct: Math.round((d.val / d.max) * 100),
    label: `${d.val}/${d.max}`,
  }));

  const getColor = (pct) => {
    if (pct >= 75) return "#ef4444";
    if (pct >= 50) return "#f59e0b";
    if (pct >= 25) return GOLD;
    return "#22c55e";
  };

  return (
    <div>
      <div style={{ fontSize: 17, color: "#888", marginBottom: 12 }}>Raw scores across all diagnostic dimensions</div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 50, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fill: "#555", fontSize: 11 }} axisLine={{ stroke: "#333" }} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fill: "#999", fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
          <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={16}>
            {data.map((d, i) => <Cell key={i} fill={getColor(d.pct)} />)}
            <LabelList dataKey="label" position="right" fill="#888" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
