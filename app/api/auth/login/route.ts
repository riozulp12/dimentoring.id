import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";
import { resolveSessionForUser } from "@/lib/auth/resolveSession";
import { TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";

/**
 * Login API — PRD Bagian 7.0.1 (Login) & Bagian 7.0.6 (multi-role).
 * Business rules: Bagian 8 BR-2 (Mentor pending sampai approve Admin),
 * BR-27 (direvisi September 2026 — Mentor Pending tetap bisa login, cuma fitur
 * mengajar dikunci di sisi frontend lewat flag `mentorStatus`).
 *
 * BR-15 (direvisi September 2026, Bagian 7.0.3): verifikasi akun DITUNDA ke Fase 2 —
 * tidak ada lagi blokir login berdasarkan `status_verifikasi_akun`.
 *
 * FR-1.15 (baru, Agustus 2026): SEBELUM cek role, wajib cek users.profiling_selesai
 * — kalau false, akun ini belum pernah/belum selesai isi /lengkapi-profil (belum
 * punya baris user_roles sama sekali), jadi TIDAK boleh masuk ke logic resolusi
 * role sama sekali. Logic ini didelegasikan ke resolveSessionForUser() supaya SAMA
 * persis dengan yang dipakai app/api/auth/google-callback/route.ts.
 */

// Hash scrypt dummy (bukan dari akun manapun) — dipakai kalau email tidak ditemukan,
// supaya verifyPassword() tetap menjalankan scrypt dengan cost yang sama seperti
// jalur email valid. Mencegah timing attack yang bisa dipakai menebak email terdaftar.
const DUMMY_PASSWORD_HASH =
  "scrypt$64ca0d48f328da570f514640165fae25$99f29c8dfb118c5193589c2a43ca9bdf12b851ec69e1d6892f6a9ecde68b71f7140160227d7c576cf0964d8943b8d8535ae666b85e936553851b0eeae325b29f";

interface LoginRequestBody {
  email: string;
  password: string;
  // PRD Bagian 7.4.1b: id assessment anonim yang mau ditautkan ke akun ini,
  // dikirim frontend dari query param ?pending_assessment= di halaman Login.
  pendingAssessmentId?: string;
}

function errorResponse(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  let body: LoginRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return errorResponse("Email dan password wajib diisi.", 400);
  }

  // ---- Cari user & verifikasi password (pesan error SENGAJA generik, lihat di bawah) ----
  const { data: user, error: userQueryError } = await supabaseServer
    .from("users")
    .select("id, email, password_hash, profiling_selesai")
    .eq("email", email)
    .maybeSingle();

  if (userQueryError) {
    console.error("[login] query users failed:", userQueryError);
    return errorResponse("Gagal memproses login. Coba lagi nanti.", 500);
  }

  // Selalu jalankan verifyPassword (bahkan kalau user tidak ada/password_hash NULL karena akun
  // Google-only, pakai dummy hash) supaya waktu respons tidak membocorkan apakah email terdaftar
  // atau apakah akun itu punya password lokal (BR: jangan bisa ditebak dari luar).
  const passwordValid = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordValid) {
    return errorResponse("Email atau password salah.", 401);
  }

  const previousSession = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const trialId = request.cookies.get(TRIAL_COOKIE_NAME)?.value ?? null;

  const resolved = await resolveSessionForUser({
    userId: user.id,
    profilingSelesai: user.profiling_selesai as boolean,
    previousSessionUserId: previousSession?.userId ?? null,
    previousSessionRole: previousSession?.role ?? null,
    pendingAssessmentId: body.pendingAssessmentId,
    trialId,
  });

  if (!resolved.ok) {
    return errorResponse(resolved.error, resolved.status, resolved.reason ? { reason: resolved.reason } : undefined);
  }

  const response = NextResponse.json({
    success: true,
    role: resolved.role,
    redirectTo: resolved.redirectTo,
    ...(resolved.mentorStatus ? { mentorStatus: resolved.mentorStatus } : {}),
  });

  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken({ userId: user.id, role: resolved.role }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
