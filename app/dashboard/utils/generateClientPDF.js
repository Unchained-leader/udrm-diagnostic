"use client";

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// ═══════════════════════════════════════════════════════════════
// Client-side PDF generator — captures the dashboard as-rendered
// and produces a single continuous PDF (no page breaks).
// ═══════════════════════════════════════════════════════════════

const PDF_WIDTH_PT = 612; // letter width in points
const PDF_SCALE = 2;      // 2x for retina-quality output

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
  const origPaddingRight = element.style.paddingRight;
  const origWordBreak = element.style.wordBreak;
  const origOverflowWrap = element.style.overflowWrap;

  element.style.overflow = "visible";
  element.style.height = "auto";
  // Force a consistent width so text never clips at the right edge
  element.style.width = "780px";
  element.style.maxWidth = "780px";
  element.style.paddingRight = "20px";
  // Prevent any text overflow
  element.style.wordBreak = "break-word";
  element.style.overflowWrap = "break-word";

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

  // Give the browser a frame to render the swaps
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // ── 3. Capture with html2canvas ──
  const canvas = await html2canvas(element, {
    scale: PDF_SCALE,
    useCORS: false,
    allowTaint: true,
    backgroundColor: "#0a0a0a",
    logging: false,
    windowWidth: 860, // Force consistent render width so text doesn't clip
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
  element.style.paddingRight = origPaddingRight;
  element.style.wordBreak = origWordBreak;
  element.style.overflowWrap = origOverflowWrap;
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
