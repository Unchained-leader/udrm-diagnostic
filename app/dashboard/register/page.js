"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const GOLD = "#C9A227";
const CARD_BG = "#111111";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = "/dashboard/overview";
        return;
      } else {
        setError(data.error || "Registration failed.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: CARD_BG, borderRadius: 16, padding: 40, border: "1px solid #222" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, marginBottom: 8, textTransform: "uppercase" }}>Unchained Leader</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#fff" }}>Set Up Your Dashboard</h1>
          <p style={{ color: "#888", fontSize: 14, marginTop: 8 }}>Create a 4-digit PIN to access your results</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>Email used for your assessment</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }}
              placeholder="Your email address"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>Create a 4-digit PIN</label>
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

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>Confirm PIN</label>
            <input
              type="password"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
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
            style={{ width: "100%", padding: "14px", background: loading ? "#555" : "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", letterSpacing: 1, textTransform: "uppercase" }}
          >
            {loading ? "Setting up..." : "Create Dashboard"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 13 }}>
          <a href="/dashboard/login" style={{ color: "#888", textDecoration: "none" }}>Already have a PIN? Sign in</a>
        </div>
      </div>
    </div>
  );
}
