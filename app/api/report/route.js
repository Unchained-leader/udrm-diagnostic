import Anthropic from "@anthropic-ai/sdk";
import redis from "../lib/redis";
import PDFDocument from "pdfkit";
import { put } from "@vercel/blob";
import { ghlDiagnosticComplete, ghlSendReportData } from "../lib/ghl";
import fs from "fs";
import path from "path";

export const maxDuration = 300;

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
    const rawAnalysis = await analyzeConversation(messages, userName);

    // Sanitize all string values in analysis — replace em dashes with commas
    function sanitizeObj(obj) {
      if (!obj) return obj;
      const result = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") {
          result[k] = v.replace(/\u2014/g, ",").replace(/ — /g, ", ").replace(/— /g, ", ").replace(/ —/g, ",").replace(/—/g, ",");
        } else if (Array.isArray(v)) {
          result[k] = v.map(item => typeof item === "object" && item !== null ? sanitizeObj(item) : typeof item === "string" ? item.replace(/\u2014/g, ",").replace(/ — /g, ", ").replace(/— /g, ", ").replace(/ —/g, ",").replace(/—/g, ",") : item);
        } else {
          result[k] = v;
        }
      }
      return result;
    }
    const analysis = sanitizeObj(rawAnalysis);

    // Generate PDF
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
      arousalTemplateType: analysis.arousalTemplateType,
      attachmentStyle: analysis.attachmentStyle,
      neuropathway: analysis.neuropathway,
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
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Analyze this Unwanted Desire Root Mapping (UDRM) quiz conversation. The quiz uses select-all-that-apply checkboxes. The user's responses contain IDs like "viewing_porn", "tab_wrong", "conf_wife_others" etc. Pay close attention to ALL selections.

CONVERSATION:
${conversationText}

AROUSAL TEMPLATE TYPES (based on Section 2 content theme selections):
- val_ items → The Invisible Man. Root: "I am not enough / not wanted." Counterfeits: being chosen, seen, desired.
- pow_ items → The Controller. Root: "I am unsafe / powerless." Counterfeits: mastery, safety, control.
- sur_ items → The Surrendered. Root: "I must perform to be loved / exhausted from controlling." Counterfeits: relief from responsibility.
- tab_ items → The Shame Circuit. Root: "Shame is fused with arousal." The transgression IS the neurochemical payload.
- voy_ items → The Observer. Root: "I am safer watching than participating." Counterfeits: connection without vulnerability.
- ten_ items → The Orphan Heart. Root: "I was never emotionally safe." Counterfeits: nurture, warmth, being held.
- nov_ items → The Escalator. Dopamine tolerance. Chasing a hit the brain can no longer produce at baseline.
- conf_ items → Complex Template. Multiple roots intersecting. Decoded individually.

CONFUSING PATTERNS DECODER:
- conf_wife_others: Three roots: (1) Masochistic shame eroticization — shame IS the neurochemical payload, (2) Compersive anxiety management — brain masters abandonment fear by making it voluntary, (3) Self-worth narrative — "I am not enough" playing out sexually.
- conf_race: Race/ethnicity present during imprinting OR brain eroticized cultural "other" as forbidden. Power dynamics mapped onto racial categories from culture.
- conf_trans: Novelty-driven arousal template needs maximum novelty for dopamine. May also activate taboo circuit. Does NOT define orientation.
- conf_pain: Pain and arousal share neurochemical pathways. Often traces to childhood physical abuse or corporal punishment near sexual development.
- conf_humiliation: Root narrative "I am worthless" converting belief into arousal. Brain resolves tension between public identity and private belief about worth.

ATTACHMENT STYLES (based on Section 6):
- anx_ items → Anxious-Preoccupied
- avoid_ items → Dismissive-Avoidant
- fear_ items → Fearful-Avoidant (Disorganized)
- sec_ items → Secure (but hijacked)
- Both anxious + avoidant high → Disorganized

CRITICAL FORMATTING RULE: NEVER use em dashes (the long dash character) in any text. Use commas instead. Write "meaning, the brain" not "meaning — the brain."

Return ONLY valid JSON, no markdown:
{
  "arousalTemplateType": "The Invisible Man|The Controller|The Surrendered|The Shame Circuit|The Observer|The Orphan Heart|The Escalator|Complex Template",
  "arousalTemplateSecondary": "secondary type if applicable, or null",
  "rootNarrativeStatement": "The core lie (e.g. 'I am not enough', 'I am unsafe')",
  "whatBrainCounterfeits": "What the brain is trying to get through the behavior (1 sentence)",

  "behaviorRootMap": [{"behavior": "behavior name", "root": "decoded root explanation (2-3 sentences)"}],

  "confusingPatternsDecoded": [{"pattern": "pattern name", "explanation": "full clinical decoder (3-5 sentences, zero shame, clinical clarity)"}],

  "neuropathway": "Arousal|Numbing|Fantasy|Deprivation",
  "neuropathwayManages": "Pain|Anxiety|Shame|Terror",
  "neuropathwayExplanation": "2-3 sentences: what the behavior is doing for the nervous system",

  "imprintingAge": "age range of first exposure",
  "imprintingContext": "how exposure happened",
  "imprintingFusion": "2-3 sentences: what got fused with arousal during imprinting, connecting childhood environment to current pattern",

  "attachmentStyle": "Anxious-Preoccupied|Dismissive-Avoidant|Fearful-Avoidant|Secure|Disorganized",
  "attachmentFuels": "2-3 sentences: how this attachment style specifically fuels the sexual behavior cycle",

  "godAttachment": "2-3 sentences: how the man relates to God based on god_ selections, connecting to his human attachment style",
  "purityCultureImpact": "2-3 sentences if church/purity culture items were selected, otherwise null",

  "codependencyScore": "0-3 based on cod_ items",
  "enmeshmentScore": "0-3 based on enm_ items",
  "relationalVoidScore": "0-3 based on void_ items",
  "leadershipBurdenScore": "0-3 based on lead_ items",
  "codependencyExplanation": "1-2 sentences connecting to sexual behavior, or null if score is 0",
  "enmeshmentExplanation": "1-2 sentences, or null",
  "relationalVoidExplanation": "1-2 sentences, or null",
  "leadershipBurdenExplanation": "1-2 sentences, or null",

  "escalationPresent": true or false,
  "patternYears": "estimate of how many years based on context clues, or 'many' if unknown",
  "isolationLevel": "description based on relational void selections",

  "keyInsight": "The single most powerful paragraph. 4-5 sentences. Connect ALL dots: specific behaviors to roots, shame fueling the cycle, attachment driving relational patterns, childhood environment encoding the template. This should feel like someone finally turned all the lights on at once. Write directly to him.",
  "closingStatement": "2-3 sentences: 'You are not broken. You are not perverted.' frame. Every behavior has a root, every root has an origin, every origin can be traced and restructured. But not alone."
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
      arousalTemplateType: "Unknown",
      arousalTemplateSecondary: null,
      rootNarrativeStatement: "Unable to determine from available data",
      whatBrainCounterfeits: "Something your soul actually needs",
      behaviorRootMap: [],
      confusingPatternsDecoded: [],
      neuropathway: "Unknown",
      neuropathwayManages: "Unknown",
      neuropathwayExplanation: "Further data needed.",
      imprintingAge: "unknown",
      imprintingContext: "unknown",
      imprintingFusion: "Further data needed to trace the imprinting.",
      attachmentStyle: "Unknown",
      attachmentFuels: "Further data needed.",
      godAttachment: null,
      purityCultureImpact: null,
      codependencyScore: "0",
      enmeshmentScore: "0",
      relationalVoidScore: "0",
      leadershipBurdenScore: "0",
      codependencyExplanation: null,
      enmeshmentExplanation: null,
      relationalVoidExplanation: null,
      leadershipBurdenExplanation: null,
      escalationPresent: false,
      isolationLevel: "Unknown",
      keyInsight: "Your pattern is not random. Every behavior traces to a root. Every root has an origin.",
      closingStatement: "You are not broken. You are not perverted. Every behavior has a root, every root has an origin, and every origin can be traced, exposed, and restructured.",
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
      bufferPages: false,
      autoFirstPage: false,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 612, H = 792, M = 50, CW = W - M * 2, PB = H - 60;
    const CONTENT_TOP = 50; // Standard top margin for content below logo

    // Load logo for letterhead
    let logoBuffer = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "images", "unchained-logo.png");
      logoBuffer = fs.readFileSync(logoPath);
    } catch (e) {
      console.log("Logo not found, continuing without letterhead:", e.message);
    }

    // Strip em dashes from all analysis text — replace with commas
    function sanitize(text) {
      if (!text) return "";
      return text.replace(/\u2014/g, ",").replace(/ — /g, ", ").replace(/— /g, ", ").replace(/ —/g, ",").replace(/—/g, ",");
    }

    function newPage() {
      doc.addPage();
      pageNum++;
      doc.rect(0, 0, W, H).fill(DK_BG);
      doc.rect(0, 0, W, 3).fill(GOLD);
      // Letterhead logo — small, top-right, with padding
      if (logoBuffer) {
        try { doc.image(logoBuffer, W - M - 100, 8, { width: 90 }); } catch(e) {}
      }
    }
    function fit(text, max) {
      if (!text) return "";
      return sanitize(text.length <= max ? text : text.substring(0, max - 3) + "...");
    }
    function sectionHeader(title) {
      doc.fontSize(14).fillColor(GOLD).font("Helvetica").text(title, M, y, { characterSpacing: 2 });
      y += 20;
      doc.roundedRect(M, y, CW, 2, 0).fill(GOLD);
      y += 16;
    }
    function checkFit(needed) {
      if (y + needed > PB) { newPage(); y = CONTENT_TOP; }
    }
    function writeCard(label, title, body) {
      title = sanitize(title);
      body = sanitize(body);
      const titleH = doc.fontSize(18).font("Helvetica-Bold").heightOfString(title || "", { width: CW - 28 });
      const bodyH = body ? doc.fontSize(14).font("Helvetica").heightOfString(body, { width: CW - 28, lineGap: 4 }) : 0;
      const labelTop = 14;
      const titleTop = labelTop + 18;
      const bodyTop = titleTop + titleH + 8;
      const cardH = Math.max(70, bodyTop + bodyH + 14);
      checkFit(cardH + 12);
      doc.roundedRect(M, y, CW, cardH, 6).fill(CARD_BG);
      doc.fontSize(11).fillColor(GOLD).font("Helvetica").text(label, M + 14, y + labelTop, { characterSpacing: 1 });
      doc.fontSize(18).fillColor(WHITE).font("Helvetica-Bold").text(title || "—", M + 14, y + titleTop);
      if (body) doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(body, M + 14, y + bodyTop, { width: CW - 28, lineGap: 4 });
      y += cardH + 12;
    }
    function writeGapWidening(text) {
      const gapH = doc.fontSize(14).font("Helvetica-Oblique").heightOfString(text, { width: CW - 20, lineGap: 4 });
      checkFit(gapH + 28);
      doc.rect(M, y, CW, 0.5).fill([50, 50, 50]);
      y += 12;
      doc.fontSize(14).fillColor([140, 140, 140]).font("Helvetica-Oblique").text(text, M + 10, y, { width: CW - 20, lineGap: 4 });
      y = doc.y + 16;
    }

    function writeGauge(label, score, maxScore) {
      const pct = Math.min(1, parseInt(score || 0) / maxScore);
      checkFit(40);
      doc.fontSize(16).fillColor(WHITE).font("Helvetica").text(label, M, y);
      y += 20;
      doc.roundedRect(M, y, CW, 10, 5).fill([40, 40, 40]);
      if (pct > 0) doc.roundedRect(M, y, CW * pct, 10, 5).fill(GOLD);
      doc.fontSize(12).fillColor(GRAY).font("Helvetica").text(`${score || 0} / ${maxScore}`, M + CW + 6, y - 2);
      y += 20;
    }

    let y = 0;
    let pageNum = 0;

    // ════════════════════════════════════════
    // COVER PAGE
    // ════════════════════════════════════════
    newPage();
    y = 120;
    doc.fontSize(14).fillColor(GOLD).font("Helvetica").text("UNCHAINED LEADER", M, y, { width: CW, align: "center", characterSpacing: 4 });
    y += 36;
    doc.fontSize(28).fillColor(WHITE).font("Helvetica-Bold").text("UNWANTED DESIRE", M, y, { width: CW, align: "center" });
    y += 34;
    doc.text("ROOT MAPPING", M, y, { width: CW, align: "center" });
    y += 44;
    doc.rect(W / 2 - 30, y, 60, 2).fill(GOLD);
    y += 22;
    doc.fontSize(16).fillColor(GRAY).font("Helvetica").text(`Personalized for ${firstName}`, M, y, { width: CW, align: "center" });
    y += 26;
    doc.fontSize(14).text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), M, y, { width: CW, align: "center" });
    y += 20;
    doc.fontSize(10).fillColor([100, 100, 100]).text("CONFIDENTIAL", M, y, { width: CW, align: "center", characterSpacing: 3 });

    // Disclaimer
    const disclaimer = "DISCLAIMER: This report is not intended for clinical use. It is not a diagnosis, a treatment plan, or a substitute for professional counseling or therapy. It is a personalized educational resource designed to help increase understanding of unwanted behaviors and increase hope that freedom is possible. If you are in crisis or experiencing thoughts of self-harm, please contact the 988 Suicide & Crisis Lifeline immediately.";
    doc.fontSize(9).fillColor([80, 80, 80]).font("Helvetica").text(disclaimer, M + 10, H - 110, { width: CW - 20, align: "center", lineGap: 2 });

    // ════════════════════════════════════════
    // SECTION 1 — AROUSAL TEMPLATE TYPE
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 1 — YOUR AROUSAL TEMPLATE TYPE");

    writeCard("PRIMARY TYPE", analysis.arousalTemplateType || "Unknown", `Root narrative: "${analysis.rootNarrativeStatement || ""}"\n\nWhat your brain is counterfeiting: ${analysis.whatBrainCounterfeits || ""}`);

    if (analysis.arousalTemplateSecondary) {
      writeCard("SECONDARY TYPE", analysis.arousalTemplateSecondary, "Multiple patterns are present in your template.");
    }

    writeGapWidening("You now have a name for the story that has been running beneath your cycle. Most men never get this far. But naming the narrative does not restructure it. Root narratives operate below conscious awareness. You cannot think your way out of a belief system your brain does not know it is running. Restructuring requires a guided process that can access what self-analysis cannot.");

    // ════════════════════════════════════════
    // SECTION 2 — BEHAVIOR-ROOT MAP
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 2 — THE BEHAVIOR-ROOT MAP");

    doc.fontSize(14).fillColor(GRAY).font("Helvetica-Oblique").text(
      "Every behavior in your cycle traces to a specific root. Here is what your brain is actually trying to accomplish through each one.",
      M, y, { width: CW, lineGap: 3 }
    );
    y = doc.y + 14;

    const brm = analysis.behaviorRootMap || [];
    for (const item of brm) {
      const beh = sanitize(item.behavior || "");
      const root = sanitize(item.root || "");
      const titleH = doc.fontSize(16).font("Helvetica-Bold").heightOfString(beh, { width: CW - 28 });
      const rootH = doc.fontSize(14).font("Helvetica").heightOfString(root, { width: CW - 28, lineGap: 4 });
      const rowH = Math.max(60, 14 + titleH + 10 + rootH + 14);
      checkFit(rowH + 10);
      doc.roundedRect(M, y, CW, rowH, 5).fill(CARD_BG);
      doc.fontSize(16).fillColor(WHITE).font("Helvetica-Bold").text(beh, M + 14, y + 14, { width: CW - 28 });
      const bodyY = y + 14 + titleH + 10;
      doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(root, M + 14, bodyY, { width: CW - 28, lineGap: 4 });
      y += rowH + 10;
    }

    writeGapWidening("Every line on this map represents a connection your brain made before you had any say in the matter. You can see the connections now. But seeing the wiring does not rewire it. The neural pathways that encode these patterns require sustained, guided, experiential work to restructure. Information about the pattern has never changed the pattern. If it could, you would already be free.");

    // ════════════════════════════════════════
    // SECTION 3 — CONFUSING PATTERNS DECODED (conditional)
    // ════════════════════════════════════════
    const cpd = analysis.confusingPatternsDecoded || [];
    if (cpd.length > 0) {
      newPage(); y = CONTENT_TOP;
      sectionHeader("SECTION 3 — CONFUSING PATTERNS DECODED");

      doc.fontSize(14).fillColor(GRAY).font("Helvetica-Oblique").text(
        "These are the patterns you have likely never told anyone about. Each one has a clinical explanation that has nothing to do with your character and everything to do with how your brain was wired.",
        M, y, { width: CW, lineGap: 3 }
      );
      y = doc.y + 14;

      for (const cp of cpd) {
        const cpTitle = sanitize(cp.pattern || "");
        const cpExp = sanitize(cp.explanation || "");
        const patTitleH = doc.fontSize(16).font("Helvetica-Bold").heightOfString(cpTitle, { width: CW - 28 });
        const expH = doc.fontSize(14).font("Helvetica").heightOfString(cpExp, { width: CW - 28, lineGap: 4 });
        const boxH = Math.max(70, 14 + patTitleH + 10 + expH + 14);
        checkFit(boxH + 10);
        doc.roundedRect(M, y, CW, boxH, 5).fill(CARD_BG);
        doc.roundedRect(M, y, CW, boxH, 5).strokeColor(GOLD).lineWidth(0.5).stroke();
        doc.fontSize(16).fillColor(GOLD).font("Helvetica-Bold").text(cpTitle, M + 14, y + 14, { width: CW - 28 });
        const cpBodyY = y + 14 + patTitleH + 10;
        doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(cpExp, M + 14, cpBodyY, { width: CW - 28, lineGap: 4 });
        y += boxH + 10;
      }
      writeGapWidening("If you have carried shame about any of these patterns, what you just read may be the first time it has made sense. That clarity matters. But understanding why the pattern exists is not the same as resolving it. The arousal template was encoded during a developmental window you cannot re-enter alone. Attempting to process this material without guided support often leads to destabilization rather than healing. The nervous system needs to be paced through this safely.");
    }

    // ════════════════════════════════════════
    // SECTION 4 — ADDICTION NEUROPATHWAY
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 4 — YOUR ADDICTION NEUROPATHWAY");

    writeCard("NEUROPATHWAY", analysis.neuropathway || "Unknown", analysis.neuropathwayExplanation || "");

    doc.fontSize(16).fillColor(WHITE).font("Helvetica").text(
      `Your brain is not using this behavior for pleasure. It is using it to manage ${(analysis.neuropathwayManages || "pain").toLowerCase()}.`,
      M, y, { width: CW, lineGap: 3 }
    );
    y = doc.y + 14;

    const yearsData = analysis.patternYears || "many";
    writeGapWidening(`Your brain is not choosing this behavior. It is running a survival program. That program was installed by experiences you did not choose and reinforced by thousands of repetitions over ${yearsData} years. Willpower cannot override a survival program. Filters cannot reach it. Accountability cannot see it. The neuropathway will keep firing until the root narrative it is responding to is restructured at the source.`);

    // ════════════════════════════════════════
    // SECTION 5 — AROUSAL TEMPLATE ORIGIN
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 5 — YOUR AROUSAL TEMPLATE ORIGIN");

    doc.fontSize(18).fillColor(WHITE).font("Helvetica-Bold").text(`First Exposure: Age ${analysis.imprintingAge || "unknown"}`, M, y);
    y = doc.y + 8;
    doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(`Context: ${analysis.imprintingContext || "unknown"}`, M, y, { width: CW });
    y = doc.y + 16;

    doc.fontSize(16).fillColor(GRAY).font("Helvetica").text(
      analysis.imprintingFusion || "",
      M, y, { width: CW, lineGap: 4 }
    );
    y = doc.y + 14;

    writeGapWidening("You can now trace your pattern from its origin to your current cycle. That is more clarity than most men get in a lifetime. But here is what the research makes clear: you cannot excavate your own root. You cannot see the story you are operating inside of. The brain that was conditioned in isolation and secrecy requires the opposite, guided truth in relationship, to recondition.");

    // ════════════════════════════════════════
    // SECTION 6 — ATTACHMENT STYLE
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 6 — YOUR ATTACHMENT STYLE");

    writeCard("ATTACHMENT STYLE", analysis.attachmentStyle || "Unknown", analysis.attachmentFuels || "");

    if (analysis.godAttachment) {
      checkFit(100);
      doc.fontSize(12).fillColor(GOLD).font("Helvetica").text("HOW THIS SHOWS UP WITH GOD", M, y, { characterSpacing: 1 });
      y += 22;
      doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(analysis.godAttachment, M, y, { width: CW, lineGap: 4 });
      y = doc.y + 16;
    }

    if (analysis.purityCultureImpact) {
      checkFit(100);
      doc.fontSize(12).fillColor(GOLD).font("Helvetica").text("PURITY CULTURE IMPACT", M, y, { characterSpacing: 1 });
      y += 22;
      doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(analysis.purityCultureImpact, M, y, { width: CW, lineGap: 4 });
      y = doc.y + 16;
    }

    writeGapWidening("Your attachment style shapes how you connect with people, how you connect with God, and how you relate to the behavior. It was encoded before age five. It has operated as your relational operating system for your entire life. And it cannot be updated by reading about it. Attachment patterns were formed in relationship. They can only be restructured in relationship. That is not a theory. That is peer-reviewed neuroscience and the consistent testimony of Scripture.");

    // ════════════════════════════════════════
    // SECTION 7 — RELATIONAL PATTERNS
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 7 — RELATIONAL PATTERNS");

    writeGauge("Codependency", analysis.codependencyScore, 3);
    if (analysis.codependencyExplanation) {
      doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(analysis.codependencyExplanation, M, y, { width: CW, lineGap: 2 });
      y = doc.y + 10;
    }
    writeGauge("Enmeshment", analysis.enmeshmentScore, 3);
    if (analysis.enmeshmentExplanation) {
      doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(analysis.enmeshmentExplanation, M, y, { width: CW, lineGap: 2 });
      y = doc.y + 10;
    }
    writeGauge("Relational Void", analysis.relationalVoidScore, 3);
    if (analysis.relationalVoidExplanation) {
      doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(analysis.relationalVoidExplanation, M, y, { width: CW, lineGap: 2 });
      y = doc.y + 10;
    }
    writeGauge("Leadership Burden", analysis.leadershipBurdenScore, 3);
    if (analysis.leadershipBurdenExplanation) {
      doc.fontSize(14).fillColor(GRAY).font("Helvetica").text(analysis.leadershipBurdenExplanation, M, y, { width: CW, lineGap: 2 });
      y = doc.y + 10;
    }

    writeGapWidening("The relational patterns in your life are not separate from your sexual behavior. They are the soil it grows in. Isolation feeds the cycle. Enmeshment distorts your boundaries. Codependency drains you until the behavior becomes the only thing that is yours. And the leadership burden ensures you carry everyone while no one carries you. These patterns do not resolve by being identified. They resolve by being experienced differently, in a community of men who understand them firsthand.");

    // ════════════════════════════════════════
    // SECTION 8 — THE FULL PATTERN MAP (visual diagram)
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("YOUR FULL PATTERN MAP");

    doc.fontSize(14).fillColor(GRAY).font("Helvetica-Oblique").text(
      "This diagram connects everything. Each level is populated with your actual data.",
      M, y, { width: CW }
    );
    y = doc.y + 16;

    // Vertical flow diagram
    const nodeW2 = CW - 60;
    const nodeH2 = 42;
    const nodeX = M + 30;
    const gapV = 8;
    const arrowH = 16;

    function drawFlowNode(label, value, highlight) {
      const col = highlight ? GOLD : BORDER;
      doc.roundedRect(nodeX, y, nodeW2, nodeH2, 5).fill(CARD_BG);
      doc.roundedRect(nodeX, y, nodeW2, nodeH2, 5).strokeColor(col).lineWidth(highlight ? 1 : 0.5).stroke();
      doc.fontSize(9).fillColor(GOLD).font("Helvetica").text(label, nodeX + 12, y + 6, { characterSpacing: 1 });
      doc.fontSize(10).fillColor(WHITE).font("Helvetica").text(fit(value, 70), nodeX + 12, y + 20, { width: nodeW2 - 24 });
      y += nodeH2;
    }
    function drawArrow() {
      const cx = nodeX + nodeW2 / 2;
      doc.strokeColor(GOLD).lineWidth(1).moveTo(cx, y + 2).lineTo(cx, y + arrowH - 4).stroke();
      doc.fillColor(GOLD).moveTo(cx - 3, y + arrowH - 4).lineTo(cx, y + arrowH).lineTo(cx + 3, y + arrowH - 4).fill();
      y += arrowH;
    }

    drawFlowNode("CHILDHOOD ENVIRONMENT + FAITH ENVIRONMENT",
      [analysis.imprintingContext, analysis.purityCultureImpact ? "Purity culture present" : ""].filter(Boolean).join(" | ") || "Your upbringing", true);
    drawArrow();
    drawFlowNode("ROOT NARRATIVE FORMED", `"${fit(analysis.rootNarrativeStatement, 70)}"`, true);
    drawArrow();
    drawFlowNode("FIRST EXPOSURE", `Age ${analysis.imprintingAge || "?"} — ${fit(analysis.imprintingContext, 60)}`, true);
    drawArrow();
    drawFlowNode("AROUSAL TEMPLATE ENCODED", analysis.arousalTemplateType || "Unknown", true);
    drawArrow();
    drawFlowNode("ATTACHMENT STYLE SHAPES RELATIONAL + SPIRITUAL PATTERN", analysis.attachmentStyle || "Unknown", false);
    drawArrow();
    drawFlowNode("NEUROPATHWAY DETERMINES FUNCTION", `${analysis.neuropathway || "Unknown"} — manages ${(analysis.neuropathwayManages || "pain").toLowerCase()}`, false);
    drawArrow();
    drawFlowNode("SPECIFIC BEHAVIORS EMERGE", (analysis.behaviorRootMap || []).map(b => b.behavior).join(", ") || "Your pattern", false);
    drawArrow();
    drawFlowNode("CURRENT CYCLE", analysis.escalationPresent ? "Escalating" : "Active", false);

    y += 16;
    writeGapWidening("This is the full architecture of your cycle. Every connection. Every root. Every origin. Every reinforcing pattern.\n\nYou can see the prison now. Most men never do.\n\nBut seeing the prison does not open the door.");

    // ════════════════════════════════════════
    // SECTION 9 — THE KEY INSIGHT
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("THE FULL PICTURE");

    doc.fontSize(16).fillColor(WHITE).font("Helvetica").text(
      analysis.keyInsight || "Your pattern is not random.",
      M, y, { width: CW, lineGap: 5 }
    );
    y = doc.y + 20;

    // ════════════════════════════════════════
    // SECTION 9 — WHAT THIS MEANS
    // ════════════════════════════════════════
    checkFit(200);
    doc.fontSize(14).fillColor(GOLD).font("Helvetica").text("WHAT THIS MEANS", M, y, { characterSpacing: 2 });
    y += 24;

    doc.fontSize(16).fillColor(WHITE).font("Helvetica").text(
      analysis.closingStatement || "You are not broken. Every behavior has a root, every root has an origin, and every origin can be traced and restructured.",
      M, y, { width: CW, lineGap: 5 }
    );
    y = doc.y + 20;

    // ════════════════════════════════════════
    // SECTION 10 — NEXT STEP
    // ════════════════════════════════════════
    checkFit(100);
    doc.rect(M, y, CW, 1).fill(BORDER);
    y += 14;

    const ctaBodyH = doc.fontSize(14).font("Helvetica").heightOfString("Log back in with your email and PIN to book a 30-minute Clarity Call with a certified coach who has your full data.", { width: CW - 32 });
    const ctaBoxH = 14 + 22 + 12 + ctaBodyH + 14;
    doc.roundedRect(M, y, CW, ctaBoxH, 6).fill(CARD_BG);
    doc.fontSize(18).fillColor(WHITE).font("Helvetica-Bold").text("Ready to go deeper?", M + 16, y + 14, { width: CW - 32 });
    doc.fontSize(14).fillColor(GRAY).font("Helvetica").text("Log back in with your email and PIN to book a 30-minute Clarity Call with a certified coach who has your full data.", M + 16, y + 14 + 22 + 12, { width: CW - 32 });
    y += ctaBoxH + 20;

    doc.fontSize(18).fillColor(GOLD).font("Helvetica-Bold").text("#liveunchained", M, y, { width: CW, align: "center" });

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
      subject: `${firstName}, Your Unwanted Desire Root Mapping`,
      html: `
        <div style="background:#111;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#ccc;max-width:600px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:30px;">
            <div style="color:#c5a55a;font-size:12px;letter-spacing:3px;margin-bottom:6px;">UNCHAINED LEADER</div>
            <div style="color:#fff;font-size:22px;font-weight:bold;">Your Root Mapping Report</div>
          </div>
          <p style="font-size:15px;line-height:1.7;color:#ccc;">
            ${firstName}, your Root Genre Diagnostic report is attached.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#999;">
            This report maps every behavior in your pattern to its psychological root, decodes your attachment style, reveals your relational patterns, and connects it all to your childhood environment and first exposure. It shows you what is actually driving the cycle, not just the symptom.
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
          filename: `UDRM-Report-${firstName}.pdf`,
          content: pdfBase64,
          type: "application/pdf",
        },
      ],
    }),
  });
}
