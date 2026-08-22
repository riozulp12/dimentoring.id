import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * Ganti Password — PRD 8 Section 1 (Pengaturan). Password Saat Ini
 * diverifikasi lewat verifyPassword() yang SAMA dengan Login
 * (app/api/auth/login/route.ts), Password Baru di-hash lewat hashPassword()
 * yang SAMA dengan Register — satu fungsi hash/compare dipakai di semua
 * jalur auth, bukan diimplementasi ulang.
 *
 * Sukses TIDAK menghapus/reissue session cookie — sesi yang sedang aktif
 * (signed independen dari password_hash) tetap berlaku, user tidak
 * auto-logout.
 */

const MIN_PASSWORD_LENGTH = 8;

interface GantiPasswordBody {
  passwordSaatIni?: string;
  passwordBaru?: string;
  konfirmasiPasswordBaru?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);

  let body: GantiPasswordBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const passwordSaatIni = body.passwordSaatIni ?? "";
  const passwordBaru = body.passwordBaru ?? "";
  const konfirmasiPasswordBaru = body.konfirmasiPasswordBaru ?? "";

  if (!passwordSaatIni || !passwordBaru || !konfirmasiPasswordBaru) {
    return errorResponse("Semua field wajib diisi.", 400);
  }
  if (passwordBaru !== konfirmasiPasswordBaru) {
    return errorResponse("Password Baru dan Konfirmasi Password Baru tidak sama.", 400);
  }
  if (passwordBaru.length < MIN_PASSWORD_LENGTH) {
    return errorResponse(`Password Baru minimal ${MIN_PASSWORD_LENGTH} karakter.`, 400);
  }

  const { data: user, error: userError } = await supabaseServer
    .from("users")
    .select("id, password_hash")
    .eq("id", session.userId)
    .maybeSingle();

  if (userError || !user) {
    console.error("[pengaturan/ganti-password] query users failed:", userError);
    return errorResponse("Gagal memuat akun kamu. Coba lagi nanti.", 500);
  }

  const currentValid = await verifyPassword(passwordSaatIni, user.password_hash as string);
  if (!currentValid) {
    return errorResponse("Password saat ini salah.", 401);
  }

  const newHash = await hashPassword(passwordBaru);
  const { error: updateError } = await supabaseServer
    .from("users")
    .update({ password_hash: newHash })
    .eq("id", session.userId);

  if (updateError) {
    console.error("[pengaturan/ganti-password] update failed:", updateError);
    return errorResponse("Gagal menyimpan password baru. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
