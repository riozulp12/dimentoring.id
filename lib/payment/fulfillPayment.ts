import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { convertReferralOnPayment } from "@/lib/referral/convertReferralOnPayment";
import {
  notifyPembayaranBerhasil,
  notifyMentorsSiswaBaruDaftar,
  notifyMentorOfflineSiswaBaruDaftar,
} from "@/lib/notifikasi/notify";
import { formatJadwalRingkas } from "@/lib/shared/formatJadwal";
import { generateSesiKelasUntukEnrollment, type GenerateSesiResult } from "@/lib/absensi/generateSesiKelas";

/**
 * Alur pasca-lunas BERSAMA — PRD Bagian 8 BR-19 (status cuma berubah lewat
 * webhook gateway / override Admin) & BR-10/BR-11 (referral). Dipakai webhook
 * Mayar, recheck Admin, dan (dormant) webhook Midtrans — JANGAN disalin.
 *
 * Idempotensi: status diubah BERSYARAT menunggu -> berhasil; cuma pemanggil
 * yang "menang" yang menjalankan langkah sekali-jalan (promo, referral,
 * notifikasi). Langkah enrollment (enrollments, enrollment_subtes, sesi_kelas)
 * aman diulang, jadi dijalankan lagi tiap ada notifikasi untuk payment yang
 * sudah 'berhasil' — kalau run sebelumnya gagal di tengah (HTTP 500 -> Mayar
 * kirim ulang), run berikutnya melengkapinya tanpa membuat data ganda.
 */

const PAYMENT_COLUMNS =
  "id, user_id, item_type, item_id, kode_promo_id, status, mentor_offline_id, lokasi_siswa_lat, lokasi_siswa_lng, jadwal_pilihan";

type PaymentRow = Record<string, unknown> & { id: string; user_id: string; item_type: string; item_id: string };

/** Langkah pasca-lunas yang wajib sukses ternyata gagal — pemanggil membalas HTTP 500 supaya gateway mengirim ulang. */
export class PascaLunasError extends Error {
  constructor(step: string, cause: unknown) {
    const code = (cause as { code?: string } | null)?.code;
    super(`Langkah pasca-lunas gagal: ${step}${code ? ` (kode ${code})` : ""}`);
    this.name = "PascaLunasError";
  }
}

export type TandaiLunasOutcome = "diproses" | "sudah_lunas" | "bukan_menunggu" | "tidak_ditemukan";

/**
 * Tandai payment lunas (menunggu -> berhasil, bersyarat) lalu jalankan alur
 * pasca-lunas. Pemanggil WAJIB sudah memverifikasi status & nominal ke API
 * gateway sebelum memanggil ini.
 */
export async function tandaiLunasDanProses(paymentId: string, opts: { metode: string | null }): Promise<TandaiLunasOutcome> {
  const { data: claimed, error: claimError } = await supabaseServer
    .from("payments")
    .update({ status: "berhasil", metode: opts.metode, tanggal_lunas: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("status", "menunggu")
    .select(PAYMENT_COLUMNS)
    .maybeSingle();
  if (claimError) throw new PascaLunasError("update payments berhasil", claimError);

  if (claimed) {
    await jalankanPascaLunas(claimed as PaymentRow, { pertamaKali: true });
    return "diproses";
  }

  const { data: current, error: currentError } = await supabaseServer
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("id", paymentId)
    .maybeSingle();
  if (currentError) throw new PascaLunasError("query payments", currentError);
  if (!current) return "tidak_ditemukan";
  if (current.status !== "berhasil") return "bukan_menunggu";

  await jalankanPascaLunas(current as PaymentRow, { pertamaKali: false });
  return "sudah_lunas";
}

/**
 * `pertamaKali` = pemanggil ini yang baru saja mengubah status jadi 'berhasil'.
 * Dipakai juga webhook Midtrans lama (yang punya kunci idempotensinya sendiri).
 */
export async function jalankanPascaLunas(payment: PaymentRow, opts: { pertamaKali: boolean }): Promise<void> {
  if (opts.pertamaKali) {
    // Sekali jalan & tidak bergantung pada enrollment — gagal di sini cukup di-log.
    await tambahPemakaianPromo(payment.kode_promo_id as string | null);
    await convertReferralOnPayment(payment.user_id, payment.id);
  }

  if (payment.item_type !== "kelas") return;

  const hasil = await pastikanEnrollment(payment);

  // Notifikasi sekali: oleh pemenang, atau oleh run ulang yang ternyata baru
  // melengkapi sesi_kelas (berarti run pertama gagal sebelum sempat notifikasi).
  if (!opts.pertamaKali && hasil.sesi !== "dibuat") return;

  const kelasId = payment.item_id;
  const kelasNama = (hasil.kelas?.nama as string) ?? "kamu";
  const jadwalDisplay = formatJadwalRingkas(hasil.kelas?.jadwal);

  await notifyPembayaranBerhasil(payment.user_id, kelasId, kelasNama);

  // Offline: notif HANYA ke mentor_offline_id yang dipilih siswa saat checkout
  // (kelas offline tidak punya kelas_subtes_mentor/kelas_mentor).
  if (hasil.kelas?.mode_pembelajaran === "offline") {
    if (payment.mentor_offline_id) {
      await notifyMentorOfflineSiswaBaruDaftar(payment.mentor_offline_id as string, kelasId, kelasNama, jadwalDisplay);
    }
  } else {
    await notifyMentorsSiswaBaruDaftar(kelasId, kelasNama, jadwalDisplay, hasil.subtesIds);
  }
}

async function tambahPemakaianPromo(kodePromoId: string | null): Promise<void> {
  if (!kodePromoId) return;
  const { data: promo, error: fetchError } = await supabaseServer
    .from("kode_promo")
    .select("jumlah_terpakai")
    .eq("id", kodePromoId)
    .maybeSingle();
  if (fetchError) {
    console.error("[fulfillPayment] query kode_promo failed:", fetchError);
    return;
  }
  if (!promo) return;
  const { error: updateError } = await supabaseServer
    .from("kode_promo")
    .update({ jumlah_terpakai: (promo.jumlah_terpakai as number) + 1 })
    .eq("id", kodePromoId);
  if (updateError) {
    console.error("[fulfillPayment] update kode_promo.jumlah_terpakai failed:", updateError);
  }
}

/** Langkah yang aman diulang — error apa pun dilempar sebagai PascaLunasError. */
async function pastikanEnrollment(payment: PaymentRow): Promise<{
  subtesIds: string[];
  kelas: Record<string, unknown> | null;
  sesi: GenerateSesiResult | "tanpa_sesi";
}> {
  const { data: enrollment, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .upsert(
      {
        user_id: payment.user_id,
        kelas_id: payment.item_id,
        status_pembayaran: "lunas",
        mentor_offline_id: payment.mentor_offline_id ?? null,
        lokasi_siswa_lat: payment.lokasi_siswa_lat ?? null,
        lokasi_siswa_lng: payment.lokasi_siswa_lng ?? null,
        // Pilihan Jadwal Siswa (PRD 7.5.8) — ditampung di payments saat checkout.
        jadwal_pilihan: payment.jadwal_pilihan ?? null,
      },
      { onConflict: "user_id,kelas_id" },
    )
    .select("id")
    .single();
  if (enrollmentError || !enrollment) throw new PascaLunasError("upsert enrollments", enrollmentError);
  const enrollmentId = enrollment.id as string;

  // Pilihan Subtes dari payment_subtes_pilihan (ditampung saat checkout) ->
  // enrollment_subtes — dasar filter Materi & notifikasi mentor.
  const { data: pilihan, error: pilihanError } = await supabaseServer
    .from("payment_subtes_pilihan")
    .select("subtes_id")
    .eq("payment_id", payment.id);
  if (pilihanError) throw new PascaLunasError("query payment_subtes_pilihan", pilihanError);

  const subtesIds = (pilihan ?? []).map((row) => row.subtes_id as string);
  if (subtesIds.length > 0) {
    const { error: subtesError } = await supabaseServer
      .from("enrollment_subtes")
      .upsert(
        subtesIds.map((subtesId) => ({ enrollment_id: enrollmentId, subtes_id: subtesId })),
        { onConflict: "enrollment_id,subtes_id", ignoreDuplicates: true },
      );
    if (subtesError) throw new PascaLunasError("upsert enrollment_subtes", subtesError);
  }

  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("nama, jadwal, mode_pembelajaran, jumlah_sesi")
    .eq("id", payment.item_id)
    .maybeSingle();
  if (kelasError) throw new PascaLunasError("query kelas", kelasError);

  // Absensi (PRD 7.5.5) — sesi_kelas 1..jumlah_sesi begitu enrollment 'lunas' ada.
  let sesi: GenerateSesiResult | "tanpa_sesi" = "tanpa_sesi";
  if (kelas?.jumlah_sesi) {
    sesi = await generateSesiKelasUntukEnrollment(enrollmentId, kelas.jumlah_sesi as number);
    if (sesi === "gagal") throw new PascaLunasError("generate sesi_kelas", null);
  }

  return { subtesIds, kelas: kelas ?? null, sesi };
}
