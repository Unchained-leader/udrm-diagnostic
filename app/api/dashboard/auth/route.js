import redis from "../../lib/redis";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "unchained-dashboard-secret-key-change-me");

export async function POST(request) {
  try {
    const { email, pin } = await request.json();
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !pin) {
      return Response.json({ error: "Email and PIN are required." }, { status: 400 });
    }

    const user = await redis.get(`mkt:user:${normalizedEmail}`);
    if (!user) {
      return Response.json({ error: "No account found." }, { status: 404 });
    }

    const userData = typeof user === "string" ? JSON.parse(user) : user;

    if (!userData.dashboardPin) {
      return Response.json({ error: "Dashboard not set up yet. Please register first." }, { status: 403 });
    }

    const pinValid = await bcrypt.compare(String(pin), userData.dashboardPin);
    if (!pinValid) {
      return Response.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    const token = await new SignJWT({ email: normalizedEmail, name: userData.name })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(SECRET);

    const response = Response.json({ success: true, name: userData.name });
    response.headers.set("Set-Cookie", `dashboard_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (error) {
    console.error("Dashboard auth error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
