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

    // Build message
    const hasData = starts > 0;
    let message;
    if (hasData) {
      message = `:bar_chart: *DAILY PERFORMANCE SUMMARY*\n${dateLabel}\n\n`
        + `*Quiz Starts:* ${starts}\n`
        + `*Completions:* ${completions}\n`
        + `*Reports Generated:* ${reports}\n`
        + `*Conversion Rate:* ${convRate}%\n\n`
        + `*Biggest Drop-off:* ${biggestDrop}\n`
        + `*Most Selected Behavior:* ${topBehavior}\n\n`
        + `Full dashboard: https://unchained-marketing-coach.vercel.app/admin/dashboard`;
    } else {
      message = `:bar_chart: *DAILY PERFORMANCE SUMMARY*\n${dateLabel}\n\nNo quiz activity yesterday. Dashboard: https://unchained-marketing-coach.vercel.app/admin/dashboard`;
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
