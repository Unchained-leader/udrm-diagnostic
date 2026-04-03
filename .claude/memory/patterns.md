# Coding Patterns

### API Route Pattern
All API routes in `app/api/` follow:
1. CORS headers via `corsHeaders()` from `app/api/lib/cors.js`
2. OPTIONS handler for preflight
3. Try/catch with structured error responses
4. Redis for user data, Postgres for analytics

### Redis Key Convention
All keys prefixed with `mkt:` followed by domain and email:
- `mkt:user:{email}` — user profile
- `mkt:diagnostic:{email}` — quiz messages
- `mkt:analysis:{email}` — Claude analysis
- `mkt:report:{email}` — generated report
- `mkt:history:{email}` — past reports array
- `mkt:status:{email}` — processing status

### Auth Pattern
- JWT via `jose` library (not jsonwebtoken)
- Token creation/verification in `app/api/lib/auth.js`
- 7-day expiration, HttpOnly cookies
- PIN validated against bcrypt hash in Redis

### QStash Background Job Pattern
```
Thin enqueue endpoint → QStash → Background worker endpoint
POST /api/report → enqueue → POST /api/report/process
```
- Enqueue returns immediately (<1s)
- Worker does heavy lifting (Claude API, PDF, email, webhooks)
- Failure callback at POST /api/report/failure

### Dashboard Component Pattern
- Client components with "use client" directive
- Color constants: `GOLD = "#C9A227"`, `CARD_BG = "#111111"`
- Recharts for all visualizations
- useState + useEffect for data fetching and polling

### GHL Webhook Pattern
- Two webhook URLs (contact events + report delivery)
- Payloads built in `app/api/lib/ghl.js`
- Include diagnostic analysis, report URL, dashboard impersonation link
