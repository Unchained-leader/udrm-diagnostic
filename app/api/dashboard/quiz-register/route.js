import redis from "../../lib/redis";
import { createDashboardToken, setTokenCookie } from "../../lib/auth";
import bcrypt from "bcryptjs";
import { ghlContactCreated } from "../../lib/ghl";
import { zapierDiagnosticSubmitted } from "../../lib/zapier";
import { corsHeaders, optionsResponse } from "../../lib/cors";
import { normalizeEmail, parseRedis } from "../../lib/utils";
import { getDb } from "../../lib/db";

const CORS_HEADERS = corsHeaders("POST, OPTIONS");

export async function OPTIONS() {
  return optionsResponse("POST, OPTIONS");
}

// ═══════════════════════════════════════════════════════════════
// Durable identity capture — survives a Redis/cache outage.
// The June 2026 outage lost ~300 finished quizzes because identity
// (email/name) was only ever written to Redis; when Redis rejected
// writes, registration threw before GHL/Zapier fired and nothing
// durable recorded WHO the person was. This writes identity to
// Postgres (which is independent of the cache) and, when the quiz
// frontend supplies sessionId, links it to the anonymous answers
// already in quiz_responses so a report can be regenerated later.
// ═══════════════════════════════════════════════════════════════
let _regTableReady = false;
async function persistRegistration({ sessionId, email, name, phone, gender, trafficSource, geo }) {
  const sql = getDb();
  if (!_regTableReady) {
    await sql`CREATE TABLE IF NOT EXISTS quiz_registrations (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(255),
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      phone VARCHAR(64),
      gender VARCHAR(32),
      traffic_source VARCHAR(255),
      geo_city VARCHAR(255), geo_region VARCHAR(255), geo_country VARCHAR(16), geo_ip VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    _regTableReady = true;
  }
  await sql`INSERT INTO quiz_registrations
    (session_id, email, name, phone, gender, traffic_source, geo_city, geo_region, geo_country, geo_ip)
    VALUES (${sessionId || null}, ${email}, ${name || null}, ${phone || null}, ${gender || null},
            ${trafficSource || null}, ${geo.city}, ${geo.region}, ${geo.country}, ${geo.ip})`;
}

export async function POST(request) {
  try {
    const { email, name, phone, pin, gender, sessionId, trafficSource, embedParentUrl, referrerUrl, utmSource, utmMedium, utmCampaign } = await request.json();
    const normalizedEmail = normalizeEmail(email);
    const trimmedName = (name || "").trim();

    // Extract geo data from Vercel headers
    const hdrs = request.headers;
    const geo = {
      ip: (hdrs.get("x-forwarded-for") || "").split(",")[0].trim() || null,
      city: hdrs.get("x-vercel-ip-city") || null,
      region: hdrs.get("x-vercel-ip-country-region") || null,
      country: hdrs.get("x-vercel-ip-country") || null,
      lat: hdrs.get("x-vercel-ip-latitude") || null,
      lon: hdrs.get("x-vercel-ip-longitude") || null,
    };

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Valid email is required." }, { status: 400, headers: CORS_HEADERS });
    }
    if (!trimmedName) {
      return Response.json({ error: "Name is required." }, { status: 400, headers: CORS_HEADERS });
    }
    if (!pin || !/^\d{4}$/.test(String(pin))) {
      return Response.json({ error: "PIN must be exactly 4 digits." }, { status: 400, headers: CORS_HEADERS });
    }

    const hashedPin = await bcrypt.hash(String(pin), 10);

    // ── DURABLE FIRST: capture identity to Postgres + CRM, independent of the cache. ──
    // These run regardless of whether Redis is healthy, so an outage can never again
    // lose who completed the quiz.
    persistRegistration({ sessionId, email: normalizedEmail, name: trimmedName, phone, gender, trafficSource, geo })
      .catch((e) => console.error("[Register] Postgres identity capture failed (non-fatal):", e.message));

    ghlContactCreated({
      email: normalizedEmail, name: trimmedName, phone: phone || "", gender: gender || "",
      trafficSource: trafficSource || "", embedParentUrl: embedParentUrl || "",
      referrerUrl: referrerUrl || "", utmSource: utmSource || "", utmMedium: utmMedium || "", utmCampaign: utmCampaign || "",
    }).catch((e) => console.error("GHL webhook error:", e.message));

    zapierDiagnosticSubmitted({
      email: normalizedEmail, name: trimmedName, phone: phone || "", ip: geo.ip || "",
    }).catch((e) => console.error("Zapier webhook error:", e.message));

    // ── BEST-EFFORT: cache write for the live dashboard. Non-fatal if Redis is down. ──
    let resolvedName = trimmedName;
    try {
      const userKey = `mkt:user:${normalizedEmail}`;
      const existing = await redis.get(userKey);
      if (existing) {
        const userData = parseRedis(existing);
        userData.diagnosticComplete = true;
        userData.diagnosticCompletedAt = new Date().toISOString();
        if (!userData.dashboardPin) userData.dashboardPin = hashedPin;
        userData.geo = geo;
        await redis.set(userKey, userData);
        resolvedName = userData.name || trimmedName;
      } else {
        await redis.set(userKey, {
          name: trimmedName,
          phone: phone || "",
          gender: gender || "",
          createdAt: new Date().toISOString(),
          diagnosticComplete: true,
          diagnosticCompletedAt: new Date().toISOString(),
          dashboardPin: hashedPin,
          geo,
          trafficSource: trafficSource || "",
          embedParentUrl: embedParentUrl || "",
        });
      }
    } catch (e) {
      console.error("[Register] Redis cache write failed (non-fatal — identity captured in Postgres + CRM):", e.message);
    }

    // Token signing does not depend on Redis, so the user can still proceed.
    const token = await createDashboardToken(normalizedEmail, resolvedName);
    const response = new Response(JSON.stringify({ success: true, name: resolvedName, token }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
    setTokenCookie(response, token);
    return response;
  } catch (error) {
    console.error("Quiz register error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500, headers: CORS_HEADERS });
  }
}
