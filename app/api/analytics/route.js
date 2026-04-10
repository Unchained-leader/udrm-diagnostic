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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate + "T23:59:59").toISOString() : new Date("2099-12-31T23:59:59").toISOString();
    const sql = getDb();

    if (view === "funnel") {
      // Funnel conversion data
      const funnel = await sql`
        SELECT event_type, COUNT(DISTINCT session_id) as unique_sessions
        FROM analytics_events
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
        GROUP BY event_type
        ORDER BY unique_sessions DESC
      `;

      // Daily completions
      const daily = await sql`
        SELECT DATE(created_at) as date, COUNT(DISTINCT session_id) as completions
        FROM analytics_events
        WHERE product = ${product} AND event_type = 'contact_capture_complete' AND created_at >= ${since} AND created_at <= ${until}
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      return Response.json({ funnel, daily }, { headers: CORS_HEADERS });

    } else if (view === "research") {
      // Answer distributions per section
      const distributions = await sql`
        SELECT section_num, unnest(selections) as selection, COUNT(*) as count
        FROM quiz_responses
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
        GROUP BY section_num, selection
        ORDER BY section_num, count DESC
      `;

      // Completed diagnostic breakdowns
      const diagnostics = await sql`
        SELECT
          arousal_template_type, COUNT(*) as count
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
        GROUP BY arousal_template_type
        ORDER BY count DESC
      `;

      const attachments = await sql`
        SELECT attachment_style, COUNT(*) as count
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
        GROUP BY attachment_style
        ORDER BY count DESC
      `;

      const neuropathways = await sql`
        SELECT neuropathway, COUNT(*) as count
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
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
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
      `;

      return Response.json({ distributions, diagnostics, attachments, neuropathways, relational }, { headers: CORS_HEADERS });

    } else if (view === "dropoff") {
      // Section-by-section drop-off analysis
      const sections = await sql`
        SELECT event_type, COUNT(DISTINCT session_id) as users
        FROM analytics_events
        WHERE product = ${product}
          AND event_type LIKE 'section_%'
          AND created_at >= ${since} AND created_at <= ${until}
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
          AND a1.created_at >= ${since} AND a1.created_at <= ${until}
        GROUP BY a1.event_type, a2.event_type
      `;

      return Response.json({ sections, timing }, { headers: CORS_HEADERS });

    } else if (view === "summary") {
      const total = await sql`
        SELECT COUNT(DISTINCT session_id) as total FROM analytics_events
        WHERE product = ${product} AND event_type = 'quiz_start' AND created_at >= ${since} AND created_at <= ${until}
      `;
      const completed = await sql`
        SELECT COUNT(DISTINCT session_id) as total FROM analytics_events
        WHERE product = ${product} AND event_type = 'contact_capture_complete' AND created_at >= ${since} AND created_at <= ${until}
      `;
      const reports = await sql`
        SELECT COUNT(DISTINCT session_id) as total FROM analytics_events
        WHERE product = ${product} AND event_type = 'report_generated' AND created_at >= ${since} AND created_at <= ${until}
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
        WHERE product = ${product} AND event_type = 'quiz_start' AND created_at >= ${since} AND created_at <= ${until}
          AND event_data->'device' IS NOT NULL
        GROUP BY event_data->>'device'->>'type'
      `.catch(() => []);

      // Fallback: parse device from event_data JSON
      const deviceRaw = await sql`
        SELECT event_data::text as raw, session_id
        FROM analytics_events
        WHERE product = ${product} AND event_type = 'quiz_start' AND created_at >= ${since} AND created_at <= ${until}
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
          report_url, traffic_source, created_at
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      const totalSubmissions = await sql`
        SELECT COUNT(*) as total FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
      `;

      // Location breakdown
      const locationBreakdown = await sql`
        SELECT geo_country, geo_region, geo_city, COUNT(*) as count
        FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since} AND created_at <= ${until}
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

    } else if (view === "export") {
      // Export tab renders client-side download links to /api/analytics/export;
      // no server-side data needed, just return an empty success response.
      return Response.json({}, { headers: CORS_HEADERS });

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

    } else if (view === "pipeline") {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const tpmLimit = parseInt(process.env.ANTHROPIC_OUTPUT_TPM_LIMIT || "8000", 10);

      // Summary counts
      const [counts] = await sql`SELECT
        COUNT(*) FILTER (WHERE event_type = 'report_complete') as reports_complete,
        COUNT(*) FILTER (WHERE event_type = 'report_failed') as reports_failed,
        COUNT(*) FILTER (WHERE event_type = 'rate_limited') as rate_limited,
        COUNT(*) FILTER (WHERE event_type = 'email_sent') as emails_sent,
        COALESCE(SUM(tokens_input) FILTER (WHERE event_type = 'report_complete'), 0) as total_input_tokens,
        COALESCE(SUM(tokens_output) FILTER (WHERE event_type = 'report_complete'), 0) as total_output_tokens,
        COALESCE(SUM(cost_cents) FILTER (WHERE event_type = 'report_complete'), 0) as total_cost_cents,
        COALESCE(AVG(duration_ms) FILTER (WHERE event_type = 'report_complete'), 0) as avg_duration_ms,
        COALESCE(AVG(tokens_input) FILTER (WHERE event_type = 'report_complete'), 0) as avg_input_tokens,
        COALESCE(AVG(tokens_output) FILTER (WHERE event_type = 'report_complete'), 0) as avg_output_tokens
        FROM pipeline_metrics WHERE created_at >= ${since}`;

      // Hourly breakdown (last 24h)
      const hourly = await sql`SELECT
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) FILTER (WHERE event_type = 'report_complete') as reports,
        COUNT(*) FILTER (WHERE event_type = 'report_failed') as failures,
        COUNT(*) FILTER (WHERE event_type = 'rate_limited') as rate_limits
        FROM pipeline_metrics WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', created_at) ORDER BY hour`;

      // Current velocity
      const [vel1] = await sql`SELECT COUNT(*) as c FROM pipeline_metrics WHERE event_type = 'report_complete' AND created_at >= NOW() - INTERVAL '1 minute'`;
      const [vel5] = await sql`SELECT COUNT(*) as c FROM pipeline_metrics WHERE event_type = 'report_complete' AND created_at >= NOW() - INTERVAL '5 minutes'`;
      const [vel60] = await sql`SELECT COUNT(*) as c FROM pipeline_metrics WHERE event_type = 'report_complete' AND created_at >= NOW() - INTERVAL '60 minutes'`;

      // Current TPM (output tokens in last 60s)
      const [tpmRow] = await sql`SELECT COALESCE(SUM(tokens_output), 0) as total FROM pipeline_metrics
        WHERE service = 'anthropic' AND event_type = 'report_complete' AND created_at > NOW() - INTERVAL '60 seconds'`;

      // Today's email count
      const [emailToday] = await sql`SELECT COUNT(*) as c FROM pipeline_metrics WHERE service = 'resend' AND event_type = 'email_sent' AND created_at > CURRENT_DATE`;

      // Recent rate limit events
      const rateLimitEvents = await sql`SELECT created_at, email, error_message FROM pipeline_metrics
        WHERE event_type = 'rate_limited' AND created_at >= ${since} ORDER BY created_at DESC LIMIT 20`;

      // Recent failures
      const failureEvents = await sql`SELECT created_at, email, error_message FROM pipeline_metrics
        WHERE event_type = 'report_failed' AND created_at >= ${since} ORDER BY created_at DESC LIMIT 20`;

      return Response.json({
        counts: {
          reportsComplete: parseInt(counts.reports_complete),
          reportsFailed: parseInt(counts.reports_failed),
          rateLimited: parseInt(counts.rate_limited),
          emailsSent: parseInt(counts.emails_sent),
          totalInputTokens: parseInt(counts.total_input_tokens),
          totalOutputTokens: parseInt(counts.total_output_tokens),
          totalCostCents: parseFloat(counts.total_cost_cents),
          avgDurationMs: Math.round(parseFloat(counts.avg_duration_ms)),
          avgInputTokens: Math.round(parseFloat(counts.avg_input_tokens)),
          avgOutputTokens: Math.round(parseFloat(counts.avg_output_tokens)),
        },
        hourly,
        velocity: { last1min: parseInt(vel1.c), last5min: parseInt(vel5.c), last60min: parseInt(vel60.c) },
        capacity: { currentOutputTPM: parseInt(tpmRow.total), tpmLimit, pctUsed: Math.round(parseInt(tpmRow.total) / tpmLimit * 100) },
        emailsToday: parseInt(emailToday.c),
        rateLimitEvents,
        failureEvents,
      }, { headers: CORS_HEADERS });

    } else if (view === "referrers") {
      // Fetch all quiz_start event_data and parse referrer info client-side style
      const raw = await sql`
        SELECT event_data::text as raw, session_id, created_at
        FROM analytics_events
        WHERE product = ${product} AND event_type = 'quiz_start' AND created_at >= ${since} AND created_at <= ${until}
      `;

      // Parse referrer data from JSONB
      const domainCounts = {};
      const sourceCounts = {};
      const mediumCounts = {};
      const campaignCounts = {};
      const dailyCounts = {};
      const recentReferrers = [];
      let withReferrer = 0;
      const sessionReferrers = {};

      for (const row of raw) {
        try {
          const d = JSON.parse(row.raw);
          const ref = d?.referrer || {};
          const domain = ref.referrerDomain || "";
          const source = ref.utmSource || "";
          const medium = ref.utmMedium || "";
          const campaign = ref.utmCampaign || "";
          const hasReferrer = domain || source;

          if (hasReferrer) withReferrer++;

          // Track domain counts
          const domainKey = domain || (source ? `utm:${source}` : "Direct");
          domainCounts[domainKey] = (domainCounts[domainKey] || 0) + 1;

          // UTM breakdowns
          if (source) sourceCounts[source] = (sourceCounts[source] || 0) + 1;
          if (medium) mediumCounts[medium] = (mediumCounts[medium] || 0) + 1;
          if (campaign) campaignCounts[campaign] = (campaignCounts[campaign] || 0) + 1;

          // Daily trend
          const dateKey = new Date(row.created_at).toISOString().split("T")[0];
          if (!dailyCounts[dateKey]) dailyCounts[dateKey] = { total: 0, withRef: 0 };
          dailyCounts[dateKey].total++;
          if (hasReferrer) dailyCounts[dateKey].withRef++;

          // Store session referrer for conversion lookup
          sessionReferrers[row.session_id] = domainKey;

          // Recent entries (collect all, slice later)
          recentReferrers.push({
            sessionId: row.session_id,
            date: row.created_at,
            referrerDomain: domain || "Direct",
            referrerUrl: ref.referrerUrl || "",
            utmSource: source,
            utmMedium: medium,
            utmCampaign: campaign,
            utmContent: ref.utmContent || "",
            utmTerm: ref.utmTerm || "",
            landingPage: ref.landingPage || "",
          });
        } catch (e) {}
      }

      // Get completion sessions for conversion calculation
      const completedSessions = await sql`
        SELECT DISTINCT session_id
        FROM analytics_events
        WHERE product = ${product} AND event_type = 'contact_capture_complete' AND created_at >= ${since} AND created_at <= ${until}
      `;
      const completedSet = new Set(completedSessions.map(r => r.session_id));

      // Calculate conversion by source
      const sourceConversions = {};
      for (const [sessionId, source] of Object.entries(sessionReferrers)) {
        if (!sourceConversions[source]) sourceConversions[source] = { sessions: 0, completed: 0 };
        sourceConversions[source].sessions++;
        if (completedSet.has(sessionId)) sourceConversions[source].completed++;
      }

      // Mark recent referrers with completion status
      const recentWithStatus = recentReferrers
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 50)
        .map(r => ({ ...r, completed: completedSet.has(r.sessionId) }));

      // Sort and format results
      const toSorted = (obj) => Object.entries(obj)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);

      const dailyTrend = Object.entries(dailyCounts)
        .map(([date, counts]) => ({ date, ...counts }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const conversionTable = Object.entries(sourceConversions)
        .map(([source, data]) => ({
          source,
          sessions: data.sessions,
          completed: data.completed,
          rate: data.sessions > 0 ? ((data.completed / data.sessions) * 100).toFixed(1) : "0",
        }))
        .sort((a, b) => b.sessions - a.sessions);

      return Response.json({
        totalSessions: raw.length,
        withReferrer,
        referrerPct: raw.length > 0 ? ((withReferrer / raw.length) * 100).toFixed(1) : "0",
        domains: toSorted(domainCounts).slice(0, 30),
        utmSources: toSorted(sourceCounts).slice(0, 20),
        utmMediums: toSorted(mediumCounts).slice(0, 20),
        utmCampaigns: toSorted(campaignCounts).slice(0, 20),
        dailyTrend,
        conversions: conversionTable.slice(0, 30),
        recent: recentWithStatus,
      }, { headers: CORS_HEADERS });
    }

    return Response.json({ error: "Invalid view" }, { status: 400, headers: CORS_HEADERS });
  } catch (error) {
    console.error("Analytics query error:", error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
