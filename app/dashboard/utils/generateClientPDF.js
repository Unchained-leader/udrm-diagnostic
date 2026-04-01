"use client";

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// ═══════════════════════════════════════════════════════════════
// Client-side PDF generator — captures the dashboard as-rendered
// and produces a pixel-perfect multi-page PDF.
// ═══════════════════════════════════════════════════════════════

const LETTER_W = 612; // points
const LETTER_H = 792;
const PDF_SCALE = 2;  // 2x for retina-quality output

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
  // Force all sections visible (override progressive reveal)
  const origOverflow = element.style.overflow;
  const origHeight = element.style.height;
  element.style.overflow = "visible";
  element.style.height = "auto";

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

  // ── 2. Capture with html2canvas ──
  const canvas = await html2canvas(element, {
    scale: PDF_SCALE,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#0a0a0a", // Match dashboard dark background
    logging: false,
    // Ignore interactive-only elements
    ignoreElements: (el) => {
      return el.hasAttribute("data-pdf-exclude");
    },
  });

  // ── 3. Restore DOM ──
  element.style.overflow = origOverflow;
  element.style.height = origHeight;
  origDisplay.forEach(({ el, display }) => { el.style.display = display; });
  origOpacity.forEach(({ el, opacity, transform }) => {
    el.style.opacity = opacity;
    el.style.transform = transform;
    el.style.transition = "";
  });

  // ── 4. Slice canvas into pages ──
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // PDF page dimensions in canvas pixels
  const pageWidthPx = imgWidth;
  const pageHeightPx = (LETTER_H / LETTER_W) * imgWidth;

  const totalPages = Math.ceil(imgHeight / pageHeightPx);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
  });

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();

    // Create a slice canvas for this page
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = pageWidthPx;
    const sliceHeight = Math.min(pageHeightPx, imgHeight - page * pageHeightPx);
    sliceCanvas.height = sliceHeight;

    const ctx = sliceCanvas.getContext("2d");
    // Fill background in case the slice is shorter than a full page
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

    // Draw the portion of the full canvas for this page
    ctx.drawImage(
      canvas,
      0, page * pageHeightPx,           // source x, y
      pageWidthPx, sliceHeight,          // source width, height
      0, 0,                              // dest x, y
      pageWidthPx, sliceHeight           // dest width, height
    );

    const sliceDataUrl = sliceCanvas.toDataURL("image/jpeg", 0.92);

    // Scale to fill the PDF page
    const pdfImgHeight = (sliceHeight / pageWidthPx) * LETTER_W;
    pdf.addImage(sliceDataUrl, "JPEG", 0, 0, LETTER_W, pdfImgHeight);
  }

  // ── 5. Download ──
  const date = new Date().toISOString().split("T")[0];
  const safeName = userName.replace(/[^a-zA-Z0-9]/g, "_");
  pdf.save(`${safeName}_Root_Mapping_${date}.pdf`);
}
