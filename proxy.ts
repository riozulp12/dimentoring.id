import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";
import { TRIAL_COOKIE_MAX_AGE_SECONDS, TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";
import {
  ATTR_COOKIE_MAX_AGE_SECONDS,
  ATTR_COOKIE_NAME,
  buatAtribusiDariUrl,
  serializeAtribusi,
} from "@/lib/shared/atribusi";

/**
 * Dua tugas, sengaja terpisah:
 *
 * 1. PRD Bagian 7.4.1b (Akses Anonim/Trial Tanpa Login): begitu browser yang
 *    belum login membuka /assessment, kasih cookie trial ID httpOnly random
 *    (tanpa data pribadi) — dipakai app/api/assessment/snbp/route.ts untuk
 *    menghitung batas "2x hasil gratis" per BR-29. HANYA di /assessment.
 *
 * 2. PRD 7.4.6 / BR-38 (atribusi first-touch): di halaman mana pun, kalau URL
 *    membawa utm_* / fbclid dan cookie dm_attr BELUM ada, simpan atribusinya.
 *    Cookie yang sudah ada tidak pernah ditimpa (first-touch).
 */
function isAssessmentPath(pathname: string): boolean {
  return pathname === "/assessment" || pathname.startsWith("/assessment/");
}

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (isAssessmentPath(request.nextUrl.pathname)) {
    const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
    const hasTrial = request.cookies.has(TRIAL_COOKIE_NAME);
    if (!hasSession && !hasTrial) {
      response.cookies.set(TRIAL_COOKIE_NAME, crypto.randomUUID(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: TRIAL_COOKIE_MAX_AGE_SECONDS,
      });
    }
  }

  if (!request.cookies.has(ATTR_COOKIE_NAME)) {
    const atribusi = buatAtribusiDariUrl(request.nextUrl.searchParams, request.nextUrl.pathname);
    if (atribusi) {
      response.cookies.set(ATTR_COOKIE_NAME, serializeAtribusi(atribusi), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: ATTR_COOKIE_MAX_AGE_SECONDS,
      });
    }
  }

  return response;
}

export const config = {
  // Semua halaman, kecuali API, aset Next, dan file statis (punya ekstensi).
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[A-Za-z0-9]+$).*)"],
};
