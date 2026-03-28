import redis from "../../lib/redis";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "unchained-dashboard-secret-key-change-me");

export async function GET(request) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const tokenMatch = cookie.match(/dashboard_token=([^;]+)/);
    if (!tokenMatch) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    let payload;
    try {
      const result = await jwtVerify(tokenMatch[1], SECRET);
      payload = result.payload;
    } catch {
      return Response.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }

    const email = payload.email;

    const [analysis, reportMeta, user] = await Promise.all([
      redis.get(`mkt:analysis:${email}`),
      redis.get(`mkt:report:${email}`),
      redis.get(`mkt:user:${email}`),
    ]);

    if (!analysis) {
      return Response.json({ error: "No results found. Your report may still be processing." }, { status: 404 });
    }

    const userData = typeof user === "string" ? JSON.parse(user) : user;
    const reportData = typeof reportMeta === "string" ? JSON.parse(reportMeta) : reportMeta;
    const analysisData = typeof analysis === "string" ? JSON.parse(analysis) : analysis;

    return Response.json({
      success: true,
      name: userData?.name || payload.name,
      analysis: analysisData,
      reportUrl: reportData?.reportUrl || null,
      generatedAt: reportData?.generatedAt || null,
    });
  } catch (error) {
    console.error("Dashboard results error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
