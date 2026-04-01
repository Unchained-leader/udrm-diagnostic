import { createDashboardToken } from "../../lib/auth";

export const maxDuration = 120; // 2 minutes for chromium cold start + render

// ═══════════════════════════════════════════════════════════════
// POST /api/report/capture — Server-side dashboard PDF capture
// Uses headless Chromium to render the dashboard and print to PDF.
// Called internally by /api/report/process after analysis is stored.
// ═══════════════════════════════════════════════════════════════

export async function POST(request) {
  const { email, secret } = await request.json();

  // Only allow internal calls
  if (secret !== process.env.QSTASH_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  console.log(`[Capture] Starting PDF capture for ${email}`);

  let browser = null;
  try {
    // Dynamic imports — these are large binaries that must not be loaded at build time
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteerCore = (await import("puppeteer-core")).default;

    // Generate a temporary JWT for the dashboard
    const token = await createDashboardToken(email, "User");

    // Launch headless Chromium
    const executablePath = await chromium.executablePath();
    browser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: { width: 900, height: 1200 },
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Set the auth cookie
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://unchainedleader.io";
    const domain = new URL(baseUrl).hostname;
    await page.setCookie({
      name: "dashboard_token",
      value: token,
      domain,
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
    });

    // Navigate to dashboard in print mode
    const dashboardUrl = `${baseUrl}/dashboard/overview?print=true`;
    console.log(`[Capture] Navigating to ${dashboardUrl}`);
    await page.goto(dashboardUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for the page to signal it's ready
    console.log("[Capture] Waiting for data-print-ready...");
    await page.waitForSelector("[data-print-ready]", { timeout: 30000 });

    // Extra wait for charts to fully render
    await page.waitForTimeout(2000);

    // Get the full page height
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);

    // Generate PDF — single continuous page matching the content
    const pdfBuffer = await page.pdf({
      width: "900px",
      height: `${bodyHeight}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    console.log(`[Capture] PDF generated: ${Math.round(pdfBuffer.length / 1024)}KB`);

    await browser.close();
    browser = null;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error(`[Capture] PDF capture failed for ${email}:`, error.message);
    console.error("[Capture] Stack:", error.stack);
    if (browser) await browser.close().catch(() => {});
    return Response.json({ error: `Capture failed: ${error.message}` }, { status: 500 });
  }
}
