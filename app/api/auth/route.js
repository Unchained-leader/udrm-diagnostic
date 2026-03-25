import redis from "../lib/redis";
import { ghlContactCreated } from "../lib/ghl";

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
    const { action, email, pin, name, phone } = await request.json();
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !pin) {
      return Response.json(
        { error: "Email and PIN are required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json(
        { error: "Please enter a valid email address." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Validate PIN is 4 digits
    if (!/^\d{4}$/.test(pin)) {
      return Response.json(
        { error: "PIN must be exactly 4 digits." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const userKey = `mkt:user:${normalizedEmail}`;

    if (action === "register") {
      // Validate name is provided for registration
      const trimmedName = (name || "").trim();
      if (!trimmedName) {
        return Response.json(
          { error: "Full name is required." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      // Check if user already exists
      const existing = await redis.get(userKey);
      if (existing) {
        return Response.json(
          { error: "This email is already registered. Please sign in instead." },
          { status: 409, headers: CORS_HEADERS }
        );
      }

      // Create new user
      await redis.set(userKey, {
        pin,
        name: trimmedName,
        phone: phone || "",
        createdAt: new Date().toISOString(),
      });

      // Send to GoHighLevel CRM via webhook (fire and forget)
      ghlContactCreated({
        email: normalizedEmail,
        name: trimmedName,
        phone: phone || "",
      }).catch((e) => console.error("GHL webhook error:", e.message));

      return Response.json(
        { success: true, message: "Account created.", name: trimmedName },
        { headers: CORS_HEADERS }
      );

    } else if (action === "login") {
      const user = await redis.get(userKey);
      if (!user) {
        return Response.json(
          { error: "No account found with this email. Please register first." },
          { status: 404, headers: CORS_HEADERS }
        );
      }

      if (user.pin !== pin) {
        return Response.json(
          { error: "Incorrect PIN. Please try again." },
          { status: 401, headers: CORS_HEADERS }
        );
      }

      return Response.json(
        { success: true, message: "Signed in.", name: user.name || null },
        { headers: CORS_HEADERS }
      );

    } else {
      return Response.json(
        { error: "Invalid action." },
        { status: 400, headers: CORS_HEADERS }
      );
    }
  } catch (error) {
    console.error("Auth error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
