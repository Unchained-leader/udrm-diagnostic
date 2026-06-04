# Incident: Redis quota exhaustion (Jun 3–4, 2026)

## Summary
The production cache (Upstash Redis `upstash-kv-citrine-envelope`) hit its
256 MB free-tier limit and began rejecting **all writes** for ~12.5 hours
(Jun 3 ~12:40 PM ET → Jun 4 ~1:15 AM ET). Because the quiz/report pipeline
writes to Redis at nearly every step, report generation stopped and the
final quiz step (email submission → account creation) failed for everyone.

## Impact
- ~**412 quiz starts**, ~**299 finished**, **0 reports delivered** during the window.
- **Answers were preserved** — they are logged per-question to Postgres
  `quiz_responses` (independent of the cache): 409 sessions / 5,973 answers.
- **Identities were lost** — email/name were only ever written to Redis at
  registration, and that step threw before GHL/Zapier fired, so nothing
  durable recorded who those ~300 people were. They are unrecoverable;
  re-invite the originating traffic source to retake.
- 2 quizzes whose drafts reached Redis just before the crash were recovered
  and re-sent successfully.

## Root cause
Several `redis.set` call sites stored large per-user JSON blobs with **no
TTL**, so the cache grew unbounded (~5,600 users × 5 keys). The bulk was
`mkt:analysis` (~112 MB) and `mkt:history` (~117 MB) — both legitimate
dashboard data, i.e. the app genuinely outgrew the 256 MB free tier.
A secondary failure: the KV store had been disconnected from the
`unchained-marketing-coach` Vercel project, so its credentials were missing
from project settings while the live (May-build) deployment kept using
baked-in credentials to reach the now-full store.

## Resolution (completed)
1. Freed space by deleting 5,596 finished `mkt:diagnostic` drafts (reports
   already delivered; not read by any dashboard). Archived first. Writes
   resumed immediately; site returned to healthy.
2. Re-sent the 2 recoverable reports.
3. Exported the 409 anonymous outage quiz sets for research.

## Code changes shipped (branch `claude/investigate-pipeline-failures-aZOtN`)
- **TTLs** on `mkt:analysis` / `mkt:report` / `mkt:history` (90d),
  `mkt:diagnostic` (7d + explicit delete on report success), `mkt:summary`
  (30d) — caps cache growth.
- **Durable identity capture** in `quiz-register`: writes identity to a new
  Postgres `quiz_registrations` table and fires GHL/Zapier regardless of
  cache state; Redis write is now best-effort. (Frontend should send
  `sessionId` to link registrations to `quiz_responses` answers.)
- Alert accuracy fix, mobile admin-dashboard layout fix, S7→email funnel metric.
- `scripts/recover-failed-reports.mjs` — re-enqueues recoverable reports and
  can free space safely.

## Remaining manual steps (require console access) — DO IN ORDER
1. **Reconnect** `upstash-kv-citrine-envelope` to the `unchained-marketing-coach`
   project (Vercel → store → "Connect to Project"). Restores KV env vars to
   the project. **Do this BEFORE any deploy**, or a new build loses the cache
   connection.
2. **Deploy** this branch (merge to `main`). Activates the TTL + identity fixes.
3. **Upgrade** the Redis store off the Free tier (the data legitimately
   exceeds 256 MB). Optionally follow with a one-time pass to TTL/trim the
   existing un-expired keys, and a code change to stop `mkt:history`
   duplicating full `mkt:analysis` copies (~100 MB reclaimable).
4. **Rotate** the Redis token and Neon password (were shared during recovery).
