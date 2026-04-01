import { getDb } from "../../lib/db";
import redis from "../../lib/redis";
import { normalizeEmail, parseRedis } from "../../lib/utils";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const query = searchParams.get("q") || "";

  if (!secret || secret !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!query || query.length < 2) {
    return Response.json({ error: "Search query must be at least 2 characters" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const searchTerm = `%${query}%`;

    // Search completed_diagnostics by email or name
    const rows = await sql`
      SELECT DISTINCT ON (email)
        email, name, arousal_template_type, neuropathway, attachment_style,
        report_url, report_generated_at, ip_address, geo_city, geo_region, geo_country
      FROM completed_diagnostics
      WHERE email ILIKE ${searchTerm} OR name ILIKE ${searchTerm}
      ORDER BY email, report_generated_at DESC
      LIMIT 50
    `;

    // Get report count and history from Redis for each client
    const clients = await Promise.all(rows.map(async (row) => {
      const email = normalizeEmail(row.email);
      let reportCount = 1;
      let allReports = [];

      try {
        const history = await redis.get(`mkt:history:${email}`);
        const parsed = Array.isArray(history) ? history : parseRedis(history);
        if (Array.isArray(parsed)) {
          reportCount = parsed.length;
          allReports = parsed.map((r, i) => ({
            index: i + 1,
            generatedAt: r.generatedAt,
            reportUrl: r.reportUrl,
            arousalTemplateType: r.arousalTemplateType,
          }));
        }
      } catch {}

      return {
        email: row.email,
        name: row.name,
        arousalTemplateType: row.arousal_template_type,
        neuropathway: row.neuropathway,
        attachmentStyle: row.attachment_style,
        latestReportUrl: row.report_url,
        latestReportDate: row.report_generated_at,
        location: [row.geo_city, row.geo_region, row.geo_country].filter(Boolean).join(", "),
        reportCount,
        allReports,
      };
    }));

    return Response.json({ clients, count: clients.length });
  } catch (error) {
    console.error("Admin client search error:", error.message);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}
