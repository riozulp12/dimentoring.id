/**
 * Saklar tampilan "Peta Materi" (silabus SNBT) di detail kelas: env SERVER `SILABUS_SNBT_AKTIF`.
 * Hanya nilai persis "true" yang menyalakan; kosong/nilai lain ("TRUE", "1") = mati (bawaan) = halaman persis seperti lama.
 * Dibaca saat fungsi dipanggil (bukan saat modul dimuat), DI SERVER — bukan dari kode browser.
 */
export function silabusSnbtAktif(): boolean {
  return process.env.SILABUS_SNBT_AKTIF === "true";
}
