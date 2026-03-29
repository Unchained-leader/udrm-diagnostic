import { getDb } from "../../lib/db";
import { corsHeaders, optionsResponse } from "../../lib/cors";

const CORS_HEADERS = corsHeaders("POST, OPTIONS");

export async function OPTIONS() {
  return optionsResponse("POST, OPTIONS");
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.secret !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const sql = getDb();

    // Create tables
    await sql`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        product VARCHAR(50) DEFAULT 'udrm',
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS quiz_responses (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        email VARCHAR(255),
        product VARCHAR(50) DEFAULT 'udrm',
        section_num INTEGER NOT NULL,
        question_id VARCHAR(100),
        selections TEXT[],
        single_selection VARCHAR(100),
        text_response TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS completed_diagnostics (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(64),
        email VARCHAR(255),
        product VARCHAR(50) DEFAULT 'udrm',
        name VARCHAR(100),
        arousal_template_type VARCHAR(100),
        neuropathway VARCHAR(50),
        attachment_style VARCHAR(50),
        shame_architecture VARCHAR(50),
        codependency_score INTEGER,
        enmeshment_score INTEGER,
        relational_void_score INTEGER,
        leadership_burden_score INTEGER,
        escalation_present BOOLEAN,
        age_first_exposure VARCHAR(20),
        strategies_count INTEGER,
        years_fighting VARCHAR(20),
        report_url TEXT,
        report_generated_at TIMESTAMP,
        quiz_started_at TIMESTAMP,
        quiz_completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Indexes for common queries
    await sql`CREATE INDEX IF NOT EXISTS idx_events_product ON analytics_events(product)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_type ON analytics_events(event_type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_session ON analytics_events(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_created ON analytics_events(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_responses_session ON quiz_responses(session_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_responses_section ON quiz_responses(section_num)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_diagnostics_product ON completed_diagnostics(product)`;

    return Response.json({ success: true, message: "Schema created successfully" }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Migration error:", error);
    return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
