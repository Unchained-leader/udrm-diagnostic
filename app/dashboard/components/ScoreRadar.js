"use client";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
import { GOLD } from "../constants";

export default function ScoreRadar({ analysis }) {
  const data = [
    { dim: "Behaviors", val: Math.min(Number(analysis.scorecardBehaviorCount) || 0, 7), max: 7 },
    { dim: "Content", val: Math.min(Number(analysis.scorecardContentThemeCount) || 0, 10), max: 10 },
    { dim: "Childhood", val: Number(analysis.scorecardChildhoodWoundScore) || 0, max: 5 },
    { dim: "Attachment", val: Number(analysis.scorecardAttachmentSeverity) || 0, max: 5 },
    { dim: "Spiritual", val: Number(analysis.scorecardSpiritualDisconnect) || 0, max: 5 },
    { dim: "Relational", val: Number(analysis.scorecardRelationalBurden) || 0, max: 5 },
    { dim: "Escalation", val: Number(analysis.escalationSeverity) || 0, max: 5 },
    { dim: "Isolation", val: Number(analysis.isolationScore) || 0, max: 5 },
  ].map(d => ({ ...d, pct: Math.round((d.val / d.max) * 100) }));

  return (
    <ResponsiveContainer width="100%" height={360}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#2a2a2a" />
        <PolarAngleAxis dataKey="dim" tick={{ fill: "#fff", fontSize: 12, fontWeight: 600 }} />
        <Radar name="Score" dataKey="pct" stroke={GOLD} fill={GOLD} fillOpacity={0.2} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
