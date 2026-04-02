import redis from "../../lib/redis";
import { normalizeEmail } from "../../lib/utils";

// ═══════════════════════════════════════════════════════════════
// POST /api/report/failure — QStash failure callback
// Called when all retries are exhausted for a report job.
// Sets a clear error status so the user isn't stuck on the
// processing screen, and sends an alert if Slack is configured.
// ═══════════════════════════════════════════════════════════════

export async function POST(request) {
  try {
    const body = await request.json();

    // QStash failure callback includes the original request body
    const originalBody = body.body ? (typeof body.body === "string" ? JSON.parse(body.body) : body.body) : body;
    const email = originalBody?.email;
    const normalizedEmail = email ? normalizeEmail(email) : null;

    console.error(`[QStash] FAILURE CALLBACK — all retries exhausted for ${normalizedEmail || "unknown"}`);
    console.error(`[QStash] Failure details:`, JSON.stringify({
      status: body.status,
      url: body.url,
      retried: body.retried,
      error: body.error,
    }));

    // Update Redis so the user sees a clear error instead of infinite spinner
    if (normalizedEmail) {
      await redis.set(`mkt:status:${normalizedEmail}`, {
        step: "failed",
        message: "Report generation failed after multiple attempts. Please try again or contact support.",
        failedAt: new Date().toISOString(),
        permanent: true,
      }, { ex: 86400 }); // Keep for 24 hours
    }

    // Send Slack alert if configured
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `:rotating_light: *Report generation failed permanently*\nEmail: ${normalizedEmail || "unknown"}\nRetries exhausted: ${body.retried || "unknown"}\nError: ${body.error || "unknown"}\nTime: ${new Date().toISOString()}`,
          }),
        });
      } catch (slackErr) {
        console.error("[Slack] Alert failed:", slackErr.message);
      }
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error("[QStash] Failure callback error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
