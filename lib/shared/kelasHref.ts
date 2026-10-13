/**
 * Tujuan klik sebuah card kelas di area Siswa — SATU tempat supaya kelas yang
 * BELUM dibeli tidak pernah nyasar ke halaman kelas yang sudah dibeli:
 *
 * - belum dibeli (Rekomendasi Kelas, katalog di empty state "Kelas Saya") →
 *   halaman detail JUALAN publik, yang punya tombol "Daftar Sekarang"
 *   (aturan tombolnya di lib/shared/kelasDaftarTarget.ts).
 * - sudah dibeli (enrollment lunas) → halaman kelas siswa (materi & absensi).
 */
export function hrefKelasJualan(kelasId: string): string {
  return `/program/kelas/${kelasId}`;
}

export function hrefKelasDimiliki(kelasId: string): string {
  return `/kelas/${kelasId}`;
}
