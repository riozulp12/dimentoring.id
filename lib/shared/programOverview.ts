import {
  PROGRAM_KATEGORI_LABEL,
  PROGRAM_KATEGORI_ORDER,
  PROGRAM_KATEGORI_SLUG,
  PROGRAM_KATEGORI_TAMPILAN,
  type ProgramKategori,
} from "@/lib/shared/kelasLabels";

/**
 * Susunan section halaman "semua program" (/program). Program kelas SMA hanya berisi kelas katalog; program
 * mahasiswa ("Beasiswa & Karier Mahasiswa") isinya konten info (beasiswa/internship/event) dan/atau kelas —
 * section ikut tampil kalau SALAH SATUNYA ada, jadi tidak lagi hilang hanya karena belum ada kelas di kategorinya.
 * Section yang keduanya kosong tetap disembunyikan (aturan lama). Urutan = PROGRAM_KATEGORI_ORDER. Fungsi murni
 * (tanpa akses data) supaya mudah diuji.
 */
export interface SectionProgram<K, C> {
  kategori: ProgramKategori;
  kategoriLabel: string;
  slug: string;
  items: K[];
  kontenInfo: C[];
}

export function susunSectionProgram<K, C>(
  sectionKelas: Array<{ kategori: ProgramKategori; items: K[] }>,
  kontenMahasiswa: C[],
): SectionProgram<K, C>[] {
  const hasil: SectionProgram<K, C>[] = [];
  for (const kategori of PROGRAM_KATEGORI_ORDER) {
    const items = sectionKelas.find((section) => section.kategori === kategori)?.items ?? [];
    const kontenInfo = PROGRAM_KATEGORI_TAMPILAN[kategori] === "mahasiswa" ? kontenMahasiswa : [];
    if (items.length === 0 && kontenInfo.length === 0) continue;
    hasil.push({
      kategori,
      kategoriLabel: PROGRAM_KATEGORI_LABEL[kategori],
      slug: PROGRAM_KATEGORI_SLUG[kategori],
      items,
      kontenInfo,
    });
  }
  return hasil;
}
