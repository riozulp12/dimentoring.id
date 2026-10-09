/**
 * Helper diskon per Kelas (`kelas.diskon_persen`, lihat db/add_kelas_diskon.sql).
 * Sengaja TANPA "server-only" supaya bisa dipakai juga dari client component
 * (mis. preview harga di form Kelola Kelas Admin) — satu-satunya sumber rumus
 * harga diskon, jangan dihitung ulang manual di tempat lain.
 *
 * CATATAN: ini TERPISAH dari sistem `kode_promo` (diskon yang ditebus siswa
 * lewat kode). `diskon_persen` melekat ke kelas itu sendiri.
 */

/** Normalisasi nilai dari DB — kolom ini baru, jadi baris lama bisa NULL
 * sebelum migration dijalankan. Di-clamp ke 0-100 supaya data kotor tidak
 * pernah menghasilkan harga negatif / lebih mahal dari harga asli. */
export function normalizeDiskonPersen(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n));
}

/** harga asli * (1 - diskon/100), dibulatkan ke rupiah terdekat. */
export function hitungHargaSetelahDiskon(harga: number, diskonPersen: number): number {
  if (diskonPersen <= 0) return harga;
  return Math.round(harga * (1 - diskonPersen / 100));
}

export function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}
