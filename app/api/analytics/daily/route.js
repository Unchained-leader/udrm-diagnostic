import { getDb } from "../../lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    const sql = getDb();
    const SLACK_URL = process.env.SLACK_WEBHOOK_URL;
    if (!SLACK_URL) {
      return Response.json({ error: "SLACK_WEBHOOK_URL not configured" }, { status: 500, headers: CORS_HEADERS });
    }

    // Yesterday's stats (UTC, but 8AM ET = 12/13 UTC so "yesterday" is correct)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayStart = yesterday.toISOString().split("T")[0] + "T00:00:00Z";
    const dayEnd = yesterday.toISOString().split("T")[0] + "T23:59:59Z";
    const dateLabel = yesterday.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    // Quiz starts
    const startsRes = await sql`SELECT COUNT(DISTINCT session_id) as c FROM analytics_events WHERE event_type = 'quiz_start' AND product = 'udrm' AND created_at >= ${dayStart}::timestamp AND created_at <= ${dayEnd}::timestamp`;
    const starts = parseInt(startsRes[0]?.c) || 0;

    // Completions (contact capture)
    const completionsRes = await sql`SELECT COUNT(DISTINCT session_id) as c FROM analytics_events WHERE event_type = 'contact_capture_complete' AND product = 'udrm' AND created_at >= ${dayStart}::timestamp AND created_at <= ${dayEnd}::timestamp`;
    const completions = parseInt(completionsRes[0]?.c) || 0;

    // Reports generated
    const reportsRes = await sql`SELECT COUNT(DISTINCT session_id) as c FROM analytics_events WHERE event_type = 'report_generated' AND product = 'udrm' AND created_at >= ${dayStart}::timestamp AND created_at <= ${dayEnd}::timestamp`;
    const reports = parseInt(reportsRes[0]?.c) || 0;

    // Conversion rate
    const convRate = starts > 0 ? ((completions / starts) * 100).toFixed(1) : "0.0";

    // Drop-off: find biggest drop between consecutive sections
    const sectionEvents = [
      "quiz_start", "section_1_complete", "section_2_complete", "section_3_complete",
      "section_4_complete", "section_5_complete", "section_6_complete", "section_7_complete",
      "section_8_complete"
    ];
    const sectionCounts = [];
    for (const evt of sectionEvents) {
      const res = await sql`SELECT COUNT(DISTINCT session_id) as c FROM analytics_events WHERE event_type = ${evt} AND product = 'udrm' AND created_at >= ${dayStart}::timestamp AND created_at <= ${dayEnd}::timestamp`;
      sectionCounts.push({ event: evt, count: parseInt(res[0]?.c) || 0 });
    }

    let biggestDrop = "None detected";
    let biggestDropPct = 0;
    for (let i = 1; i < sectionCounts.length; i++) {
      const prev = sectionCounts[i - 1].count;
      const curr = sectionCounts[i].count;
      if (prev > 0) {
        const dropPct = ((prev - curr) / prev) * 100;
        if (dropPct > biggestDropPct) {
          biggestDropPct = dropPct;
          const sectionName = sectionCounts[i].event.replace("section_", "Section ").replace("_complete", "").replace("quiz_start", "Start");
          biggestDrop = `${sectionName} (${dropPct.toFixed(0)}% drop)`;
        }
      }
    }

    // Most selected behavior (Section 1)
    let topBehavior = "N/A";
    try {
      const behaviorRes = await sql`
        SELECT unnest(selections) as sel, COUNT(*) as c
        FROM quiz_responses
        WHERE section_num = 1 AND product = 'udrm'
        AND created_at >= ${dayStart}::timestamp AND created_at <= ${dayEnd}::timestamp
        GROUP BY sel ORDER BY c DESC LIMIT 1`;
      if (behaviorRes.length > 0) {
        const labels = {
          viewing_porn: "Viewing pornography",
          scrolling_social: "Scrolling sexual content",
          fantasy_daydream: "Sexual fantasy/daydreaming",
          compulsive_mb: "Compulsive masturbation",
          sexting: "Sexting",
          physical_acting: "Physical acting out"
        };
        topBehavior = labels[behaviorRes[0].sel] || behaviorRes[0].sel;
      }
    } catch (e) { /* ignore */ }

    // ── TREND ANALYSIS: 3-day, 7-day, 30-day windows ──
    async function getWindowStats(daysBack) {
      const from = new Date();
      from.setDate(from.getDate() - daysBack);
      const fromStr = from.toISOString();
      const sRes = await sql`SELECT COUNT(DISTINCT session_id) as c FROM analytics_events WHERE event_type = 'quiz_start' AND product = 'udrm' AND created_at >= ${fromStr}::timestamp`;
      const cRes = await sql`SELECT COUNT(DISTINCT session_id) as c FROM analytics_events WHERE event_type = 'contact_capture_complete' AND product = 'udrm' AND created_at >= ${fromStr}::timestamp`;
      const s = parseInt(sRes[0]?.c) || 0;
      const c = parseInt(cRes[0]?.c) || 0;
      const rate = s > 0 ? ((c / s) * 100).toFixed(1) : "0.0";
      const dailyAvgStarts = (s / daysBack).toFixed(1);
      const dailyAvgCompletions = (c / daysBack).toFixed(1);
      return { starts: s, completions: c, rate, dailyAvgStarts, dailyAvgCompletions, days: daysBack };
    }

    const d3 = await getWindowStats(3);
    const d7 = await getWindowStats(7);
    const d30 = await getWindowStats(30);

    // Determine trajectory
    let trajectory = "";
    const r3 = parseFloat(d3.rate);
    const r7 = parseFloat(d7.rate);
    const r30 = parseFloat(d30.rate);

    if (r3 > r7 && r7 > r30) {
      trajectory = ":chart_with_upwards_trend: *Trajectory: Accelerating.* Conversion rate is climbing across all windows. Current momentum is strong.";
    } else if (r3 > r7) {
      trajectory = ":chart_with_upwards_trend: *Trajectory: Improving.* Short-term conversion is trending up vs the 7-day average. Keep current ad strategy running.";
    } else if (r3 < r7 && r7 < r30) {
      trajectory = ":chart_with_downwards_trend: *Trajectory: Declining.* Conversion rate is dropping across all windows. Review ad targeting, landing page, or quiz friction.";
    } else if (r3 < r7) {
      trajectory = ":small_red_triangle_down: *Trajectory: Softening.* Short-term conversion dipped below the 7-day average. Could be normal variance, or early signal. Monitor closely.";
    } else if (d3.starts === 0) {
      trajectory = ":warning: *Trajectory: No recent data.* Zero quiz starts in the last 3 days. Ads may be paused or landing page may be down.";
    } else {
      trajectory = ":heavy_minus_sign: *Trajectory: Stable.* Conversion rate is holding steady across all windows.";
    }

    // Volume trend
    let volumeTrend = "";
    const avg3 = parseFloat(d3.dailyAvgStarts);
    const avg7 = parseFloat(d7.dailyAvgStarts);
    const avg30 = parseFloat(d30.dailyAvgStarts);
    if (avg3 > avg7 * 1.2) {
      volumeTrend = "Volume is surging, 3-day daily average is 20%+ above the 7-day average.";
    } else if (avg3 < avg7 * 0.8) {
      volumeTrend = "Volume is dropping, 3-day daily average is 20%+ below the 7-day average. Check ad spend or delivery.";
    } else {
      volumeTrend = "Volume is consistent with recent averages.";
    }

    // 7-day forecast
    const forecastWeeklyStarts = (avg7 * 7).toFixed(0);
    const forecastWeeklyCompletions = (parseFloat(d7.dailyAvgCompletions) * 7).toFixed(0);

    // Build message
    const hasData = starts > 0 || d3.starts > 0;
    let message;
    if (hasData) {
      message = `:bar_chart: *DAILY PERFORMANCE SUMMARY*\n${dateLabel}\n\n`
        + `*Yesterday:*\n`
        + `Quiz Starts: ${starts}  |  Completions: ${completions}  |  Reports: ${reports}  |  Conversion: ${convRate}%\n`
        + `Biggest Drop-off: ${biggestDrop}\n\n`
        + `───────────────────\n`
        + `:mag: *TREND ANALYSIS*\n\n`
        + `*Last 3 Days:* ${d3.starts} starts, ${d3.completions} completions, ${d3.rate}% conversion (${d3.dailyAvgStarts}/day avg)\n`
        + `*Last 7 Days:* ${d7.starts} starts, ${d7.completions} completions, ${d7.rate}% conversion (${d7.dailyAvgStarts}/day avg)\n`
        + `*Last 30 Days:* ${d30.starts} starts, ${d30.completions} completions, ${d30.rate}% conversion (${d30.dailyAvgStarts}/day avg)\n\n`
        + `${trajectory}\n`
        + `${volumeTrend}\n\n`
        + `*7-Day Forecast (at current pace):* ~${forecastWeeklyStarts} starts, ~${forecastWeeklyCompletions} completions\n\n`
        + `───────────────────\n`
        + `Full dashboard: https://unchained-leader.com/admin/dashboard`;
    } else {
      message = `:bar_chart: *DAILY PERFORMANCE SUMMARY*\n${dateLabel}\n\nNo quiz activity in the last 3 days.\n\n`
        + `*30-Day Totals:* ${d30.starts} starts, ${d30.completions} completions, ${d30.rate}% conversion\n\n`
        + `Dashboard: https://unchained-leader.com/admin/dashboard`;
    }

    // Send to Slack (NO @channel tag for daily summaries)
    await fetch(SLACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    return Response.json({ success: true, message: "Daily summary sent", stats: { starts, completions, reports, convRate } }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Daily summary error:", error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
