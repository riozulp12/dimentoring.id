import "server-only";
import { Resend } from "resend";
import { buatEmailResetPassword } from "@/lib/email/templateEmail";

/**
 * Kirim email Reset Password lewat Resend — PRD Bagian 7.0.3 lanjutan
 * (Lupa Password). GANTI dari simulasi (dulu cuma dicatat ke log) ke
 * pengiriman sungguhan. Dipanggil app/api/auth/forgot-password/route.ts
 * SETELAH token reset dibuat (lib/auth/passwordResetToken.ts) — logic
 * generate token TIDAK berubah, cuma bagian pengirimannya.
 *
 * Resend butuh domain pengirim (`noreply@dimentoring.id`) sudah terverifikasi
 * di dashboard Resend — kalau belum, kirim akan gagal/ditolak.
 */

const FROM_ADDRESS = "Dimentoring <noreply@dimentoring.id>";

/**
 * Tampilan email memakai layout bersama (lib/email/layoutEmail.ts; isi per
 * event di lib/email/templateEmail.ts). Nama & tautan di-escape di sana.
 */
function buildResetPasswordHtml(nama: string, resetLink: string): string {
  return buatEmailResetPassword({ nama, resetLink }).html;
}

export interface KirimEmailResetPasswordInput {
  email: string;
  nama: string;
  resetLink: string;
}

export type KirimEmailResetPasswordResult = { success: true } | { success: false; error: string };

export async function kirimEmailResetPassword({
  email,
  nama,
  resetLink,
}: KirimEmailResetPasswordInput): Promise<KirimEmailResetPasswordResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[kirimEmailResetPassword] RESEND_API_KEY belum diset di .env.local.");
    return { success: false, error: "Layanan email belum dikonfigurasi. Coba lagi nanti." };
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [email],
      subject: "Reset Password Dimentoring",
      html: buildResetPasswordHtml(nama, resetLink),
      text: buatEmailResetPassword({ nama, resetLink }).teks,
    });

    if (error) {
      console.error("[kirimEmailResetPassword] Resend menolak pengiriman:", error);
      return { success: false, error: "Gagal mengirim email reset password. Coba lagi nanti." };
    }

    console.log("[kirimEmailResetPassword] Terkirim, Resend id:", data?.id);
    return { success: true };
  } catch (error) {
    console.error("[kirimEmailResetPassword] Gagal terhubung ke Resend:", error);
    return { success: false, error: "Gagal mengirim email reset password. Coba lagi nanti." };
  }
}
