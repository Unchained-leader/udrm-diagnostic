import redis from "../lib/redis";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_RECENT_MESSAGES = 50;
const SUMMARY_THRESHOLD = 40;

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(request) {
  try {
    const { action, email, pin, messages } = await request.json();
    const normalizedEmail = (email || "").trim().toLowerCase();

    // Verify identity on every request
    if (!normalizedEmail || !pin) {
      return Response.json(
        { error: "Authentication required." },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const userKey = `mkt:user:${normalizedEmail}`;
    const user = await redis.get(userKey);
    if (!user || user.pin !== pin) {
      return Response.json(
        { error: "Invalid credentials." },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const historyKey = `mkt:history:${normalizedEmail}`;
    const summaryKey = `mkt:summary:${normalizedEmail}`;

    if (action === "load") {
      const [history, summary] = await Promise.all([
        redis.get(historyKey),
        redis.get(summaryKey),
      ]);

      return Response.json(
        {
          messages: history || [],
          summary: summary || null,
        },
        { headers: CORS_HEADERS }
      );

    } else if (action === "save") {
      if (!messages || !Array.isArray(messages)) {
        return Response.json(
          { error: "Messages array required." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const toSave = messages.slice(-MAX_RECENT_MESSAGES);
      await redis.set(historyKey, toSave);

      return Response.json(
        { success: true, saved: toSave.length },
        { headers: CORS_HEADERS }
      );

    } else if (action === "summarize") {
      const history = await redis.get(historyKey);
      if (!history || history.length < SUMMARY_THRESHOLD) {
        return Response.json(
          { success: true, message: "Not enough messages to summarize." },
          { headers: CORS_HEADERS }
        );
      }

      const splitPoint = history.length - 20;
      const olderMessages = history.slice(0, splitPoint);
      const recentMessages = history.slice(splitPoint);

      const existingSummary = await redis.get(summaryKey);
      const olderText = olderMessages
        .map((m) => `${m.role}: ${m.content.substring(0, 200)}`)
        .join("\n");

      const newSummary = existingSummary
        ? `${existingSummary}\n\n--- Continued ---\n${olderText}`
        : olderText;

      const trimmedSummary =
        newSummary.length > 4000
          ? "..." + newSummary.slice(-4000)
          : newSummary;

      await Promise.all([
        redis.set(summaryKey, trimmedSummary),
        redis.set(historyKey, recentMessages),
      ]);

      return Response.json(
        {
          success: true,
          summarized: olderMessages.length,
          remaining: recentMessages.length,
        },
        { headers: CORS_HEADERS }
      );

    } else if (action === "clear") {
      const history = await redis.get(historyKey);
      if (history && history.length > 0) {
        const existingSummary = (await redis.get(summaryKey)) || "";
        const sessionText = history
          .map((m) => `${m.role}: ${m.content.substring(0, 200)}`)
          .join("\n");

        const newSummary = existingSummary
          ? `${existingSummary}\n\n--- Previous conversation ---\n${sessionText}`
          : `--- Previous conversation ---\n${sessionText}`;

        const trimmedSummary =
          newSummary.length > 4000
            ? "..." + newSummary.slice(-4000)
            : newSummary;

        await Promise.all([
          redis.set(summaryKey, trimmedSummary),
          redis.set(historyKey, []),
        ]);
      }

      return Response.json(
        { success: true, message: "Chat cleared. Previous conversation summarized." },
        { headers: CORS_HEADERS }
      );

    } else {
      return Response.json(
        { error: "Invalid action." },
        { status: 400, headers: CORS_HEADERS }
      );
    }
  } catch (error) {
    console.error("History error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
