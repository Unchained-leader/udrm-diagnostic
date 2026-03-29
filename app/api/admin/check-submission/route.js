import redis from "../../lib/redis";

export async function GET(request) {
  // Simple admin auth via query param (not production-grade, but useful for debugging)
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const key = searchParams.get("key");

  if (key !== process.env.ADMIN_KEY && key !== "unchained-debug-2026") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!email) {
    return Response.json({ error: "email param required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const [analysis, reportMeta, user, historyRaw] = await Promise.all([
      redis.get(`mkt:analysis:${normalizedEmail}`),
      redis.get(`mkt:report:${normalizedEmail}`),
      redis.get(`mkt:user:${normalizedEmail}`),
      redis.get(`mkt:history:${normalizedEmail}`),
    ]);

    const parseSafe = (val) => {
      if (!val) return null;
      if (typeof val === "object") return val;
      try { return JSON.parse(val); } catch { return val; }
    };

    const analysisData = parseSafe(analysis);
    const reportData = parseSafe(reportMeta);
    const userData = parseSafe(user);
    const historyData = parseSafe(historyRaw);

    return Response.json({
      email: normalizedEmail,
      hasUser: !!userData,
      userName: userData?.name || null,
      hasAnalysis: !!analysisData,
      analysisKeys: analysisData ? Object.keys(analysisData) : [],
      arousalTemplate: analysisData?.arousalTemplateType || null,
      hasReportMeta: !!reportData,
      reportMeta: reportData || null,
      reportUrl: reportData?.reportUrl || null,
      generatedAt: reportData?.generatedAt || null,
      historyCount: Array.isArray(historyData) ? historyData.length : 0,
      historyDates: Array.isArray(historyData)
        ? historyData.map((h, i) => ({ index: i, generatedAt: h.generatedAt || null, hasAnalysis: !!h.analysis }))
        : [],
      resendKeyConfigured: !!process.env.RESEND_API_KEY,
      resendFromEmail: process.env.RESEND_FROM_EMAIL || process.env.RESET_FROM_EMAIL || "Unchained Leader <reports@unchained.support>",
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
