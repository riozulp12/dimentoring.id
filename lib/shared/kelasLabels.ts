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
  pendampingan_mahasiswa: "Beasiswa & Karier Mahasiswa",
};

// Kalimat persuasif TETAP per kategori (PRD 7.5 poin 13) — bukan AI-generate,
// jangan diganti jadi dynamic/random. SATU-SATUNYA sumber teks ini — dipakai
// app/program/page.tsx (section utama) DAN app/program/[kategori]/page.tsx
// (di bawah H1), supaya kedua halaman selalu konsisten.
export const PROGRAM_KATEGORI_TAGLINE: Record<ProgramKategori, string> = {
  konsultasi:
    "Bingung menentukan strategi belajar atau pilihan jurusan? Ngobrol langsung sama mentor berpengalaman yang paham perjalananmu.",
  tka: "Kuasai tiap mata pelajaran TKA dengan pembahasan mendalam dan latihan soal yang terus diperbarui sesuai kisi-kisi terbaru.",
  snbt: "Latih Tes Potensi Skolastik dan Literasimu bareng mentor yang sudah lolos SNBT dari PTN impian.",
  ujian_mandiri:
    "Setiap PTN punya karakter ujian mandiri sendiri — kami bantu kamu siapkan strategi yang paling pas buat kampus incaranmu.",
  pendampingan_mahasiswa:
    "Sudah keterima? Perjalanan belum selesai — dapatkan info beasiswa, internship, dan pendampingan sampai kamu benar-benar siap jadi mahasiswa.",
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
