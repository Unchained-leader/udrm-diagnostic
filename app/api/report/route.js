import Anthropic from "@anthropic-ai/sdk";
import redis from "../lib/redis";
import PDFDocument from "pdfkit";

// ═══════════════════════════════════════════════════════════════
// UNCHAINED LEADER — ROOT GENRE DIAGNOSTIC REPORT GENERATOR
// POST /api/report
// Analyzes diagnostic conversation, generates branded PDF, emails via Resend
// ═══════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Brand colors
const COLORS = {
  bg: "#111111",
  gold: "#c5a55a",
  white: "#ffffff",
  gray: "#aaaaaa",
  darkGray: "#1a1a1a",
  medGray: "#333333",
  lightGold: "#d4bc7c",
  darkGold: "#9e8344",
};

// Hex to RGB helper for pdfkit
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, pin, name, diagnosticData } = body;

    if (!email || !pin) {
      return Response.json(
        { error: "Email and PIN are required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── Authenticate ──
    const user = await redis.get(`mkt:user:${normalizedEmail}`);
    if (!user || String(user.pin) !== String(pin)) {
      return Response.json(
        { error: "Invalid credentials." },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const userName = name || user.name || "Brother";
    const firstName = userName.split(" ")[0];

    // ── Get diagnostic messages ──
    let messages = [];
    if (diagnosticData && diagnosticData.messages) {
      messages = diagnosticData.messages;
    } else if (diagnosticData && Array.isArray(diagnosticData)) {
      messages = diagnosticData;
    } else {
      // Try to load from Redis
      const stored = await redis.get(`mkt:diagnostic:${normalizedEmail}`);
      if (stored) {
        const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
        messages = parsed.messages || [];
      }
    }

    if (!messages || messages.length === 0) {
      return Response.json(
        { error: "No diagnostic data found. Please complete the diagnostic first." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ── Analyze with Claude ──
    const analysis = await analyzeConversation(messages, userName);

    // ── Generate PDF ──
    const pdfBuffer = await generatePDF(analysis, userName, normalizedEmail);
    const pdfBase64 = pdfBuffer.toString("base64");

    // ── Send via Resend ──
    await sendReportEmail(normalizedEmail, firstName, pdfBase64);

    // ── Store report timestamp ──
    await redis.set(`mkt:report:${normalizedEmail}`, {
      generatedAt: new Date().toISOString(),
      rootNarrativeType: analysis.rootNarrativeType,
      neuropathway: analysis.neuropathway,
    });

    return Response.json(
      { success: true, message: "Report sent" },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("Report generation error:", error);
    return Response.json(
      { error: "Failed to generate report. Please try again." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// CLAUDE ANALYSIS
// ═══════════════════════════════════════════════════════════════

async function analyzeConversation(messages, userName) {
  const client = new Anthropic();

  const conversationText = messages
    .map((m) => `${m.role === "assistant" ? "GUIDE" : "USER"}: ${m.content}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a clinical data extraction engine for the Unchained Leader Root Genre Diagnostic. Analyze the following diagnostic conversation and extract structured data. Return ONLY valid JSON — no markdown, no code fences, no explanation.

CONVERSATION:
${conversationText}

Extract and return this exact JSON structure:
{
  "rootNarrativeType": "The Invisible Man | The Performer | The Shame Bearer | The Escapist | The Controller | The Orphan",
  "rootNarrativeStatement": "The core lie (e.g., 'I don't matter', 'Something is fundamentally wrong with me')",
  "rootNarrativeDescription": "2-3 sentence explanation of how this root narrative manifests in this man's life based on his specific answers",
  "originConnection": "1-2 sentence connection between first exposure and root narrative formation",
  "ageFirstExposure": number,
  "exposureContext": "brief description of how exposure happened",
  "neuropathway": "Arousal | Numbing/Satiation | Fantasy | Deprivation",
  "neuropathwayDescription": "2-3 sentences explaining how this man's brain uses the behavior, referencing his specific answers",
  "coreEmotionManaged": "Pain | Anxiety | Shame | Terror",
  "genreTheme": "Brief description of primary content theme/dynamic",
  "sexualizedFeelings": ["list of emotions fused with arousal based on answers"],
  "governingFantasy": "1-2 sentence description of the internal role/movie/dynamic",
  "patternDecodedNarrative": "3-4 sentence narrative connecting childhood imprint to current pattern, written in second person to the man",
  "triggers": [
    { "name": "trigger name", "description": "brief description", "bodyLocation": "where felt in body", "nervousSystemState": "fight/flight/freeze/fawn" }
  ],
  "socialMediaScrolling": { "present": true/false, "escalates": true/false, "estimatedDailyMinutes": number or null, "description": "brief description if present" },
  "shameArchitectureType": "Performance Shame | Identity Shame | Silence Shame",
  "childhoodConditioning": "2-3 sentence description of childhood shame environment",
  "internalCriticVoice": "The exact or paraphrased voice of the internal critic based on his answer",
  "strategiesTried": [{ "name": "strategy name", "duration": "how long it worked" }],
  "totalStrategiesCount": number,
  "yearsInCycle": number,
  "relationshipStatus": "married | in a relationship | single",
  "spouseAware": true/false/null,
  "isolationLevel": "high | moderate | low",
  "consequencesDomains": [{ "domain": "domain name", "severity": 1-10 }],
  "identityGapDescription": "1-2 sentences describing the gap between public and private self",
  "spiritualState": "close | distant | angry | numb | going through the motions",
  "readinessLevel": "high | moderate | low",
  "triggerDimensions": {
    "stress": 1-10,
    "loneliness": 1-10,
    "boredom": 1-10,
    "anger": 1-10,
    "shame": 1-10,
    "anxiety": 1-10
  },
  "whatStillHidden": ["3-5 specific things the Advanced Diagnostic would reveal that this report does not cover, written as compelling bullet points"]
}

IMPORTANT: Base ALL data on the man's ACTUAL answers. Do not invent details he did not share. If data is unclear, make your best clinical inference and note it. Return ONLY the JSON object.`,
      },
    ],
  });

  const rawText = response.content[0].text.trim();

  // Parse JSON, handling potential markdown code fences
  let jsonText = rawText;
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("Failed to parse Claude analysis:", e, "Raw:", rawText.substring(0, 500));
    throw new Error("Failed to parse diagnostic analysis. Please try again.");
  }
}

// ═══════════════════════════════════════════════════════════════
// PDF GENERATION
// ═══════════════════════════════════════════════════════════════

function generatePDF(analysis, userName, email) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "letter",
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: "Root Genre Diagnostic Report",
          Author: "Unchained Leader",
          Subject: `Diagnostic Report for ${userName}`,
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = 612;
      const pageH = 792;
      const margin = 50;
      const contentW = pageW - margin * 2;
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // ── Helper functions ──

      function drawPageBg() {
        doc.rect(0, 0, pageW, pageH).fill(COLORS.bg);
      }

      function drawFooter(pageNum, totalPages) {
        // Top rule
        doc
          .moveTo(margin, pageH - 45)
          .lineTo(pageW - margin, pageH - 45)
          .strokeColor(COLORS.medGray)
          .lineWidth(0.5)
          .stroke();

        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(COLORS.gray);

        doc.text("UNCHAINED LEADER", margin, pageH - 35, { width: contentW / 3, align: "left" });
        doc.text("CONFIDENTIAL", margin + contentW / 3, pageH - 35, { width: contentW / 3, align: "center" });
        doc.text(`${pageNum} / ${totalPages}`, margin + (contentW / 3) * 2, pageH - 35, { width: contentW / 3, align: "right" });
      }

      function drawSectionHeader(title, yPos) {
        // Gold accent bar
        doc.rect(margin, yPos, 4, 22).fill(COLORS.gold);

        doc
          .font("Helvetica-Bold")
          .fontSize(16)
          .fillColor(COLORS.gold)
          .text(title.toUpperCase(), margin + 14, yPos + 3, { width: contentW - 14 });

        // Underline
        doc
          .moveTo(margin, yPos + 28)
          .lineTo(pageW - margin, yPos + 28)
          .strokeColor(COLORS.medGray)
          .lineWidth(0.5)
          .stroke();

        return yPos + 40;
      }

      function drawLabel(label, yPos) {
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor(COLORS.gold)
          .text(label.toUpperCase(), margin, yPos, { width: contentW });
        return yPos + 14;
      }

      function drawBody(text, yPos, options = {}) {
        const fontSize = options.fontSize || 10;
        const color = options.color || COLORS.white;
        const font = options.font || "Helvetica";
        const lineGap = options.lineGap || 4;
        const indent = options.indent || 0;

        doc
          .font(font)
          .fontSize(fontSize)
          .fillColor(color)
          .text(text, margin + indent, yPos, {
            width: contentW - indent,
            lineGap,
            align: options.align || "left",
          });

        return doc.y + (options.spacing || 8);
      }

      function drawQuoteBlock(text, yPos) {
        const blockX = margin + 12;
        const blockW = contentW - 24;

        // Background
        doc.rect(margin, yPos, contentW, 0).fill(COLORS.bg); // placeholder

        // Left gold bar
        doc.rect(margin, yPos, 3, 50).fill(COLORS.gold);

        doc
          .font("Helvetica-Oblique")
          .fontSize(11)
          .fillColor(COLORS.lightGold)
          .text(`"${text}"`, blockX + 8, yPos + 8, { width: blockW - 16, lineGap: 4 });

        return doc.y + 14;
      }

      function drawInfoCard(label, value, yPos, width) {
        const cardX = margin + (width === "half-right" ? contentW / 2 + 6 : 0);
        const cardW = width === "full" ? contentW : contentW / 2 - 6;

        // Card background
        doc
          .roundedRect(cardX, yPos, cardW, 52, 4)
          .fillAndStroke(COLORS.darkGray, COLORS.medGray);

        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(COLORS.gray)
          .text(label.toUpperCase(), cardX + 12, yPos + 10, { width: cardW - 24 });

        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .fillColor(COLORS.gold)
          .text(value, cardX + 12, yPos + 26, { width: cardW - 24 });

        return yPos + 62;
      }

      // ── Radar chart drawing ──
      function drawRadarChart(dimensions, centerX, centerY, radius) {
        const keys = Object.keys(dimensions);
        const count = keys.length;
        const angleStep = (Math.PI * 2) / count;
        const startAngle = -Math.PI / 2;

        // Background circles
        for (let ring = 1; ring <= 5; ring++) {
          const r = (radius / 5) * ring;
          doc.save();
          for (let i = 0; i < count; i++) {
            const angle = startAngle + i * angleStep;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            if (i === 0) doc.moveTo(x, y);
            else doc.lineTo(x, y);
          }
          doc.closePath().strokeColor(COLORS.medGray).lineWidth(0.5).stroke();
          doc.restore();
        }

        // Axis lines and labels
        for (let i = 0; i < count; i++) {
          const angle = startAngle + i * angleStep;
          const endX = centerX + Math.cos(angle) * radius;
          const endY = centerY + Math.sin(angle) * radius;

          doc
            .moveTo(centerX, centerY)
            .lineTo(endX, endY)
            .strokeColor(COLORS.medGray)
            .lineWidth(0.5)
            .stroke();

          // Label
          const labelR = radius + 14;
          const labelX = centerX + Math.cos(angle) * labelR;
          const labelY = centerY + Math.sin(angle) * labelR;

          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(COLORS.gray)
            .text(
              keys[i].toUpperCase(),
              labelX - 30,
              labelY - 5,
              { width: 60, align: "center" }
            );
        }

        // Data polygon
        doc.save();
        const values = Object.values(dimensions);
        for (let i = 0; i < count; i++) {
          const val = Math.min(values[i], 10) / 10;
          const angle = startAngle + i * angleStep;
          const x = centerX + Math.cos(angle) * radius * val;
          const y = centerY + Math.sin(angle) * radius * val;
          if (i === 0) doc.moveTo(x, y);
          else doc.lineTo(x, y);
        }
        doc.closePath();
        doc.fillColor(COLORS.gold).opacity(0.2).fill();
        doc.restore();

        // Data polygon outline
        doc.save();
        for (let i = 0; i < count; i++) {
          const val = Math.min(values[i], 10) / 10;
          const angle = startAngle + i * angleStep;
          const x = centerX + Math.cos(angle) * radius * val;
          const y = centerY + Math.sin(angle) * radius * val;
          if (i === 0) doc.moveTo(x, y);
          else doc.lineTo(x, y);
        }
        doc.closePath().strokeColor(COLORS.gold).lineWidth(1.5).stroke();
        doc.restore();

        // Data points
        for (let i = 0; i < count; i++) {
          const val = Math.min(values[i], 10) / 10;
          const angle = startAngle + i * angleStep;
          const x = centerX + Math.cos(angle) * radius * val;
          const y = centerY + Math.sin(angle) * radius * val;
          doc.circle(x, y, 3).fill(COLORS.gold);
        }
      }

      // ── Bar chart drawing ──
      function drawBarChart(items, startX, startY, chartWidth, chartHeight) {
        if (!items || items.length === 0) return startY + chartHeight;

        const barHeight = Math.min(24, (chartHeight - 10) / items.length - 6);
        const maxVal = 10;
        const labelW = 100;
        const barAreaW = chartWidth - labelW - 40;

        items.forEach((item, i) => {
          const y = startY + i * (barHeight + 6);

          // Label
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor(COLORS.gray)
            .text(item.domain || item.name, startX, y + 4, { width: labelW, align: "right" });

          // Bar background
          doc
            .roundedRect(startX + labelW + 8, y, barAreaW, barHeight, 3)
            .fill(COLORS.darkGray);

          // Bar fill
          const severity = item.severity || item.value || 5;
          const fillW = Math.max(8, (severity / maxVal) * barAreaW);
          const barColor = severity >= 7 ? "#c44" : severity >= 4 ? COLORS.gold : COLORS.darkGold;
          doc
            .roundedRect(startX + labelW + 8, y, fillW, barHeight, 3)
            .fill(barColor);

          // Value
          doc
            .font("Helvetica-Bold")
            .fontSize(8)
            .fillColor(COLORS.white)
            .text(`${severity}/10`, startX + labelW + barAreaW + 14, y + 4, { width: 30 });
        });

        return startY + items.length * (barHeight + 6) + 10;
      }

      // ── Timeline drawing ──
      function drawTimeline(events, startX, startY, width) {
        const lineY = startY + 20;

        // Timeline line
        doc
          .moveTo(startX, lineY)
          .lineTo(startX + width, lineY)
          .strokeColor(COLORS.medGray)
          .lineWidth(2)
          .stroke();

        const spacing = width / (events.length + 1);

        events.forEach((event, i) => {
          const x = startX + spacing * (i + 1);

          // Node
          doc.circle(x, lineY, 5).fill(COLORS.gold);

          // Inner dot
          doc.circle(x, lineY, 2).fill(COLORS.bg);

          // Label above
          doc
            .font("Helvetica-Bold")
            .fontSize(7)
            .fillColor(COLORS.gold)
            .text(event.label, x - 35, lineY - 18, { width: 70, align: "center" });

          // Description below
          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor(COLORS.gray)
            .text(event.description, x - 40, lineY + 10, { width: 80, align: "center" });
        });

        return lineY + 60;
      }

      // ═══ PAGE 1: COVER ═══
      drawPageBg();

      // Top accent line
      doc.rect(0, 0, pageW, 4).fill(COLORS.gold);

      // Centered branding block
      const coverCenterY = 200;

      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(COLORS.gold)
        .text("UNCHAINED LEADER", 0, coverCenterY, { width: pageW, align: "center" });

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.gray)
        .text("presents", 0, coverCenterY + 20, { width: pageW, align: "center" });

      // Horizontal rule
      doc
        .moveTo(pageW / 2 - 100, coverCenterY + 42)
        .lineTo(pageW / 2 + 100, coverCenterY + 42)
        .strokeColor(COLORS.gold)
        .lineWidth(0.5)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(30)
        .fillColor(COLORS.white)
        .text("ROOT GENRE", 0, coverCenterY + 58, { width: pageW, align: "center" });

      doc
        .font("Helvetica-Bold")
        .fontSize(30)
        .fillColor(COLORS.gold)
        .text("DIAGNOSTIC", 0, coverCenterY + 94, { width: pageW, align: "center" });

      // Divider
      doc
        .moveTo(pageW / 2 - 100, coverCenterY + 138)
        .lineTo(pageW / 2 + 100, coverCenterY + 138)
        .strokeColor(COLORS.gold)
        .lineWidth(0.5)
        .stroke();

      // Name
      doc
        .font("Helvetica")
        .fontSize(14)
        .fillColor(COLORS.white)
        .text(`Prepared for ${userName}`, 0, coverCenterY + 155, { width: pageW, align: "center" });

      // Date
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(COLORS.gray)
        .text(today, 0, coverCenterY + 178, { width: pageW, align: "center" });

      // Confidential notice
      doc
        .roundedRect(pageW / 2 - 90, coverCenterY + 220, 180, 28, 4)
        .strokeColor(COLORS.gold)
        .lineWidth(1)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(COLORS.gold)
        .text("CONFIDENTIAL", 0, coverCenterY + 229, { width: pageW, align: "center" });

      // Bottom text
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.gray)
        .text(
          "This report was generated by the Unchained Leader Root Genre Diagnostic AI.",
          0,
          pageH - 100,
          { width: pageW, align: "center" }
        );

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.gray)
        .text(
          "It is intended solely for the named recipient and is not a clinical diagnosis.",
          0,
          pageH - 86,
          { width: pageW, align: "center" }
        );

      // Bottom accent
      doc.rect(0, pageH - 4, pageW, 4).fill(COLORS.gold);

      // ═══ PAGE 2-3: ROOT NARRATIVE TYPE ═══
      doc.addPage();
      drawPageBg();

      let y = 50;
      y = drawSectionHeader("Section 1: Root Narrative Type", y);

      // Type name card
      doc
        .roundedRect(margin, y, contentW, 60, 6)
        .fillAndStroke(COLORS.darkGray, COLORS.medGray);

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.gray)
        .text("YOUR ROOT NARRATIVE TYPE", margin + 16, y + 10, { width: contentW - 32 });

      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor(COLORS.gold)
        .text(analysis.rootNarrativeType || "Unclassified", margin + 16, y + 28, { width: contentW - 32 });

      y += 74;

      // Root narrative statement
      y = drawLabel("The Core Lie Your Brain Believes", y);
      y = drawQuoteBlock(analysis.rootNarrativeStatement || "Data not available", y);

      // Description
      y = drawLabel("How This Shows Up In Your Life", y);
      y = drawBody(
        analysis.rootNarrativeDescription || "Based on your diagnostic conversation, this root narrative shapes the way you experience desire, shame, and relationship.",
        y
      );

      // Origin connection
      y = drawLabel("Origin Connection", y);

      // Info cards row
      y = drawInfoCard("Age of First Exposure", `Age ${analysis.ageFirstExposure || "N/A"}`, y, "half-left");
      drawInfoCard("Core Emotion Managed", analysis.coreEmotionManaged || "N/A", y - 62, "half-right");
      y += 4;

      y = drawBody(
        analysis.originConnection || "Your first exposure created the initial imprint that your brain would build upon for years.",
        y,
        { color: COLORS.gray }
      );

      // How it connects
      y = drawLabel("The Connection to Your Pattern", y);
      y = drawBody(
        `Your root narrative type, ${analysis.rootNarrativeType || "your pattern"}, drives you toward ${analysis.genreTheme || "specific content themes"} because your brain is trying to counterfeit what the wound took from you. The type of content your brain craves is not random. It is a diagnostic fingerprint that traces back to this exact root.`,
        y
      );

      if (y > pageH - 100) {
        doc.addPage();
        drawPageBg();
        y = 50;
      }

      // Neuropathway section
      y = drawLabel("Your Addiction Neuropathway", y);
      y = drawInfoCard("Neuropathway", analysis.neuropathway || "N/A", y, "full");
      y = drawBody(
        analysis.neuropathwayDescription || "Your brain has developed a specific pathway for managing unbearable emotion through this behavior.",
        y
      );

      // ═══ PAGE: YOUR PATTERN DECODED ═══
      doc.addPage();
      drawPageBg();

      y = 50;
      y = drawSectionHeader("Section 2: Your Pattern Decoded", y);

      // Connection flow
      y = drawLabel("The Path From Wound to Pattern", y);

      const flowItems = [
        { label: "CHILDHOOD", description: analysis.exposureContext ? analysis.exposureContext.substring(0, 40) : "Early experience" },
        { label: "IMPRINT", description: `Age ${analysis.ageFirstExposure || "?"}` },
        { label: "PATTERN", description: analysis.genreTheme ? analysis.genreTheme.substring(0, 40) : "Content theme" },
        { label: "GENRE", description: analysis.neuropathway || "Pathway" },
        { label: "ROOT", description: (analysis.rootNarrativeType || "Type").replace("The ", "") },
      ];

      y = drawTimeline(flowItems, margin + 10, y, contentW - 20);
      y += 10;

      // Pattern narrative
      y = drawLabel("Your Pattern in Your Own Words", y);
      y = drawBody(
        analysis.patternDecodedNarrative || "Your pattern connects early experiences to the specific content themes your brain craves today. The behavior is not random and it is not a moral failure. It is a nervous system running survival software.",
        y,
        { lineGap: 5 }
      );

      // Sexualized feelings
      if (analysis.sexualizedFeelings && analysis.sexualizedFeelings.length > 0) {
        y = drawLabel("Eroticized Feelings Identified", y);
        const feelingsText = analysis.sexualizedFeelings.join("  |  ");
        y = drawBody(feelingsText, y, { color: COLORS.lightGold, font: "Helvetica-Bold", fontSize: 11 });
        y += 4;
      }

      // Governing fantasy
      if (analysis.governingFantasy) {
        y = drawLabel("Governing Fantasy Dynamic", y);
        y = drawQuoteBlock(analysis.governingFantasy, y);
      }

      // Description of what content counterfeits
      y = drawBody(
        `The content your brain gravitates toward is counterfeiting something real that the wound denied you. Your ${analysis.neuropathway || "neuropathway"} drives you to use this behavior to ${analysis.coreEmotionManaged === "Pain" ? "override pain" : analysis.coreEmotionManaged === "Anxiety" ? "manage anxiety" : analysis.coreEmotionManaged === "Shame" ? "escape shame" : "manage terror"}. Understanding this distinction is the first step toward dismantling the cycle at its root.`,
        y,
        { color: COLORS.gray, fontSize: 9 }
      );

      // ═══ PAGE: TRIGGER MAP ═══
      doc.addPage();
      drawPageBg();

      y = 50;
      y = drawSectionHeader("Section 3: Trigger Map", y);

      // Radar chart for trigger dimensions
      if (analysis.triggerDimensions) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLORS.gray)
          .text("TRIGGER INTENSITY PROFILE", 0, y, { width: pageW, align: "center" });

        y += 16;
        drawRadarChart(analysis.triggerDimensions, pageW / 2, y + 110, 100);
        y += 240;
      }

      // Individual triggers
      if (analysis.triggers && analysis.triggers.length > 0) {
        y = drawLabel("Identified Triggers", y);

        analysis.triggers.forEach((trigger) => {
          if (y > pageH - 100) {
            doc.addPage();
            drawPageBg();
            y = 50;
          }

          // Trigger card
          doc
            .roundedRect(margin, y, contentW, 48, 4)
            .fillAndStroke(COLORS.darkGray, COLORS.medGray);

          // Gold dot
          doc.circle(margin + 14, y + 14, 4).fill(COLORS.gold);

          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor(COLORS.white)
            .text(trigger.name || "Trigger", margin + 26, y + 8, { width: contentW - 40 });

          const detailParts = [];
          if (trigger.bodyLocation) detailParts.push(`Body: ${trigger.bodyLocation}`);
          if (trigger.nervousSystemState) detailParts.push(`State: ${trigger.nervousSystemState}`);
          if (trigger.description) detailParts.push(trigger.description);

          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor(COLORS.gray)
            .text(detailParts.join("  |  "), margin + 26, y + 24, { width: contentW - 40 });

          y += 56;
        });
      }

      // Social media scrolling
      if (analysis.socialMediaScrolling && analysis.socialMediaScrolling.present) {
        y += 6;
        y = drawLabel("Social Media Scrolling Pattern", y);

        doc
          .roundedRect(margin, y, contentW, 50, 4)
          .fillAndStroke(COLORS.darkGray, COLORS.medGray);

        doc.rect(margin, y, 4, 50).fill(COLORS.gold);

        const scrollText = analysis.socialMediaScrolling.description || "Social media scrolling identified as gateway behavior.";
        const escalateText = analysis.socialMediaScrolling.escalates ? "Escalates to acting out." : "Stays contained but feeds the cycle.";
        const timeText = analysis.socialMediaScrolling.estimatedDailyMinutes
          ? `Est. ${analysis.socialMediaScrolling.estimatedDailyMinutes} min/day.`
          : "";

        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLORS.white)
          .text(`${scrollText} ${escalateText} ${timeText}`, margin + 14, y + 10, { width: contentW - 28, lineGap: 3 });

        y += 60;
      }

      // ═══ PAGE: SHAME ARCHITECTURE ═══
      doc.addPage();
      drawPageBg();

      y = 50;
      y = drawSectionHeader("Section 4: Shame Architecture", y);

      // Shame type card
      y = drawInfoCard("Shame Architecture Type", analysis.shameArchitectureType || "N/A", y, "full");

      // Childhood conditioning
      y = drawLabel("Childhood Conditioning", y);
      y = drawBody(
        analysis.childhoodConditioning || "Your childhood environment shaped the shame circuits that the behavior later plugged into.",
        y
      );

      // Shame timeline
      y = drawLabel("Shame Formation Timeline", y);
      const shameEvents = [
        { label: "CHILDHOOD", description: "Shame environment formed" },
        { label: "IMPRINT", description: "Behavior discovered" },
        { label: "FUSION", description: "Shame + behavior merge" },
        { label: "PRESENT", description: "Cycle reinforces shame" },
      ];
      y = drawTimeline(shameEvents, margin + 10, y, contentW - 20);

      y += 10;

      // Internal critic voice
      y = drawLabel("The Internal Critic", y);
      if (analysis.internalCriticVoice) {
        y = drawQuoteBlock(analysis.internalCriticVoice, y);
      }

      y = drawBody(
        `Your shame architecture is ${analysis.shameArchitectureType || "significant"}. This means the shame was ${analysis.shameArchitectureType === "Performance Shame" ? "attached to what you did. Mistakes were met with punishment or anger, encoding the belief that your value comes from getting it right." : analysis.shameArchitectureType === "Identity Shame" ? "attached to who you are. The message was not that you made a mistake but that you ARE the mistake. This is the deepest form of wounding." : "built through silence. Your feelings were not punished. They were invisible. This absence of acknowledgment created a void the behavior eventually filled."}`,
        y,
        { color: COLORS.gray, fontSize: 9 }
      );

      // ═══ PAGE: CLINICAL TRAJECTORY ═══
      doc.addPage();
      drawPageBg();

      y = 50;
      y = drawSectionHeader("Section 5: Clinical Trajectory", y);

      // Stats row
      y = drawInfoCard("Years In Cycle", `${analysis.yearsInCycle || "N/A"} years`, y, "half-left");
      drawInfoCard("Strategies Tried", `${analysis.totalStrategiesCount || "N/A"}`, y - 62, "half-right");
      y += 4;

      // Strategies list
      if (analysis.strategiesTried && analysis.strategiesTried.length > 0) {
        y = drawLabel("Strategy Autopsy", y);

        analysis.strategiesTried.forEach((strategy) => {
          if (y > pageH - 80) {
            doc.addPage();
            drawPageBg();
            y = 50;
          }

          // Strategy row
          doc
            .roundedRect(margin, y, contentW, 30, 3)
            .fillAndStroke(COLORS.darkGray, COLORS.medGray);

          // X marker
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor("#c44")
            .text("x", margin + 10, y + 8);

          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor(COLORS.white)
            .text(strategy.name || "Strategy", margin + 28, y + 8, { width: contentW / 2 });

          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor(COLORS.gray)
            .text(strategy.duration || "Unknown duration", margin + contentW / 2, y + 9, { width: contentW / 2 - 16, align: "right" });

          y += 36;
        });

        y += 6;
      }

      // Consequences bar chart
      if (analysis.consequencesDomains && analysis.consequencesDomains.length > 0) {
        y = drawLabel("Consequences Footprint", y);
        y = drawBarChart(analysis.consequencesDomains, margin, y, contentW, 200);
      }

      // Trajectory observation
      y = drawBody(
        `Over ${analysis.yearsInCycle || "the"} years of this cycle, ${analysis.totalStrategiesCount || "multiple"} strategies were deployed. Every one of them targeted the behavior. None of them addressed the root. This is not a failure of effort or willpower. It is evidence that the approach was aimed at the wrong target.`,
        y,
        { color: COLORS.gray, fontSize: 9, spacing: 14 }
      );

      // Identity gap
      if (analysis.identityGapDescription) {
        y = drawLabel("The Identity Gap", y);
        y = drawQuoteBlock(analysis.identityGapDescription, y);
      }

      // ═══ PAGE: WHAT YOU'VE UNCOVERED + WHAT'S STILL HIDDEN ═══
      doc.addPage();
      drawPageBg();

      y = 50;
      y = drawSectionHeader("Section 6: What You've Uncovered", y);

      y = drawBody(
        `${userName.split(" ")[0]}, what you just did took real courage. Most men go their entire lives without looking under the hood of this struggle. You did not just take a quiz. You sat with hard questions, told the truth, and let yourself be seen. That matters.`,
        y,
        { lineGap: 5 }
      );

      y = drawBody("Here is what this diagnostic confirmed:", y, { color: COLORS.gold, font: "Helvetica-Bold", fontSize: 11 });
      y += 4;

      const confirmations = [
        `Your root narrative type is ${analysis.rootNarrativeType || "identified"}.`,
        `Your brain uses ${analysis.neuropathway || "a specific pathway"} to manage ${analysis.coreEmotionManaged || "deep emotion"}.`,
        `Your pattern traces back to an imprint at age ${analysis.ageFirstExposure || "N/A"}.`,
        `Your shame architecture was built ${analysis.ageFirstExposure && analysis.ageFirstExposure < 10 ? "long" : ""} before you ever found a screen.`,
        `${analysis.totalStrategiesCount || "Multiple"} strategies failed because they targeted the symptom, not the root.`,
      ];

      confirmations.forEach((item) => {
        doc.circle(margin + 6, y + 4, 2.5).fill(COLORS.gold);
        y = drawBody(item, y, { indent: 18, spacing: 6 });
      });

      y += 14;

      // What's still hidden
      y = drawLabel("What the Advanced Diagnostic Reveals", y);

      y = drawBody(
        "This report covers approximately 20% of your full diagnostic profile. The Advanced Diagnostic goes deeper:",
        y,
        { color: COLORS.gray }
      );

      y += 4;

      const hiddenItems = analysis.whatStillHidden || [
        "Your complete Addiction Matrix Profile across all four neuropathways",
        "Your full Trigger Map with nervous system state analysis",
        "Your Courtship Failure Pattern and how it affects your marriage",
        "Your Risk Level Assessment and clinical trajectory projection",
        "Your personalized Root Narrative Restructuring pathway",
      ];

      hiddenItems.forEach((item) => {
        if (y > pageH - 60) {
          doc.addPage();
          drawPageBg();
          y = 50;
        }
        doc.rect(margin + 4, y + 1, 6, 6).fill(COLORS.gold);
        y = drawBody(item, y, { indent: 18, spacing: 6, color: COLORS.lightGold });
      });

      y += 18;

      // Soft CTA
      doc
        .moveTo(margin, y)
        .lineTo(pageW - margin, y)
        .strokeColor(COLORS.medGray)
        .lineWidth(0.5)
        .stroke();
      y += 16;

      y = drawBody(
        "When you are ready to see the full picture, log back in at UnchainedLeader.com. Your diagnostic data is saved and waiting.",
        y,
        { color: COLORS.white, fontSize: 10 }
      );

      y = drawBody(
        "The root has been identified. The next step is dismantling it.",
        y,
        { color: COLORS.gold, font: "Helvetica-Bold", fontSize: 11, spacing: 20 }
      );

      y = drawBody("Unchained Leader  |  UnchainedLeader.com  |  support@UnchainedLeader.com", y, {
        color: COLORS.gray,
        fontSize: 8,
        align: "center",
      });

      // ── Add footers to all pages ──
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        drawFooter(i + 1, totalPages);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// EMAIL DELIVERY VIA RESEND
// ═══════════════════════════════════════════════════════════════

async function sendReportEmail(email, firstName, pdfBase64) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set. Skipping email delivery.");
    return;
  }

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#111111;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:8px;overflow:hidden;">
          <!-- Gold top bar -->
          <tr><td style="background-color:#c5a55a;height:4px;"></td></tr>

          <!-- Header -->
          <tr>
            <td style="padding:40px 40px 20px;">
              <p style="color:#c5a55a;font-size:12px;letter-spacing:2px;margin:0 0 8px;">UNCHAINED LEADER</p>
              <h1 style="color:#ffffff;font-size:24px;margin:0 0 4px;font-weight:bold;">Your Root Genre Diagnostic</h1>
              <p style="color:#aaaaaa;font-size:14px;margin:0;">Report is attached below</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 40px;"><div style="border-top:1px solid #333333;"></div></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 40px;">
              <p style="color:#ffffff;font-size:15px;line-height:1.6;margin:0 0 16px;">
                ${firstName}, your Root Genre Diagnostic report is attached to this email as a PDF.
              </p>
              <p style="color:#aaaaaa;font-size:14px;line-height:1.6;margin:0 0 16px;">
                This report contains a summary of what your diagnostic conversation revealed, including your Root Narrative Type, your pattern analysis, your trigger map, and your shame architecture.
              </p>
              <p style="color:#aaaaaa;font-size:14px;line-height:1.6;margin:0 0 24px;">
                This is approximately 20% of your full diagnostic profile. When you are ready to go deeper, log back in and access the Advanced Diagnostic.
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#c5a55a;border-radius:6px;padding:14px 32px;">
                    <a href="https://unchainedleader.com" style="color:#111111;font-size:14px;font-weight:bold;text-decoration:none;display:inline-block;">Log Back In</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 40px;"><div style="border-top:1px solid #333333;"></div></td></tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;">
              <p style="color:#666666;font-size:11px;line-height:1.5;margin:0;">
                This email and attached report are confidential and intended solely for the named recipient. If you received this in error, please discard it.
              </p>
              <p style="color:#666666;font-size:11px;margin:12px 0 0;">
                Unchained Leader | support@UnchainedLeader.com
              </p>
            </td>
          </tr>

          <!-- Gold bottom bar -->
          <tr><td style="background-color:#c5a55a;height:4px;"></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Unchained Leader <reports@unchained.support>",
      to: email,
      subject: `${firstName}, Your Root Genre Diagnostic Report`,
      html: htmlBody,
      attachments: [
        {
          filename: "Root-Genre-Diagnostic-Report.pdf",
          content: pdfBase64,
          type: "application/pdf",
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Resend API error:", response.status, errorBody);
    throw new Error(`Failed to send email: ${response.status}`);
  }
}
