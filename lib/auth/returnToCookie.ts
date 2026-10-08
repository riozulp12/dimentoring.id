import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/auth/safeInternalPath";

/**
 * Titipan `returnTo` lintas alur daftar -> onboarding (/lengkapi-profil).
 *
 * Kenapa cookie (bukan query/sessionStorage): `returnTo` dari halaman kelas
 * ("Daftar Sekarang" -> /login?returnTo=...) hilang begitu user ternyata
 * akun BARU / onboarding belum selesai, karena server mengarahkannya ke
 * /lengkapi-profil dan baru di akhir wizard tujuan akhirnya ditentukan.
 * Cookie bertahan lintas tab & navigasi, berumur pendek (30 menit).
 *
 * Aturan:
 * - Ditulis HANYA saat sesi hasil login/daftar masih "unassigned" (onboarding
 *   belum selesai). Login ke akun lama tidak butuh cookie — `returnTo` sudah
 *   diproses langsung di app/(auth)/login/page.tsx lewat query.
 * - Divalidasi safeInternalPath saat DITULIS dan saat DIBACA (cookie tetap
 *   bisa diedit manual, jadi isi cookie juga dianggap input tidak dipercaya).
 * - Dipakai di akhir onboarding HANYA kalau role akhirnya Siswa; dihapus
 *   setelah onboarding selesai (role apa pun) dan saat logout.
 */

export const RETURN_TO_COOKIE_NAME = "dimentoring_return_to";
const RETURN_TO_MAX_AGE_SECONDS = 30 * 60;

/** Tulis cookie kalau `value` lolos safeInternalPath; kalau tidak (atau kosong),
 * hapus titipan lama supaya tidak "nyangkut" ke pendaftaran berikutnya di browser yang sama. */
export function writeReturnToCookie(response: NextResponse, value: unknown): void {
  const safe = typeof value === "string" ? safeInternalPath(value) : null;
  if (!safe) {
    clearReturnToCookie(response);
    return;
  }
  response.cookies.set(RETURN_TO_COOKIE_NAME, safe, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: RETURN_TO_MAX_AGE_SECONDS,
  });
}

export function readReturnToCookie(request: NextRequest): string | null {
  return safeInternalPath(request.cookies.get(RETURN_TO_COOKIE_NAME)?.value);
}

export function clearReturnToCookie(response: NextResponse): void {
  response.cookies.set(RETURN_TO_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
