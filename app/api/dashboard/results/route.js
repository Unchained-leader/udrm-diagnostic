import redis from "../../lib/redis";
import { getJwtSecret, jwtVerify } from "../../lib/auth";
import { parseRedis } from "../../lib/utils";

export async function GET(request) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const tokenMatch = cookie.match(/dashboard_token=([^;]+)/);
    if (!tokenMatch) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }

    let payload;
    try {
      const result = await jwtVerify(tokenMatch[1], getJwtSecret());
      payload = result.payload;
    } catch {
      return Response.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }

    const email = payload.email;

    const [analysis, reportMeta, user, historyRaw] = await Promise.all([
      redis.get(`mkt:analysis:${email}`),
      redis.get(`mkt:report:${email}`),
      redis.get(`mkt:user:${email}`),
      redis.get(`mkt:history:${email}`),
    ]);

    if (!analysis) {
      // Check if report is currently being generated
      const status = await redis.get(`mkt:status:${email}`);
      const statusData = parseRedis(status);
      if (statusData && (statusData.step === "analyzing" || statusData.step === "complete" || statusData.step === "pdf_ready" || statusData.step === "emailed")) {
        return Response.json({
          success: true,
          processing: true,
          status: statusData,
          name: parseRedis(user)?.name || payload.name,
        });
      }
      return Response.json({ error: "No results found. Your report may still be processing." }, { status: 404 });
    }

    const userData = parseRedis(user);
    const reportData = parseRedis(reportMeta);
    const analysisData = parseRedis(analysis);
    const historyData = parseRedis(historyRaw);

    // Build history array — if no history key exists, create one from current report
    let reports = [];
    if (Array.isArray(historyData) && historyData.length > 0) {
      // Filter out corrupt/empty entries (no analysis data)
      const validEntries = historyData.filter(entry => entry && (entry.analysis || entry.generatedAt));
      reports = validEntries.map((entry, i) => {
        const generatedAt = entry.generatedAt || entry.analysis?.generatedAt || null;
        return {
          id: i,
          generatedAt,
          reportUrl: entry.reportUrl || entry.analysis?.reportUrl || null,
          arousalTemplateType: entry.arousalTemplateType || entry.analysis?.arousalTemplateType,
          neuropathway: entry.neuropathway || entry.analysis?.neuropathway,
          attachmentStyle: entry.attachmentStyle || entry.analysis?.attachmentStyle,
          analysis: entry.analysis || null,
        };
      });
    }
    if (reports.length === 0) {
      // Backwards compatibility: single report, no history yet
      reports = [{
        id: 0,
        generatedAt: reportData?.generatedAt || null,
        reportUrl: reportData?.reportUrl || null,
        arousalTemplateType: analysisData?.arousalTemplateType,
        neuropathway: analysisData?.neuropathway,
        attachmentStyle: analysisData?.attachmentStyle,
        analysis: analysisData,
      }];
    }

    return Response.json({
      success: true,
      name: userData?.name || payload.name,
      analysis: analysisData,
      reportUrl: reportData?.reportUrl || null,
      generatedAt: reportData?.generatedAt || null,
      reports,
    });
  } catch (error) {
    console.error("Dashboard results error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
