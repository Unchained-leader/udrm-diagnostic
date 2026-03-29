import { SignJWT, jwtVerify } from "jose";

function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

// Lazy — evaluated on first request, not at build time
let _secret;
export function getJwtSecret() {
  if (!_secret) _secret = getSecret();
  return _secret;
}

// Re-export for convenience
export { jwtVerify };

export async function createDashboardToken(email, name) {
  return new SignJWT({ email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export function setTokenCookie(response, token) {
  response.headers.set(
    "Set-Cookie",
    `dashboard_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
  return response;
}
