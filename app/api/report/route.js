import Anthropic from "@anthropic-ai/sdk";
import redis from "../lib/redis";
import PDFDocument from "pdfkit";
import { put } from "@vercel/blob";
import { ghlDiagnosticComplete, ghlSendReportData } from "../lib/ghl";
import fs from "fs";
import path from "path";
import { getDb } from "../lib/db";

export const maxDuration = 800;

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
const GRAY = [210, 210, 210];    // #d2d2d2
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
    const { email, name, diagnosticData } = body;

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400, headers: CORS_HEADERS });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Look up user
    const user = await redis.get(`mkt:user:${normalizedEmail}`);
    if (!user) {
      return Response.json({ error: "No account found. Please register first." }, { status: 404, headers: CORS_HEADERS });
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
    console.log("Starting Opus analysis...");
    const analysisStart = Date.now();
    const rawAnalysis = await analyzeConversation(messages, userName);
    console.log(`Opus analysis completed in ${((Date.now() - analysisStart) / 1000).toFixed(1)}s`);

    // Sanitize all string values: strip em dashes + internal code identifiers
    function cleanStr(s) {
      if (!s) return s;
      return s
        // Em dashes to commas
        .replace(/\u2014/g, ",").replace(/ — /g, ", ").replace(/— /g, ", ").replace(/ —/g, ",").replace(/—/g, ",")
        // Strip internal identifiers like (tab_incest), (conf_wife_others), etc.
        .replace(/\s*\((?:tab|conf|val|pow|sur|voy|ten|nov|cod|enm|void|lead|god|anx|avoid|fear|sec|home|dad|mom|church)_[a-z_]+\)/gi, "")
        // Strip standalone identifiers like "tab_incest" without parens
        .replace(/\b(?:tab|conf|val|pow|sur|voy|ten|nov|cod|enm|void|lead|god|anx|avoid|fear|sec|home|dad|mom|church)_[a-z_]+\b/gi, "")
        // Replace "Brother," with first name
        .replace(/^Brother,/i, `${firstName || "Brother"},`)
        .replace(/\bBrother,\b/g, `${firstName || "Brother"},`)
        // Replace "clinical" when describing our process (not when referencing research)
        .replace(/\bclinical process\b/gi, "specialized process")
        .replace(/\bclinical approach\b/gi, "specialized approach")
        .replace(/\bclinical program\b/gi, "structured program")
        .replace(/\bclinical framework\b/gi, "structured framework")
        .replace(/\bclinical clarity\b/gi, "clear insight")
        .replace(/\bclinical explanation\b/gi, "research-backed explanation")
        .replace(/\bclinical reason\b/gi, "specific reason")
        // Clean up double spaces left behind
        .replace(/  +/g, " ").trim();
    }
    function sanitizeObj(obj) {
      if (!obj) return obj;
      const result = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") {
          result[k] = cleanStr(v);
        } else if (Array.isArray(v)) {
          result[k] = v.map(item => typeof item === "object" && item !== null ? sanitizeObj(item) : typeof item === "string" ? cleanStr(item) : item);
        } else {
          result[k] = v;
        }
      }
      return result;
    }
    const analysis = sanitizeObj(rawAnalysis);

    // Generate PDF
    const pdfBuffer = await generatePDF(analysis, firstName);

    // ═══════════════════════════════════════
    // QC CHECK — validate PDF before sending
    // ═══════════════════════════════════════
    const qcIssues = [];
    const pdfStr = pdfBuffer.toString("latin1");

    // 1. Page count — expect 15-30 pages
    const pageCount = (pdfStr.match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (pageCount < 10) qcIssues.push(`Low page count: ${pageCount} (expected 15+)`);
    if (pageCount > 40) qcIssues.push(`High page count: ${pageCount} (expected under 35)`);

    // 2. File size — expect 30KB-500KB
    const sizeKB = Math.round(pdfBuffer.length / 1024);
    if (sizeKB < 20) qcIssues.push(`File too small: ${sizeKB}KB (expected 30KB+)`);

    // 3. Blank page detection — each page should have text stream content
    // Count pages that have our dark background rect (means pageAdded handler fired)
    const bgRects = (pdfStr.match(/0\.0667 0\.0667 0\.0667 rg/g) || []).length; // DK_BG rgb
    if (bgRects < pageCount - 1) qcIssues.push(`Missing dark backgrounds: ${bgRects} bgs for ${pageCount} pages`);

    // 4. Check for essential content markers
    const hasScorecard = pdfStr.includes("Results at a Glance") || pdfStr.includes("RESULTS AT A GLANCE");
    const hasTemplate = pdfStr.includes("AROUSAL TEMPLATE") || pdfStr.includes("Arousal Template");
    const hasNextSteps = pdfStr.includes("PRIORITIZED NEXT STEPS") || pdfStr.includes("Priority");
    if (!hasScorecard) qcIssues.push("Missing: Results at a Glance section");
    if (!hasTemplate) qcIssues.push("Missing: Arousal Template section");
    if (!hasNextSteps) qcIssues.push("Missing: Next Steps section");

    // 5. Check for internal code leaks
    const codeLeaks = pdfStr.match(/(?:tab_|conf_|val_|pow_|sur_|voy_|ten_|nov_|cod_|enm_|void_|lead_)[a-z_]+/g);
    if (codeLeaks && codeLeaks.length > 0) qcIssues.push(`Internal codes leaked: ${[...new Set(codeLeaks)].slice(0, 3).join(", ")}`);

    // Log QC results
    if (qcIssues.length > 0) {
      console.warn(`PDF QC WARNINGS (${qcIssues.length}):`, qcIssues.join(" | "));
    } else {
      console.log(`PDF QC PASSED: ${pageCount} pages, ${sizeKB}KB, all sections present`);
    }

    // If critical failure (very low pages or missing key sections), regenerate once
    const criticalFail = pageCount < 5 || (!hasScorecard && !hasTemplate);
    if (criticalFail) {
      console.error("CRITICAL QC FAILURE — attempting regeneration");
      const pdfBuffer2 = await generatePDF(analysis, firstName);
      const pageCount2 = (pdfBuffer2.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
      if (pageCount2 > pageCount) {
        console.log(`Regeneration improved: ${pageCount} -> ${pageCount2} pages`);
        var finalBuffer = pdfBuffer2;
      } else {
        console.log("Regeneration did not improve. Using original.");
        var finalBuffer = pdfBuffer;
      }
    } else {
      var finalBuffer = pdfBuffer;
    }

    const pdfBase64 = finalBuffer.toString("base64");

    // Upload PDF to Vercel Blob for permanent storage
    let reportUrl = null;
    try {
      const timestamp = Date.now();
      const blob = await put(
        `reports/${normalizedEmail.replace(/[^a-z0-9]/g, "-")}/${timestamp}-diagnostic.pdf`,
        finalBuffer,
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

    // Record analytics: report generated + completed diagnostic
    try {
      const sql = getDb();
      await sql`INSERT INTO analytics_events (session_id, product, event_type, event_data)
        VALUES (${normalizedEmail}, 'udrm', 'report_generated', ${JSON.stringify({ reportUrl, analysisTime: `${((Date.now() - analysisStart) / 1000).toFixed(1)}s` })})`;
      await sql`INSERT INTO analytics_events (session_id, product, event_type, event_data)
        VALUES (${normalizedEmail}, 'udrm', 'report_emailed', ${JSON.stringify({ email: normalizedEmail })})`;
      await sql`INSERT INTO completed_diagnostics (
        session_id, email, product, name, arousal_template_type, neuropathway, attachment_style,
        codependency_score, enmeshment_score, relational_void_score, leadership_burden_score,
        escalation_present, strategies_count, years_fighting, report_url, report_generated_at
      ) VALUES (
        ${normalizedEmail}, ${normalizedEmail}, 'udrm', ${userName},
        ${analysis.arousalTemplateType || null}, ${analysis.neuropathway || null}, ${analysis.attachmentStyle || null},
        ${parseInt(analysis.codependencyScore) || 0}, ${parseInt(analysis.enmeshmentScore) || 0},
        ${parseInt(analysis.relationalVoidScore) || 0}, ${parseInt(analysis.leadershipBurdenScore) || 0},
        ${analysis.escalationPresent || false}, ${parseInt(analysis.strategiesCount) || 0},
        ${analysis.yearsFighting || null}, ${reportUrl}, NOW()
      )`;
    } catch(e) { console.error("Analytics write error (non-fatal):", e.message); }

    return Response.json({ success: true, message: "Report sent", reportUrl }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Report generation error:", error.message || error);
    console.error("Error stack:", error.stack);
    return Response.json({ error: `Failed to generate report: ${error.message || "unknown error"}` }, { status: 500, headers: CORS_HEADERS });
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
    model: "claude-opus-4-6",
    max_tokens: 16384,
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

CRITICAL FORMATTING RULES:
1. NEVER use em dashes (the long dash character) in any text. Use commas instead.
2. NEVER include internal variable names, code identifiers, or selection IDs in any text. Do NOT write things like "tab_incest", "conf_wife_others", "cod_needs", "enm_parent_emotions", "god_disappointed", "void_no_one", "lead_disqualified", "val_desired", "pow_dominance", etc. These are internal system identifiers. The report is client-facing. Use plain English descriptions only. Write "incest-themed content" not "tab_incest". Write "fantasies involving your wife with others" not "conf_wife_others". Write "feeling disqualified from leadership" not "lead_disqualified".
3. NEVER reference "selections" or "items selected" in diagnostic language. Write as if you know the man personally, not as if you are reading a data printout.
IMPORTANT: We are NOT a clinical practice. NEVER use the word "clinical" when describing our process, our approach, or what we offer. Use alternatives like "specialized," "guided," "professional," "trained," "structured," or "root-level." The word "clinical" is acceptable ONLY when referencing published research (e.g. "research shows") or when describing something the man may have tried (e.g. "clinical therapy"). It must NEVER describe what WE do.

VOICE GUIDE — SCRIPTURE + SCIENCE INTEGRATION:
You are writing this report as Mason Cain. Every insight should connect to kingdom purpose. Every Scripture reference should be grounded in neuroscience. The man reading this should feel simultaneously understood by science and seen by God. Never preach. Never lecture. Speak as a fellow traveler who has walked this road and found that faith and psychology are the same explanation viewed from two angles.

VOICE PRINCIPLES:
1. Lead with identity, not pathology. Not "your pattern indicates anxious attachment." Instead: "You were designed for deep connection, but your nervous system learned to distrust it before you had a choice. That is not a disorder. That is a misalignment between how God wired you and what your story taught you."
2. Every research-backed insight points to a kingdom truth. Connect the neuropathway to purpose: "Your brain uses this behavior to manage pain. That pain management system kept you alive as a child. But it is now standing between you and the man God is calling you to become."
3. Every Biblical truth is grounded in science. "Romans 12:2 says be transformed by the renewing of your mind. Neuroplasticity research confirms this is literally how the brain works. Paul was not being poetic. He was being precise."
4. Use kingdom language that connects to masculine purpose. Calling, authority, leadership, legacy, assignment. Not soft devotional language.
5. Name the contradiction between calling and cycle. "You know God has more in store for you. You can feel the assignment on your life. But every time this cycle runs, it erodes the confidence you need to fully step into it. The cycle is not just stealing your purity. It is stealing your authority."
6. Frame each behavior as a counterfeit of something God designed him to have. The desire underneath is not wrong. It is misdirected. Misdirected desire does not need punishment. It needs restructuring.
7. Frame the arousal template origin as an attack on destiny. The enemy does not waste ammunition on men with no assignment.
8. Connect attachment style to capacity for intimacy with God. The same attachment style limiting his marriage is limiting his kingdom capacity.
9. Frame relational patterns as the environment the cycle needs to survive. Isolation, overperformance, and boundary collapse keep him from the community God designed him to heal in.
10. The keyInsight and closingStatement should be the most direct kingdom language. "You are not disqualified. You are not damaged goods. You are a man carrying a kingdom assignment that the enemy has been trying to neutralize since childhood."

Return ONLY valid JSON, no markdown:
{
  "arousalTemplateType": "The Invisible Man|The Controller|The Surrendered|The Shame Circuit|The Observer|The Orphan Heart|The Escalator|Complex Template",
  "arousalTemplateSecondary": "secondary type if applicable, or null",
  "rootNarrativeStatement": "The core lie (e.g. 'I am not enough', 'I am unsafe')",
  "whatBrainCounterfeits": "What the brain is trying to get through the behavior (1 sentence)",

  "behaviorRootMap": [{"behavior": "behavior name in plain English", "root": "decoded root explanation in 2-3 SHORT paragraphs separated by newlines. First paragraph: what the behavior actually is (a shame management system, an escape valve, etc). Second paragraph: connect it to what God designed and how the brain is counterfeiting it. Keep paragraphs to 2-3 sentences max for mobile readability."}],

  "confusingPatternsDecoded": [{"pattern": "pattern name in plain English (NOT internal IDs)", "explanation": "full decoder (3-5 sentences). Zero shame. Clear, direct explanation grounded in research. Speak directly to the shame these patterns produce and counter it with identity in Christ. The man has probably believed he is uniquely depraved. Counter that with truth about how the brain works AND who God says he is."}],

  "neuropathway": "Arousal|Numbing|Fantasy|Deprivation",
  "neuropathwayManages": "Pain|Anxiety|Shame|Terror",
  "neuropathwayExplanation": "2-3 sentences: what the behavior is doing for the nervous system. Frame as a survival mechanism now blocking kingdom capacity. What kept him alive as a child is now keeping him small as a man.",

  "imprintingAge": "age range of first exposure",
  "imprintingContext": "how exposure happened in plain English",
  "imprintingFusion": "2-3 sentences: what got fused with arousal during imprinting. Frame the origin as an attack on destiny. The enemy targeted the template early because he knew what the man was designed to become. Include a Scripture connection.",

  "attachmentStyle": "Anxious-Preoccupied|Dismissive-Avoidant|Fearful-Avoidant|Secure|Disorganized",
  "attachmentFuels": "2-3 sentences: how this attachment style fuels the cycle AND limits his kingdom capacity. Connect human attachment to his capacity for intimacy with God.",

  "godAttachment": "2-3 sentences: how he relates to God through the same template as his human attachment. Include specific Scripture (Psalm 139, Romans 8:1, etc.). The barrier between him and the Father is the same barrier between him and freedom.",
  "purityCultureImpact": "2-3 sentences if church/purity culture items were selected, otherwise null. Show how the church message fused shame with arousal rather than preventing it.",

  "codependencyScore": "0-3 based on cod_ items",
  "enmeshmentScore": "0-3 based on enm_ items",
  "relationalVoidScore": "0-3 based on void_ items",
  "leadershipBurdenScore": "0-3 based on lead_ items",
  "codependencyExplanation": "2-3 sentences connecting to sexual behavior AND kingdom capacity. He gives himself away to everyone. The behavior is the one place he takes something for himself. Or null if score is 0.",
  "enmeshmentExplanation": "2-3 sentences. His boundaries were violated before he knew what boundaries were. The behavior may be the only space that feels like his own. Or null.",
  "relationalVoidExplanation": "2-3 sentences. He has no one who truly knows him. The behavior fills the void that isolation creates. Wounds created in relational absence require relational presence to heal. Ecclesiastes 4:12. Or null.",
  "leadershipBurdenExplanation": "2-3 sentences. He carries everyone. No one carries him. The behavior is the one place his nervous system does not have to perform. God never designed him to lead from isolation. Or null.",

  "escalationPresent": true or false,
  "escalationSeverity": "1-5 scale: 1=stable, 2=mild, 3=moderate, 4=significant, 5=severe",
  "patternYears": "estimate of how many years based on context clues, or 'many' if unknown",
  "isolationLevel": "description based on relational void selections",
  "isolationScore": "1-5 scale based on void items and disclosure level",

  "scorecardBehaviorCount": "number of behaviors selected in Section 1",
  "scorecardContentThemeCount": "number of content themes selected in Section 2",
  "scorecardConfusingPatternCount": "number of confusing patterns (Category H) selected",
  "scorecardEmotionalFunctionCount": "number of emotional functions selected in Section 3",
  "scorecardChildhoodWoundScore": "1-5 severity: based on home/father/mother/church selections. 1=minimal, 5=severe across all areas",
  "scorecardAttachmentSeverity": "1-5: 1=secure, 2=mild insecure, 3=moderate, 4=significant, 5=disorganized",
  "scorecardSpiritualDisconnect": "1-5: based on god_ items. 1=connected, 5=severely disconnected",
  "scorecardRelationalBurden": "1-5: combined codependency+enmeshment+void+leadership score",

  "strategiesTried": ["Array of strategy names the man selected in plain English"],
  "strategiesCount": "number of strategies selected",
  "yearsFighting": "from the duration question (e.g. '10 to 20', 'Over 20'). Do NOT include the word 'years' in this value.",
  "strategyBreakdowns": [{"strategy": "Strategy name in plain English", "targeted": "what this strategy targeted (1 phrase)", "explanation": "2-3 sentences explaining why this specific strategy could not reach HIS specific root narrative type. Be direct. Connect the failure to his Root Narrative Type name. Example for Shame Circuit: 'Filters block access but cannot reach a Shame Circuit root. Your brain was not stopped by the filter because the arousal was never about the content. It was about the transgression.' Use Scripture + Science voice. Frame each failure as a targeting problem, not a moral failure."}],

  "keyInsight": "The single most powerful paragraph. 4-5 sentences. Start with the man's first name (${userName}), NOT 'Brother.' Connect ALL dots: specific behaviors to roots, shame fueling the cycle, attachment driving relational patterns, childhood encoding the template. Use the Scripture + Science voice. Frame the enemy as having targeted him specifically because of the assignment on his life. The fact that his pattern is this specific is evidence he is dangerous to the kingdom of darkness. Write directly to him as Mason would.",
  "closingStatement": "3-4 sentences. Start with the man's first name (${userName}), NOT 'Brother.' The most direct kingdom language in the report. 'You are not disqualified. You are not damaged goods. You are a man carrying a kingdom assignment that the enemy has been trying to neutralize since childhood.' Frame freedom as neurological, spiritual, and relational reality. End with the question: the question is not whether it is possible, the question is whether you are ready."
}`
    }],
  });

  const text = response.content[0].text;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON parse failed, attempting extraction. Error:", e.message);
    console.error("First 500 chars of response:", text.substring(0, 500));
    // Try to extract JSON from the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) {
        console.error("Extracted JSON also failed:", e2.message);
      }
    }
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
      strategyBreakdowns: [],
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
    const CONTENT_TOP = 50;

    // Load logo FIRST so the pageAdded handler can reference it
    let logoBuffer = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "images", "unchained-logo.png");
      logoBuffer = fs.readFileSync(logoPath);
    } catch (e) {
      console.log("Logo not found, continuing without letterhead:", e.message);
    }

    // CRITICAL: Catch ALL page creation events (including auto-pagination).
    // This is the permanent fix for white pages. When PDFKit's .text()
    // overflows and auto-creates a new page, this event fires and applies
    // the dark background + gold accent + logo. No page can ever be white.
    // Track current text color so pageAdded can restore it after drawing background
    let _currentTextColor = GRAY;

    doc.on("pageAdded", () => {
      // Draw background elements without save/restore to avoid corrupting text color state
      doc.rect(0, 0, W, H).fill(DK_BG);
      doc.rect(0, 0, W, 3).fill(GOLD);
      if (logoBuffer) {
        try { doc.image(logoBuffer, W - M - 100, 8, { width: 90 }); } catch(e) {}
      }
      // Restore the text color that was active before the page break
      doc.fillColor(_currentTextColor);
    });

    // Strip em dashes from all analysis text — replace with commas
    function sanitize(text) {
      if (!text) return "";
      return text.replace(/\u2014/g, ",").replace(/ — /g, ", ").replace(/— /g, ", ").replace(/ —/g, ",").replace(/—/g, ",");
    }

    function newPage() {
      doc.addPage();
      pageNum++;
      // Background + logo are handled by the pageAdded event listener
    }
    function fit(text, max) {
      if (!text) return "";
      return sanitize(text.length <= max ? text : text.substring(0, max - 3) + "...");
    }
    function sectionHeader(title) {
      doc.fontSize(20).fillColor(GOLD).font("Helvetica").text(title, M, y, { characterSpacing: 2 });
      y += 26;
      doc.roundedRect(M, y, CW, 2, 0).fill(GOLD);
      y += 18;
    }
    function checkFit(needed) {
      if (y + needed > PB) { newPage(); y = CONTENT_TOP; }
    }
    function writeCard(label, title, body) {
      title = sanitize(title);
      body = sanitize(body);
      const titleH = doc.fontSize(24).font("Helvetica-Bold").heightOfString(title || "", { width: CW - 28 });
      const bodyH = body ? doc.fontSize(20).font("Helvetica").heightOfString(body, { width: CW - 28, lineGap: 5 }) : 0;
      const labelTop = 16;
      const titleTop = labelTop + 22;
      const bodyTop = titleTop + titleH + 10;
      const cardH = Math.max(80, bodyTop + bodyH + 16);
      checkFit(cardH + 14);
      doc.roundedRect(M, y, CW, cardH, 6).fill(CARD_BG);
      doc.fontSize(18).fillColor(GOLD).font("Helvetica").text(label, M + 14, y + labelTop, { characterSpacing: 1 });
      doc.fontSize(24).fillColor(WHITE).font("Helvetica-Bold").text(title || "", M + 14, y + titleTop);
      if (body) { _currentTextColor = GRAY; _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(body, M + 14, y + bodyTop, { width: CW - 28, lineGap: 5 }); }
      y += cardH + 14;
    }
    function writeGapWidening(text) {
      const gapH = doc.fontSize(20).font("Helvetica-Oblique").heightOfString(text, { width: CW - 20, lineGap: 4 });
      checkFit(gapH + 30);
      doc.rect(M, y, CW, 0.5).fill([50, 50, 50]);
      y += 14;
      _currentTextColor = [200, 60, 60]; doc.fontSize(20).fillColor([200, 60, 60]).font("Helvetica-Oblique").text(text, M + 10, y, { width: CW - 20, lineGap: 4 });
      y = doc.y + 18;
    }

    function writeGauge(label, score, maxScore) {
      const pct = Math.min(1, parseInt(score || 0) / maxScore);
      checkFit(48);
      _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(label, M, y);
      y += 26;
      doc.roundedRect(M, y, CW, 14, 7).fill([40, 40, 40]);
      if (pct > 0) doc.roundedRect(M, y, CW * pct, 14, 7).fill(GOLD);
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(`${score || 0} / ${maxScore}`, M + CW + 6, y - 2);
      y += 24;
    }

    let y = 0;
    let pageNum = 0;

    // ════════════════════════════════════════
    // COVER PAGE
    // ════════════════════════════════════════
    newPage();
    y = 120;
    doc.fontSize(18).fillColor(GOLD).font("Helvetica").text("UNCHAINED LEADER", M, y, { width: CW, align: "center", characterSpacing: 4 });
    y += 36;
    doc.fontSize(32).fillColor(WHITE).font("Helvetica-Bold").text("UNWANTED DESIRE", M, y, { width: CW, align: "center" });
    y += 34;
    doc.text("ROOT MAPPING", M, y, { width: CW, align: "center" });
    y += 44;
    doc.rect(W / 2 - 30, y, 60, 2).fill(GOLD);
    y += 22;
    _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(`Personalized for ${firstName}`, M, y, { width: CW, align: "center" });
    y += 26;
    doc.fontSize(14).text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), M, y, { width: CW, align: "center" });
    y += 20;
    doc.fontSize(12).fillColor([140, 140, 140]).text("CONFIDENTIAL", M, y, { width: CW, align: "center", characterSpacing: 3 });

    // Credentials + LegitScript badge (centered in blank space)
    const credY = y + 60;
    const credText = "This diagnostic was developed by Mason Cain, PSAP, PMAP, credentialed through the International Institute for Trauma and Addiction Professionals. Unchained Leader is a LegitScript-certified program.";
    doc.fontSize(12).fillColor([160, 160, 160]).font("Helvetica").text(credText, M + 40, credY, { width: CW - 80, align: "center", lineGap: 2 });
    const afterCredText = doc.y + 14;

    // LegitScript badge
    try {
      const badgePath = path.join(process.cwd(), "public", "legitscript-badge.png");
      if (fs.existsSync(badgePath)) {
        const badgeW = 250;
        const badgeX = W / 2 - badgeW / 2;
        doc.image(badgePath, badgeX, afterCredText, { width: badgeW });
      }
    } catch (e) { console.log("LegitScript badge not found:", e.message); }

    // Disclaimer
    const disclaimer = "DISCLAIMER: This report is not intended for clinical use. It is not a diagnosis, a treatment plan, or a substitute for professional counseling or therapy. It is a personalized educational resource designed to help increase understanding of unwanted behaviors and increase hope that freedom is possible. If you are in crisis or experiencing thoughts of self-harm, please contact the 988 Suicide & Crisis Lifeline immediately.";
    doc.fontSize(11).fillColor([120, 120, 120]).font("Helvetica").text(disclaimer, M + 10, H - 100, { width: CW - 20, align: "center", lineGap: 2 });

    // ════════════════════════════════════════
    // SCORECARD PAGE — Results Overview
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("YOUR RESULTS AT A GLANCE");

    // Color coding: 1-2 green, 3-4 yellow, 5 red
    function scoreColor(score) {
      const s = parseInt(score) || 0;
      if (s <= 2) return [80, 180, 80];   // green
      if (s <= 4) return [220, 180, 40];  // yellow
      return [200, 60, 60];               // red
    }
    function scoreLabelColor(score) {
      const s = parseInt(score) || 0;
      if (s <= 2) return "Low";
      if (s <= 4) return "Moderate";
      return "Elevated";
    }

    // Summary cards row
    const summW = (CW - 20) / 3;
    const summH = 75;
    const summCards = [
      { label: "BEHAVIORS", value: analysis.scorecardBehaviorCount || "0", sub: "identified" },
      { label: "CONTENT THEMES", value: analysis.scorecardContentThemeCount || "0", sub: "active" },
      { label: "CONFUSING PATTERNS", value: analysis.scorecardConfusingPatternCount || "0", sub: "decoded" },
    ];
    for (let i = 0; i < 3; i++) {
      const sx = M + i * (summW + 10);
      doc.roundedRect(sx, y, summW, summH, 6).fill(CARD_BG);
      doc.fontSize(11).fillColor(GOLD).font("Helvetica").text(summCards[i].label, sx + 10, y + 10, { width: summW - 20, align: "center", characterSpacing: 1 });
      doc.fontSize(28).fillColor(WHITE).font("Helvetica-Bold").text(String(summCards[i].value), sx + 10, y + 36, { width: summW - 20, align: "center" });
    }
    y += summH + 30;

    // Scored dimensions with bar chart
    const dimensions = [
      { label: "Childhood Impact Severity", score: analysis.scorecardChildhoodWoundScore, max: 5 },
      { label: "Attachment Insecurity", score: analysis.scorecardAttachmentSeverity, max: 5 },
      { label: "Escalation Risk", score: analysis.escalationSeverity, max: 5 },
      { label: "Spiritual Disconnect", score: analysis.scorecardSpiritualDisconnect, max: 5 },
      { label: "Relational Burden", score: analysis.scorecardRelationalBurden, max: 5 },
      { label: "Isolation Level", score: analysis.isolationScore, max: 5 },
    ];

    const barH = 14;
    const barGap = 48;
    for (const dim of dimensions) {
      const s = parseInt(dim.score) || 0;
      const pct = Math.min(1, s / dim.max);
      const col = scoreColor(s);
      const sLabel = scoreLabelColor(s);

      checkFit(barGap + 10);
      // Label
      doc.fontSize(18).fillColor(WHITE).font("Helvetica").text(dim.label, M, y);
      doc.fontSize(14).fillColor(col).font("Helvetica-Bold").text(`${s} / ${dim.max}  (${sLabel})`, M + CW - 120, y, { width: 120, align: "right" });
      y += 20;
      // Bar background
      doc.roundedRect(M, y, CW, barH, 7).fill([40, 40, 40]);
      // Bar fill
      if (pct > 0) doc.roundedRect(M, y, CW * pct, barH, 7).fill(col);
      y += barH + (barGap - 20 - barH);
    }

    y += 24;
    // Relational pattern scores mini-row
    doc.fontSize(18).fillColor(GOLD).font("Helvetica").text("RELATIONAL PATTERN BREAKDOWN", M, y, { characterSpacing: 1 });
    y += 22;

    const relScores = [
      { label: "Codependency", score: analysis.codependencyScore, max: 3 },
      { label: "Enmeshment", score: analysis.enmeshmentScore, max: 3 },
      { label: "Relational Void", score: analysis.relationalVoidScore, max: 3 },
      { label: "Leadership Burden", score: analysis.leadershipBurdenScore, max: 3 },
    ];
    const relW = (CW - 30) / 4;
    for (let i = 0; i < 4; i++) {
      const rx = M + i * (relW + 10);
      const rs = parseInt(relScores[i].score) || 0;
      const rc = rs <= 1 ? [80, 180, 80] : rs <= 2 ? [220, 180, 40] : [200, 60, 60]; // 3/3 = red, 2/3 = yellow, 1/3 or 0 = green
      doc.roundedRect(rx, y, relW, 60, 6).fill(CARD_BG);
      doc.fontSize(11).fillColor(GOLD).font("Helvetica").text(relScores[i].label, rx + 6, y + 8, { width: relW - 12, align: "center" });
      doc.fontSize(22).fillColor(rc).font("Helvetica-Bold").text(`${rs}/${relScores[i].max}`, rx + 6, y + 32, { width: relW - 12, align: "center" });
    }
    y += 70;

    // Relational pattern explanations
    const relExplanations = [
      {
        label: "Codependency",
        score: parseInt(analysis.codependencyScore) || 0,
        max: 3,
        explain: {
          0: "No significant codependent patterns detected.",
          1: "Mild codependent tendencies. You may occasionally prioritize others' needs at the expense of your own.",
          2: "Moderate codependency. You regularly suppress your own needs to manage others' emotions or perceptions. This pattern drains the emotional reserves your brain then tries to replenish through the cycle.",
          3: "Significant codependency. You consistently abandon your own needs for others. The behavior has become the only thing that feels like it belongs to you. Your report's relational section maps exactly how this fuels the cycle."
        }
      },
      {
        label: "Enmeshment",
        score: parseInt(analysis.enmeshmentScore) || 0,
        max: 3,
        explain: {
          0: "No significant enmeshment patterns detected.",
          1: "Mild enmeshment indicators. Boundaries may have been blurred in one key relationship growing up.",
          2: "Moderate enmeshment. You likely carried emotional weight for a parent that was never yours to carry. This distorted your understanding of where you end and others begin, which directly shapes your sexual and relational patterns.",
          3: "Significant enmeshment. You were a parent's emotional partner, therapist, or protector. This rewired how your brain processes intimacy, boundaries, and desire. Your report maps the direct connection to your cycle."
        }
      },
      {
        label: "Relational Void",
        score: parseInt(analysis.relationalVoidScore) || 0,
        max: 3,
        explain: {
          0: "You have meaningful connection and disclosure in your life.",
          1: "Some isolation present. Parts of your story remain hidden from the people closest to you.",
          2: "Significant relational void. You perform a version of yourself for most people. The gap between who they see and who you are feeds the shame cycle directly.",
          3: "Severe isolation. No one in your life knows the full truth. You have been carrying this entirely alone. Isolation is not a side effect of the behavior. It is the soil it grows in."
        }
      },
      {
        label: "Leadership Burden",
        score: parseInt(analysis.leadershipBurdenScore) || 0,
        max: 3,
        explain: {
          0: "Leadership pressure is not a significant factor in your pattern.",
          1: "Some leadership tension. The gap between your public role and private struggle creates friction.",
          2: "Significant leadership burden. You serve others while no one serves you. The weight of maintaining your image while fighting this battle compounds the cycle.",
          3: "Severe leadership burden. You feel disqualified from your calling and fear discovery would cost you everything. This pressure is not separate from the behavior. It is directly connected."
        }
      }
    ];

    for (const rel of relExplanations) {
      if (rel.score > 0) {
        const explanationText = rel.explain[Math.min(rel.score, rel.max)] || "";
        if (explanationText) {
          checkFit(60);
          const rc = rel.score <= 1 ? GOLD : rel.score <= 2 ? [220, 180, 40] : [200, 60, 60];
          doc.fontSize(18).fillColor(rc).font("Helvetica-Bold").text(`${rel.label}: ${rel.score}/${rel.max}`, M, y);
          y = doc.y + 4;
          _currentTextColor = GRAY; doc.fontSize(18).fillColor(GRAY).font("Helvetica").text(sanitize(explanationText), M, y, { width: CW, lineGap: 3 });
          y = doc.y + 14;
        }
      }
    }

    y += 10;

    // Key findings summary
    checkFit(60);
    doc.roundedRect(M, y, CW, 3, 0).fill(GOLD);
    y += 14;
    _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
      `Primary Pattern: ${sanitize(analysis.arousalTemplateType || "Unknown")}  |  Neuropathway: ${sanitize(analysis.neuropathway || "Unknown")}  |  Attachment: ${sanitize(analysis.attachmentStyle || "Unknown")}`,
      M, y, { width: CW, lineGap: 4 }
    );
    y = doc.y + 14;

    doc.fontSize(18).fillColor(GRAY).font("Helvetica-Oblique").text(
      "The sections that follow break down each of these results in detail.",
      M, y, { width: CW }
    );

    // ════════════════════════════════════════
    // SECTION 1 — AROUSAL TEMPLATE TYPE
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 1 — YOUR AROUSAL TEMPLATE TYPE");

    writeCard("PRIMARY TYPE", analysis.arousalTemplateType || "Unknown", `Root narrative: "${analysis.rootNarrativeStatement || ""}"\n\nWhat your brain is counterfeiting: ${analysis.whatBrainCounterfeits || ""}`);

    if (analysis.arousalTemplateSecondary) {
      writeCard("SECONDARY TYPE", analysis.arousalTemplateSecondary, "Multiple patterns are present in your template.");
    }

    writeGapWidening("You now have a name for the story that has been running beneath your cycle. Most men never get this far. Sit with that for a moment. The pages ahead are going to show you how deep this goes.");

    // ════════════════════════════════════════
    // SECTION 2 — BEHAVIOR-ROOT MAP
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 2 — THE BEHAVIOR-ROOT MAP");

    _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica-Oblique").text(
      "Every behavior in your cycle traces to a specific root. Here is what your brain is actually trying to accomplish through each one.",
      M, y, { width: CW, lineGap: 3 }
    );
    y = doc.y + 14;

    const brm = analysis.behaviorRootMap || [];
    for (const item of brm) {
      const beh = sanitize(item.behavior || "");
      const root = sanitize(item.root || "");
      const titleH = doc.fontSize(20).font("Helvetica-Bold").heightOfString(beh, { width: CW - 28 });
      const rootH = doc.fontSize(20).font("Helvetica").heightOfString(root, { width: CW - 28, lineGap: 4 });
      const rowH = Math.max(60, 14 + titleH + 10 + rootH + 14);
      checkFit(rowH + 10);
      doc.roundedRect(M, y, CW, rowH, 5).fill(CARD_BG);
      doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text(beh, M + 14, y + 14, { width: CW - 28 });
      const bodyY = y + 14 + titleH + 10;
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(root, M + 14, bodyY, { width: CW - 28, lineGap: 4 });
      y += rowH + 10;
    }

    writeGapWidening("Every line on this map represents a connection your brain made before you had any say in the matter. You did not choose these patterns. They chose you. And now, for the first time, you can see them.");

    // ════════════════════════════════════════
    // SECTION 3 — CONFUSING PATTERNS DECODED (conditional)
    // ════════════════════════════════════════
    const cpd = analysis.confusingPatternsDecoded || [];
    if (cpd.length > 0) {
      newPage(); y = CONTENT_TOP;
      sectionHeader("SECTION 3 — CONFUSING PATTERNS DECODED");

      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica-Oblique").text(
        "These are the patterns you have likely never told anyone about. Each one has a research-backed explanation that has nothing to do with your character and everything to do with how your brain was wired.",
        M, y, { width: CW, lineGap: 3 }
      );
      y = doc.y + 14;

      for (const cp of cpd) {
        const cpTitle = sanitize(cp.pattern || "");
        const cpExp = sanitize(cp.explanation || "");
        const patTitleH = doc.fontSize(20).font("Helvetica-Bold").heightOfString(cpTitle, { width: CW - 28 });
        const expH = doc.fontSize(20).font("Helvetica").heightOfString(cpExp, { width: CW - 28, lineGap: 4 });
        const boxH = Math.max(70, 14 + patTitleH + 10 + expH + 14);
        checkFit(boxH + 10);
        doc.roundedRect(M, y, CW, boxH, 5).fill(CARD_BG);
        doc.roundedRect(M, y, CW, boxH, 5).strokeColor(GOLD).lineWidth(0.5).stroke();
        doc.fontSize(20).fillColor(GOLD).font("Helvetica-Bold").text(cpTitle, M + 14, y + 14, { width: CW - 28 });
        const cpBodyY = y + 14 + patTitleH + 10;
        _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(cpExp, M + 14, cpBodyY, { width: CW - 28, lineGap: 4 });
        y += boxH + 10;
      }
      writeGapWidening("If you have carried shame about any of these patterns, what you just read may be the first time it has made sense. You are not depraved. You are not uniquely broken. There is a reason for every part of this, and now you are starting to see it.");
    }

    // ════════════════════════════════════════
    // SECTION 4 — ADDICTION NEUROPATHWAY
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 4 — YOUR ADDICTION NEUROPATHWAY");

    writeCard("NEUROPATHWAY", analysis.neuropathway || "Unknown", analysis.neuropathwayExplanation || "");

    _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
      `Your brain is not using this behavior for pleasure. It is using it to manage ${(analysis.neuropathwayManages || "pain").toLowerCase()}.`,
      M, y, { width: CW, lineGap: 3 }
    );
    y = doc.y + 14;

    const yearsRaw = String(analysis.patternYears || "many").replace(/\s*years?\s*$/i, "").trim();
    const yearsData = yearsRaw;
    writeGapWidening(`Your brain is not choosing this behavior. It is running a survival program that was installed by experiences you did not choose and reinforced over ${yearsData} years. That is a longer runway than most men realize. And it explains why strategies aimed at the behavioral level have never been able to reach it.`);

    // ════════════════════════════════════════
    // SECTION 5 — AROUSAL TEMPLATE ORIGIN
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 5 — YOUR AROUSAL TEMPLATE ORIGIN");

    doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text(`First Exposure: Age ${analysis.imprintingAge || "unknown"}`, M, y);
    y = doc.y + 8;
    _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(`Context: ${analysis.imprintingContext || "unknown"}`, M, y, { width: CW });
    y = doc.y + 16;

    _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(
      analysis.imprintingFusion || "",
      M, y, { width: CW, lineGap: 4 }
    );
    y = doc.y + 14;

    writeGapWidening(`You can now trace your pattern from its origin to your current cycle. That is more clarity than most men get in a lifetime. And it raises a question most men eventually ask: if this has been running beneath the surface for ${yearsData} years without me seeing it, what else is down there that I still cannot see?`);

    // ════════════════════════════════════════
    // SECTION 6 — ATTACHMENT STYLE
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 6 — YOUR ATTACHMENT STYLE");

    writeCard("ATTACHMENT STYLE", analysis.attachmentStyle || "Unknown", analysis.attachmentFuels || "");

    if (analysis.godAttachment) {
      checkFit(100);
      doc.fontSize(18).fillColor(GOLD).font("Helvetica").text("HOW THIS SHOWS UP WITH GOD", M, y, { characterSpacing: 1 });
      y += 22;
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(analysis.godAttachment, M, y, { width: CW, lineGap: 4 });
      y = doc.y + 16;
    }

    if (analysis.purityCultureImpact) {
      checkFit(100);
      doc.fontSize(18).fillColor(GOLD).font("Helvetica").text("PURITY CULTURE IMPACT", M, y, { characterSpacing: 1 });
      y += 22;
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(analysis.purityCultureImpact, M, y, { width: CW, lineGap: 4 });
      y = doc.y + 16;
    }

    writeGapWidening("Your attachment style has been your relational operating system since before you could speak. It shapes how you love, how you hide, how you connect with God, and how you relate to the behavior. Patterns this deep do not change through understanding alone. They were formed in relationship. The research is clear that they restructure the same way.");

    // ════════════════════════════════════════
    // SECTION 7 — RELATIONAL PATTERNS
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 7 — RELATIONAL PATTERNS");

    writeGauge("Codependency", analysis.codependencyScore, 3);
    if (analysis.codependencyExplanation) {
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(analysis.codependencyExplanation, M, y, { width: CW, lineGap: 2 });
      y = doc.y + 10;
    }
    writeGauge("Enmeshment", analysis.enmeshmentScore, 3);
    if (analysis.enmeshmentExplanation) {
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(analysis.enmeshmentExplanation, M, y, { width: CW, lineGap: 2 });
      y = doc.y + 10;
    }
    writeGauge("Relational Void", analysis.relationalVoidScore, 3);
    if (analysis.relationalVoidExplanation) {
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(analysis.relationalVoidExplanation, M, y, { width: CW, lineGap: 2 });
      y = doc.y + 10;
    }
    writeGauge("Leadership Burden", analysis.leadershipBurdenScore, 3);
    if (analysis.leadershipBurdenExplanation) {
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(analysis.leadershipBurdenExplanation, M, y, { width: CW, lineGap: 2 });
      y = doc.y + 10;
    }

    writeGapWidening("The relational patterns in your life are not separate from your sexual behavior. They are the soil it grows in. Isolation feeds the cycle. Codependency drains you until the behavior becomes the only thing that is yours. The leadership burden ensures you carry everyone while no one carries you. These patterns do not resolve by being identified. They resolve by being experienced differently.");

    // ════════════════════════════════════════
    // SECTION 8 — STRATEGY AUTOPSY
    // ════════════════════════════════════════
    const strategies = analysis.strategiesTried || [];
    const stratCount = parseInt(analysis.strategiesCount) || strategies.length || 0;
    const yearsFighting = sanitize(analysis.yearsFighting || "years");

    if (stratCount > 0) {
      newPage(); y = CONTENT_TOP;
      sectionHeader("STRATEGY AUDIT");

      // What You Tried — strategy list first
      checkFit(40);
      doc.fontSize(20).fillColor(GOLD).font("Helvetica").text("WHAT YOU TRIED", M, y, { characterSpacing: 1 });
      y = doc.y + 10;

      doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(
        `${stratCount} strategies over ${yearsFighting}.`,
        M, y, { width: CW }
      );
      y = doc.y + 12;

      for (const strat of strategies) {
        const stratText = sanitize(strat);
        if (!stratText) continue;
        checkFit(34);
        doc.roundedRect(M, y, CW, 28, 4).fill(CARD_BG);
        doc.fontSize(18).fillColor([200, 60, 60]).font("Helvetica").text("✕", M + 10, y + 6);
        _currentTextColor = GRAY; doc.fontSize(18).fillColor(GRAY).font("Helvetica").text(stratText, M + 28, y + 6, { width: CW - 38 });
        y = doc.y + 6;
      }
      y += 20;

      // Strategy Analysis — individual breakdowns
      checkFit(60);
      doc.fontSize(20).fillColor(GOLD).font("Helvetica").text("STRATEGY ANALYSIS", M, y, { characterSpacing: 1 });
      y = doc.y + 10;

      const breakdowns = analysis.strategyBreakdowns || [];
      if (breakdowns.length > 0) {
        for (const bd of breakdowns) {
          const stratName = sanitize(bd.strategy || "");
          const explanation = sanitize(bd.explanation || "");
          if (!stratName || !explanation) continue;
          const explH = doc.fontSize(18).font("Helvetica").heightOfString(explanation, { width: CW - 24, lineGap: 3 });
          checkFit(28 + explH + 16);
          doc.fontSize(18).fillColor(WHITE).font("Helvetica-Bold").text(stratName, M, y, { width: CW });
          y = doc.y + 4;
          _currentTextColor = GRAY; doc.fontSize(18).fillColor(GRAY).font("Helvetica").text(explanation, M + 12, y, { width: CW - 24, lineGap: 3 });
          y = doc.y + 14;
        }
      } else {
        // Fallback generic paragraph if breakdowns not available
        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
          `Based on the findings in this report, the behavior is a symptom of deeper root narratives, not a discipline problem. Every strategy listed above was focused on behavior management. None of them reached the root narrative that says "${sanitize(analysis.rootNarrativeStatement || "something is wrong with me")}." True transformation requires a root level process.`,
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 14;
      }

      writeGapWidening("Every strategy on this list was aimed at managing the behavior. Not one of them reached the root narrative driving it. That is not a failure of effort. It is a failure of targeting.");

      // Spiritual Bypass section — conditional on prayer/deliverance/fasting strategies
      const spiritualStrats = strategies.filter(s => {
        const lower = (s || "").toLowerCase();
        return lower.includes("prayer") || lower.includes("spiritual") || lower.includes("bible") || lower.includes("fasting") || lower.includes("deliverance") || lower.includes("church");
      });

      if (spiritualStrats.length >= 2) {
        checkFit(80);
        y += 10;
        doc.fontSize(20).fillColor(GOLD).font("Helvetica").text("SPIRITUAL BYPASS INDICATOR", M, y, { characterSpacing: 1 });
        y = doc.y + 10;

        // Score: 2 spiritual strategies = moderate, 3+ = high
        const bypassScore = spiritualStrats.length >= 3 ? "High" : "Moderate";
        const bypassColor = spiritualStrats.length >= 3 ? [200, 60, 60] : [220, 180, 40];

        doc.roundedRect(M, y, CW, 36, 6).fill(CARD_BG);
        doc.fontSize(18).fillColor(GOLD).font("Helvetica").text("Spiritual Bypass Score:", M + 14, y + 10);
        doc.fontSize(18).fillColor(bypassColor).font("Helvetica-Bold").text(bypassScore, M + 220, y + 10);
        y += 48;

        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
          `You selected ${spiritualStrats.length} spiritually focused strategies. Psychologist John Welwood, who coined the term "spiritual bypass" in 1984, defined it as "using spiritual practices to avoid dealing with painful feelings, unresolved wounds, and developmental needs." This is not a critique of prayer, Scripture, or spiritual disciplines. They are essential. But when they are used as the only strategy against a neurologically encoded pattern, they become a bypass around the wound rather than a path through it.`,
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 12;

        _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica-Oblique").text(
          "If your child broke their arm, you would not choose between prayer and an X-ray. You would choose both. The arm needs to be set by someone trained to set it, and God's healing power works through that process, not instead of it. Your root narrative works the same way. Prayer positions the heart. But restructuring the neuropathway requires a guided, specialized process that prayer was never designed to replace.",
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 12;

        // Personalized analogy
        const spiritStratNames = spiritualStrats.map(s => sanitize(s).toLowerCase()).join(", ");
        const personalizedBypass = `You tried ${spiritStratNames} against a ${sanitize(analysis.arousalTemplateType || "deeply encoded")} pattern with ${sanitize(analysis.attachmentStyle || "insecure")} attachment. That is like praying over a compound fracture without letting anyone set the bone. The prayer matters. But the bone still needs to be set by someone who can see it.`;
        checkFit(50);
        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(personalizedBypass, M, y, { width: CW, lineGap: 4 });
        y = doc.y + 14;
      }
    }

    // ════════════════════════════════════════
    // SECTION 9 — THE FULL PATTERN MAP (visual diagram)
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("YOUR FULL PATTERN MAP");

    _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica-Oblique").text(
      "This diagram connects everything. Each level is populated with your actual data.",
      M, y, { width: CW }
    );
    y = doc.y + 16;

    // Vertical flow diagram
    const nodeW2 = CW - 40;
    const nodeH2 = 52;
    const nodeX = M + 20;
    const gapV = 8;
    const arrowH = 16;

    function drawFlowNode(label, value, highlight) {
      const col = highlight ? GOLD : BORDER;
      const valText = sanitize(value || "");
      // Measure both label and value heights to prevent overlap
      const labelH = doc.fontSize(12).font("Helvetica").heightOfString(label, { width: nodeW2 - 24, characterSpacing: 1 });
      const valH = doc.fontSize(18).font("Helvetica").heightOfString(valText, { width: nodeW2 - 24 });
      const contentH = labelH + 6 + valH; // 6px gap between label and value
      const boxH = Math.max(nodeH2, 16 + contentH + 10); // 16px top padding, 10px bottom padding
      checkFit(boxH + arrowH + 4);
      doc.roundedRect(nodeX, y, nodeW2, boxH, 5).fill(CARD_BG);
      doc.roundedRect(nodeX, y, nodeW2, boxH, 5).strokeColor(col).lineWidth(highlight ? 1 : 0.5).stroke();
      doc.fontSize(12).fillColor(GOLD).font("Helvetica").text(label, nodeX + 12, y + 10, { width: nodeW2 - 24, characterSpacing: 1 });
      const valTop = y + 10 + labelH + 6; // position value after measured label height + gap
      _currentTextColor = WHITE; doc.fontSize(18).fillColor(WHITE).font("Helvetica").text(valText, nodeX + 12, valTop, { width: nodeW2 - 24 });
      y += boxH;
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
    drawFlowNode("ROOT NARRATIVE FORMED", `"${sanitize(analysis.rootNarrativeStatement || "")}"`, true);
    drawArrow();
    drawFlowNode("FIRST EXPOSURE", `Age ${sanitize(analysis.imprintingAge || "?")}, ${sanitize(analysis.imprintingContext || "")}`, true);
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

    // Force first name at start of key insight
    let keyInsightText = sanitize(analysis.keyInsight || "Your pattern is not random.");
    // Strip any leading "Brother," or "Man," or generic opener and prepend first name
    keyInsightText = keyInsightText.replace(/^(Brother|Man|Friend|Sir),?\s*/i, "").trim();
    if (!keyInsightText.startsWith(firstName)) {
      keyInsightText = `${firstName}, ${keyInsightText.charAt(0).toLowerCase()}${keyInsightText.slice(1)}`;
    }
    _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
      keyInsightText,
      M, y, { width: CW, lineGap: 5 }
    );
    y = doc.y + 20;

    // ════════════════════════════════════════
    // SECTION 9 — WHAT THIS MEANS
    // ════════════════════════════════════════
    checkFit(200);
    doc.fontSize(18).fillColor(GOLD).font("Helvetica").text("WHAT THIS MEANS", M, y, { characterSpacing: 2 });
    y += 24;

    let closingText = sanitize(analysis.closingStatement || "You are not broken. Every behavior has a root, every root has an origin, and every origin can be traced and restructured.");
    closingText = closingText.replace(/^(Brother|Man|Friend|Sir),?\s*/i, "").trim();
    if (!closingText.startsWith(firstName)) {
      closingText = `${firstName}, ${closingText.charAt(0).toLowerCase()}${closingText.slice(1)}`;
    }
    _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
      closingText,
      M, y, { width: CW, lineGap: 5 }
    );
    y = doc.y + 20;

    // ════════════════════════════════════════
    // SECTION 10 — NEXT STEPS & RESOURCES
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    doc.fontSize(20).fillColor(GOLD).font("Helvetica").text("YOUR NEXT STEP AND ADDITIONAL RESOURCES", M, y, { characterSpacing: 2 });
    y = doc.y + 30;

    // Helper to draw a resource card with CTA button
    function drawResourceCard(priority, label, price, title, body, link) {
      const bodyH = doc.fontSize(18).font("Helvetica").heightOfString(body, { width: CW - 32, lineGap: 3 });
      const btnH = 36;
      const cardH = 18 + 28 + 8 + bodyH + 14 + btnH + 20;
      checkFit(cardH + 20);

      doc.roundedRect(M, y, CW, cardH, 6).fill(CARD_BG);
      doc.roundedRect(M, y, CW, cardH, 6).strokeColor(priority === 1 ? GOLD : BORDER).lineWidth(priority === 1 ? 1.5 : 0.5).stroke();

      // Label (left) + price badge (right, bigger)
      doc.fontSize(12).fillColor(GOLD).font("Helvetica").text(label, M + 16, y + 14, { characterSpacing: 1 });
      const priceColor = price === "FREE" ? [80, 180, 80] : GOLD;
      const priceBg = price === "FREE" ? [20, 50, 20] : [50, 40, 15];
      const priceW = price === "FREE" ? 60 : 50;
      const priceX = M + CW - 16 - priceW;
      doc.roundedRect(priceX, y + 8, priceW, 24, 4).fill(priceBg);
      doc.fontSize(18).fillColor(priceColor).font("Helvetica-Bold").text(price, priceX, y + 12, { width: priceW, align: "center" });

      // Title
      doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text(title, M + 16, y + 38, { width: CW - 32 });
      const titleBottom = doc.y + 6;

      // Body
      _currentTextColor = GRAY; doc.fontSize(18).fillColor(GRAY).font("Helvetica").text(body, M + 16, titleBottom, { width: CW - 32, lineGap: 3 });
      const bodyBottom = doc.y + 12;

      // CTA button (gold gradient rectangle with white text, clickable)
      const btnW = 240;
      const btnX = M + (CW - btnW) / 2;
      doc.roundedRect(btnX, bodyBottom, btnW, btnH, 6).fill(GOLD);
      const btnLabel = price === "FREE" ? "ACCESS NOW" : "GET STARTED";
      doc.fontSize(14).fillColor([0, 0, 0]).font("Helvetica-Bold").text(btnLabel, btnX, bodyBottom + 10, { width: btnW, align: "center", link: link });

      y = bodyBottom + btnH + 18;
    }

    // Priority 1 — FREE
    const p1Body = `Your diagnostic revealed ${sanitize(analysis.arousalTemplateType || "your primary pattern")} as your primary pattern with ${sanitize(analysis.neuropathway || "a specific neuropathway")} as the driving mechanism. The Art of Freedom Training walks you through the exact process used to address unwanted behaviors at the root level, not the behavioral level where everything you have tried has been aimed. After the training, you can apply to speak with one of our certified support coaches about our 90 Days to Freedom core program. This is the single most important next step you can take right now.`;
    drawResourceCard(1, "PRIORITY 1 — YOUR NEXT STEP", "FREE", "Watch the Art of Freedom Training", p1Body, "https://unchained-leader.com/aof");

    // Option 2 — $27
    const p2Body = "Your report identified patterns that go deeper than any PDF can resolve. On a 30-minute Clarity Call, a certified Unchained Leader coach who has walked this exact road will review your full diagnostic, show you the specific reason each strategy you have tried was aimed at the wrong target, and build a custom plan based on your specific root narrative and attachment style. He will have your complete data in front of him before the call starts.";
    drawResourceCard(2, "OPTION 2", "$27", "Book a 30-Minute Clarity Call", p2Body, "https://unchained-leader.com/clarity-call");

    // Option 3 — FREE
    const p3Body = "A 7-day guided experience that dismantles the most common lies keeping Christian men stuck in the cycle. Each day fuses Scripture with neuroscience to reframe how you see your struggle, your identity, and your path to freedom. Built specifically for men like you.";
    drawResourceCard(3, "OPTION 3", "FREE", "7-Day Devotional: 7 Lies of the Divided Leader", p3Body, "https://unchained-leader.com/7-lies");

    // Option 4 — $27
    const p4Body = "The complete Unchained Leader framework in your hands. Covers the neuroscience of unwanted behavior, the root narrative system, the shame loop, the strategy autopsy, and the path to Root Narrative Restructuring. Written by Mason Cain from 17 years of personal experience and extensive research.";
    drawResourceCard(4, "OPTION 4", "$27", "The Unchained Leader Black Book", p4Body, "https://unchained-leader.com/black-book");

    // Closing
    checkFit(60);
    doc.fontSize(22).fillColor(GOLD).font("Helvetica-Bold").text("#liveunchained", M, y, { width: CW, align: "center" });

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
            ${firstName}, your Unwanted Desire Root Map is attached.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#999;">
            This report maps every behavior in your pattern to its psychological root, decodes your attachment style, reveals your relational patterns, and connects it all to your childhood environment and first exposure. It shows you what is actually driving the cycle, not just the symptom.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#999;">
            Read this as soon as possible. It connects dots you have never seen before. Your next steps and resources are on the final page.
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
