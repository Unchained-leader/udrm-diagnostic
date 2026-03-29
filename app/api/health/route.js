import { getDb } from "../lib/db";
import redis from "../lib/redis";
import { corsHeaders, optionsResponse } from "../lib/cors";

const CORS_HEADERS = corsHeaders("GET, OPTIONS");

export async function OPTIONS() {
  return optionsResponse("GET, OPTIONS");
}

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    status: "healthy",
    services: {},
  };

  // 1. Redis
  try {
    const start = Date.now();
    await redis.set("health_check", Date.now());
    const val = await redis.get("health_check");
    results.services.redis = { status: "up", latency: Date.now() - start };
  } catch (e) {
    results.services.redis = { status: "down", error: e.message };
    results.status = "degraded";
  }

  // 2. Postgres
  try {
    const start = Date.now();
    const sql = getDb();
    await sql`SELECT 1 as ok`;
    results.services.postgres = { status: "up", latency: Date.now() - start };
  } catch (e) {
    results.services.postgres = { status: "down", error: e.message };
    results.status = "degraded";
  }

  // 3. Anthropic API (lightweight check — just verify key works)
  try {
    const start = Date.now();
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 5, messages: [{ role: "user", content: "hi" }] }),
    });
    results.services.anthropic = { status: resp.ok ? "up" : "degraded", latency: Date.now() - start, httpStatus: resp.status };
  } catch (e) {
    results.services.anthropic = { status: "down", error: e.message };
    results.status = "degraded";
  }

  // 4. Resend (email)
  try {
    if (process.env.RESEND_API_KEY) {
      const start = Date.now();
      const r = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      results.services.resend = { status: r.ok ? "up" : "degraded", latency: Date.now() - start };
    } else {
      results.services.resend = { status: "unconfigured" };
    }
  } catch (e) {
    results.services.resend = { status: "down", error: e.message };
  }

  // Slack alert if any service is down
  const downServices = Object.entries(results.services).filter(([_, v]) => v.status === "down").map(([k]) => k);
  if (downServices.length > 0 && process.env.SLACK_WEBHOOK_URL) {
    const details = downServices.map(s => `*${s}*: ${results.services[s].error || "unreachable"}`).join("\n");
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:rotating_light: *SYSTEM ALERT*\nStatus: *${results.status}*\nTime: ${results.timestamp}\n\n*Down:*\n${details}` }),
    }).catch(() => {});
  }

  return Response.json(results, { status: results.status === "healthy" ? 200 : 503, headers: CORS_HEADERS });
}
