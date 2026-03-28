import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "unchained-dashboard-secret-key-change-me");

const PUBLIC_PATHS = ["/dashboard/login", "/dashboard/register", "/dashboard/reset-pin"];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("dashboard_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/dashboard/login", request.url));
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/dashboard/login", request.url));
    response.cookies.set("dashboard_token", "", { maxAge: 0 });
    return response;
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
