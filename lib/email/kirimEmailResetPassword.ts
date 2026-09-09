import "server-only";
import { Resend } from "resend";

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
 * Base URL absolut untuk aset gambar di email (logo & maskot). Email client
 * (Gmail, Outlook, dst) me-load gambar langsung dari internet, bukan dari
 * build aplikasi — jadi WAJIB absolut, bukan path relatif seperti "/icons/...".
 * Reuse file yang sama persis dengan yang dipakai Navbar (lihat components/ui/Logo.tsx)
 * dan folder public/mascots — jangan ganti ke aset lain tanpa alasan kuat.
 */
const ASSET_BASE_URL = "https://dimentoring.id";
const LOGO_URL = `${ASSET_BASE_URL}/icons/logo-full-primary.svg`;
const MASCOT_URL = `${ASSET_BASE_URL}/mascots/mascot-guidance.png`;

function buildResetPasswordHtml(nama: string, resetLink: string): string {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#F9FAFF;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9FAFF;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:24px;border:1px solid #E3E3E3;padding:32px;">
            <tr>
              <td style="text-align:center;padding-bottom:8px;">
                <img src="${LOGO_URL}" width="150" height="40" alt="Dimentoring" style="display:inline-block;width:150px;height:40px;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td style="padding-top:20px;">
                <p style="margin:0 0 12px;font-size:16px;color:#000000;">Halo ${nama},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333333;">
                  Kami menerima permintaan reset password untuk akun Dimentoring kamu. Klik tombol di bawah untuk
                  membuat password baru. Link ini berlaku selama <strong>30 menit</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding-bottom:20px;">
                <a href="${resetLink}" style="display:inline-block;background-color:#081EEA;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 32px;border-radius:18px;">
                  Reset Password
                </a>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding-bottom:20px;">
                <img src="${MASCOT_URL}" width="110" alt="" style="display:inline-block;width:110px;height:auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#7E7C7C;">
                  Kalau tombolnya tidak bisa diklik, salin dan buka link berikut di browser kamu:
                </p>
                <p style="margin:0 0 20px;font-size:13px;line-height:1.6;word-break:break-all;color:#081EEA;">
                  ${resetLink}
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#7E7C7C;">
                  Kalau kamu tidak merasa meminta reset password, abaikan saja email ini — password akun kamu
                  tetap aman dan tidak berubah.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
