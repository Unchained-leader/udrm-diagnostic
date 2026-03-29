import redis from "../../lib/redis";
import { createDashboardToken, setTokenCookie } from "../../lib/auth";
import bcrypt from "bcryptjs";
import { normalizeEmail, parseRedis } from "../../lib/utils";

export async function POST(request) {
  try {
    const { email, pin } = await request.json();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !pin) {
      return Response.json({ error: "Email and PIN are required." }, { status: 400 });
    }

    const user = await redis.get(`mkt:user:${normalizedEmail}`);
    if (!user) {
      return Response.json({ error: "No account found." }, { status: 404 });
    }

    const userData = parseRedis(user);

    if (!userData.dashboardPin) {
      return Response.json({ error: "Dashboard not set up yet. Please register first." }, { status: 403 });
    }

    const pinValid = await bcrypt.compare(String(pin), userData.dashboardPin);
    if (!pinValid) {
      return Response.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    const token = await createDashboardToken(normalizedEmail, userData.name);

    const response = Response.json({ success: true, name: userData.name });
    setTokenCookie(response, token);
    return response;
  } catch (error) {
    console.error("Dashboard auth error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
