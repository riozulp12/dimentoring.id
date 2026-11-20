import "server-only";
import { validatePromoCode } from "@/lib/payment/validatePromoCode";
import type { KelasCheckoutData } from "@/lib/payment/getKelasForCheckout";
import { hitungHargaSesi } from "@/lib/shared/hargaSesi";
import { cekDiskonAman, kelasPrivateOnline } from "@/lib/shared/marginKelas";
import { sesiPilihanAktif } from "@/lib/shared/sesiPilihanFlag";

/**
 * SATU-SATUNYA penghitung nominal checkout, dipakai /api/payment/create DAN /api/payment/validate-promo.
 * Harga SELALU dihitung ulang di server dari database; angka dari klien tidak pernah dipercaya.
 * Rumus harga sesi ada di lib/shared/hargaSesi.ts (tidak ditulis ulang di sini).
 *
 * jumlah = hargaDasar - diskonPromo + biayaSesiTambahan.
 * Saklar SESI_PILIHAN_AKTIF mati, atau tanpa `jumlahSesiTotal` = jalur LAMA: hargaAktif - promo (sesiPilihan = null).
 */

export interface HasilCheckoutData {
  /** null = jalur lama (kolom sesi pilihan tidak ditulis). */
  sesiPilihan: null | {
    sesiTotal: number;
    sesiTambahan: number;
    /** null bila tidak ada sesi tambahan. */
    hargaPerSesiTambahan: number | null;
    biayaSesiTambahan: number;
  };
  /** Sebelum promo (= payments.jumlah_sebelum_diskon): hargaDasar + biayaSesiTambahan. */
  hargaSebelumPromo: number;
  promo: { promoId: string; kode: string; diskon: number } | null;
  diskon: number;
  /** Nominal yang ditagih (= payments.jumlah = nominal invoice). */
  total: number;
}

export type HasilCheckout = { ok: true; data: HasilCheckoutData } | { ok: false; error: string; status: number };

const tolak = (error: string, status = 400): HasilCheckout => ({ ok: false, error, status });

export async function hitungCheckout(input: {
  kelas: KelasCheckoutData;
  /** Banyak subtes yang dipilih (1..3); dipakai batas minimal sesi. */
  jumlahSubtes: number;
  kodePromo?: string | null;
  /** Mentah dari klien; diabaikan bila saklar mati. */
  jumlahSesiTotal?: unknown;
}): Promise<HasilCheckout> {
  const { kelas } = input;
  const saklar = sesiPilihanAktif();
  const privateOnline = kelasPrivateOnline(kelas.tipeKelas, kelas.modePembelajaran);

  let sesiPilihan: HasilCheckoutData["sesiPilihan"] = null;
  let hargaSebelumPromo = kelas.hargaAktif;
  let promoBerlaku = true;

  const diminta = saklar ? input.jumlahSesiTotal : undefined;
  if (diminta !== undefined && diminta !== null) {
    if (typeof diminta !== "number" || !Number.isInteger(diminta)) return tolak("Jumlah sesi tidak valid.");
    if (!privateOnline) {
      // Kelas lain: jumlah sesi tidak bisa diubah. Sama dengan paket kelas = jalur lama.
      if (diminta !== kelas.jumlahSesi) return tolak("Jumlah sesi untuk kelas ini tidak bisa diubah.");
    } else {
      const hasil = hitungHargaSesi({
        hargaNormal: kelas.harga,
        hargaAktif: kelas.hargaAktif,
        jumlahSesiKelas: kelas.jumlahSesi ?? 0,
        jumlahSesiDipilih: diminta,
        jumlahSubtes: input.jumlahSubtes,
      });
      if (!hasil.valid) return tolak(hasil.galat);
      sesiPilihan = {
        sesiTotal: hasil.sesiTotal,
        sesiTambahan: hasil.sesiTambahan,
        hargaPerSesiTambahan: hasil.sesiTambahan > 0 ? hasil.hargaPerSesi : null,
        biayaSesiTambahan: hasil.biayaSesiTambahan,
      };
      hargaSebelumPromo = hasil.totalSebelumPromo;
      promoBerlaku = hasil.kodePromoBerlaku;
    }
  }

  let promo: HasilCheckoutData["promo"] = null;
  let diskon = 0;
  const kode = input.kodePromo?.trim();
  if (kode) {
    if (!promoBerlaku) {
      return tolak("Kode promo hanya bisa dipakai untuk paket penuh atau lebih. Pilih jumlah sesi paket penuh, ya.");
    }
    const hasilPromo = await validatePromoCode(kode, kelas.id, kelas.hargaAktif);
    if (!hasilPromo.ok) return tolak(hasilPromo.error);

    // Pagar margin: kelas private online tidak boleh tertembus promo (hanya saat fitur sesi pilihan menyala).
    if (saklar && privateOnline) {
      const cek = cekDiskonAman({
        tipeKelas: kelas.tipeKelas,
        modeKelas: kelas.modePembelajaran,
        hargaNormal: kelas.harga,
        jumlahSesiKelas: kelas.jumlahSesi ?? 0,
        hargaSetelahDiskonKelas: kelas.hargaAktif,
        nilaiPromo: hasilPromo.data.diskon,
      });
      if (cek.berlaku && !cek.aman) {
        return tolak("Kode promo ini tidak bisa dipakai untuk kelas ini karena potongannya terlalu besar. Coba kode lain atau bayar tanpa kode, ya.");
      }
    }
    promo = { promoId: hasilPromo.data.promoId, kode: hasilPromo.data.kode, diskon: hasilPromo.data.diskon };
    diskon = hasilPromo.data.diskon;
  }

  return {
    ok: true,
    data: { sesiPilihan, hargaSebelumPromo, promo, diskon, total: hargaSebelumPromo - diskon },
  };
}
