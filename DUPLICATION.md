# Duplicating UDRM → 90DTF (zero-downtime runbook)

This repo is now **duplication-ready**. A second, fully independent app
(**90dtf** — 90-Day Transformation, at `90dtf.unchainedleader.io`) can be stood
up from a copy of this codebase without any downtime or risk to the live UDRM at
`unchainedleader.io`.

The live UDRM is never touched: 90dtf is a separate repo + separate Vercel
project + its own backing services. The **only** shared resource is the Neon
Postgres analytics DB, and 90dtf only ever INSERTs rows tagged `product='90dtf'`
— it never reads, updates, or deletes `product='udrm'` rows. That's how 90dtf
results show up in the existing "Unchained Analytics" dashboard.

## What's already done in code
- `app/api/lib/product.js` — single source of truth: `PRODUCT_TAG =
  process.env.PRODUCT_TAG || "udrm"`. Unset = behaves exactly like today's UDRM.
- All analytics write/query paths now use `PRODUCT_TAG` instead of a hardcoded
  `'udrm'` (`app/api/report/process/route.js`, `app/api/analytics/route.js`,
  `app/api/analytics/{daily,full-extract,marketing-narratives,export}/route.js`).
- The daily Slack report's dashboard link now follows `NEXT_PUBLIC_APP_URL`.
- The Unchained Analytics dashboard has a `90DTF` product filter option
  (`app/admin/dashboard/page.js`).
- `.env.90dtf.example` — fill-in-the-blanks env template for the 90dtf deployment.

So standing up 90dtf = copy this code into a new repo, set the env vars from
`.env.90dtf.example` (notably `PRODUCT_TAG=90dtf`), and deploy.

## Steps that require your accounts (copy-paste)

### 1. Provision new backing services (all NEW except the DB)
- **Upstash Redis**: create a new database → `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
- **Upstash QStash**: get `QSTASH_TOKEN` + signing keys. QStash will call
  `https://90dtf.unchainedleader.io/api/report/process`.
- **Resend**: add & verify the sending domain/subdomain (DNS records may take a
  while to verify) → `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- **GoHighLevel**: create new inbound webhooks for the 90dtf pipeline →
  `GHL_WEBHOOK_URL`, `GHL_REPORT_WEBHOOK_URL`.
- **Anthropic**: create a new API key (clean cost separation) → `ANTHROPIC_API_KEY`.
- Generate fresh `JWT_SECRET`, `ADMIN_PASSWORD`, `ADMIN_KEY`. Optional new Slack
  webhook / Zapier hook.
- **Reuse only** the `DATABASE_URL` / `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`
  values from the live UDRM (the shared analytics DB).

### 2. Create the new repo
- Create `Unchained-leader/90dtf` on GitHub and push a copy of this codebase to it
  (intentional divergence — fresh history is fine).

### 3. Deploy to a new Vercel project
- New Vercel project (team `unchained-leader`) connected to the `90dtf` repo.
- Add every variable from `.env.90dtf.example`, including `PRODUCT_TAG=90dtf`.
- Add domain `90dtf.unchainedleader.io` and create the DNS record at your provider.
- **Do NOT run `POST /api/analytics/migrate`** — the shared DB schema already
  exists; 90dtf reuses it. (Running it is idempotent but unnecessary; skip it.)

### 4. Point the 90dtf quiz at the 90dtf API
- On the new GHL landing pages embedding the quiz, set
  `window.UNCHAINED_MKT_API_URL = "https://90dtf.unchainedleader.io"` before the
  quiz script (see `public/quiz.html` around line 774). Update the "OPEN MY
  DASHBOARD" link similarly.

## Verify
**90dtf works:** complete the quiz at `https://90dtf.unchainedleader.io/`, confirm
the report email arrives from the new Resend sender and the dashboard link
resolves on the 90dtf domain (check the new Vercel project's runtime logs for the
QStash → `/api/report/process` call).

**Analytics seam works:** in Unchained Analytics, pick the `90DTF` filter (or
"All Products") and confirm the test submission appears. Spot-check:
`SELECT product, COUNT(*) FROM completed_diagnostics GROUP BY product;`

**Live UDRM unaffected:** `unchainedleader.io` quiz + dashboard still work; no new
deploys on `unchained-marketing-coach`; `product='udrm'` row counts only change
from genuine live traffic.

## After duplication
All further changes for the new purpose happen in the `90dtf` repo and deploy only
to its own Vercel project — the live UDRM cannot be affected. Likely first edits:
quiz content/scoring (`public/quiz.html`, `app/api/chat/system-prompt.js`), the
report prompt/layout (`app/api/report/process/route.js`), and the admin-chat
schema notes (`app/api/admin/chat/route.js`, which still say product is "always
'udrm'").
