# AI Agents Tutorial for Unchained Leader

> **What this tutorial covers:** What AI agents are, how to build them, how they could serve Unchained Leader, and how they would have accelerated the marketing quiz project. Written specifically for the Unchained Marketing Coach codebase.

---

## Part 1: What Are AI Agents?

### The Simple Version

You already use Claude AI in two places in this project:

1. **Chat endpoint** (`/app/api/chat/route.js`) — You send quiz answers, Claude sends back a teaser reveal
2. **Report endpoint** (`/app/api/report/route.js`) — You send conversation history, Claude sends back analysis JSON

Both of these follow the same pattern:

```
You send a message → Claude responds → Done.
```

That is a **single-turn interaction**. You tell Claude exactly what to do, it does it once, and you handle everything else (saving to Redis, generating the PDF, sending webhooks to GoHighLevel, etc.).

**An AI agent is different.** An agent gets a *goal*, not a single instruction. Then it figures out the steps on its own.

### The Analogy

Think about the difference between these two scenarios:

**Scenario A: Giving step-by-step instructions (what you do now)**
> "Claude, here are the quiz answers. Analyze them using these exact scoring rules. Return JSON with these exact fields. Nothing else."

This is like handing someone a recipe and saying "follow this exactly." They can only do what you wrote down.

**Scenario B: Giving a goal (what an agent does)**
> "Claude, a new user just completed the quiz. Look up their answers in Redis, analyze their patterns, generate their report, check the PDF for quality issues, and if it passes, email it to them and sync their data to GoHighLevel. If the PDF fails QC, fix the spacing and try again."

This is like telling a capable team member "handle this new quiz submission end to end." They know what tools are available, they make decisions, they handle problems, and they keep going until the job is done.

### What Makes Something an "Agent"

An AI agent has three key ingredients:

1. **A goal** — Not step-by-step instructions, but an outcome. "Process this quiz submission" or "Write a blog post in Mason's voice about attachment styles."

2. **Tools** — Things the agent can *do*. Read from Redis. Send an email. Query a database. Generate a PDF. Call an API. You define these tools and the agent chooses which ones to use.

3. **A reasoning loop** — The agent thinks, acts, observes the result, then thinks again. It keeps looping until the goal is accomplished or it gets stuck.

```
┌─────────────────────────────────────┐
│           THE AGENT LOOP            │
│                                     │
│   ┌──────────┐                      │
│   │  THINK   │ ← "What should I    │
│   │          │    do next?"         │
│   └────┬─────┘                      │
│        │                            │
│        ▼                            │
│   ┌──────────┐                      │
│   │   ACT    │ ← Uses a tool       │
│   │          │   (read data,        │
│   └────┬─────┘    send email, etc.) │
│        │                            │
│        ▼                            │
│   ┌──────────┐                      │
│   │ OBSERVE  │ ← Sees the result   │
│   │          │   of the tool        │
│   └────┬─────┘                      │
│        │                            │
│        ▼                            │
│   ┌──────────┐                      │
│   │  DECIDE  │ ← "Am I done?       │
│   │          │    Or do I need      │
│   └────┬─────┘    another step?"    │
│        │                            │
│        ├──→ Not done yet ──→ Loop   │
│        │                    back    │
│        └──→ Done! ──→ Return result │
└─────────────────────────────────────┘
```

### What You Already Built vs. What Agents Do

Here is a side-by-side comparison using your actual code:

| | **What You Have Now** | **What an Agent Would Do** |
|---|---|---|
| **Quiz Chat** | You send messages to `/api/chat`, Claude responds with text. Your frontend handles all the flow. | An agent could *run* the entire quiz: decide which section to show next, validate answers, detect if the user is struggling, adjust tone, and handle crisis detection — all autonomously. |
| **Report Generation** | Your `report/route.js` calls Claude once for analysis, then YOUR code generates the PDF, uploads to Vercel Blob, emails via Resend, and syncs to GHL. That is 1,739 lines of code YOU wrote. | An agent with the right tools could do ALL of that: analyze responses, generate the PDF, check quality, retry if needed, upload, email, and sync — in one autonomous run. |
| **Crisis Detection** | You manually coded keyword matching (14 keywords in `chat/route.js` line 23-39) plus Slack/email alerts. | A crisis agent could understand *context*, not just keywords. "I can't keep doing this" might be crisis or might be frustration. An agent reasons about meaning. |

### The Bottom Line

**Regular AI call:** You are the brain. Claude is the muscle. You decide every step, Claude executes one thing at a time.

**AI Agent:** Claude is both brain and muscle. You give it the goal and the tools, and it figures out the steps, handles problems, and completes the mission.

---

## Part 2: What You Need to Build Agents

Good news: you already have most of what you need. Let's look at what is required.

### Ingredient 1: The Anthropic SDK (You Already Have This)

Your `package.json` already includes:

```json
"@anthropic-ai/sdk": "^0.39.0"
```

And you already create the client in your code:

```javascript
// From your /app/api/chat/route.js — you already do this!
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();
```

That same SDK supports tool use (function calling), which is the foundation of agents. You do not need a new library.

### Ingredient 2: Tool Definitions

This is the new piece. Tools are JSON objects that tell Claude "here is something you can do." Each tool has:
- A **name** (what to call it)
- A **description** (when to use it)
- An **input schema** (what parameters it needs)

Here is what a tool definition looks like:

```javascript
const tools = [
  {
    name: "lookup_quiz_data",
    description: "Look up a user's quiz responses from Redis by their email address",
    input_schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The user's email address"
        }
      },
      required: ["email"]
    }
  },
  {
    name: "send_email",
    description: "Send an email to a user via Resend",
    input_schema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address"
        },
        subject: {
          type: "string",
          description: "Email subject line"
        },
        body: {
          type: "string",
          description: "Email body in HTML format"
        }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "save_to_redis",
    description: "Save data to Redis with a specific key",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The Redis key (e.g., mkt:analysis:user@email.com)"
        },
        value: {
          type: "string",
          description: "The JSON string to store"
        }
      },
      required: ["key", "value"]
    }
  }
];
```

You give these tool definitions to Claude when you make an API call. Claude then decides IF and WHEN to use them.

### Ingredient 3: Tool Handlers (Your Code That Executes the Tools)

When Claude decides to use a tool, it does not actually execute it. It sends back a response saying "I want to call `lookup_quiz_data` with `email: 'john@example.com'`." YOUR code then executes that action and sends the result back.

```javascript
// This is the function that actually runs when Claude calls the tool
async function executeToolCall(toolName, toolInput) {
  switch (toolName) {
    case "lookup_quiz_data":
      // Use your existing Redis setup from /app/api/lib/redis.js
      const data = await redis.get(`mkt:diagnostic:${toolInput.email}`);
      return JSON.stringify(data);

    case "send_email":
      // Use your existing Resend integration
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Unchained AI Guide <guide@unchained.support>",
          to: toolInput.to,
          subject: toolInput.subject,
          html: toolInput.body,
        }),
      });
      return JSON.stringify({ success: response.ok });

    case "save_to_redis":
      await redis.set(toolInput.key, JSON.parse(toolInput.value));
      return JSON.stringify({ success: true });
  }
}
```

Notice how these tool handlers use the **exact same libraries and patterns** you already use in your project. Redis, Resend, fetch — nothing new.

### Ingredient 4: The Agentic Loop

This is the code that ties it all together. It sends a message to Claude, checks if Claude wants to use tools, executes those tools, sends the results back, and repeats until Claude is done.

```javascript
async function runAgent(goal, tools) {
  // Start the conversation with the goal
  let messages = [{ role: "user", content: goal }];

  // Keep looping until Claude is done
  while (true) {
    // Call Claude with the tools available
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools: tools,
      messages: messages,
    });

    // If Claude responded with just text (no tool calls), we are done
    if (response.stop_reason === "end_turn") {
      // Extract the final text response
      const finalText = response.content
        .filter(block => block.type === "text")
        .map(block => block.text)
        .join("");
      return finalText;
    }

    // If Claude wants to use tools, execute them
    if (response.stop_reason === "tool_use") {
      // Add Claude's response to the conversation
      messages.push({ role: "assistant", content: response.content });

      // Find all tool calls in the response
      const toolCalls = response.content.filter(
        block => block.type === "tool_use"
      );

      // Execute each tool and collect results
      const toolResults = [];
      for (const toolCall of toolCalls) {
        const result = await executeToolCall(toolCall.name, toolCall.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: result,
        });
      }

      // Send tool results back to Claude so it can continue
      messages.push({ role: "user", content: toolResults });
    }
  }
}
```

**That is the entire agent framework.** It is roughly 40 lines of code. Everything else is just defining what tools are available and what they do.

### Ingredient 5 (Optional): The Claude Agent SDK

Anthropic also offers a higher-level framework called the **Claude Agent SDK** that handles the loop, error handling, and multi-agent coordination for you. You would install it like this:

```bash
npm install claude_agent_sdk
```

The Agent SDK gives you:
- **Built-in agentic loop** — no need to write the while loop yourself
- **Guardrails** — define rules the agent must follow (like your theology guardrails)
- **Handoffs** — one agent can pass work to another agent (e.g., quiz agent hands off to report agent)
- **Tracing** — see every step the agent took for debugging

We will stick with the manual approach in this tutorial since it helps you understand the fundamentals, but know that the Agent SDK exists when you are ready to build more complex systems.

### Summary: What You Need

| Ingredient | Do You Have It? | Where? |
|---|---|---|
| Anthropic SDK | Yes | `package.json` → `@anthropic-ai/sdk` |
| API Key | Yes | `ANTHROPIC_API_KEY` in your `.env` |
| Claude Model | Yes | Already using `claude-sonnet-4-6` and `claude-opus-4-6` |
| Tool Definitions | **New** | JSON schemas you define |
| Tool Handlers | **New** (but uses existing code) | Functions that execute tools using your Redis, Resend, GHL, etc. |
| Agentic Loop | **New** | ~40 lines of code |

---

## Part 3: How Agents Work Without You Telling Them Every Step

This is the part that blows people's minds. Let's walk through exactly what happens when an agent runs.

### A Real Example: Processing a Quiz Submission

Imagine you built an agent with these tools:
- `lookup_user` — Get user info from Redis
- `get_quiz_responses` — Get their quiz answers from Redis
- `analyze_patterns` — Run Claude analysis on their responses
- `generate_pdf` — Create the PDF report
- `check_pdf_quality` — Validate the PDF (page count, file size, blank pages)
- `upload_pdf` — Upload to Vercel Blob storage
- `send_email` — Email the report via Resend
- `sync_to_ghl` — Send data to GoHighLevel CRM
- `send_slack_alert` — Alert the team on Slack

You start the agent with:
```javascript
const result = await runAgent(
  "A new user just completed the quiz. Their email is john@example.com. " +
  "Process their submission: analyze their responses, generate their report, " +
  "verify quality, deliver the report, and sync to our CRM.",
  tools
);
```

Here is what happens inside Claude's reasoning, step by step:

### Step 1: Claude Thinks

> "I need to process a quiz submission for john@example.com. Let me start by looking up this user to make sure they exist."

**Claude calls:** `lookup_user({ email: "john@example.com" })`

**Your code runs:** `await redis.get("mkt:user:john@example.com")`

**Result sent back:** `{ name: "John", phone: "555-1234", diagnosticComplete: true }`

### Step 2: Claude Thinks Again

> "Good, John exists and his diagnostic is complete. Now I need his quiz responses."

**Claude calls:** `get_quiz_responses({ email: "john@example.com" })`

**Your code runs:** `await redis.get("mkt:diagnostic:john@example.com")`

**Result sent back:** `{ messages: [...32 messages of quiz conversation...] }`

### Step 3: Claude Thinks Again

> "I have his responses. Let me analyze them to identify his arousal template, neuropathway, attachment style, and root narrative."

**Claude calls:** `analyze_patterns({ messages: [...], userName: "John" })`

**Result sent back:** `{ arousalTemplateType: "The Invisible Man", neuropathway: "Numbing", attachmentStyle: "Dismissive-Avoidant", rootNarrativeStatement: "I am not enough, so I disappear"... }`

### Step 4: Claude Thinks Again

> "Analysis complete. Now I need to generate the PDF report with these findings."

**Claude calls:** `generate_pdf({ analysis: {...}, userName: "John" })`

**Result sent back:** `{ pdfBuffer: <buffer>, pageCount: 22, fileSize: 156000 }`

### Step 5: Claude Thinks Again

> "PDF generated. Let me check quality before sending it out."

**Claude calls:** `check_pdf_quality({ pageCount: 22, fileSize: 156000 })`

**Result sent back:** `{ passed: true, details: "22 pages (target 15-30), 156KB (target 30-500KB)" }`

### Step 6: Claude Thinks Again

> "QC passed. Time to upload and deliver. I can do the upload, email, and CRM sync since they are independent of each other."

**Claude calls three tools at once:**
- `upload_pdf({ email: "john@example.com", pdfBuffer: <buffer> })`
- `send_email({ to: "john@example.com", subject: "Your UDRM Report Is Ready", body: "..." })`
- `sync_to_ghl({ email: "john@example.com", analysis: {...} })`

**Results:** All three succeed.

### Step 7: Claude Returns Final Answer

> "I've processed John's quiz submission. His Arousal Template is The Invisible Man with a Numbing neuropathway and Dismissive-Avoidant attachment style. The 22-page report passed quality checks and has been emailed to him and synced to GoHighLevel."

**That whole flow happened autonomously.** You did not write if/then logic for each step. You did not hardcode the order. Claude decided what to do, in what order, and handled the entire process.

### The Magic: Decision-Making and Error Handling

Here is where agents really shine. What if Step 5 (quality check) had FAILED?

```
Result: { passed: false, details: "Only 8 pages (target 15-30). Spacing too tight." }
```

Claude would think:

> "The PDF failed QC — only 8 pages, spacing is too tight. I need to regenerate with more spacing."

**Claude calls:** `generate_pdf({ analysis: {...}, userName: "John", spacingMultiplier: 1.5 })`

Then it would check quality again. And if that failed, it might try `spacingMultiplier: 1.8`. This retry logic is not something you coded. Claude reasons about the problem and tries solutions.

This is exactly what your current code does manually in `report/route.js` — you wrote retry logic with spacing multipliers. An agent does this thinking automatically.

### How Claude Knows What Tools to Use

You might wonder: "How does Claude know to call `lookup_user` before `get_quiz_responses`?"

The answer: **Claude reads the tool descriptions and reasons about the logical order.** If the `get_quiz_responses` tool description says "Look up quiz responses for a user," Claude understands it needs to verify the user exists first. It is the same way a smart employee would think "let me check this person is in our system before I pull their records."

The better your tool descriptions are, the better the agent performs. This is why description quality matters:

```javascript
// Bad — Claude does not know when to use this
{ name: "tool1", description: "Does stuff with data" }

// Good — Claude knows exactly what this does and when to use it
{
  name: "lookup_user",
  description: "Look up a user's profile from Redis by their email. Returns their name, phone, registration date, and whether their diagnostic is complete. Use this to verify a user exists before performing operations on their data."
}
```

### System Prompts Still Matter

Agents still use system prompts. This is where you put the "personality" and "rules" — just like your `system-prompt.js` gives Claude its identity, voice, and guardrails. For an agent, the system prompt might say:

```
You are the Unchained Leader Report Processing Agent. Your job is to
process completed quiz submissions and deliver personalized reports.

RULES:
- Always verify the user exists before accessing their data
- Never send a report that fails quality checks
- If a user shows crisis indicators, alert the team via Slack BEFORE processing the report
- Use Mason's voice guidelines from the marketing bible for any user-facing text
- Always sync to GoHighLevel after successful delivery
```

The system prompt sets the WHAT and WHY. The tools provide the HOW.

---

## Part 4: Agent Ideas for Unchained Leader

Here are six practical agents that could serve the Unchained Leader mission. Each one references real files in your codebase and shows what tools it would need.

### Agent 1: Content Creation Agent

**What it does:** Writes blog posts, social media captions, email sequences, and ad copy — all in Mason's voice, aligned with the marketing bible.

**Why it matters:** Your `marketing-bible.js` is 8,066 lines of voice guidelines, reframes, theology guardrails, and forbidden language. Right now, only Claude inside the quiz uses this. A content agent could use it for ALL your content.

**Tools it would need:**
| Tool | What It Does |
|---|---|
| `read_marketing_bible` | Loads the relevant section of `/app/api/lib/marketing-bible.js` |
| `read_knowledge_base` | Loads `/knowledge-base.md` for program facts |
| `search_existing_content` | Checks if you have already written about a topic |
| `write_draft` | Saves a draft to your content management system |
| `check_brand_compliance` | Validates the draft against forbidden language and theology rules |

**Example prompt:**
```
Write a blog post about why accountability partners alone do not work
for men struggling with unwanted sexual behaviors. Use the "Symptom vs Root"
reframe. Target audience: Christian men aged 25-45 who have tried
accountability and failed. Include a call to action for the free UDRM assessment.
```

**What the agent would do autonomously:**
1. Read the marketing bible sections on accountability, "Symptom vs Root" reframe, and forbidden language
2. Read the knowledge base for program statistics (10,000+ men, 33 countries)
3. Draft the post in Mason's voice (short sentences, fellow traveler, kingdom language)
4. Check for forbidden words ("addict," "addiction," "recovery program," em dashes)
5. Fix any violations and return the final draft

### Agent 2: Report QA Agent

**What it does:** Automatically validates every generated report before delivery. Catches issues your current QC checks might miss.

**Why it matters:** Your `report/route.js` (lines 180-232) already has QC checks for page count, file size, and blank pages. But an agent could go deeper — reading the actual content and checking for quality.

**Tools it would need:**
| Tool | What It Does |
|---|---|
| `read_pdf_content` | Extracts text from the generated PDF |
| `check_section_presence` | Verifies all required sections exist (Scorecard, Template Analysis, Next Steps, etc.) |
| `check_internal_codes` | Scans for leaked internal identifiers like `tab_incest`, `conf_wife_others` |
| `validate_theology` | Checks content against theology guardrails (no "addict" labels, prayer + treatment together) |
| `check_personalization` | Verifies the report uses the user's name and references their specific responses |
| `flag_for_review` | Sends a Slack alert if the report needs human review |

**What this catches that current QC does not:**
- Reports that technically pass page/size checks but have generic content
- Theology violations (accidentally labeling someone an "addict")
- Internal code identifiers that slipped through the sanitizer
- Sections that are present but suspiciously short

### Agent 3: Lead Nurture Agent

**What it does:** Monitors quiz completions and orchestrates personalized follow-up sequences through GoHighLevel.

**Why it matters:** Right now, your GHL integration (`/app/api/lib/ghl.js` — 8,008 lines) fires webhooks at specific moments. A nurture agent could be smarter — adapting follow-up timing and content based on the user's specific results.

**Tools it would need:**
| Tool | What It Does |
|---|---|
| `get_recent_completions` | Query Redis for users who completed the quiz in the last 24 hours |
| `get_user_analysis` | Look up their UDRM analysis results |
| `get_report_status` | Check if they have viewed their report |
| `send_ghl_action` | Trigger a specific GoHighLevel workflow |
| `compose_personalized_email` | Write a follow-up email based on their arousal template and attachment style |
| `schedule_followup` | Set a timed follow-up if they have not engaged |

**Example behavior:**
- User completes quiz but does not view report after 24 hours → Agent sends a personalized nudge email referencing their specific arousal template
- User views report but does not register for Art of Freedom → Agent sends a message addressing the specific root narrative revealed in their assessment
- User shows "Escalator" template with high escalation severity → Agent prioritizes them for faster follow-up

### Agent 4: Analytics Agent

**What it does:** Monitors your admin dashboard data and proactively alerts you to trends, drops, or opportunities.

**Why it matters:** Your admin dashboard (`/app/admin/dashboard/page.js`) has great visualizations, but someone has to look at it. An analytics agent watches 24/7.

**Tools it would need:**
| Tool | What It Does |
|---|---|
| `query_analytics` | Call your `/api/analytics` endpoint for any time range |
| `query_daily_stats` | Call `/api/analytics/daily` for granular data |
| `compare_periods` | Compare this week vs. last week, this month vs. last month |
| `detect_anomalies` | Flag unusual drops or spikes |
| `generate_summary` | Write a plain-English summary of findings |
| `send_slack_report` | Post the summary to your Slack channel |

**Example weekly summary it might generate:**
```
Weekly UDRM Report (Mar 24-30):
- 47 quiz completions (up 12% from last week)
- 38 reports generated (81% conversion — down from 87%)
- Drop-off spike in Section 6 (Childhood/Upbringing) — 9 users abandoned here
- Top arousal template this week: The Invisible Man (34%)
- 2 crisis detections (both received follow-up)

Recommendation: Section 6 drop-off suggests the childhood questions
feel too invasive. Consider adding a reassurance message before that section.
```

### Agent 5: Enhanced Crisis Response Agent

**What it does:** Goes beyond keyword matching to understand context, assess severity, and coordinate the response.

**Why it matters:** Your current crisis detection (`chat/route.js` lines 23-39) matches 14 keywords. But "I can't keep doing this" could be crisis or frustration. "My family would be better off" is a red flag your keywords would miss.

**Tools it would need:**
| Tool | What It Does |
|---|---|
| `assess_message_context` | Analyze the full conversation for crisis indicators, not just keywords |
| `check_severity_level` | Rate severity: low (frustration), medium (passive ideation), high (active ideation) |
| `get_user_history` | Check if this user has had crisis flags before |
| `alert_team_slack` | Send detailed Slack alert with severity, context, and recommended response |
| `alert_team_email` | Send email with full context |
| `provide_resources` | Generate an appropriate response with crisis resources (988, Crisis Text 741741) |
| `log_incident` | Record the incident in the database for tracking |

**The difference from what you have now:**

| Current System | Agent System |
|---|---|
| Matches exact keywords | Understands meaning and context |
| Binary: crisis or not | Severity levels: low, medium, high |
| Same response every time | Tailored response based on severity |
| No history awareness | Checks if user has been flagged before |
| Fire-and-forget alerts | Coordinated multi-channel response with follow-up tracking |

### Agent 6: Quiz Testing Agent

**What it does:** Simulates users taking the quiz with different profiles to find bugs, edge cases, and inconsistent responses.

**Why it matters:** Testing a 9-section quiz with dozens of checkbox combinations manually is exhausting. An agent can simulate 50 different user profiles in minutes.

**Tools it would need:**
| Tool | What It Does |
|---|---|
| `create_test_profile` | Generate a realistic set of quiz answers (e.g., "35-year-old married man, avoidant attachment, childhood abuse, escalating behaviors") |
| `submit_quiz` | Send the answers to your `/api/chat` endpoint |
| `validate_response` | Check that Claude's teaser reveal is appropriate for the profile |
| `generate_report` | Trigger report generation via `/api/report` |
| `validate_report` | Check that the report matches the input profile (right template, right neuropathway) |
| `log_results` | Record pass/fail for each test case |
| `generate_test_summary` | Create a report of all test results |

**Example test cases it would run:**
- Profile with all "Invisible Man" indicators → Does the report correctly identify this template?
- Profile with crisis keywords embedded → Does crisis detection fire?
- Profile with minimal answers (only 3 sections completed) → Does the system handle gracefully?
- Profile triggering "Confusing Patterns" (same-sex content for straight man) → Is the decoder accurate and sensitive?
- Two identical profiles → Do they produce consistent results?

---

## Part 5: How Agents Would Have Sped Up Building This Project

Let's look back at the major pieces of the Unchained Marketing Coach and honestly assess: what took the most effort, and how could agents have helped?

### The Big Picture

Here is a rough breakdown of the major components you built:

| Component | File | Lines of Code | What It Does |
|---|---|---|---|
| System Prompt | `system-prompt.js` | ~220 | AI personality, scoring logic, quiz flow |
| Chat API | `chat/route.js` | ~224 | Streaming Claude responses, crisis detection |
| Report Engine | `report/route.js` | ~1,739 | Analysis, PDF generation, QC, delivery |
| GHL Integration | `lib/ghl.js` | ~8,008 | CRM webhook payloads and mapping |
| Marketing Bible | `lib/marketing-bible.js` | ~8,066 | Brand voice, theology, reframes |
| Quiz Frontend | `public/quiz.html` | ~1,000+ | The 9-section quiz UI |
| Dashboard | `admin/dashboard/page.js` | ~800+ | Analytics views and charts |
| Dashboard Components | `dashboard/components/` | ~10 files | Visualizations (radar, heatmap, bars) |

That is over **20,000 lines of code** across the project. Let's look at where agents would have made the biggest difference.

### 1. The System Prompt (Would Have Saved Days of Iteration)

**What you did manually:** You wrote 220 lines of layered instructions across 6 layers (Identity, Voice, Quiz Flow, Safety, Theology, Guardrails). Getting the scoring logic right for arousal templates, neuropathways, and attachment styles required extensive iteration. The confusing patterns decoder (cuckolding, same-sex content, race preferences, pain content) required careful psychological reasoning.

**How an agent would have helped:**

An agent with these tools could have drafted it:
- `read_marketing_bible` — Reads the 8,066-line brand voice guide
- `read_knowledge_base` — Gets program facts and methodology
- `research_psychology` — Looks up clinical frameworks for the scoring dimensions
- `draft_prompt_section` — Writes a section of the system prompt
- `test_prompt` — Runs a simulated quiz with the draft prompt and checks output quality

**The agent approach:**
```
"Read the marketing bible and knowledge base. Draft a system prompt for
the UDRM quiz guide that includes: identity layer, voice guidelines,
9-section quiz flow, safety protocols, theology guardrails, and scoring
logic for arousal templates, neuropathways, and attachment styles.
Test the draft against 5 simulated user profiles and refine until
the outputs match expected classifications."
```

The agent would iterate on the prompt automatically, testing and refining. What took days of manual testing could have been done in hours.

### 2. The Report Engine (Would Have Saved the Most Time)

**What you did manually:** The `report/route.js` is 1,739 lines covering:
- Claude analysis call with a massive system prompt
- Output sanitization (em dashes, internal codes)
- PDF generation with PDFKit (dark theme, gold accents, multi-section layout)
- Quality checks (page count, file size, blank pages, section presence)
- Retry logic with spacing adjustments
- Vercel Blob upload
- Resend email delivery
- GoHighLevel CRM sync
- Neon database logging
- Error handling and status tracking

**How an agent would have helped:**

A "Report Builder Agent" could have generated the scaffold:
```
"I need an API route that:
1. Receives an email and diagnostic data
2. Calls Claude Opus to analyze quiz responses (here is the analysis schema: {...})
3. Generates a dark-themed PDF with gold accents using PDFKit
4. Runs QC checks (15-30 pages, 30-500KB, no blank pages)
5. Retries with adjusted spacing if QC fails
6. Uploads to Vercel Blob
7. Emails via Resend
8. Syncs to GoHighLevel via webhook
9. Logs to Neon database
10. Tracks progress in Redis

Use the existing Redis, db, ghl, and cors utilities in /app/api/lib/.
Follow the brand colors: gold #c5a55a, dark background #111111, card #1a1a1a."
```

Instead of writing 1,739 lines step by step, an agent could have generated a working first draft, then you would refine the details.

### 3. The GHL Integration (Would Have Eliminated the Mapping Grind)

**What you did manually:** The `ghl.js` file is 8,008 lines. Most of that is mapping your internal data fields to GoHighLevel's webhook format. That is tedious, repetitive work — taking each field from your analysis JSON and formatting it for the CRM.

**How an agent would have helped:**

An agent with access to:
- `read_analysis_schema` — Your analysis JSON structure (50+ fields)
- `read_ghl_docs` — GoHighLevel's webhook format documentation
- `generate_mapping` — Create the field-by-field mapping
- `test_webhook` — Send a test payload and verify the response

```
"Map every field from our UDRM analysis JSON to GoHighLevel webhook format.
The analysis has these fields: arousalTemplateType, rootNarrativeStatement,
behaviorRootMap, neuropathway, attachmentStyle, escalationSeverity...
Create two webhook functions: one for contact creation (diagnostic_complete)
and one for report delivery (report_data)."
```

The agent would grind through the mapping automatically. What is 8,008 lines of mostly repetitive field mapping could have been generated in one pass.

### 4. The Quiz Frontend (Would Have Handled the UI Details)

**What you did manually:** The `quiz.html` is 1,000+ lines with 9 sections, dozens of checkboxes, progress tracking, styling, and the submission flow.

**How an agent would have helped:**

```
"Generate a quiz frontend with these 9 sections: [section definitions from system-prompt.js].
Each section should have multiple-select checkboxes. Use the brand colors
(gold #b99c4f, black #000). Include a progress bar that advances through
sections. On completion, collect all selections and POST them to /api/chat.
Style it as luxury/masculine. Include a 4-digit PIN creation step."
```

### 5. Dashboard Components (Would Have Automated the Visualization Work)

**What you did manually:** You built 10+ visualization components (ScoreRadar, NeuropathwayDiagram, RelationalBars, StressHeatmap, EscalationGauge, etc.) using Recharts.

**How an agent would have helped:**

```
"Given this analysis JSON schema, generate React dashboard components using Recharts:
1. Radar chart for the 5 scoring dimensions
2. Flow diagram for Trigger → Neuropathway → Behavior
3. Horizontal bars for relational patterns (codependency, enmeshment, void, leadership)
4. Heatmap for life stress categories
5. Gauge for escalation severity (1-5 scale)
Use the gold/black brand colors. Each component should accept the analysis object as a prop."
```

An agent could have generated all 10 components from the data schema in one run.

### 6. Testing (Would Have Caught Bugs Faster)

**What you did manually:** Manual testing of different quiz paths, checking that reports generate correctly for different profiles, verifying GHL webhooks fire properly.

**How an agent would have helped:** The Quiz Testing Agent (from Part 4) would simulate dozens of user profiles, check outputs, and report issues automatically.

### The Honest Assessment

| Task | Manual Effort | With Agents | Time Saved |
|---|---|---|---|
| System Prompt | Days of iteration | Hours (auto-test and refine) | ~70% |
| Report Engine (1,739 lines) | Multiple sessions | Generated scaffold + manual refinement | ~50% |
| GHL Integration (8,008 lines) | Tedious mapping grind | Auto-generated from schemas | ~80% |
| Quiz Frontend (1,000+ lines) | Built section by section | Generated from section definitions | ~60% |
| Dashboard Components (10 files) | One component at a time | All generated from data schema | ~70% |
| Testing | Manual, slow, incomplete | Automated, thorough, fast | ~90% |

**Agents would not have done everything.** The deep thinking — the psychological framework, the theology guardrails, Mason's voice, the "Confusing Patterns Decoder" — that came from human expertise and cannot be automated. But the implementation grind? The mapping? The boilerplate? The testing? Agents would have crushed that.

The creative direction and ministry wisdom is yours. The code generation and repetitive execution is where agents shine.

---

## Part 6: Build Your First Agent (Complete Code Walkthrough)

Let's build a real agent from scratch. We will create a **Quiz Insights Agent** that can look up any user's quiz data, analyze their patterns, and generate a plain-English summary. This uses your existing Anthropic SDK and Redis setup.

### Step 1: Define the Tools

```javascript
// file: /app/api/agent-example/tools.js
//
// These are the tool definitions we give to Claude.
// They tell Claude WHAT it can do (but our code handles HOW).

export const agentTools = [
  {
    name: "lookup_user",
    description:
      "Look up a user's profile from Redis by email. Returns their name, " +
      "registration date, and whether their diagnostic is complete. " +
      "Use this first to verify a user exists.",
    input_schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The user's email address",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "get_quiz_responses",
    description:
      "Get a user's quiz conversation history from Redis. Returns the array " +
      "of messages between the user and the quiz guide. Only works if the " +
      "user has completed (or started) the diagnostic.",
    input_schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The user's email address",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "get_analysis_results",
    description:
      "Get the stored UDRM analysis results for a user. Returns their " +
      "arousal template type, neuropathway, attachment style, root narrative, " +
      "behavior-root map, and all other analysis fields. Only available " +
      "after a report has been generated.",
    input_schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "The user's email address",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "count_quiz_completions",
    description:
      "Count how many users have completed the quiz in a given time period. " +
      "Useful for understanding volume and trends.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days to look back (e.g., 7 for last week)",
        },
      },
      required: ["days"],
    },
  },
  {
    name: "generate_insight_summary",
    description:
      "Save a generated insight summary to Redis for later retrieval. " +
      "Use this after you have analyzed the data and want to store your findings.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "A descriptive key for this insight (e.g., 'weekly-summary-2026-03-30')",
        },
        summary: {
          type: "string",
          description: "The insight summary text to store",
        },
      },
      required: ["key", "summary"],
    },
  },
];
```

### Step 2: Write the Tool Handlers

```javascript
// file: /app/api/agent-example/handlers.js
//
// These functions run when Claude calls a tool.
// They use your EXISTING Redis and database setup.

import redis from "../lib/redis";
import { normalizeEmail, parseRedis } from "../lib/utils";

export async function executeToolCall(toolName, toolInput) {
  switch (toolName) {
    case "lookup_user": {
      const email = normalizeEmail(toolInput.email);
      const user = await redis.get(`mkt:user:${email}`);
      if (!user) {
        return JSON.stringify({ error: "User not found" });
      }
      // Return user profile (never return sensitive data like PIN hashes)
      return JSON.stringify({
        name: user.name,
        email: email,
        registeredAt: user.createdAt,
        diagnosticComplete: user.diagnosticComplete || false,
      });
    }

    case "get_quiz_responses": {
      const email = normalizeEmail(toolInput.email);
      const stored = await redis.get(`mkt:diagnostic:${email}`);
      if (!stored) {
        return JSON.stringify({ error: "No quiz data found for this user" });
      }
      const parsed = parseRedis(stored);
      const messages = parsed.messages || [];
      // Return message count and the conversation
      return JSON.stringify({
        messageCount: messages.length,
        messages: messages.map((m) => ({
          role: m.role,
          // Truncate long messages to save tokens
          content:
            m.content.length > 500
              ? m.content.substring(0, 500) + "..."
              : m.content,
        })),
      });
    }

    case "get_analysis_results": {
      const email = normalizeEmail(toolInput.email);
      const analysis = await redis.get(`mkt:analysis:${email}`);
      if (!analysis) {
        return JSON.stringify({
          error: "No analysis found. Report may not have been generated yet.",
        });
      }
      return JSON.stringify(analysis);
    }

    case "count_quiz_completions": {
      // This would query your analytics — simplified example
      const days = toolInput.days || 7;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      // In a real implementation, you would query Neon or scan Redis keys
      // For now, return a placeholder that shows the pattern
      return JSON.stringify({
        period: `Last ${days} days`,
        note: "Connect this to your /api/analytics endpoint for real data",
      });
    }

    case "generate_insight_summary": {
      await redis.set(
        `mkt:insight:${toolInput.key}`,
        {
          summary: toolInput.summary,
          generatedAt: new Date().toISOString(),
        },
        { ex: 60 * 60 * 24 * 30 } // Expire after 30 days
      );
      return JSON.stringify({ success: true, key: toolInput.key });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
```

### Step 3: Build the Agentic Loop

```javascript
// file: /app/api/agent-example/route.js
//
// This is the actual API route that runs the agent.
// POST /api/agent-example with a JSON body: { "goal": "your question or task" }

import Anthropic from "@anthropic-ai/sdk";
import { agentTools } from "./tools";
import { executeToolCall } from "./handlers";
import { corsHeaders, optionsResponse } from "../lib/cors";

const client = new Anthropic();
const CORS_HEADERS = corsHeaders("POST, OPTIONS");

// The system prompt gives the agent its identity and rules
const AGENT_SYSTEM_PROMPT = `You are the Unchained Leader Insights Agent. You help the team
understand quiz data, user patterns, and diagnostic results.

RULES:
- Always verify a user exists before looking up their data
- Never expose sensitive information (PINs, full email addresses in summaries)
- Use first names only when discussing specific users
- Frame findings using Unchained Leader language:
  - "Arousal template" not "porn type"
  - "Unwanted behavior" not "addiction"
  - "Root narrative" not "psychological issue"
- Be concise and actionable in your summaries
- If you cannot find data, say so honestly — do not make up results`;

export async function OPTIONS() {
  return optionsResponse("POST, OPTIONS");
}

export async function POST(request) {
  try {
    const { goal } = await request.json();

    if (!goal) {
      return Response.json(
        { error: "Please provide a goal" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ═══════════════════════════════════════════
    //  THE AGENTIC LOOP — This is where the magic happens
    // ═══════════════════════════════════════════

    let messages = [{ role: "user", content: goal }];
    let iterations = 0;
    const MAX_ITERATIONS = 10; // Safety limit to prevent infinite loops

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Call Claude with the available tools
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: AGENT_SYSTEM_PROMPT,
        tools: agentTools,
        messages: messages,
      });

      // ─── Check: Is Claude done? ───
      if (response.stop_reason === "end_turn") {
        // Claude finished — extract the final text
        const finalText = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");

        return Response.json(
          {
            result: finalText,
            toolCallsUsed: iterations - 1, // How many tool rounds it took
          },
          { headers: CORS_HEADERS }
        );
      }

      // ─── Check: Does Claude want to use tools? ───
      if (response.stop_reason === "tool_use") {
        // Add Claude's response (with tool calls) to the conversation
        messages.push({ role: "assistant", content: response.content });

        // Find all tool calls
        const toolCalls = response.content.filter(
          (block) => block.type === "tool_use"
        );

        // Execute each tool and collect results
        const toolResults = [];
        for (const toolCall of toolCalls) {
          console.log(`Agent using tool: ${toolCall.name}`, toolCall.input);

          const result = await executeToolCall(
            toolCall.name,
            toolCall.input
          );

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: result,
          });
        }

        // Send results back to Claude so it can continue thinking
        messages.push({ role: "user", content: toolResults });
      }
    }

    // If we hit the iteration limit, return what we have
    return Response.json(
      {
        result: "Agent reached maximum iterations without completing.",
        iterations: iterations,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("Agent error:", error);
    return Response.json(
      { error: error.message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
```

### Step 4: Use It

Once this route is deployed, you can call it like this:

```bash
# Ask about a specific user
curl -X POST https://your-app.vercel.app/api/agent-example \
  -H "Content-Type: application/json" \
  -d '{"goal": "Look up the quiz results for john@example.com and give me a summary of his root narrative and arousal template."}'

# Ask for a broader insight
curl -X POST https://your-app.vercel.app/api/agent-example \
  -H "Content-Type: application/json" \
  -d '{"goal": "How many quizzes were completed this week? Save a weekly summary."}'
```

**What happens behind the scenes:**

For the first request, the agent would:
1. Call `lookup_user` to verify John exists
2. Call `get_analysis_results` to get his UDRM analysis
3. Read the results and compose a clear summary
4. Return: "John's arousal template is The Invisible Man with a Numbing neuropathway. His root narrative is 'I am not enough, so I disappear.' His Dismissive-Avoidant attachment style fuels the cycle by..."

For the second request, the agent would:
1. Call `count_quiz_completions` with `days: 7`
2. Compose a summary based on the data
3. Call `generate_insight_summary` to save it to Redis
4. Return the summary

**You did not tell it the steps. It figured them out.**

### The Complete File Structure

```
/app/api/agent-example/
  ├── route.js       ← The agentic loop (API endpoint)
  ├── tools.js       ← Tool definitions (what Claude CAN do)
  └── handlers.js    ← Tool handlers (how tools EXECUTE)
```

Three files. The loop is ~80 lines. The tools are JSON definitions. The handlers use your existing utilities. That is all you need to build an AI agent.

---

## What's Next?

Now you understand AI agents. Here is a path forward:

1. **Start small:** Build the Quiz Insights Agent above. Get comfortable with the tool-use pattern.

2. **Add tools gradually:** Each new tool you add makes the agent more capable. Start with read-only tools (looking up data) before adding tools that take actions (sending emails, syncing CRM).

3. **Add guardrails:** Use system prompts to set boundaries. Your theology guardrails from `system-prompt.js` show you already know how to do this.

4. **Consider the Agent SDK:** When you are ready for multi-agent systems (e.g., a quiz agent that hands off to a report agent that hands off to a nurture agent), look into the Claude Agent SDK for built-in coordination.

5. **Think about what is repetitive:** Any task you do over and over — content creation, data analysis, testing, follow-ups — is a candidate for an agent.

The Unchained Marketing Coach already uses Claude AI powerfully. Agents are the next level: going from "Claude answers when asked" to "Claude acts when needed."

---

## Quick Reference

### Key Concepts

| Term | Meaning |
|---|---|
| **Tool** | Something the agent can do (read data, send email, etc.) |
| **Tool Definition** | JSON that describes the tool to Claude |
| **Tool Handler** | Your code that actually executes when Claude calls a tool |
| **Agentic Loop** | The while loop: think → act → observe → repeat |
| **Stop Reason** | How Claude tells you what happened: `end_turn` (done) or `tool_use` (needs to use a tool) |
| **System Prompt** | The agent's identity, rules, and personality |
| **Guardrails** | Rules in the system prompt that prevent unwanted behavior |

### Key Code Pattern

```javascript
// The entire agent pattern in 20 lines
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  system: "You are an agent. Here are your rules...",
  tools: [/* tool definitions */],
  messages: messages,
});

if (response.stop_reason === "end_turn") {
  // Done! Return the text response.
}

if (response.stop_reason === "tool_use") {
  // Claude wants to use a tool.
  // 1. Execute the tool
  // 2. Send results back
  // 3. Loop again
}
```

### Your Existing Infrastructure That Agents Can Use

| What You Have | File | What Agents Can Do With It |
|---|---|---|
| Redis (Upstash) | `/app/api/lib/redis.js` | Read/write user data, quiz responses, analysis results |
| PostgreSQL (Neon) | `/app/api/lib/db.js` | Query analytics, log events |
| Resend Email | Used in `report/route.js` | Send personalized emails |
| Slack Webhooks | Used in `chat/route.js` | Alert the team |
| GoHighLevel CRM | `/app/api/lib/ghl.js` | Sync contacts and trigger workflows |
| Vercel Blob | Used in `report/route.js` | Store and retrieve files |
| Marketing Bible | `/app/api/lib/marketing-bible.js` | Generate on-brand content |
| Knowledge Base | `/knowledge-base.md` | Reference program facts |

Everything is already wired up. Agents just give Claude the keys to use these tools autonomously.

---

*Tutorial created for the Unchained Leader team. The technology serves the mission: helping men find freedom through root-level transformation.*
