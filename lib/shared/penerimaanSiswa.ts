/**
 * Aturan penerimaan siswa PER SUBTES — logika murni (tanpa DB), aman dipakai
 * server maupun UI. Keputusan Rio: subtes yang dipegang >1 mentor AKTIF pada
 * kelas yang sama → siswa dimiliki mentor yang MENERIMA lebih dulu (siapa
 * cepat dia dapat). Subtes dengan tepat 1 mentor aktif → otomatis ke mentor itu.
 */

/** Batas jam siswa boleh "menunggu penerima" sebelum Admin perlu turun tangan (Tahap B). */
export const BATAS_JAM_TANPA_PENERIMA = 24;

/** Daftar id mentor unik — duplikat (data ganda) tidak boleh dihitung dua kali. */
function unik(mentorAktifSubtes: string[]): string[] {
  return Array.from(new Set(mentorAktifSubtes.filter((id) => id)));
}

/** true bila ada >1 mentor aktif yang memegang subtes ini → perlu tombol "Terima siswa". */
export function perluKlaim(mentorAktifSubtes: string[]): boolean {
  return unik(mentorAktifSubtes).length > 1;
}

/** id mentor bila TEPAT 1 mentor aktif; selain itu (0 atau >1) null. */
export function penerimaOtomatis(mentorAktifSubtes: string[]): string | null {
  const daftar = unik(mentorAktifSubtes);
  return daftar.length === 1 ? daftar[0] : null;
}
