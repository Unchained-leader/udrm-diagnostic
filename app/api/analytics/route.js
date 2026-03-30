import { getDb } from "../lib/db";
import { corsHeaders, optionsResponse } from "../lib/cors";
import { parseRedis } from "../lib/utils";

const CORS_HEADERS = corsHeaders("POST, GET, OPTIONS");

export async function OPTIONS() {
  return optionsResponse("POST, GET, OPTIONS");
}

// POST: Record an analytics event
export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionId, product, eventType, eventData, selections, sectionNum, questionId, singleSelection, textResponse, email } = body;

    if (!sessionId || !eventType) {
      return Response.json({ error: "sessionId and eventType required" }, { status: 400, headers: CORS_HEADERS });
    }

    // Extract geo data from Vercel headers
    const hdrs = request.headers;
    const geoIp = (hdrs.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const geoCity = hdrs.get("x-vercel-ip-city") || null;
    const geoRegion = hdrs.get("x-vercel-ip-country-region") || null;
    const geoCountry = hdrs.get("x-vercel-ip-country") || null;
    const geoLat = hdrs.get("x-vercel-ip-latitude") ? parseFloat(hdrs.get("x-vercel-ip-latitude")) : null;
    const geoLon = hdrs.get("x-vercel-ip-longitude") ? parseFloat(hdrs.get("x-vercel-ip-longitude")) : null;

    const sql = getDb();

    // Record the event
    await sql`
      INSERT INTO analytics_events (session_id, product, event_type, event_data, ip_address, geo_city, geo_region, geo_country, geo_lat, geo_lon)
      VALUES (${sessionId}, ${product || "udrm"}, ${eventType}, ${JSON.stringify(eventData || {})}, ${geoIp}, ${geoCity}, ${geoRegion}, ${geoCountry}, ${geoLat}, ${geoLon})
    `;

    // If this includes quiz response data, also save to quiz_responses
    if (selections || singleSelection) {
      await sql`
        INSERT INTO quiz_responses (session_id, email, product, section_num, question_id, selections, single_selection, text_response)
        VALUES (${sessionId}, ${email || null}, ${product || "udrm"}, ${sectionNum || 0}, ${questionId || null}, ${selections || []}, ${singleSelection || null}, ${textResponse || null})
      `;
    }

    return Response.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Analytics record error:", error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}

// GET: Query analytics data (for dashboard)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    if (secret !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const view = searchParams.get("view") || "funnel";
    const product = searchParams.get("product") || "udrm";
    const days = parseInt(searchParams.get("days")) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const sql = getDb();

    if (view === "funnel") {
      // Funnel conversion data
      const funnel = await sql`
        SELECT event_type, COUNT(DISTINCT session_id) as unique_sessions
        FROM analytics_events
        WHERE product = ${product} AND created_at >= ${since}
        GROUP BY event_type
        ORDER BY unique_sessions DESC
      `;

      // Daily completions
      const daily = await sql`
        SELECT DATE(created_at) as date, COUNT(DISTINCT session_id) as completions
        FROM analytics_events
        WHERE product = ${product} AND event_type = 'contact_capture_complete' AND created_at >= ${since}
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      return Response.json({ funnel, daily }, { headers: CORS_HEADERS });

    } else if (view === "research") {
      // Answer distributions per section
      const distributions = await sql`
        SELECT section_num, unnest(selections) as selection, COUNT(*) as count
        FROM quiz_responses
        WHERE product = ${product} AND created_at >= ${since}
        GROUP BY section_num, selection
        ORDER BY section_num, count DESC
      `;

      // Completed diagnostic breakdowns
      const diagnostics = await sql`
        SELECT
          arousal_template_type, COUNT(*) as count
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since}
        GROUP BY arousal_template_type
        ORDER BY count DESC
      `;

      const attachments = await sql`
        SELECT attachment_style, COUNT(*) as count
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since}
        GROUP BY attachment_style
        ORDER BY count DESC
      `;

      const neuropathways = await sql`
        SELECT neuropathway, COUNT(*) as count
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since}
        GROUP BY neuropathway
        ORDER BY count DESC
      `;

      // Relational scores averages
      const relational = await sql`
        SELECT
          ROUND(AVG(codependency_score)::numeric, 1) as avg_codependency,
          ROUND(AVG(enmeshment_score)::numeric, 1) as avg_enmeshment,
          ROUND(AVG(relational_void_score)::numeric, 1) as avg_relational_void,
          ROUND(AVG(leadership_burden_score)::numeric, 1) as avg_leadership_burden,
          COUNT(*) as total
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since}
      `;

      return Response.json({ distributions, diagnostics, attachments, neuropathways, relational }, { headers: CORS_HEADERS });

    } else if (view === "dropoff") {
      // Section-by-section drop-off analysis
      const sections = await sql`
        SELECT event_type, COUNT(DISTINCT session_id) as users
        FROM analytics_events
        WHERE product = ${product}
          AND event_type LIKE 'section_%'
          AND created_at >= ${since}
        GROUP BY event_type
        ORDER BY event_type
      `;

      // Average time between sections
      const timing = await sql`
        SELECT
          a1.event_type as from_event,
          a2.event_type as to_event,
          ROUND(AVG(EXTRACT(EPOCH FROM (a2.created_at - a1.created_at)))::numeric, 1) as avg_seconds
        FROM analytics_events a1
        JOIN analytics_events a2 ON a1.session_id = a2.session_id
        WHERE a1.product = ${product}
          AND a1.event_type = 'quiz_start'
          AND a2.event_type = 'contact_capture_complete'
          AND a1.created_at >= ${since}
        GROUP BY a1.event_type, a2.event_type
      `;

      return Response.json({ sections, timing }, { headers: CORS_HEADERS });

    } else if (view === "summary") {
      const total = await sql`
        SELECT COUNT(DISTINCT session_id) as total FROM analytics_events
        WHERE product = ${product} AND event_type = 'quiz_start' AND created_at >= ${since}
      `;
      const completed = await sql`
        SELECT COUNT(DISTINCT session_id) as total FROM analytics_events
        WHERE product = ${product} AND event_type = 'contact_capture_complete' AND created_at >= ${since}
      `;
      const reports = await sql`
        SELECT COUNT(DISTINCT session_id) as total FROM analytics_events
        WHERE product = ${product} AND event_type = 'report_generated' AND created_at >= ${since}
      `;

      return Response.json({
        quizStarts: total[0]?.total || 0,
        completions: completed[0]?.total || 0,
        reportsGenerated: reports[0]?.total || 0,
        conversionRate: total[0]?.total > 0 ? ((completed[0]?.total / total[0]?.total) * 100).toFixed(1) : "0",
      }, { headers: CORS_HEADERS });

    } else if (view === "devices") {
      // Device breakdown
      const devices = await sql`
        SELECT
          event_data->>'device'->>'type' as device_type,
          COUNT(DISTINCT session_id) as users
        FROM analytics_events
        WHERE product = ${product} AND event_type = 'quiz_start' AND created_at >= ${since}
          AND event_data->'device' IS NOT NULL
        GROUP BY event_data->>'device'->>'type'
      `.catch(() => []);

      // Fallback: parse device from event_data JSON
      const deviceRaw = await sql`
        SELECT event_data::text as raw, session_id
        FROM analytics_events
        WHERE product = ${product} AND event_type = 'quiz_start' AND created_at >= ${since}
      `;
      const deviceCounts = { mobile: 0, desktop: 0, tablet: 0, unknown: 0 };
      for (const row of deviceRaw) {
        try {
          const d = JSON.parse(row.raw);
          const type = d?.device?.type || "unknown";
          deviceCounts[type] = (deviceCounts[type] || 0) + 1;
        } catch (e) { deviceCounts.unknown++; }
      }

      // Browser breakdown
      const browserCounts = {};
      for (const row of deviceRaw) {
        try {
          const d = JSON.parse(row.raw);
          const browser = d?.device?.browser || "Unknown";
          browserCounts[browser] = (browserCounts[browser] || 0) + 1;
        } catch (e) {}
      }

      return Response.json({ devices: deviceCounts, browsers: browserCounts }, { headers: CORS_HEADERS });

    } else if (view === "cohort") {
      // This week vs last week
      const thisWeekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const lastWeekStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const thisWeek = await sql`
        SELECT event_type, COUNT(DISTINCT session_id) as users
        FROM analytics_events
        WHERE product = ${product} AND created_at >= ${thisWeekStart}
          AND event_type IN ('quiz_start', 'contact_capture_complete', 'report_generated')
        GROUP BY event_type
      `;
      const lastWeek = await sql`
        SELECT event_type, COUNT(DISTINCT session_id) as users
        FROM analytics_events
        WHERE product = ${product} AND created_at >= ${lastWeekStart} AND created_at < ${thisWeekStart}
          AND event_type IN ('quiz_start', 'contact_capture_complete', 'report_generated')
        GROUP BY event_type
      `;

      const toMap = (arr) => {
        const m = {};
        arr.forEach(r => { m[r.event_type] = parseInt(r.users) || 0; });
        return m;
      };

      return Response.json({ thisWeek: toMap(thisWeek), lastWeek: toMap(lastWeek) }, { headers: CORS_HEADERS });

    } else if (view === "health") {
      // Downtime history from health check events
      const checks = await sql`
        SELECT created_at, event_data
        FROM analytics_events
        WHERE session_id = 'system' AND event_type = 'health_check'
        ORDER BY created_at DESC
        LIMIT 100
      `;

      const history = checks.map(c => {
        const d = parseRedis(c.event_data);
        return {
          timestamp: c.created_at,
          status: d.status,
          downServices: d.downServices || [],
        };
      });

      // Calculate uptime percentage
      const total = history.length;
      const healthy = history.filter(h => h.status === "healthy").length;
      const uptimePct = total > 0 ? ((healthy / total) * 100).toFixed(1) : "100.0";

      return Response.json({ history, uptimePct, totalChecks: total }, { headers: CORS_HEADERS });

    } else if (view === "submissions") {
      // Recent submissions with geo data (admin only)
      const limit = parseInt(searchParams.get("limit")) || 25;
      const submissions = await sql`
        SELECT
          id, session_id, email, name, arousal_template_type, attachment_style, neuropathway,
          ip_address, geo_city, geo_region, geo_country, geo_lat, geo_lon,
          report_url, created_at
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      const totalSubmissions = await sql`
        SELECT COUNT(*) as total FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since}
      `;

      // Location breakdown
      const locationBreakdown = await sql`
        SELECT geo_country, geo_region, geo_city, COUNT(*) as count
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since}
          AND geo_country IS NOT NULL
        GROUP BY geo_country, geo_region, geo_city
        ORDER BY count DESC
        LIMIT 20
      `;

      return Response.json({
        submissions,
        total: totalSubmissions[0]?.total || 0,
        locationBreakdown,
      }, { headers: CORS_HEADERS });

    } else if (view === "locations") {
      // Aggregated location data for globe visualization
      const startDate = searchParams.get("startDate");
      const endDate = searchParams.get("endDate");
      let dateSince = since;
      let dateUntil = null;
      if (startDate && endDate) {
        dateSince = new Date(startDate).toISOString();
        dateUntil = new Date(endDate + "T23:59:59").toISOString();
      }

      const locationQuery = dateUntil
        ? sql`
          SELECT
            geo_lat, geo_lon, geo_city, geo_region, geo_country,
            COUNT(*) as count
          FROM completed_diagnostics
          WHERE product = ${product}
            AND created_at >= ${dateSince}
            AND created_at <= ${dateUntil}
            AND geo_lat IS NOT NULL
            AND geo_lon IS NOT NULL
          GROUP BY geo_lat, geo_lon, geo_city, geo_region, geo_country
          ORDER BY count DESC
        `
        : sql`
          SELECT
            geo_lat, geo_lon, geo_city, geo_region, geo_country,
            COUNT(*) as count
          FROM completed_diagnostics
          WHERE product = ${product}
            AND created_at >= ${dateSince}
            AND geo_lat IS NOT NULL
            AND geo_lon IS NOT NULL
          GROUP BY geo_lat, geo_lon, geo_city, geo_region, geo_country
          ORDER BY count DESC
        `;

      const locations = await locationQuery;

      // Summary stats
      const summaryQuery = dateUntil
        ? sql`
          SELECT
            COUNT(*) as total_submissions,
            COUNT(DISTINCT geo_country) as unique_countries,
            COUNT(DISTINCT geo_city) as unique_cities
          FROM completed_diagnostics
          WHERE product = ${product}
            AND created_at >= ${dateSince}
            AND created_at <= ${dateUntil}
            AND geo_lat IS NOT NULL
        `
        : sql`
          SELECT
            COUNT(*) as total_submissions,
            COUNT(DISTINCT geo_country) as unique_countries,
            COUNT(DISTINCT geo_city) as unique_cities
          FROM completed_diagnostics
          WHERE product = ${product}
            AND created_at >= ${dateSince}
            AND geo_lat IS NOT NULL
        `;

      const locationSummary = await summaryQuery;

      // Top locations ranked list
      const topQuery = dateUntil
        ? sql`
          SELECT geo_city, geo_region, geo_country, COUNT(*) as count
          FROM completed_diagnostics
          WHERE product = ${product}
            AND created_at >= ${dateSince}
            AND created_at <= ${dateUntil}
            AND geo_country IS NOT NULL
          GROUP BY geo_city, geo_region, geo_country
          ORDER BY count DESC
          LIMIT 50
        `
        : sql`
          SELECT geo_city, geo_region, geo_country, COUNT(*) as count
          FROM completed_diagnostics
          WHERE product = ${product}
            AND created_at >= ${dateSince}
            AND geo_country IS NOT NULL
          GROUP BY geo_city, geo_region, geo_country
          ORDER BY count DESC
          LIMIT 50
        `;

      const topLocations = await topQuery;

      return Response.json({
        locations,
        summary: locationSummary[0] || { total_submissions: 0, unique_countries: 0, unique_cities: 0 },
        topLocations,
      }, { headers: CORS_HEADERS });

    } else if (view === "trends") {
      // Daily event counts for current period + previous period (for overlay comparison)
      const metric = searchParams.get("metric") || "quiz_start";
      const currentStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const prevStart = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000).toISOString();

      // Current period daily counts
      const current = await sql`
        SELECT DATE(created_at) as date, COUNT(DISTINCT session_id) as count
        FROM analytics_events
        WHERE product = ${product} AND event_type = ${metric} AND created_at >= ${currentStart}
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      // Previous period daily counts
      const previous = await sql`
        SELECT DATE(created_at) as date, COUNT(DISTINCT session_id) as count
        FROM analytics_events
        WHERE product = ${product} AND event_type = ${metric}
          AND created_at >= ${prevStart} AND created_at < ${currentStart}
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      // Also get multiple metrics for multi-line view
      const metrics = ["quiz_start", "contact_capture_complete", "report_generated"];
      const multiCurrent = {};
      const multiPrevious = {};
      for (const m of metrics) {
        multiCurrent[m] = await sql`
          SELECT DATE(created_at) as date, COUNT(DISTINCT session_id) as count
          FROM analytics_events
          WHERE product = ${product} AND event_type = ${m} AND created_at >= ${currentStart}
          GROUP BY DATE(created_at)
          ORDER BY date
        `;
        multiPrevious[m] = await sql`
          SELECT DATE(created_at) as date, COUNT(DISTINCT session_id) as count
          FROM analytics_events
          WHERE product = ${product} AND event_type = ${m}
            AND created_at >= ${prevStart} AND created_at < ${currentStart}
          GROUP BY DATE(created_at)
          ORDER BY date
        `;
      }

      return Response.json({ current, previous, multiCurrent, multiPrevious, days, metric }, { headers: CORS_HEADERS });
    }

    return Response.json({ error: "Invalid view" }, { status: 400, headers: CORS_HEADERS });
  } catch (error) {
    console.error("Analytics query error:", error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
