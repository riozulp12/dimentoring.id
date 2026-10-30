/**
 * Kelengkapan soal & bacaan sebelum DIKIRIM untuk dicek (Studio Soal UX-3,
 * revisi butir 4). Modul MURNI — satu sumber aturan untuk:
 *   - browser: tombol "Kirim untuk dicek" di halaman bacaan + soal & soal;
 *   - server: halaman daftar mentor (penanda "Belum lengkap", checkbox
 *     kirim banyak dikunci) dan API Ajukan (pemutus akhir).
 * Aturannya TIDAK ditulis ulang di sini: hanya merangkai validasiSoal /
 * validasiStimulus (mode "ajukan") + validasi rumus yang sudah ada.
 *
 * Simpan draf tetap boleh walau belum lengkap (mode "draf" tidak berubah).
 */
import { inputValidasiSoal, inputValidasiStimulus, type FormSoal, type FormStimulus } from "./formSoal";
import { validasiRumusSoal, validasiRumusStimulus } from "./rumus";
import { validasiSoal, validasiStimulus, type ErrorValidasi } from "./validasi";

type SoalUntukCek = Omit<FormSoal, "sumber_rujukan"> & { sumber_rujukan: string | null };

/** Validasi lengkap satu soal (sama dengan API Ajukan). */
export function cekSoalLengkap(soal: SoalUntukCek, kategori: string | null | undefined): ErrorValidasi[] {
  return [...validasiSoal(inputValidasiSoal(soal, kategori), "ajukan"), ...validasiRumusSoal(soal)];
}

/** Validasi lengkap bacaan (tanpa soalnya; sama dengan API Ajukan). */
export function cekBacaanLengkap(bacaan: FormStimulus, kategori: string | null | undefined): ErrorValidasi[] {
  return [...validasiStimulus(inputValidasiStimulus(bacaan, kategori), "ajukan"), ...validasiRumusStimulus(bacaan)];
}

/** Pesan berbeda, urut kemunculan. */
export const pesanUnik = (errors: ErrorValidasi[]): string[] => [...new Set(errors.map((e) => e.pesan))];

/** Soal yang belum lengkap di halaman bacaan + soal. `kosong` = kartu sama sekali belum diisi. */
export interface SoalKurang {
  nomor: number;
  errors: ErrorValidasi[];
  kosong?: boolean;
}

export const PESAN_KARTU_KOSONG = "Masih kosong. Isi soalnya atau buang kartunya.";

/**
 * Daftar yang belum lengkap dalam bahasa biasa, satu baris per bacaan/soal,
 * mis. ["Bacaan: Sumber bacaan belum diisi.", "Soal 2: Pilih satu jawaban
 * benar (A–E).", "Soal 3: Teks soal belum diisi."]. Per bagian maksimal
 * `maks` pesan, sisanya dihitung. Kosong = semua lengkap.
 */
export function daftarBelumLengkap(
  kurang: { bacaan?: ErrorValidasi[]; soal?: SoalKurang[] },
  maks = 2,
): string[] {
  const ringkas = (errors: ErrorValidasi[]) => {
    const p = pesanUnik(errors);
    const sisa = p.length - maks;
    return p.slice(0, maks).join(" ") + (sisa > 0 ? ` (+${sisa} hal lain)` : "");
  };
  const baris: string[] = [];
  if (kurang.bacaan && kurang.bacaan.length > 0) baris.push(`Bacaan: ${ringkas(kurang.bacaan)}`);
  for (const s of kurang.soal ?? []) {
    if (s.kosong) baris.push(`Soal ${s.nomor}: ${PESAN_KARTU_KOSONG}`);
    else if (s.errors.length > 0) baris.push(`Soal ${s.nomor}: ${ringkas(s.errors)}`);
  }
  return baris;
}

// ---------------------------------------------------------------------------
// Halaman daftar mentor: alasan pertama "belum lengkap" per draf
// ---------------------------------------------------------------------------

/** Satu soal draf/ditolak dari database (kolom lengkap). */
export interface SoalDrafLengkap extends SoalUntukCek {
  id: string;
  status: string;
  urutan_dalam_stimulus: number | null;
}

export interface BacaanDrafLengkap extends FormStimulus {
  id: string;
  status: string;
}

const bisaDikirim = (status: string) => status === "draf" || status === "ditolak";

/** Alasan pertama soal belum lengkap, atau null bila lengkap. */
export function alasanSoalBelumLengkap(soal: SoalUntukCek, kategori: string | null | undefined): string | null {
  return cekSoalLengkap(soal, kategori)[0]?.pesan ?? null;
}

/**
 * Alasan pertama bacaan belum lengkap — bacaannya sendiri ("Bacaan: …") lalu
 * soal draf/ditolak di dalamnya ("Soal ke-2: …"), sama dengan yang ditolak
 * API Ajukan bacaan (semua-atau-tidak sama sekali). null = lengkap.
 */
export function alasanBacaanBelumLengkap(
  bacaan: FormStimulus,
  soalDiBacaan: SoalDrafLengkap[],
  kategori: string | null | undefined,
): string | null {
  const b = cekBacaanLengkap(bacaan, kategori)[0];
  if (b) return `Bacaan: ${b.pesan}`;
  const urut = [...soalDiBacaan].filter((s) => bisaDikirim(s.status)).sort((x, y) => (x.urutan_dalam_stimulus ?? 0) - (y.urutan_dalam_stimulus ?? 0));
  for (const s of urut) {
    const alasan = alasanSoalBelumLengkap(s, kategori);
    if (alasan) return `${typeof s.urutan_dalam_stimulus === "number" ? `Soal ke-${s.urutan_dalam_stimulus}` : "Salah satu soal"}: ${alasan}`;
  }
  return null;
}

/**
 * Peta "soal:<id>" / "bacaan:<id>" -> alasan pertama belum lengkap, untuk
 * draf/ditolak di subtes yang DITUGASKAN (yang lain memang tidak bisa
 * dikirim). Item yang lengkap tidak ada di peta.
 */
export function susunKelengkapan(
  soal: (SoalDrafLengkap & { stimulus_id: string | null })[],
  bacaan: BacaanDrafLengkap[],
  kategoriSubtes: ReadonlyMap<string, string>,
): Record<string, string> {
  const hasil: Record<string, string> = {};
  for (const s of soal) {
    if (!bisaDikirim(s.status) || !kategoriSubtes.has(s.subtes_id)) continue;
    const alasan = alasanSoalBelumLengkap(s, kategoriSubtes.get(s.subtes_id));
    if (alasan) hasil[`soal:${s.id}`] = alasan;
  }
  for (const b of bacaan) {
    if (!bisaDikirim(b.status) || !kategoriSubtes.has(b.subtes_id)) continue;
    const alasan = alasanBacaanBelumLengkap(
      b,
      soal.filter((s) => s.stimulus_id === b.id),
      kategoriSubtes.get(b.subtes_id),
    );
    if (alasan) hasil[`bacaan:${b.id}`] = alasan;
  }
  return hasil;
}
