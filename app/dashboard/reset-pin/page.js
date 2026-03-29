"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GOLD, CARD_BG } from "../constants";

export default function ResetPinPage() {
  const [step, setStep] = useState("request"); // request | verify
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRequest(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage("If an account exists, a reset code has been sent to your email.");
        setStep("verify");
      } else {
        setError(data.error || "Failed to send reset code.");
      }
    } catch {
      setError("Connection error.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    if (newPin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, code, newPin }),
      });
      const data = await res.json();
      if (data.ok) {
        // Also update the dashboardPin with bcrypt hash
        await fetch("/api/dashboard/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, pin: newPin, reset: true }),
        });
        router.push("/dashboard/login");
      } else {
        setError(data.error || "Reset failed.");
      }
    } catch {
      setError("Connection error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: CARD_BG, borderRadius: 16, padding: 40, border: "1px solid #222" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, marginBottom: 8, textTransform: "uppercase" }}>Unchained Leader</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#fff" }}>Reset Your PIN</h1>
          <p style={{ color: "#888", fontSize: 14, marginTop: 8 }}>{step === "request" ? "Enter your email to receive a reset code" : "Enter the code and your new PIN"}</p>
        </div>

        {message && <div style={{ color: GOLD, fontSize: 13, marginBottom: 16, textAlign: "center" }}>{message}</div>}

        {step === "request" ? (
          <form onSubmit={handleRequest}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" }} placeholder="Your email address" />
            </div>
            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 16, textAlign: "center" }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "14px", background: loading ? "#555" : "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
              {loading ? "Sending..." : "Send Reset Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>6-digit code from your email</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required maxLength={6} inputMode="numeric" style={{ width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15, letterSpacing: 6, textAlign: "center", outline: "none", boxSizing: "border-box" }} placeholder="------" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>New 4-digit PIN</label>
              <input type="password" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))} required maxLength={4} inputMode="numeric" style={{ width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15, letterSpacing: 8, textAlign: "center", outline: "none", boxSizing: "border-box" }} placeholder="----" />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, color: "#999", marginBottom: 6 }}>Confirm PIN</label>
              <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))} required maxLength={4} inputMode="numeric" style={{ width: "100%", padding: "12px 14px", background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: 15, letterSpacing: 8, textAlign: "center", outline: "none", boxSizing: "border-box" }} placeholder="----" />
            </div>
            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 16, textAlign: "center" }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "14px", background: loading ? "#555" : "linear-gradient(135deg, #DFC468, #9A7730)", color: "#000", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", letterSpacing: 1, textTransform: "uppercase" }}>
              {loading ? "Resetting..." : "Reset PIN"}
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 13 }}>
          <Link href="/dashboard/login" style={{ color: "#888", textDecoration: "none" }}>Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
