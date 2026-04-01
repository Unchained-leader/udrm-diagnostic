import { jwtVerify } from "jose";
import { getJwtSecret } from "../../lib/auth";

// POST /api/dashboard/set-token — Sets the dashboard_token cookie from a JWT
// Used by admin impersonation and quiz redirect flows
export async function POST(request) {
  try {
    const { token } = await request.json();
    if (!token) {
      return Response.json({ error: "Token required" }, { status: 400 });
    }

    // Verify the token is valid before setting it as a cookie
    await jwtVerify(token, getJwtSecret());

    const response = Response.json({ success: true });
    response.headers.set(
      "Set-Cookie",
      `dashboard_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
    );
    return response;
  } catch (error) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }
}
