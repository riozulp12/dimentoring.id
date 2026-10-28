/**
 * Filter status, pilih soal, dan ringkasan "kirim banyak soal untuk dicek"
 * di halaman daftar mentor (Studio Soal UX-2). Modul MURNI.
 *
 * Kirim banyak = browser memanggil endpoint kirim yang SUDAH ADA
 * (POST /api/studio-soal/soal/:id/ajukan) satu per satu. Server tetap
 * memeriksa semuanya (pemilik, penugasan, kelengkapan, status); aturan di sini
 * hanya supaya checkbox muncul di soal yang memang bisa dikirim sendiri.
 *
 * Aturan (sama dengan RPC studio_soal_ajukan_soal):
 *   - status draf atau ditolak ("Perlu diperbaiki");
 *   - soal berdiri sendiri, ATAU soal di bacaan yang SUDAH terbit;
 *   - soal di bacaan yang masih draf/ditolak/sedang dicek TIDAK bisa dikirim
 *     sendiri — ikut terkirim saat bacaannya dikirim (dari halaman bacaan);
 *   - bacaan yang tidak ada di daftar (versi lama/diarsipkan) -> tidak dipilih.
 */
import type { SoalRingkas, StimulusRingkas } from "./studioMentor";

export const BATAS_KIRIM = 50;

// ---------------------------------------------------------------------------
// Filter status
// ---------------------------------------------------------------------------

export const FILTER_STATUS = ["semua", "draf", "diajukan", "ditolak", "terpublikasi"] as const;
export type FilterStatus = (typeof FILTER_STATUS)[number];

export const LABEL_FILTER: Record<FilterStatus, string> = {
  semua: "Semua",
  draf: "Draf",
  diajukan: "Sedang dicek",
  ditolak: "Perlu diperbaiki",
  terpublikasi: "Terbit",
};

export const isFilterStatus = (v: unknown): v is FilterStatus =>
  typeof v === "string" && (FILTER_STATUS as readonly string[]).includes(v);

export function saringStatus<T extends { status: string }>(soal: T[], filter: FilterStatus): T[] {
  return filter === "semua" ? soal : soal.filter((s) => s.status === filter);
}

/** Jumlah per filter. "Semua" = semua soal (termasuk status lain seperti diarsipkan). */
export function hitungPerStatus(soal: { status: string }[]): Record<FilterStatus, number> {
  const hasil = { semua: soal.length, draf: 0, diajukan: 0, ditolak: 0, terpublikasi: 0 };
  for (const s of soal) if (s.status !== "semua" && isFilterStatus(s.status)) hasil[s.status] += 1;
  return hasil;
}

// ---------------------------------------------------------------------------
// Boleh dikirim sendiri?
// ---------------------------------------------------------------------------

export type KelayakanKirim = { boleh: true } | { boleh: false; alasan: string };

export function kelayakanKirim(
  soal: Pick<SoalRingkas, "status" | "stimulusId">,
  statusBacaan: ReadonlyMap<string, string>,
  ditugaskan = true,
): KelayakanKirim {
  if (!ditugaskan) return { boleh: false, alasan: "Anda tidak lagi ditugaskan ke subtes ini." };
  if (soal.status !== "draf" && soal.status !== "ditolak") {
    return { boleh: false, alasan: soal.status === "diajukan" ? "Sudah dikirim." : "Bukan draf." };
  }
  if (soal.stimulusId) {
    const st = statusBacaan.get(soal.stimulusId);
    if (st === "terpublikasi") return { boleh: true };
    if (st === "draf" || st === "ditolak" || st === "diajukan") {
      return { boleh: false, alasan: "Ikut terkirim bersama bacaannya — kirim dari halaman bacaan." };
    }
    return { boleh: false, alasan: "Bacaan soal ini sudah tidak aktif." };
  }
  return { boleh: true };
}

export const petaStatusBacaan = (bacaan: Pick<StimulusRingkas, "id" | "status">[]) =>
  new Map(bacaan.map((b) => [b.id, b.status]));

// ---------------------------------------------------------------------------
// Pilihan (Set id)
// ---------------------------------------------------------------------------

/** Centang/lepas satu soal. Tidak menambah bila tidak boleh atau sudah mencapai batas. */
export function ubahPilihan(
  terpilih: ReadonlySet<string>,
  id: string,
  boleh: boolean,
  batas = BATAS_KIRIM,
): Set<string> {
  const baru = new Set(terpilih);
  if (baru.has(id)) baru.delete(id);
  else if (boleh && baru.size < batas) baru.add(id);
  return baru;
}

/**
 * "Pilih semua" untuk soal yang sedang terlihat (sudah tersaring): hanya yang
 * boleh dikirim, sampai batas total. Bila semua yang boleh sudah terpilih,
 * kebalikannya: lepas semuanya (tombol jadi "Batal pilih semua").
 */
export function pilihSemua(
  terpilih: ReadonlySet<string>,
  terlihat: { id: string; boleh: boolean }[],
  batas = BATAS_KIRIM,
): Set<string> {
  const bolehIds = terlihat.filter((s) => s.boleh).map((s) => s.id);
  const baru = new Set(terpilih);
  if (bolehIds.length > 0 && bolehIds.every((id) => baru.has(id))) {
    for (const id of bolehIds) baru.delete(id);
    return baru;
  }
  for (const id of bolehIds) {
    if (baru.size >= batas) break;
    baru.add(id);
  }
  return baru;
}

/** Keadaan kotak "Pilih semua": semua / sebagian / tidak ada yang terpilih. */
export function keadaanPilihSemua(
  terpilih: ReadonlySet<string>,
  terlihat: { id: string; boleh: boolean }[],
): "semua" | "sebagian" | "kosong" {
  const bolehIds = terlihat.filter((s) => s.boleh).map((s) => s.id);
  const n = bolehIds.filter((id) => terpilih.has(id)).length;
  if (n === 0) return "kosong";
  return n === bolehIds.length ? "semua" : "sebagian";
}

// ---------------------------------------------------------------------------
// Hasil kirim
// ---------------------------------------------------------------------------

export interface HasilKirimSatu {
  id: string;
  ok: boolean;
  /** Alasan dalam bahasa biasa bila gagal. */
  alasan?: string;
}

/**
 * Alasan dari jawaban API kirim. Error validasi (errors[]) lebih spesifik
 * daripada pesan umum — ambil maksimal 2 pesan berbeda.
 */
export function alasanDariJawaban(json: Record<string, unknown>): string {
  const errors = Array.isArray(json.errors) ? (json.errors as { pesan?: unknown }[]) : [];
  const pesan = [...new Set(errors.map((e) => (typeof e?.pesan === "string" ? e.pesan : "")).filter(Boolean))];
  if (pesan.length > 0) {
    const sisa = pesan.length - 2;
    return pesan.slice(0, 2).join(" ") + (sisa > 0 ? ` (+${sisa} hal lain)` : "");
  }
  return typeof json.error === "string" && json.error ? json.error : "Belum terkirim. Coba lagi.";
}

export interface RingkasanKirim {
  terkirim: string[];
  gagal: { id: string; alasan: string }[];
  /** Kalimat pembuka, mis. "5 soal terkirim. 2 belum terkirim:" */
  judul: string;
}

export function ringkasHasilKirim(hasil: HasilKirimSatu[]): RingkasanKirim {
  const terkirim = hasil.filter((h) => h.ok).map((h) => h.id);
  const gagal = hasil.filter((h) => !h.ok).map((h) => ({ id: h.id, alasan: h.alasan ?? "Belum terkirim. Coba lagi." }));
  const bagian: string[] = [];
  if (terkirim.length > 0 || gagal.length === 0) bagian.push(`${terkirim.length} soal terkirim.`);
  if (gagal.length > 0) bagian.push(`${gagal.length} belum terkirim:`);
  return { terkirim, gagal, judul: bagian.join(" ") };
}

/**
 * Antrean kirim: hanya id yang dipilih, belum terkirim di putaran sebelumnya,
 * dan masih boleh dikirim — dipotong di batas. Mencegah kirim dobel bila
 * tombol ditekan ulang sebelum daftar disegarkan.
 */
export function antreanKirim(
  terpilih: Iterable<string>,
  sudahTerkirim: ReadonlySet<string>,
  boleh: (id: string) => boolean,
  batas = BATAS_KIRIM,
): string[] {
  return [...new Set(terpilih)].filter((id) => !sudahTerkirim.has(id) && boleh(id)).slice(0, batas);
}
