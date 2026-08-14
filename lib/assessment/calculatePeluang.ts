/**
 * Assessment SNBP — perhitungan Nilai Akhir, Keketatan, dan Peluang.
 * PRD Bagian 7.4.3/7.4.4 (FR-3.7, FR-3.8), Bagian 8 BR-4.
 *
 * PERINGATAN: Formula `calculatePeluang` (dan skala label di bawahnya) adalah
 * PLACEHOLDER Fase 1 — BELUM divalidasi tim akademik Dimentoring. Sengaja
 * dipisah ke modul ini (bukan ditulis inline di route handler) supaya gampang
 * diganti begitu formula final tersedia, tanpa menyentuh logic request/DB.
 */

export type TingkatKejuaraan = "internasional" | "nasional" | "provinsi" | "kabupaten_kota";
export type JuaraBerapa = "juara_1" | "juara_2" | "juara_3" | "partisipasi";

export const TINGKAT_KEJUARAAN_OPTIONS: { value: TingkatKejuaraan; label: string }[] = [
  { value: "internasional", label: "Internasional" },
  { value: "nasional", label: "Nasional" },
  { value: "provinsi", label: "Provinsi" },
  { value: "kabupaten_kota", label: "Kabupaten/Kota" },
];

export const JUARA_BERAPA_OPTIONS: { value: JuaraBerapa; label: string }[] = [
  { value: "juara_1", label: "Juara 1" },
  { value: "juara_2", label: "Juara 2" },
  { value: "juara_3", label: "Juara 3" },
  { value: "partisipasi", label: "Peserta/Partisipasi" },
];

// FR-3.7 — mapping Tingkat Kejuaraan x Juara Berapa -> skala 0-100 (PLACEHOLDER,
// perlu divalidasi tim akademik).
const PRESTASI_SCORE_MAP: Record<TingkatKejuaraan, Record<JuaraBerapa, number>> = {
  internasional: { juara_1: 100, juara_2: 95, juara_3: 90, partisipasi: 80 },
  nasional: { juara_1: 90, juara_2: 85, juara_3: 80, partisipasi: 70 },
  provinsi: { juara_1: 80, juara_2: 75, juara_3: 70, partisipasi: 60 },
  kabupaten_kota: { juara_1: 70, juara_2: 65, juara_3: 60, partisipasi: 50 },
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isTingkatKejuaraan(value: string): value is TingkatKejuaraan {
  return value in PRESTASI_SCORE_MAP;
}

export function isJuaraBerapa(value: string): value is JuaraBerapa {
  return value === "juara_1" || value === "juara_2" || value === "juara_3" || value === "partisipasi";
}

/** FR-3.7 — konversi 1 entri prestasi jadi skala 0-100. */
export function convertPrestasiToNilai(
  tingkatKejuaraan: TingkatKejuaraan,
  juaraBerapa: JuaraBerapa,
): number {
  return PRESTASI_SCORE_MAP[tingkatKejuaraan][juaraBerapa];
}

/** FR-3.8 — label kualitatif Nilai Akhir (PLACEHOLDER, perlu divalidasi tim akademik). */
export function getNilaiAkhirLabel(nilaiAkhir: number): string {
  if (nilaiAkhir >= 90) return "Sangat Tinggi";
  if (nilaiAkhir >= 75) return "Tinggi";
  if (nilaiAkhir >= 60) return "Sedang";
  if (nilaiAkhir >= 45) return "Rendah";
  return "Sangat Rendah";
}

export function calculateNilaiAkhir(
  rataRataRapor: number,
  nilaiPrestasi: number | null,
): { nilaiAkhir: number; label: string } {
  const nilaiAkhir = round2(nilaiPrestasi !== null ? (rataRataRapor + nilaiPrestasi) / 2 : rataRataRapor);
  return { nilaiAkhir, label: getNilaiAkhirLabel(nilaiAkhir) };
}

/** Label kualitatif Keketatan (PLACEHOLDER, perlu divalidasi tim akademik). */
export function getKeketatanLabel(keketatanScore: number): string {
  if (keketatanScore > 15) return "Sangat Longgar";
  if (keketatanScore >= 8) return "Longgar";
  if (keketatanScore >= 4) return "Sedang";
  if (keketatanScore >= 1.5) return "Ketat";
  return "Sangat Ketat";
}

/** Formula publik (FR-3.2/FR-3.9) — sama untuk semua siswa pada PTN+jurusan+jenjang yang sama. */
export function calculateKeketatan(
  kuotaTahunBerjalan: number,
  jumlahPeminatTahunLalu: number,
): { score: number; label: string } {
  // Peminat 0 tidak seharusnya terjadi (data historis nyata), tapi dijaga di sini
  // supaya tidak menghasilkan Infinity/NaN kalau data sumber (snpmb.id) belum lengkap.
  const score = jumlahPeminatTahunLalu > 0 ? round2((kuotaTahunBerjalan / jumlahPeminatTahunLalu) * 100) : 0;
  return { score, label: getKeketatanLabel(score) };
}

/** Label kualitatif Peluang (PLACEHOLDER, perlu divalidasi tim akademik). */
export function getPeluangLabel(peluangScore: number): string {
  if (peluangScore > 70) return "Peluang Besar";
  if (peluangScore >= 40) return "Sedang";
  return "Peluang Kecil";
}

/**
 * PLACEHOLDER — belum divalidasi tim akademik Dimentoring. Personal (FR-3.2):
 * mempertimbangkan Nilai Akhir siswa relatif terhadap tingkat Keketatan.
 */
export function calculatePeluang(
  nilaiAkhir: number,
  keketatanScore: number,
): { score: number; label: string } {
  const score = round2(nilaiAkhir * 0.6 + Math.min(keketatanScore, 100) * 0.4);
  return { score, label: getPeluangLabel(score) };
}
