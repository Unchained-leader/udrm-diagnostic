import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../../lib/db";
import { corsHeaders, optionsResponse } from "../../lib/cors";

const CORS_HEADERS = corsHeaders("POST, OPTIONS");

export const maxDuration = 120; // Allow up to 2 minutes for Opus + multiple tool calls

export async function OPTIONS() {
  return optionsResponse("POST, OPTIONS");
}

// Full database schema for the system prompt
const SCHEMA_CONTEXT = `
You are an AI analytics assistant for the Unchained Leader diagnostic quiz platform.
You have read-only access to a PostgreSQL database (Neon) containing all quiz data.

## DATABASE SCHEMA

### Table: analytics_events
Tracks every user interaction with the quiz.
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment |
| session_id | VARCHAR(64) | Unique session UUID |
| product | VARCHAR(50) | Always 'udrm' |
| event_type | VARCHAR(50) | quiz_start, section_1_complete through section_8_complete, reveal_shown, report_prompt_shown, contact_capture_shown, contact_capture_complete, report_generated, report_emailed, existing_account_login |
| event_data | JSONB | Contains device info ({device:{type,browser,screenWidth,screenHeight}}), referrer info ({referrer:{referrerUrl,referrerDomain,trafficSource,utmSource,utmMedium,utmCampaign}}), section timing ({sectionSeconds}), etc. |
| ip_address | VARCHAR(45) | User IP |
| geo_city | VARCHAR(100) | City |
| geo_region | VARCHAR(100) | State/region |
| geo_country | VARCHAR(10) | Country code |
| geo_lat | DOUBLE PRECISION | Latitude |
| geo_lon | DOUBLE PRECISION | Longitude |
| created_at | TIMESTAMP | When event occurred |

### Table: quiz_responses
Every individual answer selected in the quiz. One row per selection per section.
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment |
| session_id | VARCHAR(64) | Matches analytics_events.session_id |
| email | VARCHAR(255) | User email (set after contact capture) |
| product | VARCHAR(50) | Always 'udrm' |
| section_num | INTEGER | Section number (0-9) |
| question_id | VARCHAR(100) | Question identifier |
| selections | TEXT[] | Array of selected option IDs |
| single_selection | VARCHAR(100) | Single selected option |
| text_response | TEXT | Free-text answer |
| created_at | TIMESTAMP | When answered |

### Table: completed_diagnostics
One row per completed report. Contains AI-computed diagnostic results.
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment |
| session_id | VARCHAR(64) | Session ID (also used as email for matching) |
| email | VARCHAR(255) | User email |
| product | VARCHAR(50) | Always 'udrm' |
| name | VARCHAR(100) | User's name |
| arousal_template_type | VARCHAR(100) | AI-computed type: The Invisible Man, The Controller, The Surrendered, The Seeker, The Performer, The Protector, etc. |
| neuropathway | VARCHAR(50) | arousal_pathway, numbing_pathway, fantasy_pathway, deprivation_pathway |
| attachment_style | VARCHAR(50) | anxious-preoccupied, dismissive-avoidant, fearful-avoidant, secure, disorganized |
| shame_architecture | VARCHAR(50) | Derived from childhood environment |
| codependency_score | INTEGER | 0-3 scale |
| enmeshment_score | INTEGER | 0-3 scale |
| relational_void_score | INTEGER | 0-3 scale |
| leadership_burden_score | INTEGER | 0-3 scale |
| escalation_present | BOOLEAN | Whether behavior has escalated |
| age_first_exposure | VARCHAR(20) | under_8, age_8_11, age_12_14, age_15_plus |
| strategies_count | INTEGER | Number of strategies tried |
| years_fighting | VARCHAR(20) | years_under2, years_2_5, years_5_10, years_10_20, years_20_plus |
| report_url | TEXT | URL to generated PDF |
| report_generated_at | TIMESTAMP | When report was created |
| traffic_source | VARCHAR(255) | Where the user came from |
| ip_address, geo_city, geo_region, geo_country, geo_lat, geo_lon | Various | Location data |
| created_at | TIMESTAMP | Record creation |

### Table: pipeline_metrics
Tracks API usage, costs, failures, and performance.
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment |
| service | VARCHAR(50) | 'anthropic', 'resend', 'ghl' |
| event_type | VARCHAR(50) | report_complete, report_failed, rate_limited, email_sent |
| tokens_input | INTEGER | Input tokens used |
| tokens_output | INTEGER | Output tokens used |
| duration_ms | INTEGER | Processing time |
| cost_cents | DECIMAL(10,4) | Cost in cents |
| email | VARCHAR(255) | User email |
| error_message | TEXT | Error details |
| created_at | TIMESTAMP | Event time |

## QUIZ OPTION ID REFERENCE

Section 0 (Demographics):
- Gender: male, female
- Age: age_18_24, age_25_34, age_35_44, age_45_54, age_55_64, age_65_74, age_75_84, age_85_plus

Section 1 (Behaviors):
- Sexual: viewing_porn, scrolling_social, fantasy_daydream, compulsive_mb, sexting, physical_acting, massage_parlors
- Vices: vice_alcohol, vice_thc, vice_substances, vice_overeating, vice_gambling, vice_gaming, vice_spending, vice_social_media, vice_work, vice_nicotine, vice_none
- Frequency: daily, several_week, weekly, few_month, binge_purge
- Escalation: need_more_extreme, crossed_lines, added_behaviors, stayed_same

Section 2 (Content Themes):
val_desired, val_amateur, pow_dominance, pow_degradation, sur_someone_control, sur_dominated, tab_wrong, tab_secrecy, tab_incest, voy_watching, voy_partner, ten_emotional, nov_new, nov_search, nov_anime, conf_race, conf_samesex, conf_trans, conf_pain, conf_crossdressing, cat_lesbian, cat_milf, cat_youth, cat_group, cat_bodytype, cat_solo, cat_pov

Section 3 (Emotional Function):
calm_stress, feel_less_alone, feel_powerful, numb_checkout, feel_wanted, escape_reality, manage_anger, feel_something, after_conflict, after_serving, distant_god, spiritual_growth

Section 4 (Life Stress):
life_romantic_abundance, life_romantic_lack, life_health_abundance, life_health_lack, life_financial_abundance, life_financial_lack, life_work_abundance, life_work_lack, life_god_abundance, life_god_lack

Section 5 (First Exposure):
- Age: under_8, age_8_11, age_12_14, age_15_plus
- Method: found_own, peer_showed, older_showed, abused, parent_collection, witnessed, dont_remember

Section 6 (Upbringing):
- Home: home_warm, home_cold, home_unpredictable, home_conflict, home_controlled, home_conditional, home_no_emotions
- Father: dad_close, dad_distant, dad_critical, dad_approval, dad_sexual
- Mother: mom_close, mom_enmeshed, mom_distant, mom_critical, mom_responsible
- Church: church_shameful, church_purity, church_thoughts_sin, church_good_kid, church_conditional

Section 7 (Attachment):
anx_leave, anx_reassurance, anx_conflict_end, avoid_pull_away, avoid_sexual_easy, avoid_withdraw, fear_crave_push, fear_both, fear_swing, sec_comfortable, sec_conflict_ok, sec_trust, god_disappointed, god_avoid, god_grace_cant_feel, god_like_father, god_performance

Section 8 (Relational Patterns):
cod_needs, cod_responsible, cod_worth, enm_parent_emotions, enm_therapist, enm_boundaries, void_no_one, void_perform, void_never_told, lead_disqualified, lead_no_one_serves, lead_lose_position

Section 9 (Strategies & Duration):
- Strategies: strat_filters, strat_accountability, strat_prayer, strat_willpower, strat_therapy, strat_group, strat_rehab, strat_program, strat_confession, strat_books, strat_cold_turkey, strat_medication, strat_deliverance, strat_environment, strat_dating, strat_nothing
- Years: years_under2, years_2_5, years_5_10, years_10_20, years_20_plus

## IMPORTANT QUERY NOTES

- quiz_responses.selections is a TEXT[] (PostgreSQL array). Use unnest(selections) to expand, or 'option_id' = ANY(selections) to filter.
- To find users who selected a specific option: SELECT * FROM quiz_responses WHERE 'option_id' = ANY(selections)
- To join quiz responses with completed diagnostics: JOIN on email or session_id
- All timestamps are in UTC.
- For date filtering always use: created_at >= 'YYYY-MM-DD' AND created_at < 'YYYY-MM-DD'
- The product column is always 'udrm' for the current quiz.

## YOUR ROLE

You are a senior data analyst. When the admin asks a question:
1. Think about which tables and columns contain the answer
2. Write ONE precise SQL query to get the data (combine joins, subqueries, and aggregations into a single query when possible)
3. Use the run_sql_query tool to execute it
4. Interpret the results in plain English with actionable insights
5. If asked for an export/CSV, run the SQL query FIRST, then IMMEDIATELY call generate_csv with the results — do both in sequence, no extra queries needed
6. Always show the key numbers and percentages
7. When showing trends, calculate period-over-period changes
8. Be concise but thorough — this is a business dashboard, not a classroom

## CRITICAL EFFICIENCY RULES
- NEVER run more than 3 tool calls total for a single question
- For CSV exports: 1 SQL query + 1 generate_csv call = 2 tool calls maximum
- Combine multiple questions into a single SQL query using CTEs (WITH clauses) or subqueries
- Do NOT run exploratory queries to "check the schema" — the full schema is above
- Do NOT run a count query first and then a separate data query — just get the data
- Always include LIMIT 500 on data exports unless the user specifically asks for all rows
- If a query returns an error, fix the SQL and retry ONCE — do not keep retrying
`;

const tools = [
  {
    name: "run_sql_query",
    description: "Execute a read-only SQL SELECT query against the PostgreSQL database. Returns up to 500 rows as JSON. Only SELECT queries are allowed — any INSERT, UPDATE, DELETE, DROP, ALTER, or TRUNCATE will be rejected.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The SQL SELECT query to execute. Must be a read-only SELECT statement.",
        },
        description: {
          type: "string",
          description: "Brief description of what this query does (for logging).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "generate_csv",
    description: "Generate a CSV file from data rows. Returns a base64 data URI that the user can download.",
    input_schema: {
      type: "object",
      properties: {
        headers: {
          type: "array",
          items: { type: "string" },
          description: "Column headers for the CSV.",
        },
        rows: {
          type: "array",
          items: {
            type: "array",
            items: { type: "string" },
          },
          description: "Array of rows, each row is an array of string values matching the headers.",
        },
        filename: {
          type: "string",
          description: "Suggested filename for the download (e.g. 'financial_abundance_men.csv').",
        },
      },
      required: ["headers", "rows", "filename"],
    },
  },
];

// Read-only SQL guard
function isSafeQuery(query) {
  const normalized = query.trim().toUpperCase();
  const dangerous = ["INSERT ", "UPDATE ", "DELETE ", "DROP ", "ALTER ", "TRUNCATE ", "CREATE ", "GRANT ", "REVOKE "];
  for (const keyword of dangerous) {
    if (normalized.includes(keyword)) return false;
  }
  if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) return false;
  return true;
}

// Execute a tool call
async function executeTool(toolName, toolInput) {
  if (toolName === "run_sql_query") {
    const { query, description } = toolInput;
    console.log(`[AI Chat] SQL: ${description || "query"} — ${query.substring(0, 200)}`);
    if (!isSafeQuery(query)) {
      return { error: "Query rejected: only read-only SELECT queries are allowed." };
    }
    try {
      const sql = getDb();
      // neon serverless driver: call as function with query string
      const result = await sql(query, []);
      const rows = Array.isArray(result) ? result.slice(0, 500) : [];
      console.log(`[AI Chat] Result: ${rows.length} rows`);
      return { rowCount: rows.length, rows, truncated: (Array.isArray(result) && result.length > 500) };
    } catch (e) {
      console.error(`[AI Chat] SQL error:`, e.message);
      return { error: `SQL error: ${e.message}. Fix the query and try again.` };
    }
  }

  if (toolName === "generate_csv") {
    const { headers, rows, filename } = toolInput;
    const escape = (val) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvLines = [headers.map(escape).join(",")];
    for (const row of rows) {
      csvLines.push(row.map(escape).join(","));
    }
    const csvContent = csvLines.join("\n");
    const base64 = Buffer.from(csvContent, "utf-8").toString("base64");
    return {
      filename: filename || "export.csv",
      dataUri: `data:text/csv;base64,${base64}`,
      rowCount: rows.length,
    };
  }

  return { error: `Unknown tool: ${toolName}` };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, secret } = body;

    if (secret !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages required" }, { status: 400, headers: CORS_HEADERS });
    }

    const client = new Anthropic();

    // Build conversation with tool use loop
    let currentMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    let csvDownload = null;
    let iterations = 0;
    const MAX_ITERATIONS = 6;
    let lastError = null;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`[AI Chat] Iteration ${iterations}/${MAX_ITERATIONS}`);

      const response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 8192,
        system: SCHEMA_CONTEXT,
        tools,
        messages: currentMessages,
      });

      // Check if Claude wants to use tools
      if (response.stop_reason === "tool_use") {
        // Add assistant response to conversation
        currentMessages.push({ role: "assistant", content: response.content });

        // Execute each tool call
        const toolResults = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const result = await executeTool(block.name, block.input);

            // If CSV was generated, save the download info
            if (block.name === "generate_csv" && result.dataUri) {
              csvDownload = { filename: result.filename, dataUri: result.dataUri, rowCount: result.rowCount };
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }

        // Add tool results and continue the loop
        currentMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // Claude is done — extract the text response
      const textContent = response.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");

      return Response.json({
        response: textContent,
        csvDownload,
        usage: {
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
        },
      }, { headers: CORS_HEADERS });
    }

    return Response.json({
      response: "I hit the maximum number of tool calls for this query. Try breaking your question into smaller parts.",
      csvDownload,
    }, { headers: CORS_HEADERS });

  } catch (error) {
    console.error("Admin chat error:", error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
