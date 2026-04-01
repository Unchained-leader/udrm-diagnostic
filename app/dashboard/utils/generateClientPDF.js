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

  // ── 2. Pre-build a map of image data URLs ──
  // We do NOT modify the live DOM. Instead we convert images to data
  // URLs here, then apply them inside html2canvas's onclone callback
  // which operates on a cloned copy of the DOM.
  const images = element.querySelectorAll("img");
  const dataUrlMap = new Map();

  for (const img of images) {
    if (!img.src || img.src.startsWith("data:") || dataUrlMap.has(img.src)) continue;
    try {
      if (img.complete && img.naturalWidth > 0) {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        dataUrlMap.set(img.src, c.toDataURL("image/png"));
      } else {
        // Load a fresh copy
        const dataUrl = await new Promise((resolve) => {
          const fresh = new Image();
          fresh.onload = () => {
            try {
              const c = document.createElement("canvas");
              c.width = fresh.naturalWidth;
              c.height = fresh.naturalHeight;
              c.getContext("2d").drawImage(fresh, 0, 0);
              resolve(c.toDataURL("image/png"));
            } catch { resolve(null); }
          };
          fresh.onerror = () => resolve(null);
          fresh.src = img.src;
        });
        if (dataUrl) dataUrlMap.set(img.src, dataUrl);
      }
    } catch (e) {
      console.warn("[PDF] Could not convert image:", img.src, e);
    }
  }

  // Build a lookup that matches by pathname (ignores origin differences in clone)
  const pathMap = new Map();
  for (const [url, dataUrl] of dataUrlMap) {
    try {
      const path = new URL(url).pathname;
      pathMap.set(path, dataUrl);
    } catch {
      pathMap.set(url, dataUrl);
    }
  }

  console.log("[PDF] Image data URLs prepared:", pathMap.size, "unique images");

  // ── 3. Capture with html2canvas (using onclone to fix images) ──
  const canvas = await html2canvas(element, {
    scale: PDF_SCALE,
    useCORS: false,
    allowTaint: true,
    backgroundColor: "#0a0a0a",
    logging: false,
    ignoreElements: (el) => el.hasAttribute("data-pdf-exclude"),
    onclone: (clonedDoc) => {
      // Swap images in the CLONE only — live DOM stays untouched
      const clonedImgs = clonedDoc.querySelectorAll("img");
      clonedImgs.forEach((img) => {
        // Try exact match first, then match by pathname
        let dataUrl = dataUrlMap.get(img.src);
        if (!dataUrl) {
          try {
            const path = new URL(img.src).pathname;
            dataUrl = pathMap.get(path);
          } catch {}
        }
        if (dataUrl) {
          img.src = dataUrl;
        }
      });
    },
  });

  // ── 4. Restore DOM (no image restore needed — we never touched them) ──
  element.style.overflow = origOverflow;
  element.style.height = origHeight;
  origDisplay.forEach(({ el, display }) => { el.style.display = display; });
  origOpacity.forEach(({ el, opacity, transform }) => {
    el.style.opacity = opacity;
    el.style.transform = transform;
    el.style.transition = "";
  });

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
