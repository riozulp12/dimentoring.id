import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session";
import { resolveSessionForUser } from "@/lib/auth/resolveSession";
import { generateReferralCode } from "@/lib/auth/generateReferralCode";
import { TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";

/**
 * Bridge "Google OAuth sukses -> session aplikasi kita" — dipanggil dari
 * app/auth/callback/page.tsx SETELAH exchangeCodeForSession() di browser
 * berhasil (jadi email di body ini sudah DIVERIFIKASI Google, bukan input
 * bebas). SATU rute dipakai baik dari tombol "Daftar dengan Google" (/daftar)
 * maupun "Login dengan Google" (/login) — PRD Bagian 7.0.2/7.0.1 sengaja minta
 * behavior akhirnya IDENTIK di kedua pintu masuk:
 *   - Email belum ada di `users` -> buat akun baru (treat sebagai register,
 *     termasuk kalau dipicu dari tombol Login — "UX lebih ramah daripada nolak").
 *   - Email sudah ada -> treat sebagai Login biasa (cek profiling_selesai lewat
 *     resolveSessionForUser, SAMA dengan app/api/auth/login/route.ts).
 */

interface GoogleCallbackBody {
  email: string;
  nama?: string | null;
  pendingAssessmentId?: string;
}

function errorResponse(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  let body: GoogleCallbackBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return errorResponse("Email dari Google tidak valid.", 400);
  }

  const { data: existingUser, error: userQueryError } = await supabaseServer
    .from("users")
    .select("id, profiling_selesai")
    .eq("email", email)
    .maybeSingle();

  if (userQueryError) {
    console.error("[google-callback] query users failed:", userQueryError);
    return errorResponse("Gagal memproses login Google. Coba lagi nanti.", 500);
  }

  let userId: string;
  let profilingSelesai: boolean;

  if (existingUser) {
    userId = existingUser.id as string;
    profilingSelesai = existingUser.profiling_selesai as boolean;
  } else {
    // ---- Belum pernah daftar -> buat akun baru (register implisit). ----
    const namaLengkap = body.nama?.trim() || email.split("@")[0];

    const MAX_REFERRAL_ATTEMPTS = 5;
    let newUser: { id: string } | null = null;
    let insertError: { code?: string; message: string } | null = null;

    for (let attempt = 0; attempt < MAX_REFERRAL_ATTEMPTS; attempt++) {
      const result = await supabaseServer
        .from("users")
        .insert({
          nama: namaLengkap,
          email,
          status_verifikasi_akun: "verified", // Google sudah memverifikasi kepemilikan email ini
          kode_referral: generateReferralCode(namaLengkap),
        })
        .select("id")
        .single();

      newUser = result.data;
      insertError = result.error;
      if (!insertError) break;
      const isReferralCollision =
        insertError.code === "23505" && insertError.message.includes("kode_referral");
      if (!isReferralCollision) break;
    }

    if (insertError || !newUser) {
      console.error("[google-callback] insert users failed:", insertError);
      return errorResponse("Gagal membuat akun. Coba lagi nanti.", 500);
    }

    userId = newUser.id;
    profilingSelesai = false;

    const { error: gamifikasiError } = await supabaseServer
      .from("gamifikasi_profiles")
      .insert({ user_id: userId });
    if (gamifikasiError) {
      console.error("[google-callback] insert gamifikasi_profiles failed:", gamifikasiError);
      await supabaseServer.from("users").delete().eq("id", userId);
      return errorResponse("Gagal menyiapkan profil gamifikasi. Coba lagi nanti.", 500);
    }
  }

  const previousSession = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const trialId = request.cookies.get(TRIAL_COOKIE_NAME)?.value ?? null;

  const resolved = await resolveSessionForUser({
    userId,
    profilingSelesai,
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

  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken({ userId, role: resolved.role }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
