import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Token Reset Password — tabel TERPISAH dari verification_tokens (BR-15),
 * lihat db/add_password_reset_tokens.sql & PRD Bagian 13 (PasswordResetToken
 * — baru). Dipakai app/api/auth/forgot-password/route.ts (generate) &
 * app/api/auth/reset-password/route.ts (validasi & konsumsi).
 */

const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 menit

/**
 * Invalidate semua token lama user ini yang belum dipakai, lalu buat token
 * baru — supaya tiap kali user minta reset baru, link lama otomatis mati
 * (tidak ada beberapa link valid nyebar bersamaan).
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  await supabaseServer
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  const token = randomBytes(32).toString("hex");
  const expiredAt = new Date(Date.now() + TOKEN_EXPIRY_MS).toISOString();

  const { error } = await supabaseServer.from("password_reset_tokens").insert({
    user_id: userId,
    token,
    expired_at: expiredAt,
  });

  if (error) {
    console.error("[createPasswordResetToken] insert failed:", error);
    throw new Error("Gagal membuat token reset password.");
  }

  return token;
}

export type ValidatePasswordResetTokenResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/** Validasi token (ada, belum dipakai, belum kadaluarsa) TANPA mengonsumsinya
 * — dipakai halaman /reset-password saat load pertama kali untuk cek link
 * masih valid sebelum user mulai isi form. */
export async function validatePasswordResetToken(token: string): Promise<ValidatePasswordResetTokenResult> {
  if (!token) return { ok: false, error: "Token tidak ditemukan." };

  const { data, error } = await supabaseServer
    .from("password_reset_tokens")
    .select("user_id, expired_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[validatePasswordResetToken] query failed:", error);
    return { ok: false, error: "Gagal memvalidasi link reset password. Coba lagi nanti." };
  }
  if (!data) {
    return { ok: false, error: "Link reset password tidak valid." };
  }
  if (data.used_at) {
    return { ok: false, error: "Link reset password ini sudah pernah dipakai." };
  }
  if (new Date(data.expired_at as string).getTime() < Date.now()) {
    return { ok: false, error: "Link reset password ini sudah kadaluarsa. Minta link baru." };
  }

  return { ok: true, userId: data.user_id as string };
}

/** Tandai token sudah dipakai — WAJIB dipanggil setelah password berhasil
 * diganti supaya token ini tidak bisa dipakai ulang (single-use). */
export async function consumePasswordResetToken(token: string): Promise<void> {
  const { error } = await supabaseServer
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  if (error) {
    console.error("[consumePasswordResetToken] update failed:", error);
  }
}
