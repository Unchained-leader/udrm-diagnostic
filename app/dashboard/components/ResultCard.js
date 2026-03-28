"use client";

const GOLD = "#C9A227";
const CARD_BG = "#111111";

export default function ResultCard({ title, subtitle, children, gold, style }) {
  return (
    <div style={{
      background: CARD_BG,
      borderRadius: 12,
      padding: "24px",
      border: gold ? `1px solid ${GOLD}33` : "1px solid #1f1f1f",
      ...style,
    }}>
      {title && (
        <div style={{ marginBottom: subtitle || children ? 16 : 0 }}>
          <h3 style={{ fontSize: 12, letterSpacing: 2, color: GOLD, textTransform: "uppercase", margin: 0, fontWeight: 600 }}>{title}</h3>
          {subtitle && <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginTop: 6 }}>{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
