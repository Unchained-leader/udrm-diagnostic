import { Receiver } from "@upstash/qstash";
import Anthropic from "@anthropic-ai/sdk";
import redis from "../../lib/redis";
import PDFDocument from "pdfkit";
import { put } from "@vercel/blob";
import { ghlDiagnosticComplete, ghlSendReportData } from "../../lib/ghl";
import { SignJWT } from "jose";
import { getJwtSecret } from "../../lib/auth";
import fs from "fs";
import path from "path";
import { getDb } from "../../lib/db";
import { MARKETING_BIBLE_REPORT_GUIDE } from "../../lib/marketing-bible";

export const maxDuration = 300;

// Auto-migrate: ensure traffic_source column exists (runs once per cold start)
let _schemaDone = false;
async function ensureTrafficSourceColumn() {
  if (_schemaDone) return;
  try {
    const sql = getDb();
    await sql`ALTER TABLE completed_diagnostics ADD COLUMN IF NOT EXISTS traffic_source VARCHAR(255)`;
    _schemaDone = true;
  } catch (e) { /* non-fatal */ }
}

// ═══════════════════════════════════════════════════════════════
// Pipeline metrics — non-blocking writes to Postgres
// ═══════════════════════════════════════════════════════════════
function logMetric({ service, eventType, tokensInput, tokensOutput, durationMs, costCents, email, errorMessage }) {
  const sql = getDb();
  sql`INSERT INTO pipeline_metrics (service, event_type, tokens_input, tokens_output, duration_ms, cost_cents, email, error_message)
    VALUES (${service}, ${eventType}, ${tokensInput || null}, ${tokensOutput || null}, ${durationMs || null}, ${costCents || null}, ${email || null}, ${errorMessage || null})`
    .catch(e => console.error("[Metrics] Write failed (non-fatal):", e.message));
}

// Sonnet pricing: $3/M input, $15/M output
function calcCostCents(inputTokens, outputTokens) {
  return ((inputTokens || 0) * 3 / 1_000_000 + (outputTokens || 0) * 15 / 1_000_000) * 100;
}

// ═══════════════════════════════════════════════════════════════
// Slack alert helper — deduplicated via Redis TTL
// ═══════════════════════════════════════════════════════════════
async function sendPipelineAlert(alertKey, message) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  try {
    const lockKey = `pipeline:alert:${alertKey}`;
    const existing = await redis.get(lockKey);
    if (existing) return; // Already alerted within TTL
    await redis.set(lockKey, "1", { ex: 300 }); // 5 min dedup
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (e) { console.error("[Slack] Pipeline alert failed:", e.message); }
}

async function checkPipelineLimits(email) {
  try {
    const sql = getDb();
    const tpmLimit = parseInt(process.env.ANTHROPIC_OUTPUT_TPM_LIMIT || "8000", 10);

    // Check output tokens in last 60 seconds
    const [tpmRow] = await sql`SELECT COALESCE(SUM(tokens_output), 0) as total FROM pipeline_metrics
      WHERE service = 'anthropic' AND event_type = 'report_complete' AND created_at > NOW() - INTERVAL '60 seconds'`;
    const currentTPM = parseInt(tpmRow?.total || 0);
    if (currentTPM > tpmLimit * 0.7) {
      await sendPipelineAlert("capacity", `:warning: *Pipeline capacity alert* <!channel>\nOutput tokens: ${currentTPM.toLocaleString()}/${tpmLimit.toLocaleString()} TPM (${Math.round(currentTPM / tpmLimit * 100)}%) in the last 60 seconds\nAction: Consider upgrading Anthropic API tier`);
    }

    // Check today's email count (free tier = 100/day)
    const emailLimit = parseInt(process.env.RESEND_DAILY_LIMIT || "100", 10);
    const [emailRow] = await sql`SELECT COUNT(*) as total FROM pipeline_metrics
      WHERE service = 'resend' AND event_type = 'email_sent' AND created_at > CURRENT_DATE`;
    const emailsToday = parseInt(emailRow?.total || 0);
    if (emailsToday > emailLimit * 0.8) {
      await sendPipelineAlert("email_limit", `:warning: *Email limit alert* <!channel>\nEmails sent today: ${emailsToday}/${emailLimit} (${Math.round(emailsToday / emailLimit * 100)}%)\nAction: Upgrade Resend plan`);
    }

    // Check failures in last hour
    const [failRow] = await sql`SELECT COUNT(*) as total FROM pipeline_metrics
      WHERE event_type = 'report_failed' AND created_at > NOW() - INTERVAL '1 hour'`;
    const recentFailures = parseInt(failRow?.total || 0);
    if (recentFailures >= 3) {
      await sendPipelineAlert("failures", `:rotating_light: *Pipeline failure spike* <!channel>\n${recentFailures} report failures in the last hour\nLatest: ${email || "unknown"}\nCheck Vercel logs immediately`);
    }
  } catch (e) { console.error("[Metrics] Limit check failed (non-fatal):", e.message); }
}

// ═══════════════════════════════════════════════════════════════
// Retry helper — exponential backoff with jitter for Claude 429s
// ═══════════════════════════════════════════════════════════════
async function callWithBackoff(fn, { maxRetries = 4, label = "API", email } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status || err?.statusCode;
      if (status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(err?.headers?.["retry-after"] || "0", 10);
        const backoff = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 1000 + Math.random() * 1000);
        console.warn(`[${label}] 429 rate limited, attempt ${attempt + 1}/${maxRetries}, waiting ${Math.round(backoff / 1000)}s`);
        logMetric({ service: "anthropic", eventType: "rate_limited", email, errorMessage: `429 attempt ${attempt + 1}` });
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// POST /api/report/process — QStash background worker
// Called by QStash after /api/report enqueues a job.
// Does ALL heavy work: Claude analysis, PDF, email, webhooks.
// ═══════════════════════════════════════════════════════════════

const GOLD = [197, 165, 90];     // #c5a55a
const WHITE = [255, 255, 255];
const GRAY = [210, 210, 210];    // #d2d2d2
const DK_BG = [17, 17, 17];     // #111111
const CARD_BG = [26, 26, 26];   // #1a1a1a
const BORDER = [51, 51, 51];    // #333333

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export async function POST(request) {
  // ── Step 1: Verify QStash signature ──
  const signature = request.headers.get("upstash-signature");
  const rawBody = await request.text();

  if (signature) {
    try {
      const receiver = new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      });
      await receiver.verify({ body: rawBody, signature });
    } catch (err) {
      console.error("[QStash] Signature verification failed:", err.message);
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[QStash] Missing signature in production");
    return Response.json({ error: "Missing signature" }, { status: 401 });
  }

  // ── Step 2: Parse payload ──
  const { email: normalizedEmail, name: userName, messages, gender, ageRange, geo, trafficSource, embedParentUrl, referrerUrl, utmSource, utmMedium, utmCampaign } = JSON.parse(rawBody);
  const firstName = (userName || "Brother").split(" ")[0];

  console.log(`[QStash] Processing report for ${normalizedEmail}`);

  try {

    // Set processing status so dashboard can show progress
    await redis.set(`mkt:status:${normalizedEmail}`, { step: "analyzing", message: "Analyzing your responses...", startedAt: new Date().toISOString() }, { ex: 3600 });

    // Analyze with Claude
    const analysisStart = Date.now();
    const rawAnalysis = await analyzeConversation(messages, userName, { gender, ageRange }, { email: normalizedEmail });
    const analysisDuration = Date.now() - analysisStart;

    // Log pipeline metric for this report (non-blocking)
    // rawAnalysis._usage is set by analyzeConversation (see below)
    const usage = rawAnalysis._usage || {};
    logMetric({
      service: "anthropic", eventType: "report_complete", email: normalizedEmail,
      tokensInput: usage.input_tokens, tokensOutput: usage.output_tokens,
      durationMs: analysisDuration, costCents: calcCostCents(usage.input_tokens, usage.output_tokens),
    });
    checkPipelineLimits(normalizedEmail); // async, non-blocking

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

    // ═══════════════════════════════════════
    // STORE DASHBOARD DATA FIRST (PRIORITY)
    // Dashboard works even if PDF generation fails
    // ═══════════════════════════════════════
    const reportMeta = {
      generatedAt: new Date().toISOString(),
      arousalTemplateType: analysis.arousalTemplateType,
      attachmentStyle: analysis.attachmentStyle,
      neuropathway: analysis.neuropathway,
      reportUrl: null, // Will be updated after PDF upload
    };
    await redis.set(`mkt:report:${normalizedEmail}`, reportMeta);
    await redis.set(`mkt:analysis:${normalizedEmail}`, analysis);

    // Append to report history
    const historyEntry = { ...reportMeta, analysis };
    const existingHistory = await redis.get(`mkt:history:${normalizedEmail}`);
    let history = Array.isArray(existingHistory) ? existingHistory : [];
    history.push(historyEntry);
    if (history.length > 10) history = history.slice(-10);
    await redis.set(`mkt:history:${normalizedEmail}`, history);

    // Update status — results are now available in dashboard
    await redis.set(`mkt:status:${normalizedEmail}`, { step: "complete", message: "Your results are ready", completedAt: new Date().toISOString() }, { ex: 3600 });

    // ═══════════════════════════════════════
    // STEP A: EMAIL IMMEDIATELY (dashboard link only, no PDF wait)
    // Client gets notified right away without waiting for PDF capture.
    // ═══════════════════════════════════════
    let reportUrl = null;

    try {
      await sendReportEmail(normalizedEmail, firstName, null, null);
      logMetric({ service: "resend", eventType: "email_sent", email: normalizedEmail });
      await redis.set(`mkt:status:${normalizedEmail}`, { step: "emailed", message: "Report emailed", completedAt: new Date().toISOString() }, { ex: 3600 });
      console.log(`[QStash] Email sent for ${normalizedEmail} (dashboard link only)`);
    } catch (emailErr) {
      console.error("[QStash] Email delivery error:", emailErr.message);
      logMetric({ service: "resend", eventType: "report_failed", email: normalizedEmail, errorMessage: emailErr.message });
      await redis.set(`mkt:status:${normalizedEmail}`, { step: "email_failed", message: "Report ready on dashboard. Email delivery failed.", completedAt: new Date().toISOString() }, { ex: 3600 }).catch(() => {});
    }

    // ═══════════════════════════════════════
    // STEP B: GENERATE PDF + UPLOAD (does not block client)
    // Client already has dashboard + email. This generates the
    // PDF for GHL webhook and Blob storage via PDFKit.
    // ═══════════════════════════════════════
    try {
      console.log(`[QStash] Generating PDF for ${normalizedEmail}`);
      const pdfResult = await generatePDF(analysis, firstName, { gender });
      const finalBuffer = pdfResult.buffer;
      console.log(`[QStash] PDF generated: ${Math.round(finalBuffer.length / 1024)}KB`);

      // Upload to Vercel Blob
      const timestamp = Date.now();
      const blob = await put(
        `reports/${normalizedEmail.replace(/[^a-z0-9]/g, "-")}/${timestamp}-diagnostic.pdf`,
        finalBuffer,
        { access: "public", contentType: "application/pdf" }
      );
      reportUrl = blob.url;
      await redis.set(`mkt:status:${normalizedEmail}`, { step: "pdf_ready", message: "PDF report generated", reportUrl, completedAt: new Date().toISOString() }, { ex: 3600 });

      // Update Redis with PDF URL
      reportMeta.reportUrl = reportUrl;
      await redis.set(`mkt:report:${normalizedEmail}`, reportMeta);
      const updatedHistory = await redis.get(`mkt:history:${normalizedEmail}`);
      if (Array.isArray(updatedHistory) && updatedHistory.length > 0) {
        updatedHistory[updatedHistory.length - 1].reportUrl = reportUrl;
        await redis.set(`mkt:history:${normalizedEmail}`, updatedHistory);
      }
    } catch (pdfErr) {
      console.error("[QStash] PDF capture pipeline failed (dashboard data safe):", pdfErr.message);
    }


    // Generate permanent admin link for GHL (no expiration)
    let dashboardUrl = null;
    try {
      const adminToken = await new SignJWT({ email: normalizedEmail, name: userName, admin: true })
        .setProtectedHeader({ alg: "HS256" })
        .sign(getJwtSecret());
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://unchainedleader.io";
      dashboardUrl = `${baseUrl}/dashboard/overview?token=${encodeURIComponent(adminToken)}`;
    } catch (e) {
      console.error("[QStash] Failed to generate dashboard URL for GHL:", e.message);
    }

    // Send to GoHighLevel CRM via webhook (with PDF URL + dashboard link)
    ghlDiagnosticComplete({
      email: normalizedEmail,
      name: userName,
      messages,
      analysis,
      reportUrl,
      dashboardUrl,
      trafficSource,
      embedParentUrl,
      referrerUrl,
      utmSource,
      utmMedium,
      utmCampaign,
    }).catch((e) => console.error("GHL webhook error:", e.message));

    // Send report data to Reports | Root Diagnostic workflow (separate webhook)
    ghlSendReportData({
      email: normalizedEmail,
      name: userName,
      messages,
      analysis,
      reportUrl,
      dashboardUrl,
      trafficSource,
      embedParentUrl,
      referrerUrl,
      utmSource,
      utmMedium,
      utmCampaign,
    }).catch((e) => console.error("GHL report webhook error:", e.message));

    // Record analytics: report generated + completed diagnostic
    try {
      await ensureTrafficSourceColumn();
      const sql = getDb();
      await sql`INSERT INTO analytics_events (session_id, product, event_type, event_data, ip_address, geo_city, geo_region, geo_country, geo_lat, geo_lon)
        VALUES (${normalizedEmail}, 'udrm', 'report_generated', ${JSON.stringify({ reportUrl, analysisTime: `${((Date.now() - analysisStart) / 1000).toFixed(1)}s` })}, ${geo.ip}, ${geo.city}, ${geo.region}, ${geo.country}, ${geo.lat}, ${geo.lon})`;
      await sql`INSERT INTO analytics_events (session_id, product, event_type, event_data, ip_address, geo_city, geo_region, geo_country, geo_lat, geo_lon)
        VALUES (${normalizedEmail}, 'udrm', 'report_emailed', ${JSON.stringify({ email: normalizedEmail })}, ${geo.ip}, ${geo.city}, ${geo.region}, ${geo.country}, ${geo.lat}, ${geo.lon})`;
      await sql`INSERT INTO completed_diagnostics (
        session_id, email, product, name, arousal_template_type, neuropathway, attachment_style,
        codependency_score, enmeshment_score, relational_void_score, leadership_burden_score,
        escalation_present, strategies_count, years_fighting, report_url, report_generated_at,
        ip_address, geo_city, geo_region, geo_country, geo_lat, geo_lon, traffic_source
      ) VALUES (
        ${normalizedEmail}, ${normalizedEmail}, 'udrm', ${userName},
        ${analysis.arousalTemplateType || null}, ${analysis.neuropathway || null}, ${analysis.attachmentStyle || null},
        ${parseInt(analysis.codependencyScore) || 0}, ${parseInt(analysis.enmeshmentScore) || 0},
        ${parseInt(analysis.relationalVoidScore) || 0}, ${parseInt(analysis.leadershipBurdenScore) || 0},
        ${analysis.escalationPresent || false}, ${parseInt(analysis.strategiesCount) || 0},
        ${analysis.yearsFighting || null}, ${reportUrl}, NOW(),
        ${geo.ip}, ${geo.city}, ${geo.region}, ${geo.country}, ${geo.lat}, ${geo.lon}, ${trafficSource || "direct"}
      )`;
    } catch(e) { console.error("Analytics write error (non-fatal):", e.message); }

    console.log(`[QStash] Report complete for ${normalizedEmail}`);
    return Response.json({ success: true, message: "Report processed" });
  } catch (error) {
    logMetric({ service: "anthropic", eventType: "report_failed", email: normalizedEmail, errorMessage: error.message });
    console.error(`[QStash] Report processing failed for ${normalizedEmail}:`, error.message);
    console.error("[QStash] Error stack:", error.stack);
    await redis.set(`mkt:status:${normalizedEmail}`, { step: "failed", message: "Report generation failed. Please try again.", error: error.message }, { ex: 3600 }).catch(() => {});
    return Response.json({ error: `Processing failed: ${error.message}` }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS — All original logic preserved below
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// CLAUDE ANALYSIS — Extract structured diagnostic data
// ═══════════════════════════════════════════════════════════════

const GENERATION_MAP = {
  "age_18_24": "Gen Z (born ~2002-2008)",
  "age_25_34": "Millennial (born ~1992-2001)",
  "age_35_44": "Millennial / Gen X (born ~1982-1991)",
  "age_45_54": "Gen X (born ~1972-1981)",
  "age_55_64": "Gen X / Baby Boomer (born ~1962-1971)",
  "age_65_74": "Baby Boomer (born ~1952-1961)",
  "age_75_84": "Baby Boomer / Silent Generation (born ~1942-1951)",
  "age_85_plus": "Silent Generation (born before 1942)",
};

async function analyzeConversation(messages, userName, demographics = {}, { email } = {}) {
  const client = new Anthropic({ maxRetries: 0 }); // We handle retries ourselves via callWithBackoff

  const conversationText = messages
    .filter(m => m.content && !m.content.includes("[PROGRESS:"))
    .map(m => `${m.role === "assistant" ? "GUIDE" : "USER"}: ${m.content}`)
    .join("\n\n");

  const generationLabel = GENERATION_MAP[demographics.ageRange] || "Unknown";

  const response = await callWithBackoff(() => client.messages.create({
    model: "claude-sonnet-4-20250514",  // Switch to "claude-opus-4-6" for higher quality (slower, 10x more expensive)
    max_tokens: 16384,
    messages: [{
      role: "user",
      content: `${MARKETING_BIBLE_REPORT_GUIDE}

Analyze this Unwanted Desire Root Mapping (UDRM) quiz conversation. The quiz uses select-all-that-apply checkboxes. The user's responses contain IDs like "viewing_porn", "tab_wrong", "conf_wife_others" etc. Pay close attention to ALL selections. ALL report text MUST follow the Marketing Bible guardrails, voice, and language rules above. IMPORTANT: Always spell out the full word "porn" and "pornography" — never censor with asterisks (never write "p*rn" or "p*rnography"). Use the full words.

DEMOGRAPHICS:
Gender: ${demographics.gender || "not specified"}
Age Range: ${demographics.ageRange ? demographics.ageRange.replace("age_", "").replace("_", "-").replace("plus", "+") : "not specified"}

IMPORTANT: Adapt ALL report language to match the person's gender and age. If female, use "woman," "her," "she," "wife/mother/daughter" framing instead of "man," "him," "he," "husband/father/son." Adjust life-stage references to match their age range (e.g. a man in his 20s has different concerns than a man in his 50s). If gender is "female," replace masculine kingdom language ("man of God," "kingdom man," "his assignment") with feminine equivalents ("woman of God," "kingdom woman," "her assignment"). The Marketing Bible defaults to male language because the primary audience is men, but the report must be personalized to whoever is taking it.

GENERATIONAL CONTEXT:
The user's age range (${demographics.ageRange || "not specified"}) places him in the ${generationLabel} cohort.

Each generation encountered sexual content in radically different ways and carries distinct shame architectures:
- Silent Generation / Boomers: Hidden magazines, film, extreme taboo. Exposure typically in late adolescence or adulthood. Church framed all sexuality as moral failure. "Don't ask, don't tell" silence culture. Recovery framing centers on willpower and moral failure.
- Gen X: Cable TV, video rental, early internet. "Latchkey kid" autonomy meant unsupervised access. Less church messaging, more pragmatic "handle it yourself" coping. Compartmentalization as primary defense. Self-reliance delays help-seeking by years or decades.
- Millennials: Internet explosion + smartphone adoption in adolescence. Peak evangelical purity culture (purity pledges, abstinence-only). Shame rooted in "damaged goods" narrative. BYU research shows abstinence pledges correlate with higher shame but not lower usage. Recovery framing: identity crisis ("I was supposed to be the good one").
- Gen Z: Smartphone from childhood, algorithmic exposure, average first exposure age 11-12. More sex-positive cultural framing but highest anxiety and depression rates. Less religious framework, more performance/ethical guilt. Parasocial relationships blur connection lines. Most open to help-seeking but least equipped with spiritual framework.

In your analysis, factor this generational context into the arousal template origin, shame architecture, and exposure timeline. Produce these additional output fields:
"generationalLens": A 3-5 sentence paragraph connecting THIS person's generation to their specific arousal template, shame architecture, and exposure timeline. How did their generation's media landscape, parenting norms, and church messaging shape when and how they were first exposed and the shame pattern that formed? This is not deterministic. It provides context for why their brain wired the way it did. Write in the same Scripture + Science voice as the rest of the report. Connect the generational context to kingdom purpose.
"generationalCohort": The generation label string (e.g. "Millennial", "Gen X", "Baby Boomer").

CONVERSATION:
${conversationText}

CO-OCCURRING COPING BEHAVIORS (based on Section 1 vice_ selections):
If the user selected any vice_ items, use these to help them see a critical truth: this was never a lust problem or a perversion problem. Just like it is not a substance problem, a food problem, or a gambling problem. Every unwanted behavior and desire is a symptom of the brain's creative attempt to medicate or escape root-level pain. The brain does not care HOW it gets relief, it only cares THAT it gets relief. When a man tries to white-knuckle his primary behavior, the brain reroutes the same unresolved pain through other coping mechanisms. Alcohol, overeating, gambling, gaming, spending, overworking are not separate problems. They are the same root narrative expressing itself through different neurochemical pathways. This is exactly why behavior-level solutions are dangerous, and why root-level healing through the RNR process is essential. You cannot win a game of whack-a-mole with your nervous system.
- vice_alcohol → Alcohol as nervous system regulation. Depressant that mimics the numbing the brain needs.
- vice_thc → THC/marijuana as nervous system sedation. Dulls anxiety and emotional pain the same way the sexual behavior does, just through a different receptor system.
- vice_substances → Other substance use as neurochemical override. Directly hijacks the same dopamine/serotonin pathways.
- vice_overeating → Food as emotional regulation. Dopamine + serotonin hit that mimics comfort the brain is missing.
- vice_gambling → Gambling as dopamine chasing. Same anticipation/reward loop as the sexual behavior cycle.
- vice_gaming → Gaming as dissociation. Escape into a world where the brain does not have to process real pain.
- vice_spending → Spending as dopamine seeking. The purchase high mimics the novelty hit of the sexual cycle.
- vice_social_media → Doom-scrolling as numbing. Infinite scroll = infinite avoidance of what the brain does not want to feel.
- vice_work → Overworking as performance-based worth. If the root narrative is "I am not enough," busyness is another counterfeit.
- vice_nicotine → Nicotine as anxiety regulation. Quick nervous system reset that manages the same stress the sexual behavior manages.

If vice_none is selected or no vice_ items are present, do not include coCopingBehaviors in the output.

LIFE STRESS ANALYSIS (based on Section 4 life_ selections):
The brain does not act out in a vacuum. Life stressors create the pressure the brain needs relief from. Each "lack" area is a stress load the nervous system is carrying. Each "abundance" area is a resource the brain can draw from. When lack outweighs abundance, the brain increases coping behavior frequency and intensity. Map these directly to the emotional functions selected in Section 3 and any co-coping behaviors from Section 1.
- life_romantic_abundance / life_romantic_lack → Romantic connection (or its absence) directly impacts the attachment system. Lack here intensifies the need for counterfeit intimacy through the behavior.
- life_health_abundance / life_health_lack → Physical health affects the nervous system's regulation capacity. Poor health reduces resilience, increasing reliance on coping behaviors.
- life_financial_abundance / life_financial_lack → Financial stress activates survival brain. When the brain is in threat mode, it seeks immediate relief. Financial pressure keeps the amygdala firing, making the cycle harder to interrupt.
- life_work_abundance / life_work_lack → Work fulfillment connects to identity and purpose. Lack here feeds the root narrative "I am not enough" or "I have no purpose," which the behavior counterfeits.
- life_god_abundance / life_god_lack → Spiritual disconnection removes the primary resource for shame management and identity anchoring. Without felt connection to God, the brain has no safe place to process pain.

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
- conf_crossdressing: Gender identity and arousal wiring become fused during development. Often traces to early experiences where opposite-gender clothing was associated with comfort, safety, or forbidden excitement. The brain encoded the clothing itself as part of the arousal template. Does NOT define gender identity — it reveals a neurological pathway, not an identity destination.
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
4. NEVER use emojis anywhere in the report. No emoji characters of any kind. This is a clinical diagnostic document, not a text message. Use words only.
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
10. The keyInsight and closingStatement must drive home TWO truths simultaneously: (1) The system of root narratives is staggeringly complex — hundreds of interlocking roots encoded across decades, each reinforcing the others. No one can even SEE the full system on their own, let alone untangle it. (2) BUT — the process of identifying, understanding, and healing these roots is remarkably simple when the path is laid out for you. The complexity is in the system, not in the solution. Root Narrative Restructuring makes the invisible visible and the overwhelming manageable. Frame it like a maze: impossibly complex from the inside, simple when someone hands you the map. Freedom is not complicated — it has just been hidden behind complexity. Use the most direct kingdom language.

Return ONLY valid JSON, no markdown:
{
  "arousalTemplateType": "The Invisible Man|The Controller|The Surrendered|The Shame Circuit|The Observer|The Orphan Heart|The Escalator|Complex Template",
  "arousalTemplateSecondary": "secondary type if applicable, or null",
  "rootNarrativeStatement": "The core lie (e.g. 'I am not enough', 'I am unsafe')",
  "whatBrainCounterfeits": "What the brain is trying to get through the behavior (1 sentence)",

  "behaviorRootMap": [{"behavior": "behavior name in plain English", "root": "decoded root explanation in 2-3 SHORT paragraphs separated by newlines. First paragraph: what the behavior actually is (a shame management system, an escape valve, etc). Second paragraph: connect it to what God designed and how the brain is counterfeiting it. Keep paragraphs to 2-3 sentences max for mobile readability."}],

  "coCopingBehaviors": [{"behavior": "behavior name in plain English (e.g. Alcohol, Overeating)", "connection": "2-3 sentences. Use this to reinforce: this is not a lust or perversion problem, just like this is not a substance or food problem. All of it is the brain's creative attempt to medicate root pain. Explain how this specific vice connects to the SAME root narrative driving the sexual behavior. Frame white-knuckling one behavior as why the other intensifies. Connect to why root-level healing (RNR) is the only real solution."}] or null if no vice_ items selected,

  "lifeStressScores": {"romantic": "stable" or "unstable", "health": "stable" or "unstable", "financial": "stable" or "unstable", "work": "stable" or "unstable", "god": "stable" or "unstable"} — Map each life_ selection directly: life_*_abundance = "stable", life_*_lack = "unstable". If a specific area was not selected in Section 4, omit it from this object. This MUST match what the user actually selected. Do NOT guess or infer.,
  "lifeStressAnalysis": "3-4 sentences connecting the specific abundance/lack selections to the behavioral pattern. You MUST explicitly mention every life area the user selected by name (romantic relationship, physical health, financial situation, work fulfillment, relationship with God). Show how each 'lack' area creates pressure the brain must manage, and how the behavior is the brain's attempt to medicate that real stress and pain. If financial lack is selected, weave in how financial pressure keeps the survival brain activated, making the cycle harder to interrupt. If multiple lack areas are present, show how they compound. Connect to why the RNR process addresses root stress, not surface behavior. Or null if no life_ items selected.",

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
  "purityCultureImpact": "2-3 sentences if church/purity culture items were selected, otherwise null. Frame as: even with the best of intentions, Biblical truth can get misinterpreted through communication. Religiosity that sometimes finds its way inside the church can unintentionally reinforce shame rather than dismantle it. Show how this dynamic may have fused shame with arousal. NEVER frame the church itself as the problem. The church is not the enemy. Misapplied religiosity is.",

  "generationalLens": "3-5 sentences connecting this person's generational cohort to their arousal template, shame architecture, and exposure timeline",
  "generationalCohort": "generation label string (e.g. Millennial, Gen X, Baby Boomer, Gen Z)",

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
  "yearsFighting": "from the duration question (e.g. '10 to 20', '20+'). Do NOT include the words 'years' or 'Over' in this value. Use just the number or range.",
  "strategyBreakdowns": [{"strategy": "Strategy name in plain English", "targeted": "what this strategy targeted (1 phrase)", "explanation": "2-3 sentences explaining why this specific strategy could not reach HIS specific root narrative type. Be direct. Connect the failure to his Root Narrative Type name. Example for Shame Circuit: 'Filters block access but cannot reach a Shame Circuit root. Your brain was not stopped by the filter because the arousal was never about the content. It was about the transgression.' Use Scripture + Science voice. Frame each failure as a targeting problem, not a moral failure. CRITICAL FOR SPIRITUAL STRATEGIES (prayer, deliverance prayer, fasting, Bible study, church attendance): NEVER discredit or discount the power of God, prayer, or any spiritual practice. God CAN and DOES perform miracles. Scripture gives us countless examples. But the pattern in Scripture is clear: God could have delivered His people out of Egypt into the Promised Land instantaneously. He had the power. Instead, He chose to lead them on a journey, not just out of Egypt physically, but on a journey of shedding the Egypt out of them in the wilderness. The wilderness was not a punishment. It was a forge. Deuteronomy 8:2-3 says God led them through the wilderness to humble them, test them, and know what was in their hearts. The journey itself was the transformation. Prayer and spiritual disciplines position the heart and invite God into the process. They are essential and powerful. But God also designed the brain with neurological pathways that respond to specific guided processes. Just as He heals through medicine and surgery, He also works through the process of restructuring root narratives. The strategy was not wrong. It was incomplete on its own, not because God lacks power, but because He often works THROUGH the journey, not around it. The leader in you is not just unchained on the journey, it is forged and refined by it."}],

  "keyInsight": "The single most powerful paragraph. 5-7 sentences. Do NOT start with the man's first name or 'Brother.' Start directly with the insight. This is NOT about one root narrative — this diagnostic has only scratched the surface of a system of HUNDREDS of interlocking root narratives encoded across his entire life. Each one reinforces the others. The behaviors, the shame loops, the relational patterns, the attachment wounds, the escalation — they are all nodes in an interconnected system that has been building since childhood. The enemy built this system deliberately because of the assignment on his life. The complexity is evidence of how dangerous he is to the kingdom of darkness. No amount of willpower, accountability software, or even awareness can untangle a system this deep alone. BUT — and this is the part most men never hear — the process of identifying, understanding, and healing these roots is remarkably simple when the path is laid out for you. The complexity is in the system, not in the solution. Root Narrative Restructuring makes the invisible visible and the overwhelming manageable. It is like a maze: impossibly complex from the inside, simple when someone hands you the map. Write directly to him as Mason would.",
  "closingStatement": "4-5 sentences. Start with the man's first name (${userName}), NOT 'Brother.' You are not disqualified. You are not damaged goods. What this diagnostic revealed is a fraction of what is operating beneath the surface — a system of root narratives so interconnected that it feels impossible to untangle. But here is what the enemy does not want you to know: the process of healing is not complicated. It is simple. The roots are complex, but the path through them is clear when someone who has walked it lays it out for you. Freedom is neurological, spiritual, and relational — and it is closer than you think. The question is not whether it is possible. The question is whether you are ready to see the map."
}`
    }],
  }), { label: "Claude", email });

  console.log(`[Claude] Usage: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output, stop: ${response.stop_reason}`);

  const text = response.content[0].text;
  const _usage = response.usage; // Stash for metrics logging in caller
  try {
    const parsed = JSON.parse(text);
    parsed._usage = _usage;
    return parsed;
  } catch (e) {
    console.error("JSON parse failed, attempting extraction. Error:", e.message);
    console.error("First 500 chars of response:", text.substring(0, 500));
    // Try to extract JSON from the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { const p = JSON.parse(match[0]); p._usage = _usage; return p; } catch (e2) {
        console.error("Extracted JSON also failed:", e2.message);
      }
    }
    // Fallback
    return {
      _usage,
      arousalTemplateType: "Unknown",
      arousalTemplateSecondary: null,
      rootNarrativeStatement: "Unable to determine from available data",
      whatBrainCounterfeits: "Something your soul actually needs",
      behaviorRootMap: [],
      coCopingBehaviors: null,
      lifeStressScores: {},
      lifeStressAnalysis: null,
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
      generationalLens: null,
      generationalCohort: null,
      codependencyScore: "0",
      enmeshmentScore: "0",
      relationalVoidScore: "0",
      leadershipBurdenScore: "0",
      codependencyExplanation: null,
      enmeshmentExplanation: null,
      relationalVoidExplanation: null,
      leadershipBurdenExplanation: null,
      escalationPresent: false,
      escalationSeverity: "1",
      patternYears: "many",
      isolationLevel: "Unknown",
      isolationScore: "0",
      scorecardBehaviorCount: "0",
      scorecardContentThemeCount: "0",
      scorecardConfusingPatternCount: "0",
      scorecardEmotionalFunctionCount: "0",
      scorecardChildhoodWoundScore: "1",
      scorecardAttachmentSeverity: "1",
      scorecardSpiritualDisconnect: "1",
      scorecardRelationalBurden: "1",
      strategiesTried: [],
      strategiesCount: "0",
      yearsFighting: "many",
      strategyBreakdowns: [],
      keyInsight: "What this diagnostic revealed is only the surface of a system of hundreds of interlocking root narratives encoded across your entire life. The system is complex — but the process of healing is not. When the path is laid out for you, the invisible becomes visible and the overwhelming becomes manageable.",
      closingStatement: "You are not broken. You are not disqualified. The roots are complex, but the path through them is clear when someone who has walked it lays it out for you. Freedom is closer than you think. The question is whether you are ready to see the map.",
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// PDF GENERATION — 2-3 pages, focused on awareness
// ═══════════════════════════════════════════════════════════════

async function generatePDF(analysis, firstName, layoutOpts = {}) {
  // Layout spacing multiplier: 1.0 = normal, 0.85 = tighter (used on QC retry)
  const SP = layoutOpts.spacingMultiplier || 1.0;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "letter",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
      bufferPages: false,
      autoFirstPage: false,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      logPageContent("final");
      resolve({ buffer: Buffer.concat(chunks), pageContentLog, pageNum });
    });
    doc.on("error", reject);

    const W = 612, H = 792, M = 50, CW = W - M * 2, PB = H - Math.round(60 * SP);
    const CONTENT_TOP = 50;

    // Load logo FIRST so the pageAdded handler can reference it
    let logoBuffer = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "images", "unchained-logo.png");
      logoBuffer = fs.readFileSync(logoPath);
    } catch (e) {
      // Logo not found, continuing without letterhead
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

    function sanitize(text) {
      return text || "";
    }

    // Track content per page for QC
    const pageContentLog = []; // { page, startY, endY, label }

    function logPageContent(label) {
      if (pageNum > 0) {
        pageContentLog.push({ page: pageNum, endY: y, label });
      }
    }

    function newPage() {
      logPageContent("before_newPage");
      doc.addPage();
      pageNum++;
      // Background + logo are handled by the pageAdded event listener
    }
    function fit(text, max) {
      if (!text) return "";
      return sanitize(text.length <= max ? text : text.substring(0, max - 3) + "...");
    }
    function sectionHeader(title) {
      checkFit(80); // ensure header + rule + spacing fits on current page
      doc.fontSize(20).fillColor(GOLD).font("Helvetica").text(title, M, y, { characterSpacing: 2 });
      y = doc.y + Math.round(8 * SP);
      doc.roundedRect(M, y, CW, 2, 0).fill(GOLD);
      y += Math.round(24 * SP);
    }
    function checkFit(needed) {
      if (y + needed > PB) {
        logPageContent("checkFit_overflow");
        newPage();
        y = CONTENT_TOP;
      }
    }
    function writeCard(label, title, body) {
      title = sanitize(title);
      body = sanitize(body);
      const lg = Math.round(5 * SP);
      const pad = Math.round(20 * SP);
      const titleH = doc.fontSize(24).font("Helvetica-Bold").heightOfString(title || "", { width: CW - 28 });
      const bodyH = body ? doc.fontSize(20).font("Helvetica").heightOfString(body, { width: CW - 28, lineGap: lg }) : 0;
      const labelTop = Math.round(16 * SP);
      const titleTop = labelTop + Math.round(22 * SP);
      const bodyTop = titleTop + titleH + Math.round(10 * SP);
      const cardH = Math.max(80, bodyTop + bodyH + Math.round(16 * SP));
      checkFit(cardH + pad);
      doc.roundedRect(M, y, CW, cardH, 6).fill(CARD_BG);
      doc.fontSize(18).fillColor(GOLD).font("Helvetica").text(label, M + 14, y + labelTop, { characterSpacing: 1 });
      doc.fontSize(24).fillColor(WHITE).font("Helvetica-Bold").text(title || "", M + 14, y + titleTop);
      if (body) { _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(body, M + 14, y + bodyTop, { width: CW - 28, lineGap: lg }); }
      y += cardH + pad;
    }
    function writeGapWidening(text) {
      const lg = Math.round(4 * SP);
      const gapH = doc.fontSize(20).font("Helvetica-Oblique").heightOfString(text, { width: CW - 20, lineGap: lg });
      checkFit(gapH + Math.round(30 * SP));
      doc.rect(M, y, CW, 0.5).fill([50, 50, 50]);
      y += Math.round(14 * SP);
      _currentTextColor = [200, 60, 60]; doc.fontSize(20).fillColor([200, 60, 60]).font("Helvetica-Oblique").text(text, M + 10, y, { width: CW - 20, lineGap: lg });
      y = doc.y + Math.round(18 * SP);
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

    function writeBody(text, opts = {}) {
      if (!text) return;
      const content = sanitize(text);
      const lg = opts.lineGap || 4;
      const gap = opts.gap || 20;
      const w = opts.width || CW;
      const x = opts.x || M;
      checkFit(opts.minHeight || 60);
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(content, x, y, { width: w, lineGap: lg });
      y = doc.y + gap;
    }

    function writeSubheader(text, opts = {}) {
      if (!text) return;
      const gap = opts.gap || 28;
      checkFit(opts.minHeight || 40);
      doc.fontSize(18).fillColor(GOLD).font("Helvetica").text(sanitize(text), M, y, { characterSpacing: 1 });
      y += gap;
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
    const credY = y + 40;
    const credText = "This diagnostic was developed by Mason Cain, PSAP, PMAP, credentialed through the International Institute for Trauma and Addiction Professionals. Unchained Leader is a LegitScript-certified program.";
    doc.fontSize(10).fillColor([160, 160, 160]).font("Helvetica").text(credText, M + 40, credY, { width: CW - 80, align: "center", lineGap: 2 });
    const afterCredText = doc.y + 8;

    // LegitScript badge
    try {
      const badgePath = path.join(process.cwd(), "public", "legitscript-badge.png");
      if (fs.existsSync(badgePath)) {
        const badgeW = 250;
        const badgeX = W / 2 - badgeW / 2;
        doc.image(badgePath, badgeX, afterCredText, { width: badgeW });
      }
    } catch (e) { /* LegitScript badge not found */ }

    // Disclaimer — position from bottom, ensuring it fits on cover page
    const disclaimer = "DISCLAIMER: This report is not intended for clinical use. It is not a diagnosis, a treatment plan, or a substitute for professional counseling or therapy. It is a personalized educational resource designed to help increase understanding of unwanted behaviors and increase hope that freedom is possible. If you are in crisis or experiencing thoughts of self-harm, please contact the 988 Suicide & Crisis Lifeline immediately.";
    const disclaimerH = doc.fontSize(10).font("Helvetica").heightOfString(disclaimer, { width: CW - 20, lineGap: 2 });
    doc.fontSize(10).fillColor([120, 120, 120]).font("Helvetica").text(disclaimer, M + 10, H - 50 - disclaimerH, { width: CW - 20, align: "center", lineGap: 2 });

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
    y += 28;

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

    // SECTION 1 — YOUR AROUSAL TEMPLATE TYPE
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 1 — YOUR AROUSAL TEMPLATE TYPE");

    writeCard("PRIMARY TYPE", analysis.arousalTemplateType || "Unknown", `Root narrative: "${analysis.rootNarrativeStatement || ""}"\n\nWhat your brain is counterfeiting: ${analysis.whatBrainCounterfeits || ""}`);

    if (analysis.arousalTemplateSecondary) {
      writeCard("SECONDARY TYPE", analysis.arousalTemplateSecondary, "Multiple patterns are present in your template.");
    }

    writeGapWidening("You now have a name for the story that has been running beneath your cycle. Most men never get this far. Sit with that for a moment. The pages ahead are going to show you how deep this goes.");

    // ════════════════════════════════════════
    // SECTION 2 — YOUR AROUSAL TEMPLATE ORIGIN
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 2 — YOUR AROUSAL TEMPLATE ORIGIN");

    doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text(`First Exposure: Age ${analysis.imprintingAge || "unknown"}`, M, y);
    y = doc.y + 8;
    _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(`Context: ${analysis.imprintingContext || "unknown"}`, M, y, { width: CW });
    y = doc.y + 16;

    _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(
      analysis.imprintingFusion || "",
      M, y, { width: CW, lineGap: 4 }
    );
    y = doc.y + 14;

    const yearsRaw = String(analysis.patternYears || "many").replace(/\s*years?\s*$/i, "").trim();
    const yearsData = yearsRaw;

    writeGapWidening(`You can now trace your pattern from its origin to your current cycle. That is more clarity than most men get in a lifetime. And it raises a question most men eventually ask: if this has been running beneath the surface for ${yearsData} years without me seeing it, what else is down there that I still cannot see?`);

    // ════════════════════════════════════════
    // SECTION 3 — YOUR ADDICTION NEUROPATHWAY
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 3 — YOUR ADDICTION NEUROPATHWAY");

    writeCard("NEUROPATHWAY", analysis.neuropathway || "Unknown", analysis.neuropathwayExplanation || "");

    _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
      `Your brain is not using this behavior for pleasure. It is using it to manage ${(analysis.neuropathwayManages || "pain").toLowerCase()}.`,
      M, y, { width: CW, lineGap: 3 }
    );
    y = doc.y + 14;
    writeGapWidening(`Your brain is not choosing this behavior. It is running a survival program that was installed by experiences you did not choose and reinforced over ${yearsData} years. That is a longer runway than most men realize. And it explains why strategies aimed at the behavioral level have never been able to reach it.`);

    // Neuropathway Flow Diagram (Trigger → Pathway → Behavior)
    checkFit(120);
    const npManages = (analysis.neuropathwayManages || "Pain");
    const npType = (analysis.neuropathway || "Unknown");
    const flowBoxW = (CW - 40) / 3;
    const flowBoxH = 50;
    const flowY = y + 10;

    // Trigger box
    doc.roundedRect(M, flowY, flowBoxW, flowBoxH, 6).fill(CARD_BG);
    doc.roundedRect(M, flowY, flowBoxW, flowBoxH, 6).strokeColor([180, 60, 60]).lineWidth(0.8).stroke();
    doc.fontSize(9).fillColor([180, 60, 60]).font("Helvetica").text("TRIGGER", M + 8, flowY + 8, { width: flowBoxW - 16, align: "center" });
    doc.fontSize(14).fillColor(WHITE).font("Helvetica-Bold").text(npManages, M + 8, flowY + 22, { width: flowBoxW - 16, align: "center" });

    // Arrow 1
    const arrow1X = M + flowBoxW + 2;
    doc.fontSize(16).fillColor(GRAY).font("Helvetica").text("→", arrow1X, flowY + 16, { width: 16, align: "center" });

    // Pathway box
    const pathX = M + flowBoxW + 20;
    const pathColor = npType === "Arousal" ? [180, 60, 60] : npType === "Numbing" ? [60, 120, 200] : npType === "Fantasy" ? [140, 80, 200] : [200, 160, 40];
    doc.roundedRect(pathX, flowY, flowBoxW, flowBoxH, 6).fill(CARD_BG);
    doc.roundedRect(pathX, flowY, flowBoxW, flowBoxH, 6).strokeColor(pathColor).lineWidth(0.8).stroke();
    doc.fontSize(9).fillColor(pathColor).font("Helvetica").text("PATHWAY", pathX + 8, flowY + 8, { width: flowBoxW - 16, align: "center" });
    doc.fontSize(14).fillColor(WHITE).font("Helvetica-Bold").text(npType, pathX + 8, flowY + 22, { width: flowBoxW - 16, align: "center" });

    // Arrow 2
    const arrow2X = pathX + flowBoxW + 2;
    doc.fontSize(16).fillColor(GRAY).font("Helvetica").text("→", arrow2X, flowY + 16, { width: 16, align: "center" });

    // Behavior box
    const behX = pathX + flowBoxW + 20;
    doc.roundedRect(behX, flowY, flowBoxW, flowBoxH, 6).fill(CARD_BG);
    doc.roundedRect(behX, flowY, flowBoxW, flowBoxH, 6).strokeColor(GOLD).lineWidth(0.8).stroke();
    doc.fontSize(9).fillColor(GOLD).font("Helvetica").text("BEHAVIOR", behX + 8, flowY + 8, { width: flowBoxW - 16, align: "center" });
    doc.fontSize(14).fillColor(WHITE).font("Helvetica-Bold").text("The Cycle", behX + 8, flowY + 22, { width: flowBoxW - 16, align: "center" });

    y = flowY + flowBoxH + 20;

    // ════════════════════════════════════════
    // SECTION 4 — THE BEHAVIOR-ROOT MAP
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 4 — THE BEHAVIOR-ROOT MAP");

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
    // SECTION 5 — CONFUSING PATTERNS DECODED (conditional)
    // ════════════════════════════════════════
    const cpd = analysis.confusingPatternsDecoded || [];
    if (cpd.length > 0) {
      newPage(); y = CONTENT_TOP;
      sectionHeader("SECTION 5 — CONFUSING PATTERNS DECODED");

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
    // SECTION 6 — YOUR ATTACHMENT STYLE
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 6 — YOUR ATTACHMENT STYLE");

    writeCard("ATTACHMENT STYLE", analysis.attachmentStyle || "Unknown", analysis.attachmentFuels || "");

    if (analysis.godAttachment) {
      y += 10;
      writeSubheader("HOW THIS SHOWS UP WITH GOD");
      writeBody(analysis.godAttachment);
    }

    if (analysis.purityCultureImpact) {
      y += 10;
      writeSubheader("SPIRITUAL INTEGRATION");
      writeBody(analysis.purityCultureImpact);
    }

    writeGapWidening("Your attachment style has been your relational operating system since before you could speak. It shapes how you love, how you hide, how you connect with God, and how you relate to the behavior. Patterns this deep do not change through understanding alone. They were formed in relationship. The research is clear that they restructure the same way.");

    // ════════════════════════════════════════
    // YOUR GENERATIONAL CONTEXT (conditional)
    // ════════════════════════════════════════
    if (analysis.generationalLens) {
      newPage(); y = CONTENT_TOP;
      sectionHeader("YOUR GENERATIONAL CONTEXT");

      writeSubheader(analysis.generationalCohort);
      writeBody(analysis.generationalLens, { minHeight: 120 });

      writeGapWidening("You did not choose the generation you were born into. You did not choose the media landscape that shaped your first exposure. You did not choose the shame framework your church or culture handed you. But you are choosing what happens next. The roots were planted by forces outside your control. The healing is a decision only you can make.");
    }

    // ════════════════════════════════════════
    // SECTION 7 — RELATIONAL PATTERNS
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    sectionHeader("SECTION 7 — RELATIONAL PATTERNS");

    writeGauge("Codependency", analysis.codependencyScore, 3);
    if (analysis.codependencyExplanation) {
      writeBody(analysis.codependencyExplanation, { lineGap: 2, gap: 10 });
    }
    writeGauge("Enmeshment", analysis.enmeshmentScore, 3);
    if (analysis.enmeshmentExplanation) {
      writeBody(analysis.enmeshmentExplanation, { lineGap: 2, gap: 10 });
    }
    writeGauge("Relational Void", analysis.relationalVoidScore, 3);
    if (analysis.relationalVoidExplanation) {
      writeBody(analysis.relationalVoidExplanation, { lineGap: 2, gap: 10 });
    }
    writeGauge("Leadership Burden", analysis.leadershipBurdenScore, 3);
    if (analysis.leadershipBurdenExplanation) {
      writeBody(analysis.leadershipBurdenExplanation, { lineGap: 2, gap: 10 });
    }

    writeGapWidening("The relational patterns in your life are not separate from your sexual behavior. They are the soil it grows in. Isolation feeds the cycle. Codependency drains you until the behavior becomes the only thing that is yours. The leadership burden ensures you carry everyone while no one carries you. These patterns do not resolve by being identified. They resolve by being experienced differently.");

    // ════════════════════════════════════════
    // YOUR STRESS LANDSCAPE (conditional)
    // ════════════════════════════════════════
    if (analysis.lifeStressAnalysis) {
      newPage(); y = CONTENT_TOP;
      sectionHeader("YOUR STRESS LANDSCAPE");

      y += 10 * SP;
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica-Oblique").text(
        "Your brain does not act out in a vacuum. The stress you carry in everyday life creates the pressure your nervous system needs relief from. Every area of lack is a load your brain is trying to manage, and when the load exceeds your capacity, the cycle runs.",
        M, y, { width: CW, lineGap: 3 }
      );
      y = doc.y + 14;

      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(
        sanitize(analysis.lifeStressAnalysis),
        M, y, { width: CW, lineGap: 4 }
      );
      y = doc.y + 10;

      // Insight section
      checkFit(200);
      y += 6;
      doc.roundedRect(M, y, CW, 2, 0).fill(GOLD);
      y += 16;

      _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
        "Most people unknowingly try to stabilize their unwanted desires and behaviors by stabilizing these categories in life. But it actually works the opposite way.",
        M, y, { width: CW, lineGap: 4 }
      );
      y = doc.y + 10;
      _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text(
        "When you address your root issues, you stabilize behavior, and behavior brings stability to these areas.",
        M, y, { width: CW, lineGap: 4 }
      );
      y = doc.y + 14;

      // Trend callout box
      const trendH = 80;
      checkFit(trendH + 20);
      doc.roundedRect(M, y, CW, trendH, 6).fill(CARD_BG);
      doc.roundedRect(M, y, CW, trendH, 6).strokeColor(GOLD).lineWidth(1).stroke();
      doc.fontSize(10).fillColor(GOLD).font("Helvetica-Bold").text("THE #1 TREND", M + 16, y + 12, { width: CW - 32, characterSpacing: 1 });
      _currentTextColor = WHITE; doc.fontSize(18).fillColor(WHITE).font("Helvetica").text(
        "In the 10,000+ clients we have worked with, the #1 trend is increased income, fulfillment, and relationship health as a direct result of healing root issues.",
        M + 16, y + 30, { width: CW - 32, lineGap: 3 }
      );
      y += trendH + 14;

      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(
        "Every single person who takes the first steps towards freedom does so from a place of being unstable in multiple areas of life. The leap of faith in unstable times is a rite of passage.",
        M, y, { width: CW, lineGap: 4 }
      );
      y = doc.y + 10;

      writeGapWidening("Root-level healing does not just address the behavior. It rebuilds your capacity to carry the weight of real life without needing an escape.");
    }

    // ════════════════════════════════════════
    // CO-OCCURRING COPING BEHAVIORS (conditional)
    // ════════════════════════════════════════
    const ccb = analysis.coCopingBehaviors || [];
    if (ccb.length > 0) {
      newPage(); y = CONTENT_TOP;
      sectionHeader("YOUR BRAIN'S OTHER ESCAPE ROUTES");

      y += 10 * SP;
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica-Oblique").text(
        "The fact that these behaviors show up alongside your sexual pattern is actually proof that this was never a lust problem or a perversion problem. Just like it is not a substance problem or a food problem. Every unwanted behavior and desire on this list is a symptom of your brain's creative attempt to medicate or escape root-level pain. When you try to white-knuckle one outlet, your brain does not stop seeking relief. It reroutes through another. These are not separate problems. They are the same root narrative expressing itself through different outlets.",
        M, y, { width: CW, lineGap: 3 }
      );
      y = doc.y + 14;

      for (const cb of ccb) {
        const cbTitle = sanitize(cb.behavior || "");
        const cbConn = sanitize(cb.connection || "");
        const cbTitleH = doc.fontSize(20).font("Helvetica-Bold").heightOfString(cbTitle, { width: CW - 28 });
        const connH = doc.fontSize(20).font("Helvetica").heightOfString(cbConn, { width: CW - 28, lineGap: 4 });
        const cbBoxH = Math.max(60, 14 + cbTitleH + 10 + connH + 14);
        checkFit(cbBoxH + 10);
        doc.roundedRect(M, y, CW, cbBoxH, 5).fill(CARD_BG);
        doc.roundedRect(M, y, CW, cbBoxH, 5).strokeColor("#C9A227").lineWidth(0.5).stroke();
        doc.fontSize(20).fillColor("#C9A227").font("Helvetica-Bold").text(cbTitle, M + 14, y + 14, { width: CW - 28 });
        const cbBodyY = y + 14 + cbTitleH + 10;
        _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(cbConn, M + 14, cbBodyY, { width: CW - 28, lineGap: 4 });
        y += cbBoxH + 10;
      }
      writeGapWidening("You cannot win a game of whack-a-mole with your nervous system. Every time you shut down one outlet without addressing the root, your brain will find another. This is exactly why behavior-level solutions are dangerous. And it is exactly why root-level healing through the RNR process is essential. It does not manage symptoms. It restructures the root narrative that drives all of them.");

      // ── Substance vs Behavior Vice Diagram ──
      newPage(); y = CONTENT_TOP;
      sectionHeader("SUBSTANCE VS. BEHAVIOR — SAME ROOT");

      const substanceVices = ["Alcohol", "THC / Marijuana", "Other Substances", "Nicotine"];
      const behaviorVices = ["Sexual Behavior", "Gambling", "Gaming", "Impulse Spending", "Doom-Scrolling", "Overeating", "Overworking"];

      const colW = (CW - 30) / 2;
      const viceItemH = 26;

      // Substance column header
      doc.fontSize(10).fillColor([220, 80, 80]).font("Helvetica-Bold").text("SUBSTANCE", M, y, { width: colW, align: "center", characterSpacing: 2 });
      // Behavior column header
      doc.fontSize(10).fillColor([80, 140, 240]).font("Helvetica-Bold").text("BEHAVIOR", M + colW + 30, y, { width: colW, align: "center", characterSpacing: 2 });
      y += 20;

      // Draw vice items
      const maxItems = Math.max(substanceVices.length, behaviorVices.length);
      for (let vi = 0; vi < maxItems; vi++) {
        // Substance side
        if (vi < substanceVices.length) {
          const sLabel = substanceVices[vi];
          const sActive = ccb.some(b => (b.behavior || "").toLowerCase().includes(sLabel.toLowerCase().split(" ")[0].toLowerCase()));
          doc.roundedRect(M, y, colW, viceItemH, 4).fill(sActive ? [60, 20, 20] : CARD_BG);
          doc.roundedRect(M, y, colW, viceItemH, 4).strokeColor(sActive ? [220, 80, 80] : BORDER).lineWidth(sActive ? 0.8 : 0.3).stroke();
          doc.fontSize(11).fillColor(sActive ? [255, 180, 180] : [100, 100, 100]).font(sActive ? "Helvetica-Bold" : "Helvetica").text(sLabel, M + 10, y + 7, { width: colW - 20, align: "center" });
        }
        // Behavior side
        if (vi < behaviorVices.length) {
          const bLabel = behaviorVices[vi];
          // "Sexual Behavior" is always active — it's the primary issue for every user taking this diagnostic
          const bActive = bLabel === "Sexual Behavior" || ccb.some(b => (b.behavior || "").toLowerCase().includes(bLabel.toLowerCase().split(" ")[0].toLowerCase()));
          doc.roundedRect(M + colW + 30, y, colW, viceItemH, 4).fill(bActive ? [15, 30, 55] : CARD_BG);
          doc.roundedRect(M + colW + 30, y, colW, viceItemH, 4).strokeColor(bActive ? [80, 140, 240] : BORDER).lineWidth(bActive ? 0.8 : 0.3).stroke();
          doc.fontSize(11).fillColor(bActive ? [160, 200, 255] : [100, 100, 100]).font(bActive ? "Helvetica-Bold" : "Helvetica").text(bLabel, M + colW + 40, y + 7, { width: colW - 20, align: "center" });
        }
        y += viceItemH + 4;
      }

      // Convergence arrow
      y += 6;
      doc.fontSize(16).fillColor(GRAY).font("Helvetica").text("↓", M, y, { width: CW, align: "center" });
      y += 20;

      // Same root box
      const rootBoxW = CW * 0.6;
      const rootBoxX = M + (CW - rootBoxW) / 2;
      doc.roundedRect(rootBoxX, y, rootBoxW, 40, 6).fill(CARD_BG);
      doc.roundedRect(rootBoxX, y, rootBoxW, 40, 6).strokeColor(GOLD).lineWidth(0.8).stroke();
      doc.fontSize(10).fillColor(GOLD).font("Helvetica-Bold").text("SAME ROOT", rootBoxX, y + 8, { width: rootBoxW, align: "center", characterSpacing: 2 });
      doc.fontSize(12).fillColor(WHITE).font("Helvetica").text("Different strategies, identical origin", rootBoxX, y + 24, { width: rootBoxW, align: "center" });
      y += 56;

      // Explanation text
      checkFit(200);
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(
        "Most people look at a behavior like gambling and a substance like alcohol as two very different problems. One is a \"behavioral issue.\" The other is a \"substance issue.\" Different categories, different treatments, different labels.",
        M, y, { width: CW, lineGap: 4 }
      );
      y = doc.y + 10;
      _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
        "But they are not different problems. They are different strategies your brain uses to medicate the same root pain.",
        M, y, { width: CW, lineGap: 4 }
      );
      y = doc.y + 10;
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(
        "The substance numbs. The behavior distracts. The scroll dissociates. The spend creates a dopamine hit. The overwork creates a sense of worth. Every single one is aimed at the same target: the root narrative that says something is wrong with you, missing in you, or broken about you.",
        M, y, { width: CW, lineGap: 4 }
      );
      y = doc.y + 10;
      writeGapWidening("That is why white-knuckling one behavior so often causes another to intensify. Remove one escape route and the brain finds another. The only way to stop the cycle is to heal what the brain is running from.");
    }

    // ════════════════════════════════════════
    // STRATEGY AUDIT
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

      // Spiritual Integration section — conditional on prayer/deliverance/fasting strategies
      const spiritualStrats = strategies.filter(s => {
        const lower = (s || "").toLowerCase();
        return lower.includes("prayer") || lower.includes("spiritual") || lower.includes("bible") || lower.includes("fasting") || lower.includes("deliverance") || lower.includes("church");
      });

      if (spiritualStrats.length >= 1) {
        checkFit(80);
        y += 10;
        doc.fontSize(20).fillColor(GOLD).font("Helvetica").text("SIN NATURE vs. BEHAVIORAL CYCLE", M, y, { characterSpacing: 1 });
        y = doc.y + 12;

        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
          "There is a critical distinction that most men have never been taught, and it changes everything about how you fight this battle.",
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 10;

        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
          "Your sin nature is the soil. Every human being carries it (Romans 3:23). It is the universal tendency toward sin that Scripture is clear about. You will carry this soil until glory. It cannot be uprooted because it is part of the human condition this side of eternity.",
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 10;

        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
          "But the behavioral cycle this report is mapping is not your sin nature. It is a specific pattern of neurological pathways, encoded wounds, and root narratives that GREW in that soil. And unlike the soil itself, these roots CAN be identified, understood, and uprooted. That is what Root Narrative Restructuring does.",
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 10;

        _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica-Oblique").text(
          "The sin nature is permanent. The behavioral cycle is not. Confusing the two is why so many men believe they are beyond help.",
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 16;

        checkFit(80);
        doc.fontSize(20).fillColor(GOLD).font("Helvetica").text("SPIRITUAL PRACTICES + PROCESS", M, y, { characterSpacing: 1 });
        y = doc.y + 12;

        const spiritStratNames = spiritualStrats.map(s => sanitize(s).toLowerCase()).join(", ");

        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
          `You listed ${spiritStratNames} among your strategies. Let us be direct: God is powerful enough to deliver any man from any pattern in an instant. He has done it. Scripture is full of miracles. And if He chooses to do that for you, nothing in this report overrides that.`,
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 10;

        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
          "But the pattern in Scripture is clear: God could have delivered His people out of Egypt into the Promised Land instantaneously. He had the power. Instead, He chose to lead them on a journey, not just out of Egypt physically, but on a journey of shedding the Egypt out of them in the wilderness. The wilderness was not a punishment. It was a forge. Deuteronomy 8:2-3 says God led them through the wilderness to humble them, test them, and know what was in their hearts. The journey itself was the transformation.",
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 10;

        _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
          "Prayer and spiritual disciplines are essential. They position the heart, invite God into the battle, and anchor identity. But just as God heals through medicine and surgery, He also works through the process of restructuring root narratives at their source. The strategy was not wrong. It was incomplete on its own, not because God lacks power, but because He often works THROUGH the journey, not around it.",
          M, y, { width: CW, lineGap: 4 }
        );
        y = doc.y + 10;

        _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica-Oblique").text(
          "The leader in you is not just unchained on the journey. It is forged and refined by it.",
          M, y, { width: CW, lineGap: 4 }
        );
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

    // Personalized synthesis paragraph
    try {
      const synthText = `Here is what your diagnostic revealed: A root narrative of "${sanitize(analysis.rootNarrativeStatement || "a core wound")}" formed in childhood, encoded into a ${sanitize(analysis.arousalTemplateType || "specific")} arousal template at age ${sanitize(String(analysis.imprintingAge || "unknown"))}, running through the ${sanitize(analysis.neuropathway || "primary")} neuropathway, reinforced by ${sanitize(analysis.attachmentStyle || "your")} attachment, and defended against by ${sanitize(String(analysis.strategiesCount || "multiple"))} strategies over ${sanitize(String(analysis.yearsFighting || "many"))} years. None of those strategies failed because of you. They failed because they were aimed at a system they could not see.`;
      _currentTextColor = GRAY; doc.fontSize(20).fillColor(GRAY).font("Helvetica").text(synthText, M, y, { width: CW, lineGap: 4 });
      y = doc.y + 16;
      _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text(
        "You can see the system now. Most men never get this far. But seeing the prison does not open the door.",
        M, y, { width: CW, lineGap: 4, align: "center" }
      );
      y = doc.y + 24;
    } catch (synthErr) {
      console.error("PDF synthesis paragraph error:", synthErr.message);
      y = doc.y + 24;
    }

    // Key insight — no first name, starts directly with the insight
    let keyInsightText = sanitize(analysis.keyInsight || "What this diagnostic revealed is only the surface of a system of hundreds of interlocking root narratives. The system is complex — but the process of healing is remarkably simple when the path is laid out for you.");
    keyInsightText = keyInsightText.replace(/^(Brother|Man|Friend|Sir),?\s*/i, "").trim();
    _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
      keyInsightText,
      M, y, { width: CW, lineGap: 5 }
    );
    y = doc.y + 20;

    // ════════════════════════════════════════
    // SECTION 9 — WHAT THIS MEANS
    // ════════════════════════════════════════
    checkFit(200);
    doc.fontSize(24).fillColor(GOLD).font("Helvetica-Bold").text("WHAT THIS MEANS", M, y, { characterSpacing: 2 });
    y += 28;

    // What This Means — starts with first name
    let closingText = sanitize(analysis.closingStatement || "You are not broken. You are not disqualified. The roots are complex, but the path through them is clear when someone who has walked it lays it out for you. Freedom is closer than you think.");
    closingText = closingText.replace(/^(Brother|Man|Friend|Sir),?\s*/i, "").trim();
    if (!closingText.startsWith(firstName)) {
      closingText = `${firstName}, ${closingText.charAt(0).toLowerCase()}${closingText.slice(1)}`;
    }
    _currentTextColor = WHITE; doc.fontSize(20).fillColor(WHITE).font("Helvetica").text(
      closingText,
      M, y, { width: CW, lineGap: 5 }
    );
    y = doc.y + 20;

    // Final direct commitment line
    try {
      checkFit(40);
      doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold").text(
        "The path is laid out. The question is whether you will take the first step.",
        M, y, { width: CW, lineGap: 4, align: "center" }
      );
      y = doc.y + 20;
    } catch (commitErr) {
      console.error("PDF commitment line error:", commitErr.message);
    }

    // ════════════════════════════════════════
    // SECTION 10 — NEXT STEPS & RESOURCES
    // ════════════════════════════════════════
    newPage(); y = CONTENT_TOP;
    doc.fontSize(20).fillColor(GOLD).font("Helvetica").text("YOUR RECOMMENDED NEXT STEP", M, y, { characterSpacing: 2 });
    y = doc.y + 20;

    // Personalized recommendation
    try {
      const recoText = `Based on your ${sanitize(analysis.arousalTemplateType || "primary")} pattern, ${sanitize(analysis.neuropathway || "identified")} neuropathway, and ${sanitize(analysis.attachmentStyle || "your")} attachment style, this is the recommended next step for your specific diagnostic:`;
      _currentTextColor = GRAY; doc.fontSize(18).fillColor(GRAY).font("Helvetica").text(recoText, M, y, { width: CW, lineGap: 3 });
      y = doc.y + 16;
    } catch (recoErr) {
      console.error("PDF recommendation text error:", recoErr.message);
    }

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
    const p1Body = `Your diagnostic revealed ${sanitize(analysis.arousalTemplateType || "your primary pattern")} as your primary pattern with ${sanitize(analysis.neuropathway || "a specific neuropathway")} as the driving mechanism. The Art of Freedom Training walks you through the exact process used to address unwanted behaviors at the root level, not the behavioral level where everything you have tried has been aimed. After the training, you can apply to speak with one of our certified support coaches about our 90 Days to Freedom core program. Your diagnostic is the map of the maze. This training shows you the door out.`;
    drawResourceCard(1, "PRIORITY 1 — YOUR NEXT STEP", "FREE", "Watch the Art of Freedom Training", p1Body, "https://unchained-leader.com/aof");

    // Social proof + divider
    try {
      checkFit(30);
      doc.fontSize(14).fillColor([120, 120, 120]).font("Helvetica").text(
        "Trusted by over 10,000 men across 33 countries. LegitScript-certified.",
        M, y, { width: CW, align: "center" }
      );
      y = doc.y + 16;

      // Additional Resources divider
      checkFit(30);
      doc.save();
      doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor(60, 60, 60).stroke();
      doc.restore();
      y += 10;
      doc.fontSize(12).fillColor([100, 100, 100]).font("Helvetica").text("ADDITIONAL RESOURCES", M, y, { width: CW, align: "center", characterSpacing: 2 });
      y = doc.y + 16;
    } catch (divErr) {
      console.error("PDF social proof/divider error:", divErr.message);
      y = doc.y + 16;
    }

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
    console.warn("RESEND_API_KEY not set — skipping email delivery");
    return;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.RESET_FROM_EMAIL || "Unchained Leader <reports@unchained.support>";

  const resp = await fetch("https://api.resend.com/emails", {
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
            <div style="color:#fff;font-size:22px;font-weight:bold;">Your Root Map Is Ready</div>
          </div>
          <p style="font-size:15px;line-height:1.7;color:#ccc;">
            ${firstName}, your Unwanted Desire Root Map has been generated and is waiting inside your secure dashboard.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#999;">
            Log in with the email and PIN you created to view your full results. Your report connects dots you have never seen before.
          </p>
          <div style="text-align:center;margin:30px 0;">
            <a href="https://unchainedleader.io/dashboard/login" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#DFC468,#9A7730);color:#000;font-size:14px;font-weight:bold;border-radius:8px;text-decoration:none;letter-spacing:1px;">ACCESS YOUR DASHBOARD</a>
          </div>
          <div style="border-top:1px solid #333;padding-top:20px;margin-top:20px;text-align:center;">
            <div style="color:#c5a55a;font-size:11px;letter-spacing:2px;">#liveunchained</div>
            <div style="color:#555;font-size:10px;margin-top:8px;">This email is confidential. Nothing identifiable is visible in the subject line or preview text.</div>
          </div>
        </div>
      `,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "unknown");
    console.error("Resend email failed:", resp.status, errBody);
  } else {
    const result = await resp.json().catch(() => ({}));
  }
}
