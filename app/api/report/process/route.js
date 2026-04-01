import { Receiver } from "@upstash/qstash";
import { processReport } from "../route";

export const maxDuration = 300;

export async function POST(request) {
  // Verify QStash signature at runtime (avoids build-time env var requirement)
  if (process.env.QSTASH_CURRENT_SIGNING_KEY) {
    const receiver = new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
    });
    const signature = request.headers.get("upstash-signature");
    const body = await request.text();
    const isValid = await receiver.verify({ signature, body }).catch(() => false);
    if (!isValid) {
      console.error("[QStash] Invalid signature — rejecting request");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    var payload = JSON.parse(body);
  } else {
    // No signing keys configured — allow direct calls (dev mode)
    var payload = await request.json();
  }

  const { email, name, gender, ageRange, geo } = payload;

  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    console.log(`[QStash] Processing report for ${email}`);
    const result = await processReport({ email, name, gender, ageRange, geo });
    console.log(`[QStash] Report complete for ${email}`, result?.reportUrl ? "with PDF" : "without PDF");
    return Response.json({ success: true });
  } catch (err) {
    console.error(`[QStash] Report processing failed for ${email}:`, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
