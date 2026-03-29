import { SignJWT, jwtVerify } from "jose";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export { SECRET, jwtVerify };

export async function createDashboardToken(email, name) {
  return new SignJWT({ email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(SECRET);
}

export function setTokenCookie(response, token) {
  response.headers.set(
    "Set-Cookie",
    `dashboard_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
  return response;
}
