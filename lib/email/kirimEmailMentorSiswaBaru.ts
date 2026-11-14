import "server-only";
import { Resend } from "resend";
import { resolveAppBaseUrl } from "@/lib/payment/mayarLogic";
import { bersihkanGalat, samarkanEmail } from "@/lib/notifikasi/logAman";
import { escapeHtml, satuBaris } from "@/lib/email/layoutEmail";
import { buatEmailSiswaBaru, buatSubjekSiswaBaru, type IsiEmailSiswaBaru } from "@/lib/email/templateEmail";

export { escapeHtml, buatSubjekSiswaBaru };
export type { IsiEmailSiswaBaru };

/**
 * Email ke Mentor saat ada siswa baru di kelas yang diampunya (PRD Bagian 7.5).
 * Dipanggil dari lib/notifikasi/siswaBaru.ts, SETELAH respons webhook/pendaftaran
 * dikirim (lib/notifikasi/setelahRespons.ts) — best effort: tidak pernah
 * melempar galat, tidak pernah menggagalkan alur utama.
 *
 * Isi sengaja minim: nama siswa, kelas, jadwal (kalau ada), tautan ke web.
 * TANPA nomor WA / email siswa. Semua teks dari luar di-escape (nama siswa
 * dari pengguna, jadi tidak boleh masuk HTML mentah). Tampilan memakai layout
 * bersama di lib/email/layoutEmail.ts (isi per event: lib/email/templateEmail.ts).
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

type EnvLike = Readonly<Record<string, string | undefined>>;

const POLA_ALAMAT_EMAIL = /^[^\s<>"@,;]+@[^\s<>"@,;]+\.[^\s<>"@,;]+$/;

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

export function buatTeksSiswaBaru(isi: IsiEmailSiswaBaru): string {
  return buatEmailSiswaBaru(isi).teks;
}

export function buatHtmlSiswaBaru(isi: IsiEmailSiswaBaru): string {
  return buatEmailSiswaBaru(isi).html;
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
