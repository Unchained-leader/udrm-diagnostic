import redis from "../lib/redis.js";

export async function POST(request) {
  try {
    const { action, email, code, newPin } = await request.json();
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return Response.json({ error: "Valid email is required." }, { status: 400 });
    }

    // ========== REQUEST RESET ==========
    if (action === "request") {
      // Check user exists
      const user = await redis.get(`user:${normalizedEmail}`);
      if (!user) {
        // Don't reveal whether email exists — show same success message
        return Response.json({ ok: true });
      }

      // Generate 6-digit reset code
      const resetCode = String(Math.floor(100000 + Math.random() * 900000));

      // Store code in Redis with 10-minute expiry
      await redis.set(`reset:${normalizedEmail}`, resetCode, { ex: 600 });

      // Call GHL webhook to send the email
      const webhookUrl = process.env.GHL_RESET_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: normalizedEmail,
              resetCode: resetCode,
            }),
          });
        } catch (e) {
          console.error("GHL webhook error:", e.message);
          // Don't fail the request — code is still in Redis
        }
      } else {
        console.warn("GHL_RESET_WEBHOOK_URL not configured");
      }

      return Response.json({ ok: true });
    }

    // ========== VERIFY CODE & RESET PIN ==========
    if (action === "verify") {
      if (!code || !/^\d{6}$/.test(code)) {
        return Response.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
      }
      if (!newPin || !/^\d{4}$/.test(newPin)) {
        return Response.json({ error: "New PIN must be 4 digits." }, { status: 400 });
      }

      // Check reset code
      const storedCode = await redis.get(`reset:${normalizedEmail}`);
      if (!storedCode || storedCode !== code) {
        return Response.json({ error: "Invalid or expired code. Please request a new one." }, { status: 400 });
      }

      // Update the user's PIN
      const user = await redis.get(`user:${normalizedEmail}`);
      if (!user) {
        return Response.json({ error: "Account not found." }, { status: 404 });
      }

      const userData = typeof user === "string" ? JSON.parse(user) : user;
      userData.pin = newPin;
      await redis.set(`user:${normalizedEmail}`, JSON.stringify(userData));

      // Clean up the reset code
      await redis.del(`reset:${normalizedEmail}`);

      return Response.json({ ok: true, message: "PIN updated successfully." });
    }

    return Response.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("Reset PIN error:", error);
    return Response.json({ error: "Server error." }, { status: 500 });
  }
}
