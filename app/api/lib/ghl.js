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
export async function sendToGHL({ event, email, name, phone, tags, diagnosticData, analysis, reportUrl, dashboardUrl }) {
  const webhookUrl = process.env.GHL_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("GHL_WEBHOOK_URL not configured — skipping CRM sync");
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
      report_url: reportUrl || "",
      reportUrl: reportUrl || "",
      impersonation_access: dashboardUrl || "",
    },
    tags: tags || [],
    reportUrl: reportUrl || null,
    report_url: reportUrl || null,
    dashboardUrl: dashboardUrl || null,
    dashboard_url: dashboardUrl || null,
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
export async function ghlDiagnosticComplete({ email, name, phone, messages, analysis, reportUrl }) {
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
    reportUrl,
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

// ═══════════════════════════════════════════════════════════════
// REPORT DELIVERY WEBHOOK — Separate workflow for diagnostic data
// Sends formatted note + report URL to contact profile
// ═══════════════════════════════════════════════════════════════

function buildDiagnosticNote(analysis, reportUrl, messages) {
  const a = analysis || {};
  const lines = [
    `=== ROOT GENRE DIAGNOSTIC ===`,
    `Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    ``,
    `--- ROOT NARRATIVE ---`,
    `Type: ${a.rootNarrativeType || "Unknown"}`,
    `Statement: "${a.rootNarrativeStatement || "N/A"}"`,
    `Origin: ${a.originSummary || "N/A"}`,
    `Age First Exposure: ${a.ageFirstExposure || "Unknown"}`,
    ``,
    `--- NEUROPATHWAY ---`,
    `Pathway: ${a.neuropathway || "Unknown"}`,
    `Function: ${a.neuropathwayFunction || "N/A"}`,
    `Core Emotion Managed: ${a.coreEmotionManaged || "Unknown"}`,
    ``,
    `--- SHAME ARCHITECTURE ---`,
    `Type: ${a.shameArchitecture || "Unknown"}`,
    `Description: ${a.shameDescription || "N/A"}`,
    ``,
    `--- PATTERN ---`,
    `${a.patternDescription || "N/A"}`,
    ``,
    `--- KEY INSIGHT ---`,
    `${a.keyInsight || "N/A"}`,
    ``,
    `--- HISTORY ---`,
    `Strategies Tried: ${a.strategiesCount || "Unknown"}`,
    `Years Fighting: ${a.yearsFighting || "Unknown"}`,
    ``,
    `--- REPORT ---`,
    `Report 1 URL: ${reportUrl || "Not generated"}`,
    `What's Below Surface: ${a.whatsBelowSurface || "N/A"}`,
  ];

  // Add conversation summary if messages available
  if (messages && Array.isArray(messages)) {
    const userAnswers = messages
      .filter((m) => m.role === "user")
      .map((m) =>
        m.content
          .replace(/\[PROGRESS:\d+\]/g, "")
          .replace(/\[CRISIS_DETECTED\]/g, "")
          .trim()
      )
      .filter(Boolean);

    if (userAnswers.length > 0) {
      lines.push(``);
      lines.push(`--- CONVERSATION (User Answers) ---`);
      userAnswers.forEach((answer, i) => {
        lines.push(`${i + 1}. ${answer}`);
      });
    }
  }

  return lines.join("\n");
}

/**
 * Send report data to the Reports | Root Diagnostic workflow
 * Uses a separate webhook URL (GHL_REPORT_WEBHOOK_URL)
 */
export async function ghlSendReportData({ email, name, phone, messages, analysis, reportUrl }) {
  const webhookUrl = process.env.GHL_REPORT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("GHL_REPORT_WEBHOOK_URL not configured — skipping report delivery");
    return;
  }

  const note = buildDiagnosticNote(analysis, reportUrl, messages);

  const payload = {
    event: "report_delivery",
    timestamp: new Date().toISOString(),
    contact: {
      email: email || "",
      firstName: (name || "").split(" ")[0] || "",
      lastName: (name || "").split(" ").slice(1).join(" ") || "",
      phone: phone || "",
      name: name || "",
      report_url: reportUrl || "",
      reportUrl: reportUrl || "",
    },
    tags: [
      "Diagnostic Complete",
      "Report 1 Sent",
      `RNT: ${analysis?.rootNarrativeType || "Unknown"}`,
    ],
    reportUrl: reportUrl || null,
    report_url: reportUrl || null,
    note,
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("GHL report webhook failed:", e.message);
  }
}
