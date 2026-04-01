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

  // ── 2. Convert all images to inline data URLs via canvas ──
  // html2canvas can't reliably capture <img> tags. We draw each
  // image onto a hidden canvas to produce a data URL, then swap.
  const images = element.querySelectorAll("img");
  const origSrcs = [];

  function imgToDataUrl(imgEl) {
    return new Promise((resolve) => {
      const tryConvert = () => {
        try {
          const c = document.createElement("canvas");
          c.width = imgEl.naturalWidth || imgEl.width || 200;
          c.height = imgEl.naturalHeight || imgEl.height || 200;
          const ctx = c.getContext("2d");
          ctx.drawImage(imgEl, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/png"));
        } catch (e) {
          console.warn("[PDF] Canvas draw failed for", imgEl.src, e);
          resolve(null);
        }
      };
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        tryConvert();
      } else {
        // Image not loaded yet — wait for it
        const fresh = new Image();
        fresh.onload = () => {
          try {
            const c = document.createElement("canvas");
            c.width = fresh.naturalWidth;
            c.height = fresh.naturalHeight;
            c.getContext("2d").drawImage(fresh, 0, 0);
            resolve(c.toDataURL("image/png"));
          } catch (e) {
            resolve(null);
          }
        };
        fresh.onerror = () => resolve(null);
        fresh.src = imgEl.src;
      }
    });
  }

  for (const img of images) {
    if (!img.src || img.src.startsWith("data:")) continue;
    const dataUrl = await imgToDataUrl(img);
    if (dataUrl) {
      origSrcs.push({ el: img, src: img.src });
      img.src = dataUrl;
    }
  }

  // Let the browser render the swapped data URL images
  await new Promise(r => setTimeout(r, 100));

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
