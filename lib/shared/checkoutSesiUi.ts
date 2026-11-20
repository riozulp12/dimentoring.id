/**
 * Logika murni tampilan pemilih sesi di Checkout (kelas private online, saklar SESI_PILIHAN_AKTIF hidup).
 * Angka harga SELALU dari hitungHargaSesi (lib/shared/hargaSesi.ts) — tidak ada rumus kedua di sini.
 * Server tetap menghitung ulang semuanya; ini hanya tampilan.
 */
import { SUBTES_MIN, FAKTOR_SESI_MAKS, hitungHargaSesi, type HasilHargaValid } from "./hargaSesi";
import { validasiSebaranSesi } from "./sebaranSesiSubtes";

export function batasSesi(jumlahSesiKelas: number, jumlahSubtes: number): { min: number; maks: number } {
  return { min: Math.max(1, jumlahSubtes), maks: FAKTOR_SESI_MAKS * jumlahSesiKelas };
}

/** Bagi N sesi rata ke subtes; sisa diberikan ke subtes pertama dst. Kosong bila tidak ada subtes. */
export function bagiRataSesi(subtesIds: string[], total: number): Record<string, number> {
  const hasil: Record<string, number> = {};
  const k = subtesIds.length;
  if (k === 0) return hasil;
  const dasar = Math.floor(total / k);
  const sisa = total - dasar * k;
  subtesIds.forEach((id, i) => {
    hasil[id] = dasar + (i < sisa ? 1 : 0);
  });
  return hasil;
}

export type RincianCheckoutUi =
  | {
      valid: true;
      sesiTotal: number;
      sesiTambahan: number;
      hargaDasar: number;
      biayaSesiTambahan: number;
      totalSebelumPromo: number;
      /** false untuk paket lebih kecil dari paket penuh: kode promo tidak berlaku. */
      promoBerlaku: boolean;
      paketPenuhAtauLebih: boolean;
    }
  | { valid: false; galat: string };

export function rincianCheckoutUi(input: {
  hargaNormal: number;
  hargaAktif: number;
  jumlahSesiKelas: number;
  sesiTotal: number;
  jumlahSubtes: number;
}): RincianCheckoutUi {
  const hasil = hitungHargaSesi({
    hargaNormal: input.hargaNormal,
    hargaAktif: input.hargaAktif,
    jumlahSesiKelas: input.jumlahSesiKelas,
    jumlahSesiDipilih: input.sesiTotal,
    jumlahSubtes: Math.max(SUBTES_MIN, input.jumlahSubtes),
  });
  if (!hasil.valid) return hasil;
  const h: HasilHargaValid = hasil;
  return {
    valid: true,
    sesiTotal: h.sesiTotal,
    sesiTambahan: h.sesiTambahan,
    hargaDasar: h.hargaDasar,
    biayaSesiTambahan: h.biayaSesiTambahan,
    totalSebelumPromo: h.totalSebelumPromo,
    promoBerlaku: h.kodePromoBerlaku,
    paketPenuhAtauLebih: h.diskonKelasBerlaku,
  };
}

/** Pilihan siap dibayar? Harga valid dan sebaran sesi per subtes (bila ada subtes dipilih) menjumlah tepat N. */
export function pilihanSesiSiap(input: {
  rincian: RincianCheckoutUi;
  subtesIds: string[];
  sebaran: Record<string, number>;
}): { siap: boolean; pesan: string | null; perSubtes: { subtesId: string; jumlahSesi: number }[] } {
  if (!input.rincian.valid) return { siap: false, pesan: input.rincian.galat, perSubtes: [] };
  // Belum ada subtes dipilih (kelas paket): validasi subtes di Checkout yang menolak; server memeriksa ulang.
  if (input.subtesIds.length === 0) return { siap: true, pesan: null, perSubtes: [] };
  const perSubtes = input.subtesIds.map((subtesId) => ({ subtesId, jumlahSesi: input.sebaran[subtesId] ?? 0 }));
  const cek = validasiSebaranSesi({ subtesIds: input.subtesIds, sesiTotal: input.rincian.sesiTotal, sesiPerSubtes: perSubtes });
  return cek.ok ? { siap: true, pesan: null, perSubtes: cek.perSubtes } : { siap: false, pesan: cek.error, perSubtes };
}
