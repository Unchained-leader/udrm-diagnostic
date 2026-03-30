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
    const { email, name, phone, pin } = await request.json();
    const normalizedEmail = normalizeEmail(email);
    const trimmedName = (name || "").trim();

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
    };
    await redis.set(userKey, userData);

    // Send to GoHighLevel CRM
    ghlContactCreated({
      email: normalizedEmail,
      name: trimmedName,
      phone: phone || "",
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
