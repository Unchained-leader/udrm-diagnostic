# Contributing to Unchained Marketing Coach

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/Unchained-leader/unchained-marketing-coach.git
cd unchained-marketing-coach
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env.local
```
Ask Mason for the production values. Fill them into `.env.local`. **Never commit `.env.local`.**

### 4. Run locally
```bash
npm run dev
```
Open http://localhost:3000

## Making Changes

### Branch workflow (required)
```bash
# 1. Start from latest main
git checkout main
git pull origin main

# 2. Create a feature branch
git checkout -b feature/your-change-name

# 3. Make your changes (use Claude Code, manual edits, etc.)

# 4. Commit with a clear message
git add <files>
git commit -m "Short description of what and why"

# 5. Push your branch
git push origin feature/your-change-name

# 6. Open a Pull Request on GitHub
# Go to github.com/Unchained-leader/unchained-marketing-coach/pulls
# Click "New Pull Request" → select your branch → fill in description

# 7. Wait for review + approval, then merge
```

**Direct pushes to `main` are blocked.** All changes must go through a Pull Request with at least 1 approval.

## Using Claude Code

Each team member uses their own Claude Code account. The project context is shared via the `.claude/PROJECT.md` file in the repo — Claude reads this automatically and understands the full system architecture.

### Tips for Claude Code on this project
- **Always read before editing**: Claude should read the file before modifying it
- **Test locally if possible**: Run `npm run dev` and check your changes
- **Check the dashboard**: After changes, verify at `/dashboard/overview` and `/admin/dashboard`
- **The dashboard page.js is 15,000+ lines**: Be specific about what section you want to change
- **Minimum font size is 17px**: Don't go below this for any body text

## Key Files

| What | Where |
|------|-------|
| Quiz | `public/quiz.html` |
| Report enqueue | `app/api/report/route.js` |
| Report processing | `app/api/report/process/route.js` |
| Dashboard | `app/dashboard/overview/page.js` |
| Dashboard components | `app/dashboard/components/` |
| Admin dashboard | `app/admin/dashboard/page.js` |
| GHL integration | `app/api/lib/ghl.js` |
| Auth | `app/api/lib/auth.js` |
| Database | `app/api/lib/db.js` |
| Redis | `app/api/lib/redis.js` |
| Claude prompt | Inside `app/api/report/process/route.js` (analyzeConversation function, ~line 364) |
| Client-side PDF | `app/dashboard/utils/generateClientPDF.js` |

## Deployment

Vercel auto-deploys when a PR is merged to `main`. No manual deployment needed.

- **Production URL**: https://unchainedleader.io
- **Admin dashboard**: https://unchainedleader.io/admin/dashboard
- **Vercel dashboard**: https://vercel.com/unchained-leader/unchained-marketing-coach
- **Build logs**: Check Vercel deployments if something breaks

## Don't Break These Things

- The QStash pipeline (report enqueue → process → email → GHL)
- The quiz at `/quiz.html` (this is embedded in GHL landing pages)
- The dashboard auth flow (PIN → JWT → cookie)
- The admin password protection
- The GHL webhook payload structure (fields like `contact.impersonation_access`)
