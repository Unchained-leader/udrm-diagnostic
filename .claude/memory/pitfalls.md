# Known Pitfalls & Gotchas

### PDF Generation
**Issue:** Client-side PDF capture (html2canvas + jsPDF) fails or produces blank pages when canvas exceeds browser limits.
**Root Cause:** Explicit height constraints and high scale values push canvas past browser maximums.
**Fix:** Remove explicit height from html2canvas options, reduce scale factor. Recent commits focused on this.

### Dashboard Overview Page Size
**Issue:** `app/dashboard/overview/page.js` is 1000+ lines — easy to break with unfocused edits.
**Fix:** Be surgical. Read the specific section before editing. Verify changes at `/dashboard/overview`.

### Cross-Origin Auth (GHL Iframe)
**Issue:** Cookies don't persist in cross-origin iframes (Safari, some Chrome versions).
**Fix:** Token-in-URL exchange pattern in middleware.js — token passed as URL param, then exchanged for HttpOnly cookie on first load.

### Redis Data Parsing
**Issue:** Redis returns strings, not objects. Forgetting to parse causes silent failures.
**Fix:** Always use `parseRedis()` from `app/api/lib/utils.js` when reading Redis values.

### CORS for GHL Embedding
**Issue:** Quiz and dashboard are embedded in GoHighLevel pages via iframes.
**Fix:** All API routes include `corsHeaders()` with wildcard origin. Don't remove this.

### Font Size Minimum
**Issue:** Body text below 17px fails brand guidelines.
**Fix:** Enforced convention — check CONTRIBUTING.md.
