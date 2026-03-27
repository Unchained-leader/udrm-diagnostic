import sql from "../../lib/db";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    if (secret !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = searchParams.get("type") || "diagnostics";
    const product = searchParams.get("product") || "udrm";
    const days = parseInt(searchParams.get("days")) || 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const sql = getDb();

    let rows = [];
    let headers = [];

    if (type === "diagnostics") {
      rows = await sql`
        SELECT * FROM completed_diagnostics
        WHERE product = ${product} AND created_at >= ${since}
        ORDER BY created_at DESC
      `;
      if (rows.length > 0) headers = Object.keys(rows[0]);

    } else if (type === "responses") {
      rows = await sql`
        SELECT * FROM quiz_responses
        WHERE product = ${product} AND created_at >= ${since}
        ORDER BY created_at DESC
      `;
      if (rows.length > 0) headers = Object.keys(rows[0]);

    } else if (type === "events") {
      rows = await sql`
        SELECT session_id, product, event_type, event_data::text as event_data, created_at
        FROM analytics_events
        WHERE product = ${product} AND created_at >= ${since}
        ORDER BY created_at DESC
      `;
      if (rows.length > 0) headers = Object.keys(rows[0]);
    }

    // Build CSV
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let csv = headers.map(escapeCsv).join(",") + "\n";
    for (const row of rows) {
      csv += headers.map(h => escapeCsv(row[h])).join(",") + "\n";
    }

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${type}-${product}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
