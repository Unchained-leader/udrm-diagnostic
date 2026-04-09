"use client";
import { forwardRef } from "react";
import { GOLD, CARD_BG } from "../constants";

const ResultCard = forwardRef(function ResultCard({ title, subtitle, children, gold, style }, ref) {
  return (
    <div ref={ref} style={{
      background: CARD_BG,
      borderRadius: 12,
      padding: "24px",
      overflow: "hidden",
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
});

export default ResultCard;
