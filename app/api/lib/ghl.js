// ═══════════════════════════════════════════════════════════════
// GoHighLevel CRM Integration via Webhook
// No API key needed — no token rotation — never expires
// Sends data to a GHL Inbound Webhook workflow trigger
// ═══════════════════════════════════════════════════════════════

// Set GHL_WEBHOOK_URL in Vercel env vars to your GHL Inbound Webhook URL
// Found in: GHL → Automation → Create Workflow → Trigger: Inbound Webhook

/**
 * Send diagnostic data to GHL via webhook.
 * GHL workflow handles: contact creation, tagging, notes, etc.
 */
export async function sendToGHL({ event, email, name, phone, tags, diagnosticData, analysis }) {
  const webhookUrl = process.env.GHL_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("GHL_WEBHOOK_URL not configured — skipping CRM sync");
    return;
  }

  const payload = {
    event: event || "diagnostic_unknown",
    timestamp: new Date().toISOString(),
    contact: {
      email: email || "",
      firstName: (name || "").split(" ")[0] || "",
      lastName: (name || "").split(" ").slice(1).join(" ") || "",
      phone: phone || "",
      name: name || "",
    },
    tags: tags || [],
  };

  // Add analysis data if present
  if (analysis) {
    payload.diagnostic = {
      rootNarrativeType: analysis.rootNarrativeType || "",
      rootNarrativeStatement: analysis.rootNarrativeStatement || "",
      neuropathway: analysis.neuropathway || "",
      coreEmotionManaged: analysis.coreEmotionManaged || "",
      shameArchitecture: analysis.shameArchitecture || "",
      ageFirstExposure: analysis.ageFirstExposure || "",
      strategiesCount: analysis.strategiesCount || "",
      yearsFighting: analysis.yearsFighting || "",
      keyInsight: analysis.keyInsight || "",
      patternDescription: analysis.patternDescription || "",
    };
  }

  // Add raw conversation if present
  if (diagnosticData && Array.isArray(diagnosticData)) {
    // Build readable conversation summary for the contact note
    const userAnswers = diagnosticData
      .filter((m) => m.role === "user")
      .map((m) =>
        m.content
          .replace(/\[PROGRESS:\d+\]/g, "")
          .replace(/\[CRISIS_DETECTED\]/g, "")
          .trim()
      )
      .filter(Boolean);

    payload.conversationSummary = userAnswers.join(" | ");
    payload.messageCount = diagnosticData.length;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log(`GHL webhook sent (${event}): ${res.status}`);
  } catch (e) {
    console.error("GHL webhook failed:", e.message);
  }
}

/**
 * Convenience: Send contact creation event
 */
export async function ghlContactCreated({ email, name, phone }) {
  return sendToGHL({
    event: "contact_created",
    email,
    name,
    phone,
    tags: ["Diagnostic Started", "Root Genre Diagnostic"],
  });
}

/**
 * Convenience: Send diagnostic complete event with full data
 */
export async function ghlDiagnosticComplete({ email, name, phone, messages, analysis }) {
  return sendToGHL({
    event: "diagnostic_complete",
    email,
    name,
    phone,
    tags: [
      "Diagnostic Complete",
      "Report 1 Sent",
      `RNT: ${analysis?.rootNarrativeType || "Unknown"}`,
    ],
    diagnosticData: messages,
    analysis,
  });
}

/**
 * Convenience: Send advanced diagnostic complete event
 */
export async function ghlAdvancedDiagnosticComplete({ email, name, messages, analysis }) {
  return sendToGHL({
    event: "advanced_diagnostic_complete",
    email,
    name,
    tags: ["Advanced Diagnostic Complete"],
    diagnosticData: messages,
    analysis,
  });
}

/**
 * Convenience: Send booking event
 */
export async function ghlBookingConfirmed({ email, name }) {
  return sendToGHL({
    event: "clarity_call_booked",
    email,
    name,
    tags: ["Clarity Call Booked", "$27 Paid"],
  });
}
