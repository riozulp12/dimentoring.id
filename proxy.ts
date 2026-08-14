import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";
import { TRIAL_COOKIE_MAX_AGE_SECONDS, TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";

/**
 * PRD Bagian 7.4.1b (Akses Anonim/Trial Tanpa Login): begitu browser yang
 * belum login membuka /assessment, kasih cookie trial ID httpOnly random
 * (tanpa data pribadi) — dipakai app/api/assessment/snbp/route.ts untuk
 * menghitung batas "2x hasil gratis" per BR-29.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  const hasTrial = request.cookies.has(TRIAL_COOKIE_NAME);

  if (hasSession || hasTrial) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(TRIAL_COOKIE_NAME, crypto.randomUUID(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TRIAL_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ["/assessment", "/assessment/:path*"],
};
