import "server-only";
import { Resend } from "resend";
import { resolveAppBaseUrl } from "@/lib/payment/mayarLogic";
import { bersihkanGalat, samarkanEmail } from "@/lib/notifikasi/logAman";

/**
 * Email ke Mentor saat ada siswa baru di kelas yang diampunya (PRD Bagian 7.5).
 * Dipanggil dari lib/notifikasi/siswaBaru.ts, SETELAH respons webhook/pendaftaran
 * dikirim (lib/notifikasi/setelahRespons.ts) — best effort: tidak pernah
 * melempar galat, tidak pernah menggagalkan alur utama.
 *
 * Isi sengaja minim: nama siswa, kelas, jadwal (kalau ada), tautan ke web.
 * TANPA nomor WA / email siswa. Semua teks dari luar di-escape (nama siswa
 * dari pengguna, jadi tidak boleh masuk HTML mentah).
 *
 * Env (semua opsional kecuali RESEND_API_KEY):
 *   RESEND_API_KEY      — kunci Resend. Kosong = email dilewati dengan satu peringatan.
 *   EMAIL_FROM_ADDRESS  — alamat pengirim, bawaan notifikasi@dimentoring.id (domain harus terverifikasi di Resend)
 *   EMAIL_FROM_NAME     — nama pengirim, bawaan "Dimentoring"
 *   EMAIL_REPLY_TO      — alamat balasan, bawaan: tidak ada
 *   APP_BASE_URL        — dasar tautan, bawaan https://dimentoring.id
 */

export const EMAIL_FROM_ADDRESS_BAWAAN = "notifikasi@dimentoring.id";
export const EMAIL_FROM_NAME_BAWAAN = "Dimentoring";
const BASE_URL_BAWAAN = "https://dimentoring.id";
/** Gambar email selalu dari produksi (di Preview belum tentu ada). */
const ASSET_BASE_URL = "https://dimentoring.id";
const LOGO_URL = `${ASSET_BASE_URL}/icons/logo-full-primary.svg`;
const MASCOT_URL = `${ASSET_BASE_URL}/mascots/mascot-guidance.png`;

type EnvLike = Readonly<Record<string, string | undefined>>;

const POLA_ALAMAT_EMAIL = /^[^\s<>"@,;]+@[^\s<>"@,;]+\.[^\s<>"@,;]+$/;

export function escapeHtml(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Satu baris saja (tanpa baris baru) supaya aman untuk subjek / nama pengirim. */
function satuBaris(teks: string, maks: number): string {
  return teks.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maks);
}

/** "Dimentoring <notifikasi@dimentoring.id>" — bisa diatur env, nilai tak valid jatuh ke bawaan. */
export function buatPengirim(env: EnvLike): { from: string; replyTo?: string } {
  const alamatEnv = env.EMAIL_FROM_ADDRESS?.trim();
  const alamat = alamatEnv && POLA_ALAMAT_EMAIL.test(alamatEnv) ? alamatEnv : EMAIL_FROM_ADDRESS_BAWAAN;
  const nama = satuBaris((env.EMAIL_FROM_NAME ?? "").replace(/[<>"]/g, ""), 60) || EMAIL_FROM_NAME_BAWAAN;
  const replyEnv = env.EMAIL_REPLY_TO?.trim();
  return {
    from: `${nama} <${alamat}>`,
    replyTo: replyEnv && POLA_ALAMAT_EMAIL.test(replyEnv) ? replyEnv : undefined,
  };
}

export interface IsiEmailSiswaBaru {
  namaMentor: string;
  namaSiswa: string;
  kelasNama: string;
  /** null = jadwal belum diatur -> baris jadwal tidak ditampilkan. */
  jadwalDisplay: string | null;
  tautan: string;
}

export function buatSubjekSiswaBaru(kelasNama: string): string {
  return `Ada siswa baru di kelas ${satuBaris(kelasNama, 100)}`;
}

export function buatTeksSiswaBaru(isi: IsiEmailSiswaBaru): string {
  return [
    `Halo ${isi.namaMentor},`,
    "",
    `Ada siswa baru di kelas ${isi.kelasNama}.`,
    "",
    `Siswa: ${isi.namaSiswa}`,
    `Kelas: ${isi.kelasNama}`,
    ...(isi.jadwalDisplay ? [`Jadwal: ${isi.jadwalDisplay}`] : []),
    "",
    "Penerimaan siswa dilakukan di web, bukan lewat email ini. Buka tautan ini untuk melihat dan menerimanya:",
    isi.tautan,
    "",
    "Tim Dimentoring",
  ].join("\n");
}

export function buatHtmlSiswaBaru(isi: IsiEmailSiswaBaru): string {
  const mentor = escapeHtml(isi.namaMentor);
  const siswa = escapeHtml(isi.namaSiswa);
  const kelas = escapeHtml(isi.kelasNama);
  const jadwal = isi.jadwalDisplay ? escapeHtml(isi.jadwalDisplay) : null;
  const tautan = escapeHtml(isi.tautan);

  const baris = (label: string, nilai: string, akhir = false) => `
                  <tr><td style="font-size:13px;color:#7E7C7C;padding-bottom:4px;">${label}</td></tr>
                  <tr><td style="font-size:15px;color:#000000;font-weight:600;${akhir ? "" : "padding-bottom:12px;"}">${nilai}</td></tr>`;

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
                <p style="margin:0 0 12px;font-size:16px;color:#000000;">Halo ${mentor},</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333333;">
                  Ada siswa baru di kelas <strong>${kelas}</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9FAFF;border-radius:16px;padding:16px 20px;">${baris("Siswa", siswa)}${baris("Kelas", kelas, !jadwal)}${jadwal ? baris("Jadwal", jadwal, true) : ""}
                </table>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding-bottom:20px;">
                <a href="${tautan}" style="display:inline-block;background-color:#081EEA;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:12px;">Buka Kelas Saya</a>
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
                  Penerimaan siswa dilakukan di web, bukan lewat email ini.
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
  namaSiswa: string;
  kelasId: string;
  kelasNama: string;
  jadwalDisplay: string | null;
}

export type KirimEmailMentorSiswaBaruResult =
  | { success: true }
  | { success: false; error: "belum_dikonfigurasi" | "ditolak" | "gagal_terhubung" };

interface PengirimResend {
  emails: {
    send(payload: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
      replyTo?: string;
    }): Promise<{ data?: { id?: string } | null; error?: { name?: string; message?: string } | null }>;
  };
}

export interface OpsiKirimEmail {
  env?: EnvLike;
  /** Untuk tes: pengganti klien Resend sungguhan. */
  buatKlien?: (apiKey: string) => PengirimResend;
}

export async function kirimEmailMentorSiswaBaru(
  input: KirimEmailMentorSiswaBaruInput,
  opsi: OpsiKirimEmail = {},
): Promise<KirimEmailMentorSiswaBaruResult> {
  const env = opsi.env ?? process.env;
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY belum diset — email notifikasi mentor dilewati.");
    return { success: false, error: "belum_dikonfigurasi" };
  }

  const tujuan = samarkanEmail(input.email);
  try {
    const klien = opsi.buatKlien ? opsi.buatKlien(apiKey) : (new Resend(apiKey) as unknown as PengirimResend);
    const { from, replyTo } = buatPengirim(env);
    const baseUrl = resolveAppBaseUrl(env.APP_BASE_URL, BASE_URL_BAWAAN);
    const isi: IsiEmailSiswaBaru = {
      namaMentor: input.namaMentor,
      namaSiswa: input.namaSiswa,
      kelasNama: input.kelasNama,
      jadwalDisplay: input.jadwalDisplay,
      tautan: `${baseUrl}/kelas-saya/${encodeURIComponent(input.kelasId)}`,
    };

    const { error } = await klien.emails.send({
      from,
      to: [input.email],
      subject: buatSubjekSiswaBaru(input.kelasNama),
      html: buatHtmlSiswaBaru(isi),
      text: buatTeksSiswaBaru(isi),
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error(`[email] siswa_baru ditolak Resend untuk ${tujuan}: ${bersihkanGalat(error.name ?? "galat", [apiKey])}`);
      return { success: false, error: "ditolak" };
    }
    return { success: true };
  } catch (error) {
    console.error(`[email] siswa_baru gagal terhubung untuk ${tujuan}: ${bersihkanGalat(error instanceof Error ? error.name : "galat", [apiKey])}`);
    return { success: false, error: "gagal_terhubung" };
  }
}
