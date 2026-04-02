"use client";

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// ═══════════════════════════════════════════════════════════════
// Client-side PDF generator — captures the dashboard as-rendered
// and produces a single continuous PDF (no page breaks).
// ═══════════════════════════════════════════════════════════════

const PDF_WIDTH_PT = 612; // letter width in points
// Scale must keep canvas under Chrome's 32768px max dimension.
// At 500px width, content is ~20000px tall → 2x = 40000px (exceeds limit, cuts off).
// 1.5x = 30000px (safe). Quality is still good — 750px effective width.
const PDF_SCALE = 1.5;

/**
 * Capture a DOM element and generate a downloadable PDF.
 *
 * @param {HTMLElement} element — the dashboard content wrapper
 * @param {string} userName — for the filename
 * @returns {Promise<void>}
 */
export default async function generateClientPDF(element, userName = "Report") {
  if (!element) throw new Error("No element provided for PDF capture");

  // ── 1. Prepare the DOM for capture ──
  const origOverflow = element.style.overflow;
  const origHeight = element.style.height;
  const origWidth = element.style.width;
  const origMaxWidth = element.style.maxWidth;
  const origPadding = element.style.padding;

  element.style.overflow = "visible";
  element.style.height = "auto";

  // Narrow the element to mobile-like width so charts and text fill the page
  // proportionally — matching how the report looks on a phone screen.
  // We must wait after this for Recharts ResponsiveContainer to re-render.
  element.style.width = "500px";
  element.style.maxWidth = "500px";
  element.style.padding = "20px 16px";

  // Expand any collapsed/hidden sections
  const hiddenEls = element.querySelectorAll('[data-pdf-hidden="true"], [style*="display: none"], [style*="display:none"]');
  const origDisplay = [];
  hiddenEls.forEach((el) => {
    origDisplay.push({ el, display: el.style.display });
    el.style.display = "block";
  });

  // Force visibility on progressive-reveal items
  const revealItems = element.querySelectorAll('[data-reveal]');
  const origOpacity = [];
  revealItems.forEach((el) => {
    origOpacity.push({ el, opacity: el.style.opacity, transform: el.style.transform });
    el.style.opacity = "1";
    el.style.transform = "none";
    el.style.transition = "none";
  });

  // ── 2. Replace <img> with <canvas> elements ──
  // html2canvas renders <canvas> perfectly but struggles with <img>.
  // We draw each image onto a canvas, swap it in, capture, then swap back.
  const swaps = [];
  const images = element.querySelectorAll("img");

  for (const img of images) {
    if (!img.src || !img.complete || img.naturalWidth === 0) continue;
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);

      // Copy the img's inline styles to the canvas
      c.style.cssText = img.style.cssText;
      // Preserve layout attributes
      if (img.getAttribute("width")) c.setAttribute("width", img.getAttribute("width"));
      if (img.getAttribute("height")) c.setAttribute("height", img.getAttribute("height"));

      // Swap img → canvas in the DOM
      img.parentNode.insertBefore(c, img);
      img.style.display = "none";
      swaps.push({ img, canvas: c });
    } catch (e) {
      console.warn("[PDF] Could not swap image:", img.src, e);
    }
  }

  console.log("[PDF] Swapped", swaps.length, "images to canvas elements");

  // Wait for Recharts ResponsiveContainer to detect the width change and re-render.
  // ResizeObserver fires async, so we need real time — not just animation frames.
  await new Promise(r => setTimeout(r, 1500));

  // ── 3. Capture with html2canvas ──
  // After narrowing to 500px, the content is taller (text wraps more).
  // Explicitly pass the new scrollHeight so nothing gets cut off.
  const captureHeight = element.scrollHeight;
  console.log("[PDF] Capture dimensions:", element.scrollWidth, "x", captureHeight);
  const canvas = await html2canvas(element, {
    scale: PDF_SCALE,
    useCORS: false,
    allowTaint: true,
    backgroundColor: "#0a0a0a",
    logging: false,
    height: captureHeight,
    windowHeight: captureHeight,
    ignoreElements: (el) => el.hasAttribute("data-pdf-exclude"),
  });

  // ── 4. Restore DOM — swap canvas back to img ──
  for (const { img, canvas: c } of swaps) {
    img.style.display = "";
    c.parentNode.removeChild(c);
  }

  element.style.overflow = origOverflow;
  element.style.height = origHeight;
  element.style.width = origWidth;
  element.style.maxWidth = origMaxWidth;
  element.style.padding = origPadding;
  origDisplay.forEach(({ el, display }) => { el.style.display = display; });
  origOpacity.forEach(({ el, opacity, transform }) => {
    el.style.opacity = opacity;
    el.style.transform = transform;
    el.style.transition = "";
  });

  // ── 5. Create single continuous PDF (no page breaks) ──
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const pdfHeightPt = (imgHeight / imgWidth) * PDF_WIDTH_PT;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [PDF_WIDTH_PT, pdfHeightPt],
  });

  const imgDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  pdf.addImage(imgDataUrl, "JPEG", 0, 0, PDF_WIDTH_PT, pdfHeightPt);

  // ── 6. Download ──
  const date = new Date().toISOString().split("T")[0];
  const safeName = userName.replace(/[^a-zA-Z0-9]/g, "_");
  pdf.save(`${safeName}_Root_Mapping_${date}.pdf`);
}
