"use client";

import { useEffect } from "react";

export default function AdminError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={wrap}>
      <div style={box}>
        <div style={title}>Something went wrong</div>
        <div style={msg}>{error?.message || "An unexpected error occurred."}</div>
        {error?.digest && <div style={digest}>Error ID: {error.digest}</div>}
        <div style={btnRow}>
          <button onClick={() => reset()} style={primaryBtn}>Try again</button>
          <button
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            style={secondaryBtn}
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}

const wrap = {
  minHeight: "100vh",
  background: "#0a0a0a",
  color: "#e0e0e0",
  fontFamily: "'Montserrat', -apple-system, sans-serif",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const box = {
  background: "#111",
  border: "1px solid #c5a55a",
  borderRadius: 12,
  padding: "32px 28px",
  maxWidth: 480,
  width: "100%",
  textAlign: "center",
};

const title = {
  fontSize: 16,
  fontWeight: 700,
  color: "#c5a55a",
  letterSpacing: 2,
  marginBottom: 14,
  textTransform: "uppercase",
};

const msg = {
  fontSize: 13,
  color: "#fff",
  marginBottom: 10,
  wordBreak: "break-word",
  lineHeight: 1.5,
};

const digest = {
  fontSize: 11,
  color: "#666",
  marginBottom: 18,
  fontFamily: "monospace",
};

const btnRow = {
  display: "flex",
  gap: 10,
  justifyContent: "center",
  marginTop: 6,
};

const primaryBtn = {
  background: "linear-gradient(135deg, #DFC468, #9A7730)",
  color: "#000",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryBtn = {
  background: "#1a1a1a",
  color: "#c5a55a",
  border: "1px solid #333",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};
