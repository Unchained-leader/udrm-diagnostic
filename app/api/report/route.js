import { Client } from "@upstash/qstash";
import redis from "../lib/redis";
import { corsHeaders, optionsResponse } from "../lib/cors";
import { normalizeEmail, parseRedis } from "../lib/utils";

// ═══════════════════════════════════════════════════════════════
// POST /api/report — Thin enqueue layer
// Validates input, looks up user data, enqueues to QStash,
// and returns immediately. Heavy work runs in /api/report/process.
// ═══════════════════════════════════════════════════════════════

const CORS_HEADERS = corsHeaders("POST, OPTIONS");

export async function OPTIONS() {
  return optionsResponse("POST, OPTIONS");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, name, diagnosticData, gender, ageRange } = body;

    // Extract geo data from Vercel headers
    const headers = request.headers;
    const geo = {
      ip: (headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
      city: headers.get("x-vercel-ip-city") || null,
      region: headers.get("x-vercel-ip-country-region") || null,
      country: headers.get("x-vercel-ip-country") || null,
      lat: headers.get("x-vercel-ip-latitude") ? parseFloat(headers.get("x-vercel-ip-latitude")) : null,
      lon: headers.get("x-vercel-ip-longitude") ? parseFloat(headers.get("x-vercel-ip-longitude")) : null,
    };

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400, headers: CORS_HEADERS });
    }

    const normalizedEmail = normalizeEmail(email);

    // Look up user
    const user = await redis.get(`mkt:user:${normalizedEmail}`);
    if (!user) {
      return Response.json({ error: "No account found. Please register first." }, { status: 404, headers: CORS_HEADERS });
    }

    const userName = name || user.name || "Brother";

    // Get diagnostic messages
    let messages = [];
    if (diagnosticData && Array.isArray(diagnosticData)) {
      messages = diagnosticData;
    } else if (diagnosticData && diagnosticData.messages) {
      messages = diagnosticData.messages;
    } else {
      const stored = await redis.get(`mkt:diagnostic:${normalizedEmail}`);
      if (stored) {
        const parsed = parseRedis(stored);
        messages = parsed.messages || [];
      }
    }

    if (!messages || messages.length === 0) {
      return Response.json({ error: "No diagnostic data found." }, { status: 400, headers: CORS_HEADERS });
    }

    // Set initial queued status so dashboard can show progress
    await redis.set(
      `mkt:status:${normalizedEmail}`,
      { step: "queued", message: "Your report is being prepared...", startedAt: new Date().toISOString() },
      { ex: 3600 }
    );

    // Enqueue to QStash for background processing
    const qstashClient = new Client({ token: process.env.QSTASH_TOKEN });
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/report/process`;

    console.log(`[QStash] Enqueuing report for ${normalizedEmail} -> ${callbackUrl}`);

    await qstashClient.publishJSON({
      url: callbackUrl,
      body: {
        email: normalizedEmail,
        name: userName,
        messages,
        gender,
        ageRange,
        geo,
      },
      retries: 3,
    });

    console.log(`[QStash] Report enqueued successfully for ${normalizedEmail}`);

    return Response.json(
      { success: true, message: "Report generation started. You will receive an email when it is ready." },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[QStash] Enqueue error:", error.message || error);
    console.error("Error stack:", error.stack);
    return Response.json(
      { error: `Failed to start report generation: ${error.message || "unknown error"}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
