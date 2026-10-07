/**
 * Daftar LENGKAP opsi checklist "Mapel Tersulit" (Siswa) & "Mapel/Subtes
 * Diampu" (Mentor) di onboarding — PRD Bagian 7.0.2.
 *
 * Dikelompokkan per section supaya tidak membingungkan saat di-scroll:
 * subtes resmi SNBT, lalu TKA (Mapel Utama wajib semua jurusan + Mapel
 * Pilihan per rumpun IPA/IPS). Satu sumber untuk kedua checklist — kalau
 * daftar resminya berubah, cukup diubah di sini.
 *
 * PENTING (backward compatibility): nilai di sini adalah teks yang DISIMPAN
 * ke database. Daftar lama masih punya varian penamaan berbeda (mis.
 * "Literasi B. Indonesia", "Pemahaman Bacaan & Menulis") yang sudah tersimpan
 * di akun existing. Nilai lama itu TIDAK dimigrasikan/dihapus — ChecklistGrid
 * tetap merender pilihan tersimpan yang tidak ada di daftar ini sebagai
 * section terpisah, jadi user lama tidak kehilangan pilihannya.
 */

export interface ChecklistGroup {
  label: string;
  options: string[];
}

/** 7 subtes resmi SNBT (UTBK). */
export const SUBTES_SNBT = [
  "Penalaran Umum",
  "Pengetahuan dan Pemahaman Umum",
  "Pemahaman Bacaan dan Menulis",
  "Pengetahuan Kuantitatif",
  "Literasi dalam Bahasa Indonesia",
  "Literasi dalam Bahasa Inggris",
  "Penalaran Matematika",
] as const;

/** TKA Mapel Utama — wajib untuk SEMUA jurusan. */
export const TKA_MAPEL_UTAMA = ["Matematika", "Bahasa Indonesia", "Bahasa Inggris"] as const;

/** TKA Mapel Pilihan — 3 mapel sesuai rumpun jurusan siswa. */
export const TKA_MAPEL_PILIHAN_IPA = ["Kimia", "Fisika", "Biologi"] as const;
export const TKA_MAPEL_PILIHAN_IPS = ["Sejarah", "Ekonomi", "Geografi"] as const;

/** Dipakai kedua checklist (Mapel Tersulit siswa & Subtes Diampu mentor) —
 * daftarnya sengaja SAMA supaya siswa & mentor memakai kosakata yang identik. */
export const MAPEL_SUBTES_GROUPS: ChecklistGroup[] = [
  { label: "SNBT", options: [...SUBTES_SNBT] },
  { label: "TKA — Mapel Utama", options: [...TKA_MAPEL_UTAMA] },
  { label: "TKA — Mapel Pilihan (IPA/Saintek)", options: [...TKA_MAPEL_PILIHAN_IPA] },
  { label: "TKA — Mapel Pilihan (IPS/Soshum)", options: [...TKA_MAPEL_PILIHAN_IPS] },
  { label: "Lainnya", options: ["Lainnya"] },
];

/** Semua nilai valid (flat) — dipakai untuk membedakan pilihan tersimpan lama
 * yang tidak lagi ada di daftar resmi. */
export const MAPEL_SUBTES_ALL: string[] = MAPEL_SUBTES_GROUPS.flatMap((group) => group.options);

/**
 * Alias nama lama di tabel master `subtes` untuk 3 subtes yang redaksinya
 * berbeda dari nama resmi di atas. Dipakai saat resolve pilihan checklist ->
 * `subtes.id` (app/api/auth/lengkapi-profil/route.ts) supaya pilihan user
 * TIDAK hilang diam-diam kalau db/rename_subtes_nama_resmi.sql belum
 * dijalankan di Supabase. Setelah migration itu jalan, nama resmi langsung
 * match dan alias ini cuma jadi jaring pengaman.
 */
const SUBTES_NAMA_ALIAS: Record<string, string[]> = {
  "Pemahaman Bacaan dan Menulis": ["Pemahaman Bacaan & Menulis"],
  "Literasi dalam Bahasa Indonesia": ["Literasi B. Indonesia"],
  "Literasi dalam Bahasa Inggris": ["Literasi B. Inggris"],
};

/** Semua kemungkinan `subtes.nama` untuk satu label checklist — label resmi
 * itu sendiri plus alias lamanya (kalau ada). */
export function subtesNamaCandidates(label: string): string[] {
  return [label, ...(SUBTES_NAMA_ALIAS[label] ?? [])];
}
