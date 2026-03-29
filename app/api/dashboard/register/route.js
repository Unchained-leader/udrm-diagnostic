import redis from "../../lib/redis";
import { createDashboardToken, setTokenCookie } from "../../lib/auth";
import bcrypt from "bcryptjs";
import { normalizeEmail, parseRedis } from "../../lib/utils";

export async function POST(request) {
  try {
    const { email, pin, reset } = await request.json();
    const normalizedEmail = normalizeEmail(email);

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

    const userData = parseRedis(user);

    if (!userData.diagnosticComplete) {
      return Response.json({ error: "Complete the assessment to unlock your dashboard." }, { status: 403 });
    }

    if (userData.dashboardPin && !reset) {
      return Response.json({ error: "Dashboard PIN already set. Please log in." }, { status: 409 });
    }

    const hashedPin = await bcrypt.hash(String(pin), 10);
    userData.dashboardPin = hashedPin;
    await redis.set(`mkt:user:${normalizedEmail}`, userData);

    const token = await createDashboardToken(normalizedEmail, userData.name);

    const response = Response.json({ success: true, name: userData.name });
    setTokenCookie(response, token);
    return response;
  } catch (error) {
    console.error("Dashboard register error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
