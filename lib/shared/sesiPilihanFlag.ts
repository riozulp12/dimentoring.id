/**
 * Saklar fitur "sesi pilihan siswa" (kelas private online): env SERVER `SESI_PILIHAN_AKTIF`.
 * Hanya nilai persis "true" yang menyalakan; kosong/nilai lain = mati (bawaan). Mati = perilaku lama persis.
 * Dibaca DI SERVER lalu diteruskan ke komponen klien lewat prop — jangan dibaca dari kode browser
 * (env tanpa NEXT_PUBLIC_ tidak tersedia di sana, dan klien tidak boleh menentukan saklar).
 */
export function sesiPilihanAktif(): boolean {
  return process.env.SESI_PILIHAN_AKTIF === "true";
}
