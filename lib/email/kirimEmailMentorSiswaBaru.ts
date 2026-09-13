import "server-only";
import { Resend } from "resend";

/**
 * Kirim email ke Mentor saat ada siswa baru mendaftar (payment berhasil) di
 * kelas yang diampunya — PRD Bagian 7.5, Bagian 13 (kelas_mentor — BARU).
 * Dipanggil lib/notifikasi/notify.ts (notifyMentorsSiswaBaruDaftar) dari
 * app/api/payment/webhook/route.ts. Pola & brand identik dengan
 * kirimEmailResetPassword.ts — REUSE styling, ganti isi saja.
 *
 * SENGAJA TANPA nama siswa (privasi anak, PRD Bagian 8 Data & Privasi) —
 * cukup info kelas & jadwal, bukan identitas siswa yang mendaftar.
 */

const FROM_ADDRESS = "Dimentoring <noreply@dimentoring.id>";

const ASSET_BASE_URL = "https://dimentoring.id";
const LOGO_URL = `${ASSET_BASE_URL}/icons/logo-full-primary.svg`;
const MASCOT_URL = `${ASSET_BASE_URL}/mascots/mascot-guidance.png`;

function buildSiswaBaruHtml(namaMentor: string, kelasNama: string, jadwalDisplay: string): string {
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
                <p style="margin:0 0 12px;font-size:16px;color:#000000;">Halo ${namaMentor},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333333;">
                  Ada 1 siswa baru yang mendaftar dan sudah menyelesaikan pembayaran di kelas
                  <strong>${kelasNama}</strong> yang kamu ampu.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9FAFF;border-radius:16px;padding:16px 20px;">
                  <tr>
                    <td style="font-size:13px;color:#7E7C7C;padding-bottom:4px;">Kelas</td>
                  </tr>
                  <tr>
                    <td style="font-size:15px;color:#000000;font-weight:600;padding-bottom:12px;">${kelasNama}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#7E7C7C;padding-bottom:4px;">Jadwal</td>
                  </tr>
                  <tr>
                    <td style="font-size:15px;color:#000000;font-weight:600;">${jadwalDisplay}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding-bottom:20px;">
                <img src="${MASCOT_URL}" width="110" alt="" style="display:inline-block;width:110px;height:auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#7E7C7C;">
                  Buka halaman "Kelas Saya" di dashboard Dimentoring kamu untuk lihat detail siswa binaan di kelas ini.
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

export interface KirimEmailMentorSiswaBaruInput {
  email: string;
  namaMentor: string;
  kelasNama: string;
  jadwalDisplay: string;
}

export type KirimEmailMentorSiswaBaruResult = { success: true } | { success: false; error: string };

export async function kirimEmailMentorSiswaBaru({
  email,
  namaMentor,
  kelasNama,
  jadwalDisplay,
}: KirimEmailMentorSiswaBaruInput): Promise<KirimEmailMentorSiswaBaruResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[kirimEmailMentorSiswaBaru] RESEND_API_KEY belum diset di .env.local.");
    return { success: false, error: "Layanan email belum dikonfigurasi." };
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [email],
      subject: `Siswa baru mendaftar di kelas ${kelasNama}`,
      html: buildSiswaBaruHtml(namaMentor, kelasNama, jadwalDisplay),
    });

    if (error) {
      console.error("[kirimEmailMentorSiswaBaru] Resend menolak pengiriman:", error);
      return { success: false, error: "Gagal mengirim email." };
    }

    console.log("[kirimEmailMentorSiswaBaru] Terkirim, Resend id:", data?.id);
    return { success: true };
  } catch (error) {
    console.error("[kirimEmailMentorSiswaBaru] Gagal terhubung ke Resend:", error);
    return { success: false, error: "Gagal mengirim email." };
  }
}
