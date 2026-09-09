import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { createPasswordResetToken } from "@/lib/auth/passwordResetToken";
import { kirimEmailResetPassword } from "@/lib/email/kirimEmailResetPassword";

/**
 * Minta link Reset Password — PRD Bagian 7.0.3 lanjutan (Lupa Password).
 *
 * Anti-enumeration (pola sama dengan app/api/auth/login/route.ts): response
 * SELALU sukses generik kalau email tidak ditemukan — TIDAK boleh membocorkan
 * apakah suatu email terdaftar. Beda dengan kegagalan Resend (bukan soal
 * privasi, murni kegagalan operasional) yang WAJIB dilaporkan jelas ke user
 * supaya mereka tahu harus coba lagi, bukan menganggu-anggu nunggu email yang
 * tidak pernah dikirim.
 */

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const GENERIC_SUCCESS_MESSAGE = "Kalau email itu terdaftar, link reset password sudah kami kirim.";

export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return errorResponse("Email tidak valid.", 400);
  }

  const { data: user, error: userQueryError } = await supabaseServer
    .from("users")
    .select("id, nama, email")
    .eq("email", email)
    .maybeSingle();

  if (userQueryError) {
    console.error("[forgot-password] query users failed:", userQueryError);
    return errorResponse("Gagal memproses permintaan. Coba lagi nanti.", 500);
  }

  // Email tidak ditemukan — TETAP balas sukses generik (anti-enumeration),
  // tidak ada token dibuat, tidak ada email dikirim.
  if (!user) {
    return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE });
  }

  let token: string;
  try {
    token = await createPasswordResetToken(user.id as string);
  } catch (error) {
    console.error("[forgot-password] createPasswordResetToken failed:", error);
    return errorResponse("Gagal memproses permintaan. Coba lagi nanti.", 500);
  }

  const resetLink = new URL(`/reset-password?token=${token}`, request.url).toString();

  const sendResult = await kirimEmailResetPassword({
    email: user.email as string,
    nama: user.nama as string,
    resetLink,
  });

  // Kegagalan Resend BUKAN masalah privasi (email memang terdaftar) — beri
  // tahu jelas supaya user tahu harus coba lagi, jangan biarkan mereka
  // menunggu email yang tidak pernah terkirim (instruksi eksplisit).
  if (!sendResult.success) {
    return errorResponse(sendResult.error, 502);
  }

  return NextResponse.json({ success: true, message: GENERIC_SUCCESS_MESSAGE });
}
