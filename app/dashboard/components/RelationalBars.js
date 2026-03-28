"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";

const GOLD = "#C9A227";
const COLORS = ["#C9A227", "#DFC468", "#9A7730", "#B8860B"];

export default function RelationalBars({ analysis }) {
  const data = [
    { name: "Codependency", score: Number(analysis.codependencyScore) || 0 },
    { name: "Enmeshment", score: Number(analysis.enmeshmentScore) || 0 },
    { name: "Relational Void", score: Number(analysis.relationalVoidScore) || 0 },
    { name: "Leadership Burden", score: Number(analysis.leadershipBurdenScore) || 0 },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" horizontal={false} />
        <XAxis type="number" domain={[0, 3]} ticks={[0, 1, 2, 3]} tick={{ fill: "#666", fontSize: 12 }} axisLine={{ stroke: "#333" }} />
        <YAxis type="category" dataKey="name" tick={{ fill: "#999", fontSize: 12 }} axisLine={false} tickLine={false} width={120} />
        <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={20}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
