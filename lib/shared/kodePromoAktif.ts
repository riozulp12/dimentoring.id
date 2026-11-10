import { formatNilaiDiskon } from "@/lib/shared/kodePromoLabels";

/**
 * Aturan "kode promo yang boleh DIPROMOSIKAN di kartu kelas" — murni tampilan.
 * Sengaja TANPA "server-only" supaya bisa dites langsung.
 *
 * Aturannya SAMA dengan validasi checkout (lib/payment/validatePromoCode.ts:
 * status aktif, periode, kuota, scoping kelas, rumus diskon) supaya kartu tidak
 * pernah menjanjikan kode yang akan ditolak di checkout. File ini TIDAK dipakai
 * jalur pembayaran dan tidak mengubah perhitungan jumlah apa pun.
 */

export interface KodePromoKandidat {
  id: string;
  kode: string;
  tipe_diskon: "persen" | "nominal";
  nilai_diskon: number;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  kuota_pemakaian: number | null;
  jumlah_terpakai: number;
  status: string;
  berlaku_semua_kelas: boolean;
}

/** Tanggal "hari ini" (YYYY-MM-DD, UTC) — rumus yang sama dengan validatePromoCode. */
export function tanggalHariIni(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Status aktif + dalam periode + kuota belum habis (belum menyentuh scoping kelas). */
export function isKodePromoBerlaku(promo: KodePromoKandidat, today: string): boolean {
  if (promo.status !== "aktif") return false;
  if (promo.tanggal_mulai && today < promo.tanggal_mulai) return false;
  if (promo.tanggal_selesai && today > promo.tanggal_selesai) return false;
  if (promo.kuota_pemakaian !== null && promo.jumlah_terpakai >= promo.kuota_pemakaian) return false;
  return true;
}

/** Potongan rupiah kode untuk harga tertentu — rumus yang sama dengan validatePromoCode. */
export function hitungPotonganKode(promo: Pick<KodePromoKandidat, "tipe_diskon" | "nilai_diskon">, harga: number): number {
  const nilai = Number(promo.nilai_diskon);
  const raw = promo.tipe_diskon === "persen" ? (harga * nilai) / 100 : nilai;
  return Math.min(Math.round(raw), harga);
}

/** Kode dengan potongan rupiah terbesar untuk harga ini (yang berpotongan > 0), atau null. */
export function pilihKodePromoTerbaik(kandidat: KodePromoKandidat[], harga: number): KodePromoKandidat | null {
  let terbaik: KodePromoKandidat | null = null;
  let potonganTerbaik = 0;
  for (const promo of kandidat) {
    const potongan = hitungPotonganKode(promo, harga);
    if (potongan > potonganTerbaik) {
      terbaik = promo;
      potonganTerbaik = potongan;
    }
  }
  return terbaik;
}

/** Label ringkas di kartu: "Kode PROMO 9.9: -9%" atau "Kode HEMAT: -Rp50.000". */
export function labelKodePromo(promo: Pick<KodePromoKandidat, "kode" | "tipe_diskon" | "nilai_diskon">): string {
  return `Kode ${promo.kode}: -${formatNilaiDiskon(promo.tipe_diskon, Number(promo.nilai_diskon))}`;
}
