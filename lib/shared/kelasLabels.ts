/**
 * Label tampilan untuk enum tingkat_kelas & tipe_kelas — SENGAJA di file
 * tanpa "server-only" (beda dari lib/mentor/getKelasSayaData.ts &
 * lib/mentor/getHonorData.ts) supaya aman diimport dari Client Component
 * juga (mis. components/admin/KelolaKelasClient.tsx), bukan cuma Server
 * Component. Kedua file mentor itu re-export dari sini untuk kompatibilitas
 * import lama — jangan duplikasi map ini di tempat lain.
 */

export const TINGKAT_KELAS_LABEL: Record<string, string> = {
  kelas_10: "Kelas 10",
  kelas_11: "Kelas 11",
  kelas_12: "Kelas 12",
  gap_year: "Gap Year",
};

export const TIPE_KELAS_LABEL: Record<string, string> = {
  private: "Private",
  semi_private: "Semi-Private",
  grouping: "Grouping",
};

/** Kategori bisnis kelas (PRD 7.5.4, halaman publik /program) — terpisah dari
 * Subtes/mapel. Urutan di sini JUGA urutan tampil section /program. */
export const PROGRAM_KATEGORI_ORDER = [
  "konsultasi",
  "tka",
  "snbt",
  "ujian_mandiri",
  "pendampingan_mahasiswa",
] as const;

export type ProgramKategori = (typeof PROGRAM_KATEGORI_ORDER)[number];

export const PROGRAM_KATEGORI_LABEL: Record<ProgramKategori, string> = {
  konsultasi: "Konsultasi",
  tka: "TKA",
  snbt: "SNBT",
  ujian_mandiri: "Ujian Mandiri",
  pendampingan_mahasiswa: "Pendampingan Mahasiswa",
};

/** Slug URL per kategori (dipakai /program/[kategori]) — beda dari value enum
 * DB untuk "ujian_mandiri"/"pendampingan_mahasiswa" (pakai dash, bukan underscore). */
export const PROGRAM_KATEGORI_SLUG: Record<ProgramKategori, string> = {
  konsultasi: "konsultasi",
  tka: "tka",
  snbt: "snbt",
  ujian_mandiri: "ujian-mandiri",
  pendampingan_mahasiswa: "pendampingan-mahasiswa",
};

const SLUG_TO_KATEGORI: Record<string, ProgramKategori> = Object.fromEntries(
  PROGRAM_KATEGORI_ORDER.map((kategori) => [PROGRAM_KATEGORI_SLUG[kategori], kategori]),
) as Record<string, ProgramKategori>;

export function programKategoriFromSlug(slug: string): ProgramKategori | null {
  return SLUG_TO_KATEGORI[slug] ?? null;
}
