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
 *
 * UX-3: bacaan draf/ditolak juga bisa dicentang. Kirim bacaan memanggil
 * endpoint yang SUDAH ADA (POST /api/studio-soal/stimulus/:id/ajukan):
 * bacaan + semua soal draf/ditolak di dalamnya terkirim bersama, atau semuanya
 * ditolak bila ada yang belum lengkap. Satu bacaan = 1 item untuk batas 50.
 * Pilihan disimpan sebagai kunci "soal:<id>" / "bacaan:<id>".
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

/**
 * Ringkasan status kecil di kepala kartu subtes (UX-4), mis. "3 draf · 1 sedang
 * dicek". Hanya status yang ada isinya, urutan sama dengan filter. "" bila kosong.
 */
export function ringkasStatus(soal: { status: string }[]): string {
  const n = hitungPerStatus(soal);
  return FILTER_STATUS.filter((f) => f !== "semua" && n[f] > 0)
    .map((f) => `${n[f]} ${LABEL_FILTER[f].toLowerCase()}`)
    .join(" · ");
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
      return { boleh: false, alasan: "Ikut terkirim bersama bacaannya." };
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
  /** Bawaan "soal" (UX-2). */
  jenis?: JenisItem;
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
  gagal: { id: string; jenis: JenisItem; alasan: string }[];
  /** Kalimat pembuka, mis. "5 soal terkirim. 2 belum terkirim:" / "3 soal dan 1 bacaan terkirim." */
  judul: string;
}

export function ringkasHasilKirim(hasil: HasilKirimSatu[]): RingkasanKirim {
  const ok = hasil.filter((h) => h.ok);
  const terkirim = ok.map((h) => h.id);
  const gagal = hasil
    .filter((h) => !h.ok)
    .map((h) => ({ id: h.id, jenis: h.jenis ?? ("soal" as const), alasan: h.alasan ?? "Belum terkirim. Coba lagi." }));
  const nBacaan = ok.filter((h) => h.jenis === "bacaan").length;
  const bagian: string[] = [];
  if (ok.length > 0 || gagal.length === 0) bagian.push(`${teksJumlah(ok.length - nBacaan, nBacaan)} terkirim.`);
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

// ---------------------------------------------------------------------------
// UX-3: bacaan ikut kirim banyak
// ---------------------------------------------------------------------------

export type JenisItem = "soal" | "bacaan";

export const kunciItem = (jenis: JenisItem, id: string) => `${jenis}:${id}`;

export function uraiKunci(kunci: string): { jenis: JenisItem; id: string } | null {
  const i = kunci.indexOf(":");
  const jenis = kunci.slice(0, i);
  const id = kunci.slice(i + 1);
  if (i < 1 || !id || (jenis !== "soal" && jenis !== "bacaan")) return null;
  return { jenis, id };
}

/** "3 soal dan 2 bacaan" / "2 bacaan" / "3 soal" (0 & 0 -> "0 soal"). */
export function teksJumlah(nSoal: number, nBacaan: number): string {
  if (nBacaan === 0) return `${nSoal} soal`;
  if (nSoal === 0) return `${nBacaan} bacaan`;
  return `${nSoal} soal dan ${nBacaan} bacaan`;
}

/** Hitung soal & bacaan dari kumpulan kunci pilihan. */
export function hitungPilihan(kunci: Iterable<string>): { soal: number; bacaan: number } {
  const n = { soal: 0, bacaan: 0 };
  for (const k of kunci) {
    const u = uraiKunci(k);
    if (u) n[u.jenis] += 1;
  }
  return n;
}

const bisaDikirim = (status: string) => status === "draf" || status === "ditolak";

/**
 * Bacaan boleh dicentang? Aturan sama dengan RPC studio_soal_ajukan_stimulus:
 * bacaan draf/ditolak yang berisi minimal satu soal draf/ditolak. Kelengkapan
 * isi tetap diperiksa server (semua-atau-tidak sama sekali).
 */
export function kelayakanKirimBacaan(
  bacaan: { status: string },
  soalDiBacaan: { status: string }[],
  ditugaskan = true,
): KelayakanKirim {
  if (!ditugaskan) return { boleh: false, alasan: "Anda tidak lagi ditugaskan ke subtes ini." };
  if (!bisaDikirim(bacaan.status)) {
    return { boleh: false, alasan: bacaan.status === "diajukan" ? "Sudah dikirim." : "Bukan draf." };
  }
  if (!soalDiBacaan.some((s) => bisaDikirim(s.status))) {
    return { boleh: false, alasan: "Belum ada soal di bacaan ini. Tambahkan soal dulu sebelum mengirim." };
  }
  return { boleh: true };
}

/**
 * Alasan penolakan kirim bacaan dalam bahasa biasa: error bacaan ("Bacaan: …")
 * dan error per soal ("Soal ke-2: …"). Maksimal 2 pesan, sisanya dihitung.
 */
export function alasanDariJawabanBacaan(json: Record<string, unknown>): string {
  const pesanDari = (errors: unknown) =>
    (Array.isArray(errors) ? (errors as { pesan?: unknown }[]) : [])
      .map((e) => (typeof e?.pesan === "string" ? e.pesan : ""))
      .filter(Boolean);
  const daftar: string[] = pesanDari(json.errors).map((p) => `Bacaan: ${p}`);
  const perSoal = Array.isArray(json.errorsSoal) ? (json.errorsSoal as { urutan?: unknown; errors?: unknown }[]) : [];
  for (const s of perSoal) {
    const nama = typeof s?.urutan === "number" ? `Soal ke-${s.urutan}` : "Salah satu soal";
    for (const p of pesanDari(s?.errors)) daftar.push(`${nama}: ${p}`);
  }
  const unik = [...new Set(daftar)];
  if (unik.length === 0) return alasanDariJawaban(json);
  const sisa = unik.length - 2;
  return unik.slice(0, 2).join(" ") + (sisa > 0 ? ` (+${sisa} hal lain)` : "");
}

export interface GrupBacaan<S, B> {
  bacaan: B;
  /** Soal di bacaan ini yang lolos filter. */
  soal: S[];
}

/**
 * Susunan daftar satu subtes: bacaan (dengan soalnya menjorok di bawahnya)
 * lalu soal berdiri sendiri. Soal yang bacaannya tidak ada di daftar (versi
 * lama/diarsipkan) tampil sebagai soal biasa.
 *
 * Filter status: bacaan tampil bila statusnya sendiri cocok ATAU ada soalnya
 * yang cocok; di bawahnya hanya soal yang cocok. Jadi soal tidak pernah
 * tampil tanpa bacaannya, dan bacaan draf tetap terlihat di filter "Draf"
 * walau soalnya sudah lain status.
 */
export function susunDaftar<S extends { status: string; stimulusId?: string | null }, B extends { id: string; status: string }>(
  soal: S[],
  bacaan: B[],
  filter: FilterStatus,
): { grup: GrupBacaan<S, B>[]; mandiri: S[] } {
  const cocok = (status: string) => filter === "semua" || status === filter;
  const idBacaan = new Set(bacaan.map((b) => b.id));
  const grup: GrupBacaan<S, B>[] = [];
  for (const b of bacaan) {
    const semua = soal.filter((s) => s.stimulusId === b.id);
    const lolos = semua.filter((s) => cocok(s.status));
    if (cocok(b.status) || lolos.length > 0) grup.push({ bacaan: b, soal: lolos });
  }
  const mandiri = soal.filter((s) => !(s.stimulusId && idBacaan.has(s.stimulusId)) && cocok(s.status));
  return { grup, mandiri };
}

// ---------------------------------------------------------------------------
// Revisi UX-3 butir 4: yang belum lengkap tidak bisa dicentang
// ---------------------------------------------------------------------------

/**
 * Kelayakan kirim + kelengkapan isi (dihitung server saat memuat daftar,
 * lib/shared/studio-soal/kelengkapan.ts). Yang belum lengkap tidak boleh
 * dicentang; alasannya ditampilkan. Server tetap pemutus akhir saat kirim.
 */
export function kelayakanDenganKelengkapan(k: KelayakanKirim, alasanBelumLengkap: string | undefined): KelayakanKirim {
  if (!k.boleh || !alasanBelumLengkap) return k;
  return { boleh: false, alasan: `Belum lengkap: ${alasanBelumLengkap}` };
}
