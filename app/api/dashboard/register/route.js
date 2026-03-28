import redis from "../../lib/redis";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "unchained-dashboard-secret-key-change-me");

export async function POST(request) {
  try {
    const { email, pin, reset } = await request.json();
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }
    if (!pin || !/^\d{4}$/.test(String(pin))) {
      return Response.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const user = await redis.get(`mkt:user:${normalizedEmail}`);
    if (!user) {
      return Response.json({ error: "No account found. Complete the assessment first." }, { status: 404 });
    }

    const userData = typeof user === "string" ? JSON.parse(user) : user;

    if (!userData.diagnosticComplete) {
      return Response.json({ error: "Complete the assessment to unlock your dashboard." }, { status: 403 });
    }

    if (userData.dashboardPin && !reset) {
      return Response.json({ error: "Dashboard PIN already set. Please log in." }, { status: 409 });
    }

    const hashedPin = await bcrypt.hash(String(pin), 10);
    userData.dashboardPin = hashedPin;
    await redis.set(`mkt:user:${normalizedEmail}`, userData);

    const token = await new SignJWT({ email: normalizedEmail, name: userData.name })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(SECRET);

    const response = Response.json({ success: true, name: userData.name });
    response.headers.set("Set-Cookie", `dashboard_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (error) {
    console.error("Dashboard register error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
