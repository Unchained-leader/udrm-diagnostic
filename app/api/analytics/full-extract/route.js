import { getDb } from "../../lib/db";
import redis from "../../lib/redis";
import { corsHeaders, optionsResponse } from "../../lib/cors";

const CORS_HEADERS = corsHeaders("GET, OPTIONS");

export async function OPTIONS() {
  return optionsResponse("GET, OPTIONS");
}

/**
 * GET /api/analytics/full-extract
 *
 * Extracts completed diagnostics + Redis analysis data for a date range.
 * Returns combined JSON for marketing analysis.
 *
 * Query params:
 *   secret       - ADMIN_PASSWORD (required)
 *   startDate    - YYYY-MM-DD in Eastern Time (default: today)
 *   endDate      - YYYY-MM-DD in Eastern Time (default: today)
 *   include      - comma-separated: diagnostics,responses,events,redis (default: all)
 *   page         - page number for diagnostics/redis (default: 1)
 *   limit        - results per page (default: 50, max: 100)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    if (secret !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const startDate = searchParams.get("startDate") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("endDate") || startDate;
    const include = (searchParams.get("include") || "diagnostics,responses,events,redis").split(",").map(s => s.trim());
    const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit")) || 50));
    const offset = (page - 1) * limit;

    // Convert ET dates to UTC boundaries (April = EDT = UTC-4)
    const utcStart = etToUtcStart(startDate);
    const utcEnd = etToUtcEnd(endDate);

    const sql = getDb();
    const result = {
      meta: {
        extractedAt: new Date().toISOString(),
        dateRange: { startDate, endDate, utcStart, utcEnd },
        page,
        limit,
        include,
      },
    };

    // ── Completed diagnostics ───────────────────────────────
    if (include.includes("diagnostics")) {
      const [countRow] = await sql`
        SELECT COUNT(*) as total FROM completed_diagnostics
        WHERE product = 'udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
      `;
      const total = parseInt(countRow.total);

      const rows = await sql`
        SELECT
          id, session_id, email, name, product,
          arousal_template_type, neuropathway, attachment_style,
          codependency_score, enmeshment_score, relational_void_score, leadership_burden_score,
          escalation_present, strategies_count, years_fighting,
          report_url, report_generated_at, quiz_started_at, quiz_completed_at,
          geo_city, geo_region, geo_country, traffic_source, created_at
        FROM completed_diagnostics
        WHERE product = 'udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
        ORDER BY created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;

      result.diagnostics = { total, page, limit, totalPages: Math.ceil(total / limit), rows };
    }

    // ── Quiz responses ──────────────────────────────────────
    if (include.includes("responses")) {
      const rows = await sql`
        SELECT id, session_id, email, product, section_num, question_id,
               selections, single_selection, text_response, created_at
        FROM quiz_responses
        WHERE product = 'udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
        ORDER BY session_id, section_num, created_at ASC
      `;
      result.responses = { total: rows.length, rows };
    }

    // ── Analytics events ────────────────────────────────────
    if (include.includes("events")) {
      const rows = await sql`
        SELECT session_id, product, event_type, event_data,
               geo_city, geo_region, geo_country, created_at
        FROM analytics_events
        WHERE product = 'udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
        ORDER BY created_at ASC
      `;
      result.events = { total: rows.length, rows };
    }

    // ── Redis analysis enrichment ───────────────────────────
    if (include.includes("redis") && result.diagnostics?.rows) {
      const emails = [...new Set(result.diagnostics.rows.map(d => (d.email || "").trim().toLowerCase()).filter(Boolean))];
      const redisData = [];

      for (const email of emails) {
        try {
          const [analysisRaw, userRaw] = await Promise.all([
            redis.get(`mkt:analysis:${email}`),
            redis.get(`mkt:user:${email}`),
          ]);

          const analysis = parseRedisVal(analysisRaw);
          const user = parseRedisVal(userRaw);

          if (analysis) {
            const { _usage, ...cleanAnalysis } = analysis;
            redisData.push({ email, analysis: cleanAnalysis, user: user || null });
          } else {
            redisData.push({ email, analysis: null, user: user || null });
          }
        } catch (e) {
          redisData.push({ email, analysis: null, user: null, error: e.message });
        }
      }

      result.redisAnalyses = { total: redisData.length, found: redisData.filter(r => r.analysis).length, data: redisData };
    }

    return Response.json(result, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Full extract error:", error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function parseRedisVal(val) {
  if (!val) return null;
  return typeof val === "string" ? JSON.parse(val) : val;
}

function etToUtcStart(dateStr) {
  // Determine EDT (UTC-4) vs EST (UTC-5) based on DST rules
  // March-November is EDT (UTC-4), November-March is EST (UTC-5)
  const month = parseInt(dateStr.split("-")[1]);
  const offsetHours = (month >= 3 && month <= 10) ? 4 : 5;
  return new Date(new Date(dateStr + "T00:00:00.000Z").getTime() + offsetHours * 3600000).toISOString();
}

function etToUtcEnd(dateStr) {
  const month = parseInt(dateStr.split("-")[1]);
  const offsetHours = (month >= 3 && month <= 10) ? 4 : 5;
  return new Date(new Date(dateStr + "T23:59:59.999Z").getTime() + offsetHours * 3600000).toISOString();
}
