import redis from "../../lib/redis";
import { createDashboardToken, setTokenCookie } from "../../lib/auth";
import bcrypt from "bcryptjs";
import { ghlContactCreated } from "../../lib/ghl";
import { corsHeaders, optionsResponse } from "../../lib/cors";
import { normalizeEmail, parseRedis } from "../../lib/utils";

const CORS_HEADERS = corsHeaders("POST, OPTIONS");

export async function OPTIONS() {
  return optionsResponse("POST, OPTIONS");
}

export async function POST(request) {
  try {
    const { email, name, phone, pin, trafficSource, embedParentUrl, referrerUrl, utmSource, utmMedium, utmCampaign } = await request.json();
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

    const userKey = `mkt:user:${normalizedEmail}`;
    const existing = await redis.get(userKey);
    const hashedPin = await bcrypt.hash(String(pin), 10);

    if (existing) {
      // User exists — update with PIN if not already set, mark diagnostic complete
      const userData = parseRedis(existing);
      userData.diagnosticComplete = true;
      userData.diagnosticCompletedAt = new Date().toISOString();
      if (!userData.dashboardPin) {
        userData.dashboardPin = hashedPin;
      }
      // Update geo data on each registration/completion
      userData.geo = geo;
      await redis.set(userKey, userData);

      const token = await createDashboardToken(normalizedEmail, userData.name || trimmedName);

      const response = new Response(JSON.stringify({ success: true, name: userData.name || trimmedName, token }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
      setTokenCookie(response, token);
      return response;
    }

    // New user — create account with PIN and diagnostic flag
    const userData = {
      name: trimmedName,
      phone: phone || "",
      createdAt: new Date().toISOString(),
      diagnosticComplete: true,
      diagnosticCompletedAt: new Date().toISOString(),
      dashboardPin: hashedPin,
      geo,
      trafficSource: trafficSource || "",
      embedParentUrl: embedParentUrl || "",
    };
    await redis.set(userKey, userData);

    // Send to GoHighLevel CRM
    ghlContactCreated({
      email: normalizedEmail,
      name: trimmedName,
      phone: phone || "",
      trafficSource: trafficSource || "",
      embedParentUrl: embedParentUrl || "",
      referrerUrl: referrerUrl || "",
      utmSource: utmSource || "",
      utmMedium: utmMedium || "",
      utmCampaign: utmCampaign || "",
    }).catch((e) => console.error("GHL webhook error:", e.message));

    const token = await createDashboardToken(normalizedEmail, trimmedName);

    const response = new Response(JSON.stringify({ success: true, name: trimmedName, token }), {
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
