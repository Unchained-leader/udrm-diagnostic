#!/usr/bin/env node

/**
 * UDRM Data MCP Server
 *
 * Gives Claude Code live access to query the UDRM diagnostic quiz databases:
 * - Neon PostgreSQL (completed_diagnostics, quiz_responses, analytics_events)
 * - Upstash Redis (full AI-generated analysis per user)
 *
 * Configured via .mcp.json at project root. Reads credentials from .env.local.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { Redis } from "@upstash/redis";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");

// ── Load .env.local ─────────────────────────────────────────────
function loadEnv() {
  const envPath = join(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// ── Initialize clients ──────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

let sql, redis;

function getDb() {
  if (!sql) {
    if (!DATABASE_URL) throw new Error("DATABASE_URL not set in .env.local");
    sql = neon(DATABASE_URL);
  }
  return sql;
}

function getRedis() {
  if (!redis) {
    if (!KV_URL || !KV_TOKEN) throw new Error("KV_REST_API_URL/KV_REST_API_TOKEN not set in .env.local");
    redis = new Redis({ url: KV_URL, token: KV_TOKEN });
  }
  return redis;
}

function parseRedis(val) {
  if (!val) return null;
  return typeof val === "string" ? JSON.parse(val) : val;
}

// ── ET timezone helpers ─────────────────────────────────────────
function etToUtcStart(dateStr) {
  const month = parseInt(dateStr.split("-")[1]);
  const offsetH = (month >= 3 && month <= 10) ? 4 : 5;
  return new Date(new Date(dateStr + "T00:00:00.000Z").getTime() + offsetH * 3600000).toISOString();
}

function etToUtcEnd(dateStr) {
  const month = parseInt(dateStr.split("-")[1]);
  const offsetH = (month >= 3 && month <= 10) ? 4 : 5;
  return new Date(new Date(dateStr + "T23:59:59.999Z").getTime() + offsetH * 3600000).toISOString();
}

// ── MCP Server ──────────────────────────────────────────────────
const server = new McpServer({
  name: "udrm-data",
  version: "1.0.0",
});

// ── Tool: query_diagnostics ─────────────────────────────────────
server.tool(
  "query_diagnostics",
  "Query completed quiz diagnostics from PostgreSQL. Returns structured scores, demographics, and diagnostic types. Supports date range filtering (Eastern Time), pagination, and field selection.",
  {
    startDate: z.string().describe("Start date YYYY-MM-DD in Eastern Time").optional(),
    endDate: z.string().describe("End date YYYY-MM-DD in Eastern Time").optional(),
    days: z.number().describe("Alternative to date range: last N days (default 7)").optional(),
    email: z.string().describe("Filter by exact email address").optional(),
    arousalTemplate: z.string().describe("Filter by arousal_template_type (e.g. 'The Invisible Man')").optional(),
    attachmentStyle: z.string().describe("Filter by attachment_style (e.g. 'Fearful-Avoidant')").optional(),
    limit: z.number().describe("Max rows to return (default 50, max 200)").optional(),
    offset: z.number().describe("Offset for pagination (default 0)").optional(),
  },
  async ({ startDate, endDate, days, email, arousalTemplate, attachmentStyle, limit = 50, offset = 0 }) => {
    const db = getDb();
    limit = Math.min(200, Math.max(1, limit));

    let utcStart, utcEnd;
    if (startDate && endDate) {
      utcStart = etToUtcStart(startDate);
      utcEnd = etToUtcEnd(endDate);
    } else {
      const d = days || 7;
      utcStart = new Date(Date.now() - d * 86400000).toISOString();
      utcEnd = new Date().toISOString();
    }

    // Build query with dynamic filters
    let query = `SELECT id, session_id, email, name, product,
      arousal_template_type, neuropathway, attachment_style,
      codependency_score, enmeshment_score, relational_void_score, leadership_burden_score,
      escalation_present, strategies_count, years_fighting,
      report_url, report_generated_at, geo_city, geo_region, geo_country,
      traffic_source, created_at
      FROM completed_diagnostics WHERE product = 'udrm'
      AND created_at >= '${utcStart}' AND created_at < '${utcEnd}'`;

    if (email) query += ` AND email = '${email.replace(/'/g, "''")}'`;
    if (arousalTemplate) query += ` AND arousal_template_type = '${arousalTemplate.replace(/'/g, "''")}'`;
    if (attachmentStyle) query += ` AND attachment_style = '${attachmentStyle.replace(/'/g, "''")}'`;
    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const rows = await db(query);

    const [countRow] = await db(`SELECT COUNT(*) as total FROM completed_diagnostics
      WHERE product = 'udrm' AND created_at >= '${utcStart}' AND created_at < '${utcEnd}'`);

    return {
      content: [{ type: "text", text: JSON.stringify({ total: parseInt(countRow.total), returned: rows.length, offset, rows }, null, 2) }],
    };
  }
);

// ── Tool: get_full_analysis ─────────────────────────────────────
server.tool(
  "get_full_analysis",
  "Get the complete AI-generated diagnostic analysis from Redis for a specific email. Contains root narratives, behavior-root maps, strategy breakdowns, key insights, closing statements, attachment analysis, generational lens, and 30+ fields. This is the richest data per person.",
  {
    email: z.string().describe("Email address of the person to look up"),
  },
  async ({ email }) => {
    const r = getRedis();
    const normalized = email.trim().toLowerCase();

    const [analysisRaw, userRaw, reportRaw] = await Promise.all([
      r.get(`mkt:analysis:${normalized}`),
      r.get(`mkt:user:${normalized}`),
      r.get(`mkt:report:${normalized}`),
    ]);

    const analysis = parseRedis(analysisRaw);
    const user = parseRedis(userRaw);
    const report = parseRedis(reportRaw);

    if (!analysis) {
      return { content: [{ type: "text", text: JSON.stringify({ found: false, email: normalized, message: "No analysis found in Redis for this email" }) }] };
    }

    const { _usage, ...cleanAnalysis } = analysis;
    return {
      content: [{ type: "text", text: JSON.stringify({ found: true, email: normalized, user, report, analysis: cleanAnalysis }, null, 2) }],
    };
  }
);

// ── Tool: search_clients ────────────────────────────────────────
server.tool(
  "search_clients",
  "Search for quiz clients by name or email pattern. Returns matching diagnostic records with latest results.",
  {
    query: z.string().describe("Search term — matches against name or email (minimum 2 characters)"),
    limit: z.number().describe("Max results (default 20, max 50)").optional(),
  },
  async ({ query, limit = 20 }) => {
    const db = getDb();
    limit = Math.min(50, Math.max(1, limit));
    const searchTerm = `%${query}%`;

    const rows = await db`
      SELECT DISTINCT ON (email)
        email, name, arousal_template_type, neuropathway, attachment_style,
        codependency_score, enmeshment_score, relational_void_score, leadership_burden_score,
        report_url, report_generated_at, geo_city, geo_region, geo_country, created_at
      FROM completed_diagnostics
      WHERE email ILIKE ${searchTerm} OR name ILIKE ${searchTerm}
      ORDER BY email, report_generated_at DESC
      LIMIT ${limit}
    `;

    return {
      content: [{ type: "text", text: JSON.stringify({ count: rows.length, clients: rows }, null, 2) }],
    };
  }
);

// ── Tool: get_quiz_responses ────────────────────────────────────
server.tool(
  "get_quiz_responses",
  "Get raw quiz responses (individual question answers) from PostgreSQL. Filter by session_id, email, or date range.",
  {
    sessionId: z.string().describe("Filter by session_id").optional(),
    email: z.string().describe("Filter by email").optional(),
    startDate: z.string().describe("Start date YYYY-MM-DD Eastern Time").optional(),
    endDate: z.string().describe("End date YYYY-MM-DD Eastern Time").optional(),
    limit: z.number().describe("Max rows (default 100, max 500)").optional(),
  },
  async ({ sessionId, email, startDate, endDate, limit = 100 }) => {
    const db = getDb();
    limit = Math.min(500, Math.max(1, limit));

    let utcStart, utcEnd;
    if (startDate && endDate) {
      utcStart = etToUtcStart(startDate);
      utcEnd = etToUtcEnd(endDate);
    }

    let query = `SELECT * FROM quiz_responses WHERE product = 'udrm'`;
    if (sessionId) query += ` AND session_id = '${sessionId.replace(/'/g, "''")}'`;
    if (email) query += ` AND email = '${email.replace(/'/g, "''").trim().toLowerCase()}'`;
    if (utcStart && utcEnd) query += ` AND created_at >= '${utcStart}' AND created_at < '${utcEnd}'`;
    query += ` ORDER BY section_num, created_at ASC LIMIT ${limit}`;

    const rows = await db(query);
    return { content: [{ type: "text", text: JSON.stringify({ count: rows.length, responses: rows }, null, 2) }] };
  }
);

// ── Tool: get_funnel_metrics ────────────────────────────────────
server.tool(
  "get_funnel_metrics",
  "Get quiz funnel metrics: quiz starts, section completions, contact captures, reports generated, and conversion rates for a date range.",
  {
    startDate: z.string().describe("Start date YYYY-MM-DD Eastern Time"),
    endDate: z.string().describe("End date YYYY-MM-DD Eastern Time"),
  },
  async ({ startDate, endDate }) => {
    const db = getDb();
    const utcStart = etToUtcStart(startDate);
    const utcEnd = etToUtcEnd(endDate);

    const funnel = await db`
      SELECT event_type, COUNT(DISTINCT session_id) as unique_sessions
      FROM analytics_events
      WHERE product = 'udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
      GROUP BY event_type
      ORDER BY unique_sessions DESC
    `;

    const daily = await db`
      SELECT DATE(created_at) as date, COUNT(*) as completions
      FROM completed_diagnostics
      WHERE product = 'udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    return { content: [{ type: "text", text: JSON.stringify({ funnel, daily }, null, 2) }] };
  }
);

// ── Tool: get_aggregate_stats ───────────────────────────────────
server.tool(
  "get_aggregate_stats",
  "Get aggregate diagnostic statistics: arousal template distribution, attachment style breakdown, neuropathway distribution, average relational scores, strategy counts, and duration distribution for a date range.",
  {
    startDate: z.string().describe("Start date YYYY-MM-DD Eastern Time"),
    endDate: z.string().describe("End date YYYY-MM-DD Eastern Time"),
  },
  async ({ startDate, endDate }) => {
    const db = getDb();
    const utcStart = etToUtcStart(startDate);
    const utcEnd = etToUtcEnd(endDate);

    const [arousalTypes, attachmentStyles, neuropathways, avgScores, totalRow] = await Promise.all([
      db`SELECT arousal_template_type as type, COUNT(*) as count FROM completed_diagnostics
        WHERE product='udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
        GROUP BY arousal_template_type ORDER BY count DESC`,
      db`SELECT attachment_style as style, COUNT(*) as count FROM completed_diagnostics
        WHERE product='udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
        GROUP BY attachment_style ORDER BY count DESC`,
      db`SELECT neuropathway, COUNT(*) as count FROM completed_diagnostics
        WHERE product='udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
        GROUP BY neuropathway ORDER BY count DESC`,
      db`SELECT
          AVG(codependency_score) as avg_codependency,
          AVG(enmeshment_score) as avg_enmeshment,
          AVG(relational_void_score) as avg_relational_void,
          AVG(leadership_burden_score) as avg_leadership_burden,
          AVG(strategies_count) as avg_strategies,
          SUM(CASE WHEN escalation_present THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as escalation_rate
        FROM completed_diagnostics
        WHERE product='udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}`,
      db`SELECT COUNT(*) as total FROM completed_diagnostics
        WHERE product='udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}`,
    ]);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          total: parseInt(totalRow[0].total),
          arousalTemplateTypes: arousalTypes,
          attachmentStyles,
          neuropathways,
          averageScores: avgScores[0],
        }, null, 2),
      }],
    };
  }
);

// ── Tool: get_pipeline_metrics ──────────────────────────────────
server.tool(
  "get_pipeline_metrics",
  "Get API pipeline metrics: Claude API costs, token usage, email delivery stats, and failure rates. Useful for monitoring system health and costs.",
  {
    days: z.number().describe("Look back N days (default 7)").optional(),
  },
  async ({ days = 7 }) => {
    const db = getDb();
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const metrics = await db`
      SELECT service, event_type, COUNT(*) as count,
        SUM(tokens_input) as total_input_tokens,
        SUM(tokens_output) as total_output_tokens,
        SUM(cost_cents) as total_cost_cents,
        AVG(duration_ms) as avg_duration_ms
      FROM pipeline_metrics
      WHERE created_at >= ${since}
      GROUP BY service, event_type
      ORDER BY count DESC
    `;

    return { content: [{ type: "text", text: JSON.stringify({ days, metrics }, null, 2) }] };
  }
);

// ── Tool: run_sql_query ─────────────────────────────────────────
server.tool(
  "run_sql_query",
  "Run a read-only SQL SELECT query against the PostgreSQL database. Only SELECT statements are allowed. Use this for custom analytics queries not covered by other tools.",
  {
    query: z.string().describe("SQL SELECT query to execute. Must start with SELECT."),
  },
  async ({ query }) => {
    if (!query.trim().toUpperCase().startsWith("SELECT")) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "Only SELECT queries are allowed" }) }] };
    }
    const db = getDb();
    const rows = await db(query);
    return { content: [{ type: "text", text: JSON.stringify({ rowCount: rows.length, rows }, null, 2) }] };
  }
);

// ── Start server ────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
