import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  kirimEmailPembayaranBerhasil,
  type KirimEmailPembayaranBerhasilInput,
  type KirimEmailPembayaranBerhasilResult,
} from "@/lib/email/kirimEmailPembayaranBerhasil";
import { jalankanSetelahRespons } from "@/lib/notifikasi/setelahRespons";
import { samarkanEmail } from "@/lib/notifikasi/logAman";
import { formatJadwalRingkas } from "@/lib/shared/formatJadwal";

/**
 * Saluran LUAR WEB untuk kejadian "pembayaran kelas berhasil": email bukti
 * pembayaran ke SISWA. Notifikasi di dalam web (lonceng) tetap di notify.ts
 * (notifyPembayaranBerhasil) dan tidak diubah.
 *
 * Dipanggil dari lib/payment/fulfillPayment.ts HANYA pada eksekusi pertama
 * setelah lunas (pertamaKali) — bukan saat webhook ganda, bukan saat recheck
 * Admin yang tidak mengubah status, dan tidak untuk pendaftaran manual Admin
 * (tidak ada pembayaran). Berjalan lewat jalankanSetelahRespons(): SETELAH
 * respons webhook dikirim, tidak menunggu layanan email, dan tidak pernah
 * melempar galat ke alur pembayaran.
 *
 * Mengikuti users.notif_email (Pengaturan > Notifikasi Email): false = tidak
 * dikirim; true/kosong = dikirim. Semua data dibaca dari database berdasarkan
 * id payment (bukan dari payload webhook).
 */

export interface DataBuktiBayar extends Omit<KirimEmailPembayaranBerhasilInput, "email" | "namaSiswa"> {
  email: string | null;
  namaSiswa: string;
  /** users.notif_email !== false. */
  bolehEmail: boolean;
}

export interface DepsBuktiBayar {
  env?: Readonly<Record<string, string | undefined>>;
  kirimEmail?: (input: KirimEmailPembayaranBerhasilInput) => Promise<KirimEmailPembayaranBerhasilResult>;
  /** Untuk tes: pengganti pembacaan database. */
  muatData?: (paymentId: string) => Promise<DataBuktiBayar | null>;
}

const kunciTerkirim = new Set<string>();
const MAKS_KUNCI = 5000;

/** Hanya untuk tes. */
export function resetPenjagaBuktiBayarUntukTes(): void {
  kunciTerkirim.clear();
}

export function kunciBuktiBayar(paymentId: string): string {
  return `bukti_bayar:${paymentId}`;
}

async function namaPengguna(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseServer.from("users").select("nama").eq("id", userId).maybeSingle();
  return (data?.nama as string | undefined) ?? null;
}

export async function muatDataBuktiBayar(paymentId: string): Promise<DataBuktiBayar | null> {
  const { data: payment, error } = await supabaseServer
    .from("payments")
    .select("id, user_id, item_type, item_id, order_id, jumlah, kode_promo_id, tanggal_lunas, status, mentor_offline_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) {
    console.warn(`[notifikasi] baca payment untuk email bukti bayar gagal (kode ${error.code ?? "?"}).`);
    return null;
  }
  if (!payment || payment.status !== "berhasil" || payment.item_type !== "kelas") return null;

  const { data: siswa, error: siswaError } = await supabaseServer
    .from("users")
    .select("nama, email, notif_email")
    .eq("id", payment.user_id as string)
    .maybeSingle();
  if (siswaError || !siswa) {
    console.warn(`[notifikasi] baca siswa untuk email bukti bayar gagal (kode ${siswaError?.code ?? "tidak ada"}).`);
    return null;
  }

  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("nama, jadwal, mode_pembelajaran, mentor_id")
    .eq("id", payment.item_id as string)
    .maybeSingle();
  if (kelasError || !kelas) {
    console.warn(`[notifikasi] baca kelas untuk email bukti bayar gagal (kode ${kelasError?.code ?? "tidak ada"}).`);
    return null;
  }

  // Kelas offline: mentor = yang dipilih siswa saat checkout; selain itu mentor kelas.
  const mentorId =
    kelas.mode_pembelajaran === "offline" && payment.mentor_offline_id
      ? (payment.mentor_offline_id as string)
      : ((kelas.mentor_id as string | null) ?? null);

  let kodePromo: string | null = null;
  if (payment.kode_promo_id) {
    const { data: promo } = await supabaseServer.from("kode_promo").select("kode").eq("id", payment.kode_promo_id as string).maybeSingle();
    kodePromo = (promo?.kode as string | undefined) ?? null;
  }

  return {
    email: (siswa.email as string | null) ?? null,
    namaSiswa: ((siswa.nama as string | null) ?? "").trim() || "Siswa",
    bolehEmail: siswa.notif_email !== false,
    kelasId: payment.item_id as string,
    kelasNama: kelas.nama as string,
    namaMentor: await namaPengguna(mentorId),
    jadwalDisplay: formatJadwalRingkas(kelas.jadwal),
    jumlah: Number(payment.jumlah),
    kodePromo,
    tanggalLunas: (payment.tanggal_lunas as string | null) ?? null,
    nomorPesanan: payment.order_id as string,
  };
}

/**
 * Kirim email bukti pembayaran untuk payment yang BARU SAJA lunas. Tidak pernah
 * melempar galat dan tidak menunggu layanan email di jalur webhook.
 */
export async function kabariSiswaPembayaranBerhasil(paymentId: string, deps: DepsBuktiBayar = {}): Promise<void> {
  await jalankanSetelahRespons("notifikasi-bukti-bayar", async () => {
    const kunci = kunciBuktiBayar(paymentId);
    if (kunciTerkirim.has(kunci)) return;

    const data = await (deps.muatData ?? muatDataBuktiBayar)(paymentId);
    if (!data) return;
    const { bolehEmail, email, ...sisa } = data;
    if (!bolehEmail) return;
    if (!email) {
      console.warn("[email] siswa tanpa alamat email — bukti pembayaran dilewati.");
      return;
    }

    if (kunciTerkirim.size >= MAKS_KUNCI) kunciTerkirim.clear();
    kunciTerkirim.add(kunci);

    const kirimEmail = deps.kirimEmail ?? ((input) => kirimEmailPembayaranBerhasil(input, { env: deps.env }));
    try {
      await kirimEmail({ ...sisa, email });
    } catch {
      console.error(`[email] bukti_bayar galat tak terduga untuk ${samarkanEmail(email)}.`);
    }
  });
}
