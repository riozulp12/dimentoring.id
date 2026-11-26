/**
 * Bank Soal (Admin) — modul MURNI (tanpa server/DB), dipakai data layer, API,
 * dan layar. Aturan yang sebenarnya ditegakkan RPC di
 * db/add_impor_perawatan.sql; modul ini hanya menampilkan & menerjemahkan.
 */
import { isUuid } from "./formSoal";
import { TINGKAT_KESULITAN, TIPE_SOAL } from "./tipe";

// ---------------------------------------------------------------------------
// Filter daftar soal & izin aksi
// ---------------------------------------------------------------------------

export const PER_HALAMAN = 50;
export const STATUS_FILTER = ["draf", "terpublikasi", "digantikan", "diarsipkan"] as const;
const PANJANG_CARI_MAKS = 200;

export interface FilterBank {
  subtes: string;
  topik: string;
  jenis: string;
  kesulitan: string;
  status: string;
  batch: string;
  q: string;
  hal: number;
}

/** searchParams -> filter. Nilai yang tidak dikenal dianggap "semua". */
export function parseFilterBank(sp: Record<string, string | string[] | undefined>): FilterBank {
  const teks = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const uuid = (k: string) => (isUuid(teks(k)) ? teks(k) : "");
  const dari = (k: string, daftar: readonly string[]) => (daftar.includes(teks(k)) ? teks(k) : "");
  const hal = /^\d{1,6}$/.test(teks("hal")) ? Math.max(1, Number(teks("hal"))) : 1;
  return {
    subtes: uuid("subtes"),
    topik: uuid("topik"),
    jenis: dari("jenis", TIPE_SOAL),
    kesulitan: dari("kesulitan", TINGKAT_KESULITAN),
    status: dari("status", STATUS_FILTER),
    batch: uuid("batch"),
    q: teks("q").slice(0, PANJANG_CARI_MAKS),
    hal,
  };
}

/** "?status=draf&hal=2" — hanya isian yang terisi; halaman 1 tidak ditulis. */
export function queryFilter(filter: FilterBank, ubah: Partial<FilterBank> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filter, ...ubah })) {
    if (v !== "" && !(k === "hal" && v === 1)) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface IzinSoal {
  terbit: boolean;
  edit: boolean;
  versiBaru: boolean;
  arsip: boolean;
  hapus: boolean;
}

/** Hanya soal Buatan Sendiri yang bisa diubah Admin; buatan mentor hanya-lihat. */
export function izinSoal(soal: { sumber: string; status: string }): IzinSoal {
  const sendiri = soal.sumber === "buatan_sendiri";
  const draf = sendiri && soal.status === "draf";
  const terbit = sendiri && soal.status === "terpublikasi";
  return { terbit: draf, edit: draf, versiBaru: terbit, arsip: terbit, hapus: draf };
}

// ---------------------------------------------------------------------------
// Hasil terbit draf
// ---------------------------------------------------------------------------

export interface SoalDilewati {
  id: string;
  alasan: string;
  /** Kekurangan isi (alasan 'belum_lengkap'). */
  rincian?: string[];
}

export const LABEL_ALASAN_TERBIT: Record<string, string> = {
  tidak_ditemukan: "tidak ditemukan",
  bukan_draf: "sudah bukan draf",
  bukan_buatan_sendiri: "bukan soal Buatan Sendiri",
  stimulus_tidak_valid: "bacaannya tidak bisa diterbitkan",
  data_tidak_valid: "isi belum memenuhi syarat terbit",
  belum_lengkap: "belum lengkap",
  versi_baru: "draf versi baru, terbitkan dari halaman soalnya",
};

export const teksDilewati = (d: SoalDilewati) =>
  `${LABEL_ALASAN_TERBIT[d.alasan] ?? d.alasan}${d.rincian?.length ? `: ${d.rincian.join(" ")}` : ""}`;

// ---------------------------------------------------------------------------
// Batch impor
// ---------------------------------------------------------------------------

export interface BatchBaris {
  id: string;
  nama_berkas: string;
  dibuat_pada: string;
}
export interface SoalBatchBaris {
  impor_batch_id: string | null;
  status: string;
  stimulus_id: string | null;
  menggantikan_id?: string | null;
}
export interface BacaanBatchBaris {
  id: string;
  impor_batch_id: string | null;
  status: string;
}
export interface BatchRingkas {
  id: string;
  namaBerkas: string;
  dibuatPada: string;
  draf: number;
  /** Draf pertama (bukan versi baru): yang ikut tombol terbit batch. */
  drafBaru: number;
  terbit: number;
  arsip: number;
  /** Versi lama ('digantikan') dan status lain. */
  lainnya: number;
  /** Bacaan draf yang ikut terhapus bila draf batch dihapus. */
  bacaanAkanDihapus: number;
}

export function ringkasBatch(batch: BatchBaris[], soal: SoalBatchBaris[], bacaan: BacaanBatchBaris[]): BatchRingkas[] {
  // Bacaan yang masih dipakai soal selain draf tidak ikut terhapus.
  const bacaanTertahan = new Set(soal.filter((s) => s.status !== "draf").map((s) => s.stimulus_id));
  return batch.map((b) => {
    const milik = soal.filter((s) => s.impor_batch_id === b.id);
    const hitung = (status: string) => milik.filter((s) => s.status === status).length;
    const draf = hitung("draf");
    const terbit = hitung("terpublikasi");
    const arsip = hitung("diarsipkan");
    return {
      id: b.id,
      namaBerkas: b.nama_berkas,
      dibuatPada: b.dibuat_pada,
      draf,
      drafBaru: milik.filter((s) => s.status === "draf" && !s.menggantikan_id).length,
      terbit,
      arsip,
      lainnya: milik.length - draf - terbit - arsip,
      bacaanAkanDihapus: bacaan.filter((x) => x.impor_batch_id === b.id && x.status === "draf" && !bacaanTertahan.has(x.id)).length,
    };
  });
}

// ---------------------------------------------------------------------------
// Hasil RPC studio_soal_admin_*
// ---------------------------------------------------------------------------

export type TerjemahanAdmin = { success: boolean; httpStatus: number; pesan: string };

const angka = (v: unknown) => (typeof v === "number" ? v : 0);

export function terjemahkanRpcAdmin(hasil: Record<string, unknown>): TerjemahanAdmin {
  const ok = (pesan: string): TerjemahanAdmin => ({ success: true, httpStatus: 200, pesan });
  const no = (httpStatus: number, pesan: string): TerjemahanAdmin => ({ success: false, httpStatus, pesan });
  switch (hasil.status) {
    case "dihapus": {
      // Hapus batch mengirim jumlah_soal; hapus satu soal tidak.
      if (typeof hasil.jumlah_soal !== "number") {
        return ok(angka(hasil.jumlah_bacaan) > 0 ? "Draf soal dan bacaannya yang tidak dipakai lagi sudah dihapus." : "Draf soal dihapus.");
      }
      const tahan = angka(hasil.dipertahankan);
      return ok(
        `${hasil.jumlah_soal} soal draf dan ${angka(hasil.jumlah_bacaan)} bacaan dihapus.` +
          (tahan > 0 ? ` ${tahan} soal lain di batch ini (bukan draf) dipertahankan.` : ""),
      );
    }
    case "input_tidak_valid":
      return no(400, "Data tidak terbaca. Muat ulang halaman lalu coba lagi.");
    case "bukan_admin":
      return no(403, "Cuma Admin yang bisa melakukan ini.");
    case "tidak_ditemukan":
      return no(404, "Data tidak ditemukan. Mungkin sudah dihapus.");
    case "disimpan":
      return ok("Draf tersimpan.");
    case "versi_dibuat":
      return ok("Versi baru dibuat sebagai draf. Versi lama tetap terbit sampai versi baru diterbitkan.");
    case "versi_terbit":
      return ok("Versi baru diterbitkan. Versi lama ditandai digantikan.");
    case "diarsipkan":
      return ok("Soal diarsipkan. Soal tidak ikut latihan, tetapi tetap tersimpan.");
    case "bukan_buatan_sendiri":
      return no(403, "Soal buatan mentor hanya bisa dilihat.");
    case "media_asing":
      return no(400, "Soal hanya boleh memakai gambar yang sudah ada di soal itu. Muat ulang halaman.");
    case "sudah_berubah":
      return no(409, "Soal sudah diubah di tempat lain, muat ulang halaman.");
    case "terkunci":
      return no(409, "Soal ini bukan draf lagi, jadi isinya dikunci. Muat ulang halaman.");
    case "status_tidak_valid":
      return no(409, "Aksi ini tidak berlaku untuk status soal sekarang. Muat ulang halaman.");
    case "identitas_berubah":
      return no(409, "Subtes, tipe soal, dan bacaan tidak bisa diganti.");
    case "data_tidak_valid":
      return no(400, "Ada isian yang belum sesuai aturan. Periksa lalu coba lagi.");
    case "ada_versi_terbuka":
      return no(409, "Sudah ada versi baru yang belum terbit untuk soal ini. Lanjutkan, terbitkan, atau hapus draf itu dulu.");
    case "bukan_versi_baru":
      return no(409, "Draf ini bukan versi baru dari soal terbit.");
    case "versi_lama_tidak_aktif":
      return no(409, "Versi lama soal ini sudah tidak terbit, jadi versi baru tidak bisa diterbitkan.");
    case "stimulus_tidak_aktif":
      return no(409, "Bacaan soal ini sudah tidak aktif.");
    case "pernah_diajukan":
      return no(409, "Soal ini pernah dikirim untuk dicek, jadi tidak bisa dihapus.");
    case "dipakai_paket":
      return no(409, "Soal ini masih dipakai di paket soal.");
    default:
      return no(500, "Ada gangguan. Coba lagi sebentar lagi.");
  }
}
