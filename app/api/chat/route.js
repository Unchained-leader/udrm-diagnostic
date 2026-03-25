import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./system-prompt";
import { readFileSync } from "fs";
import { join } from "path";

// Load knowledge base at startup (cached in memory)
let knowledgeBase = "";
try {
  knowledgeBase = readFileSync(
    join(process.cwd(), "knowledge-base.md"),
    "utf-8"
  );
} catch (e) {
  console.error("Warning: knowledge-base.md not found. AI will operate without program knowledge.");
}

const client = new Anthropic();

// Crisis detection keywords
const CRISIS_KEYWORDS = [
  "kill myself",
  "want to die",
  "end it all",
  "suicide",
  "suicidal",
  "self-harm",
  "self harm",
  "hurt myself",
  "don't want to live",
  "dont want to live",
  "no reason to live",
  "better off dead",
  "end my life",
  "take my life",
  "not worth living",
];

function detectCrisis(message) {
  const lower = message.toLowerCase();
  return CRISIS_KEYWORDS.some((keyword) => lower.includes(keyword));
}

async function sendCrisisAlert(message, userId) {
  // Slack webhook alert
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🚨 *CRISIS ALERT — Root Genre Diagnostic*\n*User:* ${userId || "Unknown"}\n*Time:* ${new Date().toISOString()}\n*Message:* ${message.substring(0, 500)}\n\nPlease reach out to this person immediately.`,
        }),
      });
    } catch (e) {
      console.error("Failed to send Slack crisis alert:", e);
    }
  }

  // Email alert via Resend
  if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Unchained AI Guide <alerts@unchained.support>",
          to: process.env.ALERT_EMAIL,
          subject: "🚨 CRISIS ALERT — Root Genre Diagnostic User Needs Immediate Support",
          html: `<h2>Crisis Detected</h2>
            <p><strong>User:</strong> ${userId || "Unknown"}</p>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <p><strong>Message:</strong> ${message.substring(0, 500)}</p>
            <p>Please reach out to this person immediately.</p>`,
        }),
      });
    } catch (e) {
      console.error("Failed to send email crisis alert:", e);
    }
  }
}

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
    const { messages, userId, userName, conversationSummary } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages array required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Get the latest user message
    const latestMessage = messages[messages.length - 1]?.content || "";

    // Crisis detection — alert team in background
    if (detectCrisis(latestMessage)) {
      sendCrisisAlert(latestMessage, userId || userName); // fire and forget
    }

    // Check if diagnostic is already complete (look for [PROGRESS:100] in history)
    let diagnosticComplete = false;
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.content && msg.content.includes("[PROGRESS:100]")) {
        diagnosticComplete = true;
        break;
      }
    }

    // Build system prompt with user context
    const systemPrompt = buildSystemPrompt(knowledgeBase, {
      name: userName || null,
      diagnosticComplete,
    });

    // If there's a conversation summary from previous sessions, prepend it
    const summaryContext = conversationSummary
      ? `\n═══ PREVIOUS CONVERSATION CONTEXT ═══\nThe following is a summary of your earlier conversations with this user. Use it to maintain continuity and reference past discussions when relevant:\n${conversationSummary}\n═══ END PREVIOUS CONTEXT ═══\n`
      : "";

    // Format messages for Claude API (keep last 20 for context window management)
    const recentMessages = messages.slice(-20).map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    }));

    // Call Claude API with streaming — use higher max tokens for diagnostic teaser output
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: systemPrompt + summaryContext,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: recentMessages,
    });

    // Stream the response back
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta"
            ) {
              const chunk = event.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
              );
            }
          }
          const finalMessage = await stream.finalMessage();
          const fullResponse = finalMessage.content
            .map((c) => c.text)
            .join("");

          if (fullResponse.includes("[CRISIS_DETECTED]")) {
            sendCrisisAlert(latestMessage, userId || userName);
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    return new Response(
      JSON.stringify({
        error: "Something went wrong. Please try again.",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}
