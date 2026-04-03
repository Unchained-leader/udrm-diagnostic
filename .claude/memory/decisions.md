# Architectural Decisions

### 2026-04-03: Initial Memory Setup
**Context:** Setting up agent memory system for the udrm-diagnostic project.
**Decision:** Created `.claude/memory/` with decisions.md, pitfalls.md, patterns.md, and session-log.md per the global memory protocol.
**Outcome:** Agent memory system active for this project.

### Pre-existing Decisions (from PROJECT.md)

### QStash for Report Generation
**Context:** Report generation with Claude Sonnet takes ~30s — too long for a synchronous API call.
**Decision:** Use Upstash QStash as a background job queue. POST /api/report enqueues (<1s), POST /api/report/process runs as a background worker.
**Alternatives Rejected:** Vercel serverless timeout workarounds, external queue services.
**Outcome:** Users get immediate response; report generates in background.

### PIN-based Auth (no passwords)
**Context:** Users access their dashboard via email link. Needed simple auth without full account system.
**Decision:** JWT tokens + 4-digit PIN + bcrypt. No traditional username/password.
**Outcome:** Low-friction access for quiz takers who aren't "signing up" for a product.

### Redis for Session/Report Data, Postgres for Analytics
**Context:** Reports need fast read/write for dashboard rendering. Analytics need relational queries.
**Decision:** Redis (Upstash/Vercel KV) for user data, analysis, reports, history, status. Postgres (Neon) for analytics_events, completed_diagnostics, quiz_responses.
**Outcome:** Fast dashboard loads, queryable analytics.

### Client-side + Server-side PDF Generation
**Context:** Need PDFs for both GHL CRM delivery and user download.
**Decision:** PDFKit on server (for GHL webhook delivery), html2canvas + jsPDF on client (for user download button).
**Outcome:** GHL gets clean PDF automatically; users can download their own report.

### Claude Sonnet for Diagnostic Analysis
**Context:** Need AI to analyze quiz responses and generate personalized diagnostic reports.
**Decision:** Claude Sonnet (claude-sonnet-4-20250514) via @anthropic-ai/sdk. Can upgrade to claude-opus-4-6 for higher quality (line 375 of process/route.js).
**Outcome:** Rich, personalized diagnostic reports.
