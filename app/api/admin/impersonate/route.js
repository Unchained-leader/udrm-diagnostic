import { SignJWT } from "jose";
import { getJwtSecret } from "../../lib/auth";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const email = searchParams.get("email");

  if (!secret || secret !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    // Generate a short-lived admin token (1 hour) for viewing client dashboard
    const token = await new SignJWT({ email: email.toLowerCase().trim(), name: "Admin", admin: true })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(getJwtSecret());

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://unchainedleader.io";
    const dashboardUrl = `${baseUrl}/dashboard/overview?token=${encodeURIComponent(token)}`;

    return Response.json({ url: dashboardUrl, token });
  } catch (error) {
    console.error("Admin impersonate error:", error.message);
    return Response.json({ error: "Failed to generate token" }, { status: 500 });
  }
}
