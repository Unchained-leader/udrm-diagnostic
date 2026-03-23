import redis from "../lib/redis";

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
    const { action, email, pin } = await request.json();
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

    const userKey = `user:${normalizedEmail}`;

    if (action === "register") {
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
        createdAt: new Date().toISOString(),
      });

      return Response.json(
        { success: true, message: "Account created." },
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
        { success: true, message: "Signed in." },
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
