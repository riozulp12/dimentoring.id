/**
 * Tipe & batas bersama Studio Soal SNBT (PRD 7.7 revisi, BR-37; desain
 * docs/design/studio-soal-snbt-tahap1.md). Modul MURNI — tanpa import server,
 * dipakai validator, penilaian, builder di browser, dan API route.
 *
 * Bentuk JSONB di sini HARUS sama dengan kolom soal_bank.konten/kunci dan
 * soal_stimulus.konten di db/add_studio_soal.sql. Batas angka di BATAS juga
 * dicerminkan oleh CHECK di migrasi (CHECK = jaring pengaman, validator =
 * aturan lengkap).
 */

export const TIPE_SOAL = ["pilihan_ganda", "majemuk_kompleks", "isian"] as const;
export type TipeSoal = (typeof TIPE_SOAL)[number];

export const TINGKAT_KESULITAN = ["mudah", "sedang", "hots"] as const;
export type TingkatKesulitan = (typeof TINGKAT_KESULITAN)[number];

export const LABEL_OPSI = ["A", "B", "C", "D", "E"] as const;
export type LabelOpsi = (typeof LABEL_OPSI)[number];

export const JENIS_RUMPANG = ["teks", "angka"] as const;
export type JenisRumpang = (typeof JENIS_RUMPANG)[number];

/** Nilai yang dikenal fungsi penilaian. Skor parsial menyusul (lihat nilaiJawaban). */
export const ATURAN_SKOR = ["semua_benar"] as const;
export type AturanSkor = (typeof ATURAN_SKOR)[number];

export const BATAS = {
  redaksiMaks: 5000,
  pembahasanMin: 10,
  pembahasanMaks: 10000,
  opsiTeksMaks: 1000,
  labelKolomMaks: 30,
  pernyataanMin: 2,
  pernyataanMaks: 6,
  pernyataanTeksMaks: 1000,
  rumpangMin: 1,
  rumpangMaks: 5,
  jawabanDiterimaMin: 1,
  jawabanDiterimaMaks: 10,
  jawabanTeksMaks: 100,
  sumberRujukanMin: 3,
  sumberRujukanMaks: 300,
  estimasiDetikMin: 10,
  estimasiDetikMaks: 1800,
  levelKognitifMin: 1,
  levelKognitifMaks: 3,
  alasanTolakMin: 10,
  alasanTolakMaks: 1000,
  stimulusJudulMin: 3,
  stimulusJudulMaks: 150,
  stimulusBlokMaks: 20,
  stimulusTeksMaks: 15000,
  tabelKolomMaks: 8,
  tabelBarisMaks: 20,
  tabelSelMaks: 500,
  paketJudulMin: 3,
  paketJudulMaks: 150,
  paketDeskripsiMaks: 500,
  paketDurasiMin: 1,
  paketDurasiMaks: 300,
  paketSoalMaks: 100,
} as const;

/** Id pernyataan/rumpang: huruf kecil di depan, lalu huruf kecil/angka/_ (maks. 20). */
export const POLA_ID_BAGIAN = /^[a-z][a-z0-9_]{0,19}$/;

// ---- Bentuk konten & kunci per tipe (kolom soal_bank.konten / .kunci) ----

export interface OpsiPG {
  label: LabelOpsi;
  teks: string;
}
export interface KontenPilihanGanda {
  v: 1;
  opsi: OpsiPG[];
}
export interface KunciPilihanGanda {
  v: 1;
  opsi: LabelOpsi;
}

export interface PernyataanMajemuk {
  id: string;
  teks: string;
}
export interface KontenMajemukKompleks {
  v: 1;
  /** Dua label kolom jawaban, mis. ["Benar", "Salah"]. Indeks 0 = kiri, 1 = kanan. */
  label_kolom: [string, string];
  pernyataan: PernyataanMajemuk[];
}
export interface KunciMajemukKompleks {
  v: 1;
  /** id pernyataan -> indeks kolom yang benar (0 atau 1). */
  per_baris: Record<string, 0 | 1>;
}

export interface RumpangIsian {
  id: string;
  jenis: JenisRumpang;
}
export interface KontenIsian {
  v: 1;
  rumpang: RumpangIsian[];
}
export interface KunciRumpang {
  diterima: string[];
  /** Hanya rumpang angka. null/absen = harus sama persis. Angka atau teks angka ("0,01"). */
  toleransi?: string | number | null;
}
export interface KunciIsian {
  v: 1;
  rumpang: Record<string, KunciRumpang>;
}

export type KontenSoal = KontenPilihanGanda | KontenMajemukKompleks | KontenIsian;
export type KunciSoal = KunciPilihanGanda | KunciMajemukKompleks | KunciIsian;

/** Data soal yang divalidasi (bentuk input API/builder, nama kolom = kolom DB). */
export interface SoalInput {
  subtes_kategori?: string | null;
  tipe: TipeSoal;
  redaksi: string;
  konten: unknown;
  kunci: unknown;
  pembahasan: string;
  tingkat_kesulitan: TingkatKesulitan | string;
  level_kognitif?: number | null;
  estimasi_waktu_detik?: number | null;
  sumber_rujukan?: string | null;
  stimulus_id?: string | null;
  urutan_dalam_stimulus?: number | null;
}

// ---- Stimulus (kolom soal_stimulus.konten) ----

export interface BlokTeks {
  jenis: "teks";
  teks: string;
}
export interface BlokTabel {
  jenis: "tabel";
  judul?: string | null;
  kepala: string[];
  baris: string[][];
}
/** Blok "gambar" belum didukung sampai PR 7 (keputusan K6) — validator menolaknya. */
export type BlokStimulus = BlokTeks | BlokTabel;

export interface KontenStimulus {
  v: 1;
  blok: BlokStimulus[];
}

export interface StimulusInput {
  subtes_kategori?: string | null;
  judul_internal: string;
  konten: unknown;
  sumber_rujukan: string;
}

// ---- Jawaban siswa (Tahap 2) ----

export interface JawabanPilihanGanda {
  opsi?: string | null;
}
export interface JawabanMajemukKompleks {
  per_baris?: Record<string, number | null | undefined> | null;
}
export interface JawabanIsian {
  rumpang?: Record<string, string | null | undefined> | null;
}

/** Subtes SNBT = kategori tps + literasi (Penalaran Matematika termasuk literasi). */
export const KATEGORI_SUBTES_SNBT = ["tps", "literasi"] as const;

export function isSubtesSnbt(kategori: unknown): boolean {
  return typeof kategori === "string" && (KATEGORI_SUBTES_SNBT as readonly string[]).includes(kategori);
}
