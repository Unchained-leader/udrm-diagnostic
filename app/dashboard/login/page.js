"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const GOLD = "#C9A227";
const CARD_BG = "#111111";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/dashboard/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = "/dashboard/overview";
        return;
      } else {
        setError(data.error || "Login failed.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: CARD_BG, borderRadius: 16, padding: 40, border: `1px solid #222` }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, marginBottom: 8, textTransform: "uppercase" }}>Unchained Leader</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#fff" }}>Your Results Dashboard</h1>
          <p style={{ color: "#888", fontSize: 14, marginTop: 8 }}>Log in to view your personalized report</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }}
              placeholder="Your email address"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>PIN</label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              required
              maxLength={4}
              inputMode="numeric"
              style={{ width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15, letterSpacing: 8, textAlign: "center", outline: "none", boxSizing: "border-box" }}
              placeholder="----"
            />
          </div>

          {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 16, textAlign: "center" }}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "14px", background: loading ? "#555" : `linear-gradient(135deg, #DFC468, #9A7730)`, color: "#000", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", letterSpacing: 1, textTransform: "uppercase" }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 13 }}>
          <a href="/dashboard/register" style={{ color: GOLD, textDecoration: "none" }}>First time? Set up your PIN</a>
          <span style={{ color: "#444", margin: "0 12px" }}>|</span>
          <a href="/dashboard/reset-pin" style={{ color: "#888", textDecoration: "none" }}>Forgot PIN?</a>
        </div>
      </div>
    </div>
  );
}
