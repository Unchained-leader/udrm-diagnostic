import redis from "../../lib/redis";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { ghlContactCreated } from "../../lib/ghl";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "unchained-dashboard-secret-key-change-me");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    const { email, name, phone, pin } = await request.json();
    const normalizedEmail = (email || "").trim().toLowerCase();
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
      const userData = typeof existing === "string" ? JSON.parse(existing) : existing;
      userData.diagnosticComplete = true;
      userData.diagnosticCompletedAt = new Date().toISOString();
      if (!userData.dashboardPin) {
        userData.dashboardPin = hashedPin;
      }
      await redis.set(userKey, userData);

      const token = await new SignJWT({ email: normalizedEmail, name: userData.name || trimmedName })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("7d")
        .sign(SECRET);

      const response = Response.json({ success: true, name: userData.name || trimmedName }, { headers: CORS_HEADERS });
      response.headers.set("Set-Cookie", `dashboard_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
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

    const token = await new SignJWT({ email: normalizedEmail, name: trimmedName })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(SECRET);

    const response = Response.json({ success: true, name: trimmedName }, { headers: CORS_HEADERS });
    response.headers.set("Set-Cookie", `dashboard_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (error) {
    console.error("Quiz register error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500, headers: CORS_HEADERS });
  }
}
