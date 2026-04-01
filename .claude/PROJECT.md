# Unchained Marketing Coach — Project Architecture

## Overview
A Next.js 14 app that runs a diagnostic quiz funnel for men struggling with unwanted sexual behaviors. Users complete an 8-section quiz, receive a personalized AI-generated report, and access an interactive dashboard with charts, trends, and actionable next steps.

## Tech Stack
- **Framework**: Next.js 14 (App Router, `"use client"` components)
- **Hosting**: Vercel Pro
- **AI**: Claude Sonnet (via @anthropic-ai/sdk) for diagnostic analysis
- **Database**: Neon PostgreSQL (pooled via pgbouncer)
- **Cache/Sessions**: Upstash Redis (via Vercel KV)
- **Queue**: Upstash QStash for background report processing
- **Email**: Resend (transactional)
- **PDF**: PDFKit (server-side for GHL), html2canvas + jsPDF (client-side download)
- **CRM**: GoHighLevel via inbound webhooks
- **Charts**: Recharts (radar, bar, heatmap, escalation gauge)
- **Auth**: JWT tokens + 4-digit PIN + bcrypt

## Architecture

### Report Generation Pipeline (QStash)
```
User completes quiz → POST /api/report (enqueue, <1s)
                          ↓
                     QStash queue
                          ↓
                POST /api/report/process (background worker)
                    ├─ Claude Sonnet analysis (~30s)
                    ├─ Store in Redis (dashboard available)
                    ├─ Send email via Resend (dashboard link)
                    ├─ Generate PDF via PDFKit
                    ├─ Upload PDF to Vercel Blob
                    ├─ Send to GHL webhooks (with PDF URL + impersonation link)
                    └─ Write analytics to Postgres
```

### Key Directories
```
app/
  api/
    report/          → POST enqueue + POST process (QStash worker)
    dashboard/       → auth, results, register, set-token, logout
    analytics/       → admin analytics + event recording
    admin/           → clients search, impersonate, check-submission
    chat/            → diagnostic conversation AI
    diagnostic/      → save quiz responses to Redis
    lib/             → shared: auth.js, db.js, redis.js, ghl.js, cors.js, utils.js
  dashboard/
    overview/        → main report display (15,000+ line page.js)
    components/      → ScoreRadar, ScorecardBreakdown, EscalationGauge,
                       StressHeatmap, NeuropathwayDiagram, ViceBalanceDiagram,
                       RelationalBars, TrendOverlay, ResultCard, ReportSelector
    utils/           → generateClientPDF.js (client-side PDF capture)
    login/register/  → PIN-based auth
  admin/
    dashboard/       → internal analytics dashboard (12 tabs)
public/
  quiz.html          → standalone quiz UI (embedded in GHL pages)
  images/            → logos, badges
```

### Data Flow
- **Redis keys**: `mkt:user:{email}`, `mkt:analysis:{email}`, `mkt:report:{email}`, `mkt:history:{email}`, `mkt:status:{email}`
- **Postgres tables**: `analytics_events`, `completed_diagnostics`, `quiz_responses`
- **Vercel Blob**: PDF reports at `reports/{email}/{timestamp}-diagnostic.pdf`

### Dashboard Sections (in order)
1. Cover page (logo, name, date, credentials, LegitScript)
2. Arousal Template Archetype + Secondary
3. Diagnostic Scorecard (radar chart + bar chart)
4. IMPORTANT notice (red)
5. Arousal Template Origin (age, context)
6. Root Narrative + Neuropathway
7. Escalation Risk (line chart with "Default future" projection)
8. Prepare Your Mind (Mason's personal message)
9. Behavior-Root Map (expandable)
10. Confusing Patterns Decoded (expandable)
11. Co-Coping Behaviors + Substance vs Behavior diagram
12. Strategy Audit (what they tried)
13. Spiritual Integration (Sin Nature vs Behavioral Cycle)
14. Attachment Style + How This Shows Up With God
15. Generational Context
16. Relational Patterns
17. Stress Landscape (heatmap)
18. Isolation Level
19. Full Pattern Map (visual diagram)
20. Key Insight
21. What This Means
22. Do Not Conform. Transform. (Romans 12:2 roadmap)
23. Your Recommended Next Step (Priority 1 dominant)
24. Other Resources

### Important Conventions
- **Minimum font size**: 17px for all body text on dashboard
- **Chart labels**: Bright white (#fff), 12px bold
- **Color palette**: Gold (#c5a55a), Dark BG (#0a0a0a), Card BG (#1a1a1a)
- **No first name** in: Key Insight, Your Recommended Next Step
- **First name used** in: What This Means, Priority 1 body
- **Claude model**: claude-sonnet-4-20250514 (line 375 of process/route.js — change to claude-opus-4-6 for higher quality)

### Admin Dashboard
- URL: /admin/dashboard (password-protected via ADMIN_PASSWORD)
- 12 tabs: Dashboard, Funnel, Trends, Research, Drop-off, Devices, Cohort, Submissions, Locations, System Health, Export, Clients
- Clients tab: search by name/email, view reports, VIEW DASHBOARD (admin impersonation)

### GHL Webhook Payload
Both webhooks receive: `contact.email`, `contact.name`, `contact.report_url`, `contact.impersonation_access`, `reportUrl`, `dashboardUrl`, `diagnostic.*`, `tags[]`

### Environment Variables
See `.env.example` for the full list with descriptions.
