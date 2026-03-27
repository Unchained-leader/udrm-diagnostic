import { getDb } from "../lib/db";
import redis from "../lib/redis";
import Anthropic from "@anthropic-ai/sdk";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

// Health check endpoint — tests all critical dependencies
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
    results.services.redis = { status: "up", latency: Date.now() - start, value: val ? "ok" : "empty" };
  } catch (e) {
    results.services.redis = { status: "down", error: e.message };
    results.status = "degraded";
  }

  // 2. Postgres
  try {
    const start = Date.now();
    const sql = getDb();
    const r = await sql`SELECT 1 as ok`;
    results.services.postgres = { status: "up", latency: Date.now() - start };
  } catch (e) {
    results.services.postgres = { status: "down", error: e.message };
    results.status = "degraded";
  }

  // 3. Anthropic API
  try {
    const start = Date.now();
    const client = new Anthropic();
    const r = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply with just the word OK" }],
    });
    const text = r.content[0]?.text || "";
    results.services.anthropic = { status: "up", latency: Date.now() - start, response: text.substring(0, 20) };
  } catch (e) {
    results.services.anthropic = { status: "down", error: e.message };
    results.status = "degraded";
  }

  // 4. Vercel Blob
  try {
    const start = Date.now();
    const r = await fetch("https://fpwrf9ym2ilonsvo.public.blob.vercel-storage.com/", { method: "HEAD" });
    results.services.blob = { status: r.ok || r.status === 404 ? "up" : "down", latency: Date.now() - start };
  } catch (e) {
    results.services.blob = { status: "down", error: e.message };
  }

  // 5. Resend (email)
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

  // Log health check to Postgres for downtime tracking
  try {
    const sql = getDb();
    const downServices = Object.entries(results.services)
      .filter(([_, v]) => v.status === "down")
      .map(([k]) => k);
    await sql`INSERT INTO analytics_events (session_id, product, event_type, event_data)
      VALUES ('system', 'system', 'health_check', ${JSON.stringify({
        status: results.status,
        services: results.services,
        downServices,
      })})`;

    // If anything is down, send Slack alert
    if (downServices.length > 0) {
      await sendSlackAlert(results, downServices);
    }
  } catch (e) {
    console.error("Health log error:", e.message);
  }

  const statusCode = results.status === "healthy" ? 200 : 503;
  return Response.json(results, { status: statusCode, headers: CORS_HEADERS });
}

async function sendSlackAlert(results, downServices) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const serviceDetails = downServices.map(s => {
    const svc = results.services[s];
    return `*${s}*: ${svc.error || "unreachable"}`;
  }).join("\n");

  const payload = {
    text: `:rotating_light: *UNCHAINED SYSTEM ALERT* :rotating_light:\n\nStatus: *${results.status.toUpperCase()}*\nTime: ${results.timestamp}\n\n*Down Services:*\n${serviceDetails}\n\nThis may affect quiz delivery and report generation. Check immediately.`,
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Slack alert failed:", e.message);
  }
}
