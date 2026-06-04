#!/usr/bin/env node

/**
 * Redis quota recovery + unsent-report recovery tool
 * ═══════════════════════════════════════════════════════════════
 *
 * Context: production Upstash Redis hit its 256MB quota and started
 * rejecting WRITES (reads + deletes still work). That broke the report
 * pipeline — /api/report throws at its first redis.set, so the QStash
 * job is never enqueued. The quiz answers for affected users are NOT in
 * QStash; the only durable copy is Redis `mkt:diagnostic:${email}`.
 *
 * This script does three things, all read-only by default:
 *
 *   1. CLASSIFY — SCAN mkt:diagnostic:*, cross-reference Postgres
 *      completed_diagnostics, and bucket every saved quiz into:
 *        • DONE        — report already exists (draft is dead weight)
 *        • RECOVERABLE — quiz saved, no report yet (re-enqueue these)
 *
 *   2. --free-space — DELETE mkt:diagnostic for DONE users only, to drop
 *      below the 256MB ceiling so writes resume. NEVER touches
 *      RECOVERABLE drafts. Safe because the report (Postgres row + Blob
 *      PDF + mkt:analysis cache) already exists for DONE users.
 *
 *   3. --recover — re-POST each RECOVERABLE quiz to {APP_URL}/api/report
 *      so the normal pipeline regenerates the report and emails the user.
 *      Idempotent: re-checks completed_diagnostics immediately before
 *      each POST and skips any that completed in the meantime.
 *
 * It also prints a "LOST" list: emails that completed the quiz today
 * (Postgres analytics_events) but have neither a saved mkt:diagnostic nor
 * a report — i.e. answers lost when writes started failing. Use that list
 * to reach out (GHL/Zapier have their contact info) and ask them to redo.
 *
 * Usage:
 *   node scripts/recover-failed-reports.mjs                # dry run (report only)
 *   node scripts/recover-failed-reports.mjs --free-space   # delete DONE drafts to free quota
 *   node scripts/recover-failed-reports.mjs --recover      # re-enqueue RECOVERABLE reports
 *   node scripts/recover-failed-reports.mjs --free-space --recover
 *   node scripts/recover-failed-reports.mjs --cutoff=2026-05-16T16:40:00Z   # LOST-list window (UTC)
 *
 * Requires .env.local at project root with:
 *   DATABASE_URL (or POSTGRES_URL), KV_REST_API_URL, KV_REST_API_TOKEN,
 *   NEXT_PUBLIC_APP_URL (production base URL, for --recover)
 *
 * Read the values straight off the LIVE production deployment's env
 * snapshot in Vercel — those credentials still point at the real
 * (over-quota) Upstash DB even though project Settings no longer list them.
 */

import { neon } from "@neondatabase/serverless";
import { Redis } from "@upstash/redis";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// ── Flags ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FREE_SPACE = args.includes("--free-space");
const RECOVER = args.includes("--recover");
const cutoffArg = args.find((a) => a.startsWith("--cutoff="));
// Default LOST-window cutoff: 2026-05-16 12:40 America/New_York = 16:40 UTC (EDT, UTC-4)
const CUTOFF = cutoffArg ? cutoffArg.split("=")[1] : "2026-05-16T16:40:00Z";

// ── Load .env.local (same convention as extract-quiz-data.mjs) ────
function loadEnv() {
  const envPath = join(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) {
    console.error("\n  Missing .env.local at project root. Needs:\n");
    console.error("    DATABASE_URL=postgresql://...");
    console.error("    KV_REST_API_URL=https://....upstash.io");
    console.error("    KV_REST_API_TOKEN=...");
    console.error("    NEXT_PUBLIC_APP_URL=https://unchainedleader.io   (for --recover)\n");
    process.exit(1);
  }
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const normalizeEmail = (e) => (e || "").trim().toLowerCase();

function parseMaybeJson(v) {
  if (v == null) return null;
  if (typeof v === "object") return v; // @upstash/redis auto-deserializes JSON
  try { return JSON.parse(v); } catch { return null; }
}

async function main() {
  loadEnv();

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!dbUrl) { console.error("No Postgres URL in env."); process.exit(1); }
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    console.error("Missing KV_REST_API_URL / KV_REST_API_TOKEN in env."); process.exit(1);
  }

  const sql = neon(dbUrl);
  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  console.log("\n═══ Redis quota recovery ═══");
  console.log(`Mode: ${FREE_SPACE || RECOVER ? [FREE_SPACE && "free-space", RECOVER && "recover"].filter(Boolean).join(" + ") : "DRY RUN (report only)"}`);

  // ── Step 0: confirm reads work (DELs/reads are allowed even over quota) ──
  let dbsize = null;
  try {
    dbsize = await redis.dbsize();
    console.log(`Redis reachable. DBSIZE = ${dbsize} keys.\n`);
  } catch (e) {
    console.error(`Redis read failed — cannot proceed: ${e.message}`);
    process.exit(1);
  }

  // ── Step 1: SCAN all mkt:diagnostic:* keys ──
  const diagKeys = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match: "mkt:diagnostic:*", count: 250 });
    cursor = next;
    diagKeys.push(...keys);
  } while (cursor !== "0");
  console.log(`Found ${diagKeys.length} saved quiz drafts (mkt:diagnostic:*).`);

  const emails = diagKeys.map((k) => k.replace(/^mkt:diagnostic:/, ""));

  // ── Step 2: which of those already have a report in Postgres? ──
  const doneSet = new Set();
  if (emails.length) {
    const rows = await sql`
      SELECT DISTINCT email FROM completed_diagnostics
      WHERE email = ANY(${emails})`;
    for (const r of rows) doneSet.add(normalizeEmail(r.email));
  }

  const done = [];        // report exists → mkt:diagnostic is dead weight
  const recoverable = []; // saved quiz, no report → re-enqueue
  for (const email of emails) {
    (doneSet.has(normalizeEmail(email)) ? done : recoverable).push(email);
  }

  console.log(`  • DONE (report exists, draft is dead weight): ${done.length}`);
  console.log(`  • RECOVERABLE (saved quiz, no report yet):    ${recoverable.length}`);

  // ── Step 3: LOST list — completed today but nothing saved server-side ──
  const savedOrDone = new Set(emails.map(normalizeEmail));
  const completedRows = await sql`
    SELECT session_id, event_data, created_at FROM analytics_events
    WHERE event_type = 'contact_capture_complete'
      AND created_at >= ${CUTOFF}::timestamptz`;
  const completedEmails = new Set();
  for (const r of completedRows) {
    const ed = parseMaybeJson(r.event_data) || {};
    const cand = normalizeEmail(ed.email || (String(r.session_id).includes("@") ? r.session_id : ""));
    if (cand) completedEmails.add(cand);
  }
  const reportedRows = await sql`
    SELECT DISTINCT email FROM completed_diagnostics
    WHERE report_generated_at >= ${CUTOFF}::timestamptz`;
  const reportedSince = new Set(reportedRows.map((r) => normalizeEmail(r.email)));
  const lost = [...completedEmails].filter((e) => !savedOrDone.has(e) && !reportedSince.has(e));

  console.log(`  • LOST (completed since ${CUTOFF}, no draft & no report): ${lost.length}`);
  if (lost.length) {
    console.log("    → answers gone server-side; reach out via GHL/Zapier and ask to redo:");
    lost.forEach((e) => console.log(`        ${e}`));
  }

  // ── Action: free space by deleting DONE drafts ──
  if (FREE_SPACE && done.length) {
    console.log(`\n[free-space] Deleting ${done.length} dead drafts (DONE users only)…`);
    let freed = 0;
    for (const email of done) {
      try { await redis.del(`mkt:diagnostic:${email}`); freed++; }
      catch (e) { console.error(`  del failed for ${email}: ${e.message}`); }
    }
    console.log(`[free-space] Deleted ${freed}. New DBSIZE = ${await redis.dbsize()}.`);
  } else if (FREE_SPACE) {
    console.log("\n[free-space] No DONE drafts to delete.");
  }

  // ── Action: re-enqueue recoverable reports ──
  if (RECOVER && recoverable.length) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) { console.error("\n[recover] NEXT_PUBLIC_APP_URL not set — cannot POST."); process.exit(1); }
    console.log(`\n[recover] Re-enqueuing ${recoverable.length} reports via ${appUrl}/api/report …`);
    let ok = 0, skip = 0, fail = 0;
    for (const email of recoverable) {
      // Idempotency: skip if a report appeared since we classified.
      const [already] = await sql`SELECT 1 FROM completed_diagnostics WHERE email = ${email} LIMIT 1`;
      if (already) { skip++; continue; }

      const draft = parseMaybeJson(await redis.get(`mkt:diagnostic:${email}`));
      const messages = draft?.messages || [];
      if (!messages.length) { console.warn(`  ${email}: empty draft, skipping`); skip++; continue; }

      const user = parseMaybeJson(await redis.get(`mkt:user:${email}`)) || {};
      try {
        const res = await fetch(`${appUrl}/api/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            name: draft.name || user.name || "Brother",
            diagnosticData: messages,
            gender: user.gender || "",
            trafficSource: user.trafficSource || "recovery",
          }),
        });
        if (res.ok) { ok++; console.log(`  ✓ ${email}`); }
        else { fail++; console.error(`  ✗ ${email}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`); }
      } catch (e) { fail++; console.error(`  ✗ ${email}: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 250)); // gentle pacing
    }
    console.log(`[recover] enqueued=${ok} skipped=${skip} failed=${fail}`);
  } else if (RECOVER) {
    console.log("\n[recover] Nothing to recover.");
  }

  if (!FREE_SPACE && !RECOVER) {
    console.log("\nDry run only. Re-run with --free-space and/or --recover to act.");
  }
  console.log("");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
