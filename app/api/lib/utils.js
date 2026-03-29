export function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

export function parseRedis(val) {
  if (!val) return null;
  return typeof val === "string" ? JSON.parse(val) : val;
}
