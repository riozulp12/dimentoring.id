import "server-only";
import { Resend } from "resend";
import { resolveAppBaseUrl } from "@/lib/payment/mayarLogic";
import { bersihkanGalat, samarkanEmail } from "@/lib/notifikasi/logAman";
import { buatPengirim, type OpsiKirimEmail } from "@/lib/email/kirimEmailMentorSiswaBaru";
import { buatEmailPembayaranBerhasil } from "@/lib/email/templateEmail";
import { formatRupiah } from "@/lib/shared/paymentLabels";

/**
 * Email bukti pembayaran ke SISWA saat pembayaran kelas lunas. Dipanggil dari
 * lib/notifikasi/pembayaranBerhasil.ts, SETELAH respons webhook dikirim
 * (lib/notifikasi/setelahRespons.ts) — best effort: tidak pernah melempar
 * galat, tidak pernah menggagalkan pembayaran. Log hanya berisi alamat yang
 * disamarkan dan galat yang sudah dibersihkan (tanpa data pribadi).
 *
 * Env: sama dengan email siswa baru ke mentor (RESEND_API_KEY, EMAIL_FROM_*,
 * EMAIL_REPLY_TO, APP_BASE_URL). RESEND_API_KEY kosong = dilewati, satu peringatan.
 */

const BASE_URL_BAWAAN = "https://dimentoring.id";

export interface KirimEmailPembayaranBerhasilInput {
  email: string;
  namaSiswa: string;
  kelasId: string;
  kelasNama: string;
  namaMentor: string | null;
  jadwalDisplay: string | null;
  /** payments.jumlah (setelah diskon). */
  jumlah: number;
  kodePromo: string | null;
  /** payments.tanggal_lunas (ISO); null/tidak valid -> waktu sekarang. */
  tanggalLunas: string | null;
  /** payments.order_id. */
  nomorPesanan: string;
}

export type KirimEmailPembayaranBerhasilResult =
  | { success: true }
  | { success: false; error: "belum_dikonfigurasi" | "ditolak" | "gagal_terhubung" };

/** "14 November 2026 01.44 WIB" (waktu Jakarta). */
export function formatTanggalBayar(iso: string | null, sekarang: Date = new Date()): string {
  const parsed = iso ? new Date(iso) : sekarang;
  const tanggal = Number.isNaN(parsed.getTime()) ? sekarang : parsed;
  const teks = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).format(tanggal);
  return `${teks} WIB`;
}

export async function kirimEmailPembayaranBerhasil(
  input: KirimEmailPembayaranBerhasilInput,
  opsi: OpsiKirimEmail = {},
): Promise<KirimEmailPembayaranBerhasilResult> {
  const env = opsi.env ?? process.env;
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY belum diset — email bukti pembayaran dilewati.");
    return { success: false, error: "belum_dikonfigurasi" };
  }

  const tujuan = samarkanEmail(input.email);
  try {
    const klien = opsi.buatKlien
      ? opsi.buatKlien(apiKey)
      : (new Resend(apiKey) as unknown as ReturnType<NonNullable<OpsiKirimEmail["buatKlien"]>>);
    const { from, replyTo } = buatPengirim(env);
    const baseUrl = resolveAppBaseUrl(env.APP_BASE_URL, BASE_URL_BAWAAN);
    const email = buatEmailPembayaranBerhasil({
      namaSiswa: input.namaSiswa,
      kelasNama: input.kelasNama,
      namaMentor: input.namaMentor,
      jadwalDisplay: input.jadwalDisplay,
      jumlahDibayar: formatRupiah(input.jumlah),
      kodePromo: input.kodePromo,
      tanggalPembayaran: formatTanggalBayar(input.tanggalLunas),
      nomorPesanan: input.nomorPesanan,
      tautan: `${baseUrl}/kelas/${encodeURIComponent(input.kelasId)}`,
    });

    const { error } = await klien.emails.send({
      from,
      to: [input.email],
      subject: email.subjek,
      html: email.html,
      text: email.teks,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error(`[email] bukti_bayar ditolak Resend untuk ${tujuan}: ${bersihkanGalat(error.name ?? "galat", [apiKey])}`);
      return { success: false, error: "ditolak" };
    }
    return { success: true };
  } catch (error) {
    console.error(`[email] bukti_bayar gagal terhubung untuk ${tujuan}: ${bersihkanGalat(error instanceof Error ? error.name : "galat", [apiKey])}`);
    return { success: false, error: "gagal_terhubung" };
  }
}
