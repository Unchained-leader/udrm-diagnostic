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

      // Send reset code email via Resend
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        try {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Unchained Support <onboarding@resend.dev>",
              to: [normalizedEmail],
              subject: "Your Unchained AI Coach PIN Reset Code",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #111; color: #e0e0e0; border-radius: 12px;">
                  <h2 style="color: #C4872E; margin-top: 0;">Reset Your PIN</h2>
                  <p>Hey — you requested a PIN reset for your Unchained AI Coach account.</p>
                  <p>Your reset code is:</p>
                  <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #C4872E; margin: 16px 0;">
                    ${resetCode}
                  </div>
                  <p style="color: #999; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, just ignore this email.</p>
                  <p style="margin-top: 24px;">Stay unchained,<br/><strong style="color: #C4872E;">The Unchained Team</strong></p>
                </div>
              `,
            }),
          });
          if (!emailRes.ok) {
            const errBody = await emailRes.text();
            console.error("Resend email error:", emailRes.status, errBody);
          }
        } catch (e) {
          console.error("Resend email error:", e.message);
          // Don't fail the request — code is still in Redis
        }
      } else {
        console.warn("RESEND_API_KEY not configured");
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
