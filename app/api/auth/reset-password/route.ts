import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/auth/password";
import { consumePasswordResetToken, validatePasswordResetToken } from "@/lib/auth/passwordResetToken";

/**
 * Submit password baru lewat link Reset Password — PRD Bagian 7.0.3 lanjutan
 * (Lupa Password). SENGAJA TIDAK auto-login setelah berhasil — user diarahkan
 * balik ke /login supaya bisa memverifikasi password barunya benar-benar
 * jalan (bagian dari alur test manual fitur ini).
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const token = body.token?.trim() ?? "";
  const password = body.password ?? "";
  if (!token) {
    return errorResponse("Token tidak valid.", 400);
  }
  if (password.length < 8) {
    return errorResponse("Password minimal 8 karakter.", 400);
  }

  const validation = await validatePasswordResetToken(token);
  if (!validation.ok) {
    return errorResponse(validation.error, 400);
  }

  const passwordHash = await hashPassword(password);

  const { error: updateError } = await supabaseServer
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("id", validation.userId);

  if (updateError) {
    console.error("[reset-password] update password failed:", updateError);
    return errorResponse("Gagal menyimpan password baru. Coba lagi nanti.", 500);
  }

  await consumePasswordResetToken(token);

  return NextResponse.json({ success: true });
}
