import redis from "../lib/redis";

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, name, messages, completedAt } = body;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // Verify user exists
    const user = await redis.get(`mkt:user:${email.toLowerCase()}`);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "No account found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // Store diagnostic data
    const diagnosticData = {
      email: email.toLowerCase(),
      name: name || user.name || "Unknown",
      messages: messages || [],
      completedAt: completedAt || new Date().toISOString(),
      savedAt: new Date().toISOString(),
    };

    // Save to Redis with mkt:diagnostic:{email} key
    await redis.set(
      `mkt:diagnostic:${email.toLowerCase()}`,
      JSON.stringify(diagnosticData)
    );

    // Also update user record to mark diagnostic as complete
    await redis.set(`mkt:user:${email.toLowerCase()}`, {
      ...user,
      diagnosticComplete: true,
      diagnosticCompletedAt: completedAt || new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, message: "Diagnostic data saved" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error) {
    console.error("Diagnostic save error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to save diagnostic data" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}
