#!/usr/bin/env node

/**
 * UDRM Quiz Data Extraction Script
 *
 * Extracts all quiz submission data from April 10-11, 2026 (Eastern Time)
 * from both Neon PostgreSQL and Upstash Redis, and writes structured JSON
 * files for marketing analysis.
 *
 * Usage: node scripts/extract-quiz-data.mjs
 *
 * Requires .env.local with: DATABASE_URL, KV_REST_API_URL, KV_REST_API_TOKEN
 */

import { neon } from "@neondatabase/serverless";
import { Redis } from "@upstash/redis";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

// ── Load .env.local ─────────────────────────────────────────────
function loadEnv() {
  const envPath = join(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) {
    console.error("\n  Missing .env.local file at project root.");
    console.error("  Create it with these variables:\n");
    console.error("    DATABASE_URL=postgresql://...");
    console.error("    KV_REST_API_URL=https://....upstash.io");
    console.error("    KV_REST_API_TOKEN=your-token\n");
    console.error("  See .env.example for reference.\n");
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// ── Validate required env vars ──────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL (or POSTGRES_URL) in .env.local");
  process.exit(1);
}
if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
  console.error("Missing KV_REST_API_URL or KV_REST_API_TOKEN in .env.local");
  process.exit(1);
}

// ── Initialize clients ──────────────────────────────────────────
const sql = neon(DATABASE_URL);
const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });

// ── Date range: April 10-11, 2026 Eastern Time ─────────────────
// April is EDT (UTC-4)
// Apr 10 00:00:00 ET = Apr 10 04:00:00 UTC
// Apr 11 23:59:59 ET = Apr 12 03:59:59 UTC
const DATE_START = "2026-04-10T04:00:00.000Z";
const DATE_END = "2026-04-12T03:59:59.999Z";

const OUTPUT_DIR = join(PROJECT_ROOT, "data", "quiz-export-apr-10-11");

// ── Helpers ─────────────────────────────────────────────────────
function parseRedis(val) {
  if (!val) return null;
  return typeof val === "string" ? JSON.parse(val) : val;
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function stripIp(obj) {
  if (!obj) return obj;
  const { ip_address, ...rest } = obj;
  return rest;
}

// ── Main extraction ─────────────────────────────────────────────
async function main() {
  console.log("\n=== UDRM Quiz Data Extraction ===");
  console.log(`Date range: Apr 10-11, 2026 ET`);
  console.log(`  UTC start: ${DATE_START}`);
  console.log(`  UTC end:   ${DATE_END}\n`);

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── Phase 1: Postgres queries (parallel) ────────────────────
  console.log("[1/4] Querying PostgreSQL...");

  const [diagnostics, responses, events] = await Promise.all([
    sql`
      SELECT * FROM completed_diagnostics
      WHERE product = 'udrm'
        AND created_at >= ${DATE_START}
        AND created_at < ${DATE_END}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT * FROM quiz_responses
      WHERE product = 'udrm'
        AND created_at >= ${DATE_START}
        AND created_at < ${DATE_END}
      ORDER BY session_id, section_num, created_at ASC
    `,
    sql`
      SELECT * FROM analytics_events
      WHERE product = 'udrm'
        AND created_at >= ${DATE_START}
        AND created_at < ${DATE_END}
      ORDER BY created_at ASC
    `,
  ]);

  console.log(`  completed_diagnostics: ${diagnostics.length} rows`);
  console.log(`  quiz_responses:        ${responses.length} rows`);
  console.log(`  analytics_events:      ${events.length} rows`);

  // Strip IP addresses from all results
  const cleanDiagnostics = diagnostics.map(stripIp);
  const cleanEvents = events.map(stripIp);

  // ── Phase 2: Redis enrichment ───────────────────────────────
  console.log("\n[2/4] Fetching Redis analysis data...");

  // Collect unique emails from completed diagnostics
  const uniqueEmails = [...new Set(diagnostics.map(d => normalizeEmail(d.email)).filter(Boolean))];
  console.log(`  Unique emails to fetch: ${uniqueEmails.length}`);

  const redisAnalyses = [];
  const combinedProfiles = [];
  let redisHits = 0;
  let redisMisses = 0;

  // Batch Redis fetches in chunks of 15
  const CHUNK_SIZE = 15;
  for (let i = 0; i < uniqueEmails.length; i += CHUNK_SIZE) {
    const chunk = uniqueEmails.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (email) => {
        const [analysisRaw, userRaw] = await Promise.all([
          redis.get(`mkt:analysis:${email}`),
          redis.get(`mkt:user:${email}`),
        ]);
        return { email, analysisRaw, userRaw };
      })
    );

    for (const { email, analysisRaw, userRaw } of results) {
      const analysis = parseRedis(analysisRaw);
      const user = parseRedis(userRaw);

      if (analysis) {
        redisHits++;
        // Remove internal _usage field if present
        const { _usage, ...cleanAnalysis } = analysis;
        redisAnalyses.push({ email, analysis: cleanAnalysis });
      } else {
        redisMisses++;
        console.log(`    [WARN] No Redis analysis for: ${email}`);
      }

      // Build combined profile: Postgres row + Redis analysis
      const pgRows = cleanDiagnostics.filter(d => normalizeEmail(d.email) === email);
      for (const pgRow of pgRows) {
        const { _usage, ...cleanAnalysis } = (analysis || {});
        combinedProfiles.push({
          // Postgres structured data
          ...pgRow,
          // Redis rich analysis (or null)
          redis_analysis: analysis ? cleanAnalysis : null,
          // Redis user profile
          redis_user: user || null,
        });
      }
    }

    if (i + CHUNK_SIZE < uniqueEmails.length) {
      process.stdout.write(`    Fetched ${Math.min(i + CHUNK_SIZE, uniqueEmails.length)}/${uniqueEmails.length} emails...\r`);
    }
  }

  console.log(`  Redis analyses found:   ${redisHits}`);
  console.log(`  Redis analyses missing: ${redisMisses}`);

  // ── Phase 3: Write output files ─────────────────────────────
  console.log("\n[3/4] Writing output files...");

  const files = {
    "combined-profiles.json": combinedProfiles,
    "completed-diagnostics.json": cleanDiagnostics,
    "quiz-responses.json": responses,
    "analytics-events.json": cleanEvents,
    "redis-analyses.json": redisAnalyses,
  };

  for (const [filename, data] of Object.entries(files)) {
    const filePath = join(OUTPUT_DIR, filename);
    writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  ${filename}: ${Array.isArray(data) ? data.length : 0} records`);
  }

  // Write summary
  const summary = {
    extractedAt: new Date().toISOString(),
    dateRange: {
      label: "April 10-11, 2026 Eastern Time",
      utcStart: DATE_START,
      utcEnd: DATE_END,
    },
    counts: {
      completedDiagnostics: diagnostics.length,
      quizResponses: responses.length,
      analyticsEvents: events.length,
      uniqueEmails: uniqueEmails.length,
      redisAnalysesFound: redisHits,
      redisAnalysesMissing: redisMisses,
      combinedProfiles: combinedProfiles.length,
    },
    aggregates: {
      arousalTemplateTypes: countField(diagnostics, "arousal_template_type"),
      neuropathways: countField(diagnostics, "neuropathway"),
      attachmentStyles: countField(diagnostics, "attachment_style"),
      trafficSources: countField(diagnostics, "traffic_source"),
      geoCountries: countField(diagnostics, "geo_country"),
      geoRegions: countField(diagnostics, "geo_region"),
      avgCodependencyScore: avgField(diagnostics, "codependency_score"),
      avgEnmeshmentScore: avgField(diagnostics, "enmeshment_score"),
      avgRelationalVoidScore: avgField(diagnostics, "relational_void_score"),
      avgLeadershipBurdenScore: avgField(diagnostics, "leadership_burden_score"),
      escalationRate: diagnostics.length > 0
        ? `${Math.round(diagnostics.filter(d => d.escalation_present).length / diagnostics.length * 100)}%`
        : "N/A",
    },
    outputFiles: Object.keys(files).map(f => `data/quiz-export-apr-10-11/${f}`),
  };

  writeFileSync(join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`  summary.json: metadata + aggregates`);

  // ── Phase 4: Print summary ──────────────────────────────────
  console.log("\n[4/4] Extraction complete!\n");
  console.log("=== Summary ===");
  console.log(`  Completed diagnostics: ${diagnostics.length}`);
  console.log(`  Quiz responses:        ${responses.length}`);
  console.log(`  Analytics events:      ${events.length}`);
  console.log(`  Combined profiles:     ${combinedProfiles.length} (with Redis analysis: ${redisHits})`);
  console.log(`\n  Output: ${OUTPUT_DIR}/`);
  console.log(`  Primary file: combined-profiles.json\n`);

  if (diagnostics.length > 0) {
    console.log("=== Aggregate Breakdown ===");
    console.log("  Arousal Template Types:");
    for (const [k, v] of Object.entries(summary.aggregates.arousalTemplateTypes)) {
      console.log(`    ${k}: ${v}`);
    }
    console.log("  Neuropathways:");
    for (const [k, v] of Object.entries(summary.aggregates.neuropathways)) {
      console.log(`    ${k}: ${v}`);
    }
    console.log("  Attachment Styles:");
    for (const [k, v] of Object.entries(summary.aggregates.attachmentStyles)) {
      console.log(`    ${k}: ${v}`);
    }
    console.log("");
  }
}

// ── Aggregate helpers ───────────────────────────────────────────
function countField(rows, field) {
  const counts = {};
  for (const row of rows) {
    const val = row[field] || "unknown";
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

function avgField(rows, field) {
  const nums = rows.map(r => parseFloat(r[field])).filter(n => !isNaN(n));
  if (nums.length === 0) return "N/A";
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
}

// ── Run ─────────────────────────────────────────────────────────
main().catch((err) => {
  console.error("\nExtraction failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
