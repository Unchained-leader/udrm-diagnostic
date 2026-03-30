"use client";
import { useState } from "react";
import { GOLD } from "../constants";

export default function ExpandableCard({ title, body, borderColor }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        background: "#1a1a1a",
        borderRadius: 10,
        padding: "16px 18px",
        border: `1px solid ${borderColor || "#2a2a2a"}`,
        cursor: "pointer",
        marginBottom: 10,
        transition: "border-color 0.2s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 19, fontWeight: 600, color: borderColor || "#fff" }}>{title}</span>
        <span style={{ color: "#666", fontSize: 18, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>&#9662;</span>
      </div>
      {open && body && (
        <div style={{ marginTop: 12, fontSize: 17, lineHeight: 1.7, color: "#999" }}>
          {body.split("\n").map((p, i) => p.trim() ? <p key={i} style={{ margin: "0 0 8px" }}>{p}</p> : null)}
        </div>
      )}
    </div>
  );
}
