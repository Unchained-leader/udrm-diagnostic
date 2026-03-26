import Anthropic from "@anthropic-ai/sdk";
import redis from "../lib/redis";
import PDFDocument from "pdfkit";
import { put } from "@vercel/blob";
import { ghlDiagnosticComplete, ghlSendReportData } from "../lib/ghl";

// ═══════════════════════════════════════════════════════════════
// UNCHAINED LEADER — ROOT GENRE DIAGNOSTIC REPORT (2-3 pages)
// Purpose: Increase awareness that the behavior is a SYMPTOM,
// not the problem. The pattern is a fingerprint to the root.
// ═══════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const GOLD = [197, 165, 90];     // #c5a55a
const WHITE = [255, 255, 255];
const GRAY = [170, 170, 170];    // #aaaaaa
const DK_BG = [17, 17, 17];     // #111111
const CARD_BG = [26, 26, 26];   // #1a1a1a
const BORDER = [51, 51, 51];    // #333333

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, pin, name, diagnosticData } = body;

    if (!email || !pin) {
      return Response.json({ error: "Email and PIN required." }, { status: 400, headers: CORS_HEADERS });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Authenticate
    const user = await redis.get(`mkt:user:${normalizedEmail}`);
    if (!user || String(user.pin) !== String(pin)) {
      return Response.json({ error: "Invalid credentials." }, { status: 401, headers: CORS_HEADERS });
    }

    const userName = name || user.name || "Brother";
    const firstName = userName.split(" ")[0];

    // Get diagnostic messages
    let messages = [];
    if (diagnosticData && Array.isArray(diagnosticData)) {
      messages = diagnosticData;
    } else if (diagnosticData && diagnosticData.messages) {
      messages = diagnosticData.messages;
    } else {
      const stored = await redis.get(`mkt:diagnostic:${normalizedEmail}`);
      if (stored) {
        const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
        messages = parsed.messages || [];
      }
    }

    if (!messages || messages.length === 0) {
      return Response.json({ error: "No diagnostic data found." }, { status: 400, headers: CORS_HEADERS });
    }

    // Analyze with Claude
    const analysis = await analyzeConversation(messages, userName);

    // Generate PDF (2-3 pages)
    const pdfBuffer = await generatePDF(analysis, firstName);
    const pdfBase64 = pdfBuffer.toString("base64");

    // Upload PDF to Vercel Blob for permanent storage
    let reportUrl = null;
    try {
      const timestamp = Date.now();
      const blob = await put(
        `reports/${normalizedEmail.replace(/[^a-z0-9]/g, "-")}/${timestamp}-diagnostic.pdf`,
        pdfBuffer,
        { access: "public", contentType: "application/pdf" }
      );
      reportUrl = blob.url;
      console.log("PDF uploaded to Blob:", reportUrl);
    } catch (e) {
      console.error("Blob upload failed (continuing without URL):", e.message);
    }

    // Send via Resend (with download link if available)
    await sendReportEmail(normalizedEmail, firstName, pdfBase64, reportUrl);

    // Store report metadata (including PDF URL)
    await redis.set(`mkt:report:${normalizedEmail}`, {
      generatedAt: new Date().toISOString(),
      rootNarrativeType: analysis.rootNarrativeType,
      shameArchitecture: analysis.shameArchitecture,
      genreSelected: analysis.genreSelected,
      reportUrl: reportUrl || null,
    });

    // Send to GoHighLevel CRM via webhook (with PDF URL)
    ghlDiagnosticComplete({
      email: normalizedEmail,
      name: userName,
      messages,
      analysis,
      reportUrl,
    }).catch((e) => console.error("GHL webhook error:", e.message));

    // Send report data to Reports | Root Diagnostic workflow (separate webhook)
    ghlSendReportData({
      email: normalizedEmail,
      name: userName,
      messages,
      analysis,
      reportUrl,
    }).catch((e) => console.error("GHL report webhook error:", e.message));

    return Response.json({ success: true, message: "Report sent", reportUrl }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Report generation error:", error);
    return Response.json({ error: "Failed to generate report." }, { status: 500, headers: CORS_HEADERS });
  }
}

// ═══════════════════════════════════════════════════════════════
// CLAUDE ANALYSIS — Extract structured diagnostic data
// ═══════════════════════════════════════════════════════════════

async function analyzeConversation(messages, userName) {
  const client = new Anthropic();

  const conversationText = messages
    .filter(m => m.content && !m.content.includes("[PROGRESS:"))
    .map(m => `${m.role === "assistant" ? "GUIDE" : "USER"}: ${m.content}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Analyze this Root Genre Diagnostic conversation and extract structured data. The quiz uses multiple-choice questions. Pay close attention to what the man selected for each question.

CONVERSATION:
${conversationText}

GENRE-TO-WOUND MAPPING (use this to generate the whyYouWatch field):
- Power/BDSM → Felt powerless or unsafe as a child. Brain craves control in fantasy because real life felt dangerously out of control.
- Taboo/forbidden → Shame was fused with arousal early. The "wrongness" IS the draw. Brain eroticized shame itself.
- Wife with others/cuckold/voyeur → Deep belief of being unworthy, not enough. Watching someone else have what you feel you cannot provide.
- Tender/romantic → Emotionally starved. Brain is chasing intimacy and connection, not sex.
- Same-sex (straight man) → Craving masculine validation/approval that was missing from father or key male figures.
- Escalation/novelty → Numbing. Brain building tolerance, needing bigger doses to escape the same pain.

Return ONLY valid JSON, no markdown:
{
  "rootNarrativeType": "The Invisible Man|The Performer|The Shame Bearer|The Escapist|The Controller|The Orphan",
  "rootNarrativeStatement": "The core lie in the man's own emotional language (e.g., 'I am not enough', 'I do not matter', 'Something is fundamentally wrong with me')",
  "genreSelected": "What the man selected for Q1 — the content type his brain gravitates toward",
  "whyYouWatch": "3-4 sentences explaining WHY his brain craves this specific content. Connect the genre to the wound. This is the centerpiece of the report. Be direct, specific, and make the man feel decoded. Do NOT use clinical language. Write like a perceptive friend who finally sees the connection the man has never seen.",
  "woundOrigin": "2-3 sentences connecting his childhood home environment (Q5) and age of first exposure (Q4) to the root narrative. How the wound was formed.",
  "shameArchitecture": "Performance Shame|Identity Shame|Silence Shame",
  "shameCycle": "2-3 sentences explaining how the shame voice he identified (Q6) actually FUELS the cycle rather than stopping it. Connect the shame to his childhood home. The shame that was supposed to stop the behavior is the same shame that drives it.",
  "triggerPattern": "1-2 sentences about what triggers him (Q3) and how that trigger connects to the root wound",
  "isolationLevel": "Based on Q8 — how many people know",
  "patternDuration": "Based on Q7 — how long and what he has tried",
  "soulQuestion": "What he selected for Q9 — the real question underneath",
  "keyInsight": "The single most powerful paragraph for this specific man. 3-4 sentences. Connect ALL the dots: why he watches what he watches, why shame makes it worse not better, why nothing has worked, and why it actually makes perfect sense once you see the wound. This should feel like someone turned the lights on. Write it directly to him.",
  "whatsBelowSurface": "1-2 sentences previewing what the Advanced Diagnostic and Clarity Call reveals — the strategy autopsy, custom plan, and the full WHY behind every failed approach"
}`
    }],
  });

  const text = response.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    // Fallback
    return {
      rootNarrativeType: "Unknown",
      rootNarrativeStatement: "Unable to determine",
      genreSelected: "Unknown",
      whyYouWatch: "Your pattern is not random. The content your brain gravitates toward traces directly to a wound and a belief formed long before you ever found a screen.",
      woundOrigin: "Further diagnostic data needed to trace the origin.",
      shameArchitecture: "Unknown",
      shameCycle: "The shame you feel after acting out is not stopping the cycle. It is fueling it.",
      triggerPattern: "Further data needed.",
      isolationLevel: "Unknown",
      patternDuration: "Unknown",
      soulQuestion: "Unknown",
      keyInsight: "Your pattern is not random. It is connected to something deeper. The content your brain craves is counterfeiting something your soul actually needs.",
      whatsBelowSurface: "The Advanced Diagnostic reveals the WHY behind every failed strategy and builds a custom plan for your specific root.",
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// PDF GENERATION — 2-3 pages, focused on awareness
// ═══════════════════════════════════════════════════════════════

async function generatePDF(analysis, firstName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "letter",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      bufferPages: true,
      autoFirstPage: false,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 612;
    const H = 792;
    const M = 50;
    const CW = W - M * 2;
    const PAGE_BOTTOM = H - 50; // safe content bottom

    // Helper: add dark page with gold accent
    function newPage() {
      doc.addPage();
      doc.rect(0, 0, W, H).fill(DK_BG);
      doc.rect(0, 0, W, 3).fill(GOLD);
    }

    // Helper: truncate text to fit a box width
    function fitText(text, maxChars) {
      if (!text) return "";
      if (text.length <= maxChars) return text;
      return text.substring(0, maxChars - 3) + "...";
    }

    // ══════════════════════════════════
    // PAGE 1 — COVER + GENRE REVEAL
    // ══════════════════════════════════
    newPage();

    let y = 50;
    doc.fontSize(10).fillColor(GOLD).font("Helvetica").text("UNCHAINED LEADER", M, y, { width: CW, align: "center", characterSpacing: 3 });
    y += 26;
    doc.fontSize(22).fillColor(WHITE).font("Helvetica-Bold").text("ROOT GENRE DIAGNOSTIC", M, y, { width: CW, align: "center" });
    y += 32;
    doc.rect(W / 2 - 30, y, 60, 2).fill(GOLD);
    y += 14;
    doc.fontSize(12).fillColor(GRAY).font("Helvetica").text(`Prepared for ${firstName}`, M, y, { width: CW, align: "center" });
    y += 18;
    doc.fontSize(9).text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), M, y, { width: CW, align: "center" });
    y += 12;
    doc.fontSize(7).fillColor([100, 100, 100]).text("CONFIDENTIAL", M, y, { width: CW, align: "center", characterSpacing: 2 });
    y += 28;

    // ── WHY YOUR BRAIN CRAVES THIS ──
    doc.fontSize(8).fillColor(GOLD).font("Helvetica").text("WHY YOUR BRAIN CRAVES THIS", M, y, { characterSpacing: 2 });
    y += 14;
    doc.roundedRect(M, y, CW, 2, 0).fill(GOLD);
    y += 10;

    doc.fontSize(9.5).fillColor(WHITE).font("Helvetica").text(
      analysis.whyYouWatch || "Your pattern is not random.",
      M, y, { width: CW, lineGap: 4 }
    );
    y = doc.y + 14;

    // ── Root Narrative Type Card ──
    const rntCardY = y;
    doc.roundedRect(M, rntCardY, CW, 58, 6).fill(CARD_BG);
    doc.roundedRect(M, rntCardY, CW, 58, 6).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fontSize(7).fillColor(GOLD).font("Helvetica").text("YOUR ROOT NARRATIVE TYPE", M + 16, rntCardY + 10, { characterSpacing: 1.5 });
    doc.fontSize(14).fillColor(WHITE).font("Helvetica-Bold").text(analysis.rootNarrativeType || "Unknown", M + 16, rntCardY + 24);
    doc.fontSize(8.5).fillColor(GRAY).font("Helvetica-Oblique").text(`"${fitText(analysis.rootNarrativeStatement, 80)}"`, M + 16, rntCardY + 42, { width: CW - 32 });
    y = rntCardY + 68;

    // ── Where This Started ──
    doc.fontSize(9).fillColor(WHITE).font("Helvetica-Bold").text("Where This Started", M, y);
    y += 14;
    doc.fontSize(9).fillColor(GRAY).font("Helvetica").text(
      analysis.woundOrigin || "",
      M, y, { width: CW, lineGap: 3 }
    );
    y = doc.y + 14;

    // ── Shame Cycle ── (dynamic height)
    const shameCycleText = analysis.shameCycle || "";
    const shameBoxTop = y;
    // Measure text height first
    const shameMeasure = doc.fontSize(8).font("Helvetica").heightOfString(shameCycleText, { width: CW - 28, lineGap: 2 });
    const shameBoxH = Math.max(60, 42 + shameMeasure + 8);

    if (shameBoxTop + shameBoxH > PAGE_BOTTOM - 20) {
      // Won't fit — add footer and go to page 2
      doc.fontSize(6).fillColor([60, 60, 60]).font("Helvetica").text("UNCHAINED LEADER  |  CONFIDENTIAL  |  Page 1", M, H - 30, { width: CW, align: "center", characterSpacing: 1 });
      newPage();
      y = 40;
    }

    doc.roundedRect(M, y, CW, shameBoxH, 6).fill(CARD_BG);
    doc.fontSize(7).fillColor(GOLD).font("Helvetica").text("THE SHAME CYCLE", M + 14, y + 8, { characterSpacing: 1 });
    doc.fontSize(11).fillColor(WHITE).font("Helvetica-Bold").text(analysis.shameArchitecture || "Unknown", M + 14, y + 22);
    doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(shameCycleText, M + 14, y + 38, { width: CW - 28, lineGap: 2 });
    y += shameBoxH + 10;

    // Footer page 1
    doc.fontSize(6).fillColor([60, 60, 60]).font("Helvetica").text("UNCHAINED LEADER  |  CONFIDENTIAL  |  Page 1", M, H - 30, { width: CW, align: "center", characterSpacing: 1 });

    // ══════════════════════════════════
    // PAGE 2 — KEY INSIGHT + CTA
    // ══════════════════════════════════
    newPage();
    y = 40;

    doc.fontSize(8).fillColor(GOLD).font("Helvetica").text("THE FULL PICTURE", M, y, { characterSpacing: 2 });
    y += 16;
    doc.roundedRect(M, y, CW, 2, 0).fill(GOLD);
    y += 10;

    doc.fontSize(9.5).fillColor(WHITE).font("Helvetica").text(
      analysis.keyInsight || "Your pattern is not random.",
      M, y, { width: CW, lineGap: 4 }
    );
    y = doc.y + 16;

    // ── Why Nothing Has Worked (dynamic height) ──
    const durationText = analysis.patternDuration || "Years of fighting this";
    const whyText = `${durationText}. Every approach targeted the behavior. Not one reached the root narrative that says "${fitText(analysis.rootNarrativeStatement, 60)}." That is not a willpower failure. That is a targeting problem.`;
    const whyMeasure = doc.fontSize(9).font("Helvetica").heightOfString(whyText, { width: CW - 40, lineGap: 3 });
    const whyBoxH = Math.max(50, 28 + whyMeasure + 8);

    doc.roundedRect(M, y, CW, whyBoxH, 6).fill(CARD_BG);
    doc.roundedRect(M, y, CW, whyBoxH, 6).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fontSize(7).fillColor(GOLD).font("Helvetica").text("WHY NOTHING HAS WORKED", M + 16, y + 10, { characterSpacing: 1 });
    doc.fontSize(9).fillColor(GRAY).font("Helvetica").text(whyText, M + 16, y + 26, { width: CW - 32, lineGap: 3 });
    y += whyBoxH + 16;

    // ── Flow Diagram ──
    doc.fontSize(9).fillColor(WHITE).font("Helvetica-Bold").text("What You Are Actually Dealing With", M, y);
    y += 14;

    const flowY = y;
    const nodeW = 140;
    const nodeH = 40;
    const gap = 20;
    const startX = M + (CW - (nodeW * 3 + gap * 2)) / 2;

    // Node 1: Wound
    doc.roundedRect(startX, flowY, nodeW, nodeH, 5).fill(CARD_BG);
    doc.roundedRect(startX, flowY, nodeW, nodeH, 5).strokeColor(GOLD).lineWidth(1).stroke();
    doc.fontSize(7).fillColor(GOLD).font("Helvetica").text("THE WOUND", startX + 8, flowY + 8, { width: nodeW - 16, align: "center", characterSpacing: 1 });
    doc.fontSize(7).fillColor(GRAY).font("Helvetica").text("Childhood", startX + 8, flowY + 22, { width: nodeW - 16, align: "center" });

    // Arrow 1
    const a1x = startX + nodeW;
    doc.strokeColor(GOLD).lineWidth(1).moveTo(a1x + 3, flowY + nodeH / 2).lineTo(a1x + gap - 3, flowY + nodeH / 2).stroke();
    doc.fillColor(GOLD).moveTo(a1x + gap - 3, flowY + nodeH / 2 - 3).lineTo(a1x + gap + 1, flowY + nodeH / 2).lineTo(a1x + gap - 3, flowY + nodeH / 2 + 3).fill();

    // Node 2: The Lie
    const n2x = startX + nodeW + gap;
    doc.roundedRect(n2x, flowY, nodeW, nodeH, 5).fill(CARD_BG);
    doc.roundedRect(n2x, flowY, nodeW, nodeH, 5).strokeColor(GOLD).lineWidth(1).stroke();
    doc.fontSize(7).fillColor(GOLD).font("Helvetica").text("THE LIE", n2x + 8, flowY + 8, { width: nodeW - 16, align: "center", characterSpacing: 1 });
    doc.fontSize(6).fillColor(GRAY).font("Helvetica-Oblique").text(
      `"${fitText(analysis.rootNarrativeStatement, 50)}"`,
      n2x + 6, flowY + 22, { width: nodeW - 12, align: "center" }
    );

    // Arrow 2
    const a2x = n2x + nodeW;
    doc.strokeColor(GOLD).lineWidth(1).moveTo(a2x + 3, flowY + nodeH / 2).lineTo(a2x + gap - 3, flowY + nodeH / 2).stroke();
    doc.fillColor(GOLD).moveTo(a2x + gap - 3, flowY + nodeH / 2 - 3).lineTo(a2x + gap + 1, flowY + nodeH / 2).lineTo(a2x + gap - 3, flowY + nodeH / 2 + 3).fill();

    // Node 3: The Behavior
    const n3x = n2x + nodeW + gap;
    doc.roundedRect(n3x, flowY, nodeW, nodeH, 5).fill(CARD_BG);
    doc.roundedRect(n3x, flowY, nodeW, nodeH, 5).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fontSize(7).fillColor([100, 100, 100]).font("Helvetica").text("THE BEHAVIOR", n3x + 8, flowY + 8, { width: nodeW - 16, align: "center", characterSpacing: 1 });
    doc.fontSize(7).fillColor([70, 70, 70]).font("Helvetica-Oblique").text("(the symptom)", n3x + 8, flowY + 22, { width: nodeW - 16, align: "center" });

    y = flowY + nodeH + 8;
    doc.fontSize(8).fillColor(GRAY).font("Helvetica-Oblique").text(
      "Every strategy you have tried attacked the right side. The root is on the left.",
      M, y, { width: CW, align: "center" }
    );
    y = doc.y + 16;

    // ── Divider ──
    doc.rect(M, y, CW, 1).fill(BORDER);
    y += 14;

    // ── What You Now Know / What's Hidden ──
    doc.fontSize(8).fillColor(GOLD).font("Helvetica").text("WHAT YOUR DIAGNOSTIC REVEALED", M, y, { characterSpacing: 1 });
    y += 14;

    doc.fontSize(8.5).fillColor(WHITE).font("Helvetica-Bold").text("What you now know:", M, y);
    y += 12;
    const knowItems = [
      "Why your brain craves the specific content it craves",
      `Your Root Narrative Type (${analysis.rootNarrativeType}) and the wound underneath`,
      "The shame cycle that fuels the behavior instead of stopping it",
      "Why everything you have tried has missed the actual target",
    ];
    for (const item of knowItems) {
      doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(`•  ${item}`, M + 8, y, { width: CW - 16 });
      y = doc.y + 4;
    }

    y += 6;
    doc.fontSize(8.5).fillColor(WHITE).font("Helvetica-Bold").text("What is still hidden:", M, y);
    y += 12;
    const hiddenItems = [
      "Your Strategy Autopsy — why each approach failed against your pattern",
      "Your Trigger Map — the chain that fires before you are aware of the urge",
      "Your custom plan — built from your specific data",
    ];
    for (const item of hiddenItems) {
      doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(`•  ${item}`, M + 8, y, { width: CW - 16 });
      y = doc.y + 4;
    }

    y += 6;
    doc.fontSize(8).fillColor(GRAY).font("Helvetica-Oblique").text(
      analysis.whatsBelowSurface || "",
      M, y, { width: CW, lineGap: 2 }
    );
    y = doc.y + 14;

    // ── CTA Box ──
    doc.roundedRect(M, y, CW, 40, 6).fill(CARD_BG);
    doc.fontSize(8.5).fillColor(WHITE).font("Helvetica-Bold").text("Ready to see the full picture?", M + 16, y + 10, { width: CW - 32 });
    doc.fontSize(8).fillColor(GRAY).font("Helvetica").text("Log back in with your email and PIN to continue your Advanced Diagnostic.", M + 16, y + 24, { width: CW - 32 });
    y += 52;

    // #liveunchained
    doc.fontSize(9).fillColor(GOLD).font("Helvetica-Bold").text("#liveunchained", M, y, { width: CW, align: "center" });

    // Footer page 2
    doc.fontSize(6).fillColor([60, 60, 60]).font("Helvetica").text("UNCHAINED LEADER  |  CONFIDENTIAL  |  Page 2", M, H - 30, { width: CW, align: "center", characterSpacing: 1 });

    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// EMAIL DELIVERY via Resend
// ═══════════════════════════════════════════════════════════════

async function sendReportEmail(email, firstName, pdfBase64, reportUrl) {
  if (!process.env.RESEND_API_KEY) {
    console.log("RESEND_API_KEY not set — skipping email delivery");
    return;
  }

  const fromEmail = process.env.RESET_FROM_EMAIL || "Unchained Leader <reports@unchained.support>";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: email,
      subject: `${firstName}, Your Root Genre Diagnostic`,
      html: `
        <div style="background:#111;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#ccc;max-width:600px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:30px;">
            <div style="color:#c5a55a;font-size:12px;letter-spacing:3px;margin-bottom:6px;">UNCHAINED LEADER</div>
            <div style="color:#fff;font-size:22px;font-weight:bold;">Your Diagnostic Report</div>
          </div>
          <p style="font-size:15px;line-height:1.7;color:#ccc;">
            ${firstName}, your Root Genre Diagnostic report is attached.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#999;">
            This report reveals why your brain craves the specific content it craves, the wound underneath your pattern, and the shame cycle that has been fueling the behavior instead of stopping it. It is designed to show you what is actually driving the cycle, not just the symptom.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#999;">
            What you see in this report is about 20% of your full diagnostic. To see the complete picture and get a custom plan, log back in with your email and PIN.
          </p>
          <div style="text-align:center;margin:30px 0;">
            ${reportUrl
              ? `<a href="${reportUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#DFC468,#9A7730);color:#000;font-size:14px;font-weight:bold;border-radius:8px;text-decoration:none;letter-spacing:1px;">VIEW YOUR REPORT</a>`
              : `<div style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#DFC468,#9A7730);color:#000;font-size:14px;font-weight:bold;border-radius:8px;text-decoration:none;letter-spacing:1px;">PDF REPORT ATTACHED BELOW</div>`
            }
          </div>
          <div style="border-top:1px solid #333;padding-top:20px;margin-top:20px;text-align:center;">
            <div style="color:#c5a55a;font-size:11px;letter-spacing:2px;">#liveunchained</div>
            <div style="color:#555;font-size:10px;margin-top:8px;">This email is confidential. Nothing identifiable is visible in the subject line or preview text.</div>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Root-Genre-Diagnostic-${firstName}.pdf`,
          content: pdfBase64,
          type: "application/pdf",
        },
      ],
    }),
  });
}
