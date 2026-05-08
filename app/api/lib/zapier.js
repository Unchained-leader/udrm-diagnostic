// ═══════════════════════════════════════════════════════════════
// Zapier Catch Hook — fires on every diagnostic submission
// Set ZAPIER_WEBHOOK_URL in Vercel env vars to your Zap's catch URL
// ═══════════════════════════════════════════════════════════════

export async function zapierDiagnosticSubmitted({ email, name, phone, ip }) {
  const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("ZAPIER_WEBHOOK_URL not configured — skipping Zapier sync");
    return;
  }

  const payload = {
    event: "diagnostic_submitted",
    timestamp: new Date().toISOString(),
    firstName: (name || "").trim(),
    email: email || "",
    phone: phone || "",
    ip: ip || "",
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Zapier webhook failed:", e.message);
  }
}
