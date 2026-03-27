import { neon } from "@neondatabase/serverless";

let _sql = null;

export function getDb() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("No Postgres connection string found");
  _sql = neon(url);
  return _sql;
}

export default { getDb };

