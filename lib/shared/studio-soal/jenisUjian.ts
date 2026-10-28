/**
 * Jenis ujian & pencarian mentor untuk halaman Admin "Penugasan Studio Soal"
 * (UX-1). Modul MURNI — konfigurasi di kode, tidak ada tabel baru.
 *
 * Menambah jenis ujian baru = tambah satu entri di JENIS_UJIAN dengan
 * kategori subtes miliknya (kolom `subtes.kategori`). Catatan: RPC
 * studio_soal_atur_penugasan saat ini hanya menerima subtes SNBT, jadi jenis
 * ujian lain baru bisa disimpan setelah aturan di database ikut diperluas.
 */
import { KATEGORI_SUBTES_SNBT } from "./tipe";
import { urutkanSubtes } from "./penugasan";

export interface JenisUjian {
  id: string;
  nama: string;
  keterangan: string;
  /** Nilai `subtes.kategori` yang termasuk jenis ujian ini. */
  kategoriSubtes: readonly string[];
}

export const JENIS_UJIAN: readonly JenisUjian[] = [
  {
    id: "snbt",
    nama: "SNBT",
    keterangan: "UTBK-SNBT: Tes Potensi Skolastik dan Literasi",
    kategoriSubtes: KATEGORI_SUBTES_SNBT,
  },
];

export interface SubtesBerkategori {
  id: string;
  nama: string;
  kategori: string;
}

/** Subtes milik satu jenis ujian, urut seperti biasa. Jenis tak dikenal = kosong. */
export function subtesUntukJenis<T extends SubtesBerkategori>(jenisId: string, subtes: T[]): T[] {
  const jenis = JENIS_UJIAN.find((j) => j.id === jenisId);
  if (!jenis) return [];
  return urutkanSubtes(subtes.filter((s) => jenis.kategoriSubtes.includes(s.kategori)));
}

/** Huruf kecil + tanpa aksen + spasi dirapikan, supaya "Andi  " cocok dengan "andi". */
export function normalCari(teks: string): string {
  return teks
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("id-ID")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MentorDicari {
  nama: string;
  email: string | null;
}

/**
 * Saring mentor berdasarkan nama atau email (semua kata harus ada). Berjalan
 * di browser atas data yang sudah dimuat — mengetik tidak memicu fetch.
 */
export function cariMentor<T extends MentorDicari>(mentor: T[], kata: string): T[] {
  const kataKata = normalCari(kata).split(" ").filter(Boolean);
  if (kataKata.length === 0) return mentor;
  return mentor.filter((m) => {
    const isi = normalCari(`${m.nama} ${m.email ?? ""}`);
    return kataKata.every((k) => isi.includes(k));
  });
}

export const MENTOR_PER_HALAMAN = 20;

/** Potong daftar per halaman (1-based). Halaman di luar batas dijepit ke batas terdekat. */
export function potongHalaman<T>(daftar: T[], halaman: number, perHalaman = MENTOR_PER_HALAMAN) {
  const jumlahHalaman = Math.max(1, Math.ceil(daftar.length / perHalaman));
  const h = Math.min(Math.max(1, Math.floor(halaman) || 1), jumlahHalaman);
  return { item: daftar.slice((h - 1) * perHalaman, h * perHalaman), halaman: h, jumlahHalaman };
}
