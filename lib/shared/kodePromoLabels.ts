/**
 * Label, warna badge, dan formatter tampilan untuk kode_promo (promo_tipe_diskon,
 * promo_status) — PRD Bagian 13 (kode_promo). File tanpa "server-only" supaya
 * aman diimport dari Client Component (KodePromoClient/KodePromoForm).
 */

export const PROMO_TIPE_DISKON_LABEL: Record<string, string> = {
  persen: "Persen",
  nominal: "Nominal Rupiah",
};

export const PROMO_STATUS_LABEL: Record<string, string> = {
  aktif: "Aktif",
  nonaktif: "Nonaktif",
};

export const PROMO_STATUS_BADGE_CLASS: Record<string, string> = {
  aktif: "bg-[#F0FDF4] text-[#0CBA00]",
  nonaktif: "bg-gray-100 text-[#7E7C7C]",
};

/** "17%" atau "Rp50.000", tergantung tipe_diskon. */
export function formatNilaiDiskon(tipeDiskon: string, nilaiDiskon: number): string {
  if (tipeDiskon === "persen") {
    const trimmed = Number.isInteger(nilaiDiskon) ? nilaiDiskon : nilaiDiskon.toFixed(1);
    return `${trimmed}%`;
  }
  return `Rp${Math.round(nilaiDiskon).toLocaleString("id-ID")}`;
}

function formatTanggalSingkat(value: string): string {
  return new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** "1 Jan 2026 - 31 Jan 2026", atau salah satu ujung kalau cuma satu diisi, atau "Tanpa batas waktu". */
export function formatPeriode(tanggalMulai: string | null, tanggalSelesai: string | null): string {
  if (!tanggalMulai && !tanggalSelesai) return "Tanpa batas waktu";
  if (tanggalMulai && tanggalSelesai) {
    return `${formatTanggalSingkat(tanggalMulai)} - ${formatTanggalSingkat(tanggalSelesai)}`;
  }
  if (tanggalMulai) return `Mulai ${formatTanggalSingkat(tanggalMulai)}`;
  return `Sampai ${formatTanggalSingkat(tanggalSelesai as string)}`;
}

/** "12/50 terpakai", atau "Tidak terbatas" kalau kuota_pemakaian NULL. */
export function formatKuota(kuotaPemakaian: number | null, jumlahTerpakai: number): string {
  if (kuotaPemakaian === null) return "Tidak terbatas";
  return `${jumlahTerpakai}/${kuotaPemakaian} terpakai`;
}

/** "Semua Kelas", atau daftar nama Kelas yang discoping (kode_promo_kelas). */
export function formatBerlakuUntuk(berlakuSemuaKelas: boolean, kelasNama: string[]): string {
  if (berlakuSemuaKelas) return "Semua Kelas";
  if (kelasNama.length === 0) return "-";
  return kelasNama.join(", ");
}
