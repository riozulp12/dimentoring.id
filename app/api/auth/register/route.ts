import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/auth/password";
import {
  ROLE_DASHBOARD_PATH,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "@/lib/auth/session";
import { generateReferralCode } from "@/lib/auth/generateReferralCode";
import { TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";
import { linkPendingAssessment } from "@/lib/assessment/linkPendingAssessment";

/**
 * Register API — PRD Bagian 7.0.2 DIREVISI TOTAL (Agustus 2026): "Akun Dulu,
 * Profiling Belakangan". Rute ini SEKARANG cuma bikin akun `users` (email,
 * nama, password) + auto-login, TIDAK LAGI menerima role/kelas/mapel/ptn/dst —
 * itu semua pindah ke app/api/auth/lengkapi-profil/route.ts (dipanggil SETELAH
 * user login, dari halaman terpisah /lengkapi-profil).
 *
 * Konsekuensi skema: users.no_wa & users.password_hash SEKARANG nullable (lihat
 * db/make_no_wa_password_nullable.sql) — no_wa belum diisi sampai lengkapi-profil,
 * password_hash NULL permanen untuk akun yang daftar lewat Google (rute ini juga
 * dipakai bareng app/api/auth/google-callback/route.ts secara paralel, bukan
 * dipanggil dari situ — akun Google dibuat langsung di rute itu).
 *
 * BR-15 (direvisi September 2026, Bagian 7.0.3): verifikasi akun DITUNDA ke Fase 2.
 * Akun langsung dibuat berstatus `verified`, tanpa generate/kirim verification token.
 */

interface RegisterRequestBody {
  namaLengkap: string;
  email: string;
  password: string;
  kodeReferral?: string;
  // PRD Bagian 7.4.1b: id assessment anonim yang mau ditautkan ke akun baru ini.
  pendingAssessmentId?: string;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: RegisterRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  // ---- Validasi input dasar (server-side, tidak boleh percaya client) ----
  const namaLengkap = body.namaLengkap?.trim();
  if (!namaLengkap) {
    return errorResponse("Nama lengkap wajib diisi.", 400);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return errorResponse("Email tidak valid.", 400);
  }
  if (!body.password || body.password.length < 8) {
    return errorResponse("Password minimal 8 karakter.", 400);
  }

  const warnings: string[] = [];

  // ---- Hash password ----
  const passwordHash = await hashPassword(body.password);

  // ---- Insert users (profiling_selesai default false lewat skema) ----
  // Format kode referral (3 huruf + 2 angka) cuma punya 100 kombinasi per prefix,
  // jadi retry beberapa kali dengan kode baru kalau tabrakan spesifik di kode_referral.
  const MAX_REFERRAL_ATTEMPTS = 5;
  let newUser: { id: string } | null = null;
  let userError: { code?: string; message: string; details?: string; hint?: string } | null = null;

  for (let attempt = 0; attempt < MAX_REFERRAL_ATTEMPTS; attempt++) {
    const ownReferralCode = generateReferralCode(namaLengkap);
    const result = await supabaseServer
      .from("users")
      .insert({
        nama: namaLengkap,
        email,
        password_hash: passwordHash,
        status_verifikasi_akun: "verified",
        kode_referral: ownReferralCode,
      })
      .select("id")
      .single();

    newUser = result.data;
    userError = result.error;

    if (!userError) break;
    const isReferralCollision =
      userError.code === "23505" && userError.message.includes("kode_referral");
    if (!isReferralCollision) break;
  }

  if (userError || !newUser) {
    if (userError?.code === "23505") {
      if (userError.message.includes("email")) {
        return errorResponse("Email sudah terdaftar.", 409);
      }
      if (userError.message.includes("kode_referral")) {
        return errorResponse("Gagal membuat kode referral unik. Coba lagi.", 500);
      }
      return errorResponse("Data sudah terdaftar.", 409);
    }
    console.error("[register] insert users failed:", {
      message: userError?.message,
      code: userError?.code,
      details: userError?.details,
      hint: userError?.hint,
    });
    return errorResponse("Gagal membuat akun. Coba lagi nanti.", 500);
  }

  const userId = newUser.id as string;

  async function rollbackUser() {
    await supabaseServer.from("users").delete().eq("id", userId);
  }

  // ---- Insert gamifikasi_profiles (FR-R1: setiap akun butuh "tabungan" poin
  // referral sejak awal, sebelum role Siswa/Mentor dipilih sekalipun).
  const { error: gamifikasiError } = await supabaseServer
    .from("gamifikasi_profiles")
    .insert({ user_id: userId });

  if (gamifikasiError) {
    console.error("[register] insert gamifikasi_profiles failed:", gamifikasiError);
    await rollbackUser();
    return errorResponse("Gagal menyiapkan profil gamifikasi. Coba lagi nanti.", 500);
  }

  // ---- Referral (best-effort, FR-1.5: kode salah tidak memblokir pendaftaran) ----
  // Sesuai BR-11: validasi self-referral SENGAJA tidak dilakukan di sini — itu ranah
  // Payment (webhook konversi), bukan saat registrasi.
  const kodeReferral = body.kodeReferral?.trim();
  if (kodeReferral) {
    const { data: referrer } = await supabaseServer
      .from("users")
      .select("id")
      .eq("kode_referral", kodeReferral)
      .maybeSingle();

    if (!referrer) {
      warnings.push("Kode referral tidak ditemukan, pendaftaran tetap dilanjutkan.");
    } else {
      const { error: referralError } = await supabaseServer.from("referrals").insert({
        referrer_id: referrer.id,
        referee_id: userId,
        kode_referral: kodeReferral,
        status: "terdaftar",
      });
      if (referralError) {
        console.error("[register] insert referrals failed:", referralError);
        warnings.push("Kode referral gagal dicatat, pendaftaran tetap dilanjutkan.");
      }
    }
  }

  // ---- PRD Bagian 7.4.1b (best-effort): tautkan assessment anonim yang sempat
  // diisi sebelum akun ini dibuat, supaya usahanya tidak hilang percuma.
  const trialId = request.cookies.get(TRIAL_COOKIE_NAME)?.value ?? null;
  await linkPendingAssessment(body.pendingAssessmentId, trialId, userId);

  // ---- Auto-login (PRD 7.0.2: "TIDAK perlu login manual lagi setelah register").
  // Role belum ditentukan — session sementara "unassigned" sampai /lengkapi-profil
  // selesai (lihat lib/auth/session.ts).
  const response = NextResponse.json(
    {
      success: true,
      message: "Akun berhasil dibuat.",
      userId,
      redirectTo: ROLE_DASHBOARD_PATH.unassigned,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    { status: 201 },
  );

  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken({ userId, role: "unassigned" }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
