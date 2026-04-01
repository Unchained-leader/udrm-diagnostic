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

  // ── 2. Convert all images to inline data URLs ──
  // html2canvas struggles with images even on same-origin.
  // Converting to data URLs guarantees they render in the capture.
  const images = element.querySelectorAll("img");
  const origSrcs = [];

  // Fetch each unique URL once, then apply to all matching images
  const urlCache = new Map();
  for (const img of images) {
    if (!img.src || img.src.startsWith("data:")) continue;
    const url = img.src;
    if (!urlCache.has(url)) {
      urlCache.set(url, fetch(url)
        .then(r => r.blob())
        .then(blob => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        }))
        .catch(e => { console.warn("[PDF] Could not inline:", url, e); return null; })
      );
    }
  }

  // Wait for all fetches, then swap srcs
  const resolved = new Map();
  for (const [url, promise] of urlCache) {
    resolved.set(url, await promise);
  }
  for (const img of images) {
    if (!img.src || img.src.startsWith("data:")) continue;
    const dataUrl = resolved.get(img.src);
    if (dataUrl) {
      origSrcs.push({ el: img, src: img.src });
      img.src = dataUrl;
    }
  }

  // Give the browser a frame to render the swapped images
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // ── 3. Capture with html2canvas ──
  const canvas = await html2canvas(element, {
    scale: PDF_SCALE,
    useCORS: false,
    allowTaint: true,
    backgroundColor: "#0a0a0a",
    logging: false,
    ignoreElements: (el) => {
      return el.hasAttribute("data-pdf-exclude");
    },
  });

  // ── 4. Restore DOM ──
  element.style.overflow = origOverflow;
  element.style.height = origHeight;
  origDisplay.forEach(({ el, display }) => { el.style.display = display; });
  origOpacity.forEach(({ el, opacity, transform }) => {
    el.style.opacity = opacity;
    el.style.transform = transform;
    el.style.transition = "";
  });
  // Restore original image srcs
  origSrcs.forEach(({ el, src }) => { el.src = src; });

  // ── 5. Create single continuous PDF (no page breaks) ──
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  // Calculate PDF height to match content aspect ratio
  const pdfHeightPt = (imgHeight / imgWidth) * PDF_WIDTH_PT;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [PDF_WIDTH_PT, pdfHeightPt], // custom single-page size
  });

  const imgDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  pdf.addImage(imgDataUrl, "JPEG", 0, 0, PDF_WIDTH_PT, pdfHeightPt);

  // ── 6. Download ──
  const date = new Date().toISOString().split("T")[0];
  const safeName = userName.replace(/[^a-zA-Z0-9]/g, "_");
  pdf.save(`${safeName}_Root_Mapping_${date}.pdf`);
}
