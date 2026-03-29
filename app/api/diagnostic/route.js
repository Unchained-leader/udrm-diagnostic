import redis from "../lib/redis";
import { normalizeEmail } from "../lib/utils";
import { corsHeaders, optionsResponse } from "../lib/cors";

const CORS_HEADERS = corsHeaders("POST, OPTIONS");

// Handle CORS preflight
export async function OPTIONS() {
  return optionsResponse("POST, OPTIONS");
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
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // Verify user exists
    const normalizedEmail = normalizeEmail(email);
    const user = await redis.get(`mkt:user:${normalizedEmail}`);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "No account found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        }
      );
    }

    // Store diagnostic data
    const diagnosticData = {
      email: normalizedEmail,
      name: name || user.name || "Unknown",
      messages: messages || [],
      completedAt: completedAt || new Date().toISOString(),
      savedAt: new Date().toISOString(),
    };

    // Save to Redis with mkt:diagnostic:{email} key
    await redis.set(
      `mkt:diagnostic:${normalizedEmail}`,
      JSON.stringify(diagnosticData)
    );

    // Also update user record to mark diagnostic as complete
    await redis.set(`mkt:user:${normalizedEmail}`, {
      ...user,
      diagnosticComplete: true,
      diagnosticCompletedAt: completedAt || new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, message: "Diagnostic data saved" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  } catch (error) {
    console.error("Diagnostic save error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to save diagnostic data" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      }
    );
  }
}
