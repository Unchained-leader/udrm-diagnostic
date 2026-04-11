import { getDb } from "../../lib/db";
import redis from "../../lib/redis";

/**
 * GET /api/analytics/marketing-narratives
 *
 * Returns anonymized, aggregated narrative marketing data from Redis analyses.
 * No PII is included — just patterns, themes, and sample copy.
 *
 * Query params:
 *   secret    - ADMIN_PASSWORD (required)
 *   startDate - YYYY-MM-DD Eastern Time (required)
 *   endDate   - YYYY-MM-DD Eastern Time (required)
 *   page      - 1-indexed page of narrative samples (default: 1)
 *   limit     - profiles per page (default: 20, max: 30)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    if (secret !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    if (!startDate || !endDate) {
      return Response.json({ error: "startDate and endDate required (YYYY-MM-DD)" }, { status: 400 });
    }

    const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
    const limit = Math.min(30, Math.max(1, parseInt(searchParams.get("limit")) || 20));
    const offset = (page - 1) * limit;

    // Convert ET to UTC (April = EDT = UTC-4)
    const month = parseInt(startDate.split("-")[1]);
    const offsetH = (month >= 3 && month <= 10) ? 4 : 5;
    const utcStart = new Date(new Date(startDate + "T00:00:00.000Z").getTime() + offsetH * 3600000).toISOString();
    const utcEnd = new Date(new Date(endDate + "T23:59:59.999Z").getTime() + offsetH * 3600000).toISOString();

    const sql = getDb();

    // Get total count
    const [countRow] = await sql`
      SELECT COUNT(*) as total FROM completed_diagnostics
      WHERE product = 'udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
    `;
    const total = parseInt(countRow.total);

    // Get paginated emails
    const rows = await sql`
      SELECT email FROM completed_diagnostics
      WHERE product = 'udrm' AND created_at >= ${utcStart} AND created_at < ${utcEnd}
      ORDER BY created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const emails = rows.map(r => (r.email || "").trim().toLowerCase()).filter(Boolean);

    // Fetch Redis analyses
    const profiles = [];
    for (const email of emails) {
      try {
        const raw = await redis.get(`mkt:analysis:${email}`);
        const analysis = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
        if (!analysis) continue;

        // Extract marketing-relevant fields only — NO PII
        profiles.push({
          arousalTemplateType: analysis.arousalTemplateType || null,
          arousalTemplateSecondary: analysis.arousalTemplateSecondary || null,
          rootNarrativeStatement: analysis.rootNarrativeStatement || null,
          whatBrainCounterfeits: analysis.whatBrainCounterfeits || null,
          neuropathway: analysis.neuropathway || null,
          neuropathwayManages: analysis.neuropathwayManages || null,
          neuropathwayExplanation: analysis.neuropathwayExplanation || null,
          attachmentStyle: analysis.attachmentStyle || null,
          attachmentFuels: analysis.attachmentFuels || null,
          godAttachment: analysis.godAttachment || null,
          purityCultureImpact: analysis.purityCultureImpact || null,
          generationalLens: analysis.generationalLens || null,
          generationalCohort: analysis.generationalCohort || null,
          imprintingAge: analysis.imprintingAge || null,
          imprintingFusion: analysis.imprintingFusion || null,
          escalationPresent: analysis.escalationPresent || false,
          escalationSeverity: analysis.escalationSeverity || null,
          isolationLevel: analysis.isolationLevel || null,
          isolationScore: analysis.isolationScore || null,
          codependencyScore: analysis.codependencyScore || null,
          codependencyExplanation: analysis.codependencyExplanation || null,
          enmeshmentScore: analysis.enmeshmentScore || null,
          enmeshmentExplanation: analysis.enmeshmentExplanation || null,
          relationalVoidScore: analysis.relationalVoidScore || null,
          relationalVoidExplanation: analysis.relationalVoidExplanation || null,
          leadershipBurdenScore: analysis.leadershipBurdenScore || null,
          leadershipBurdenExplanation: analysis.leadershipBurdenExplanation || null,
          lifeStressScores: analysis.lifeStressScores || null,
          lifeStressAnalysis: analysis.lifeStressAnalysis || null,
          behaviorRootMap: analysis.behaviorRootMap || [],
          coCopingBehaviors: analysis.coCopingBehaviors || [],
          confusingPatternsDecoded: analysis.confusingPatternsDecoded || [],
          strategiesTried: analysis.strategiesTried || [],
          strategiesCount: analysis.strategiesCount || null,
          yearsFighting: analysis.yearsFighting || null,
          strategyBreakdowns: analysis.strategyBreakdowns || [],
          keyInsight: analysis.keyInsight || null,
          closingStatement: analysis.closingStatement || null,
          scorecardBehaviorCount: analysis.scorecardBehaviorCount || null,
          scorecardContentThemeCount: analysis.scorecardContentThemeCount || null,
          scorecardEmotionalFunctionCount: analysis.scorecardEmotionalFunctionCount || null,
          scorecardChildhoodWoundScore: analysis.scorecardChildhoodWoundScore || null,
          scorecardAttachmentSeverity: analysis.scorecardAttachmentSeverity || null,
          scorecardSpiritualDisconnect: analysis.scorecardSpiritualDisconnect || null,
          scorecardRelationalBurden: analysis.scorecardRelationalBurden || null,
          patternYears: analysis.patternYears || null,
        });
      } catch (e) {
        // Skip failed fetches
      }
    }

    return Response.json({
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), profilesReturned: profiles.length },
      profiles,
    });
  } catch (error) {
    console.error("Marketing narratives error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
