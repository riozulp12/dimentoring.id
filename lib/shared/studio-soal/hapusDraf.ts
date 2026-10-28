/**
 * Kapan draf soal/bacaan boleh dihapus, dan alasannya dalam bahasa biasa bila
 * tidak boleh (Studio Soal UX-1). Modul MURNI — dipakai halaman daftar,
 * halaman edit, dan API.
 *
 * Aturannya SAMA dengan RPC studio_soal_hapus_draf (db/add_studio_soal_draf.sql);
 * modul ini hanya supaya tombol & alasannya tampil lebih awal. Database tetap
 * yang memutuskan.
 */
import type { ObjekStudio } from "./formSoal";

export interface KondisiHapus {
  status: string;
  /** Pernah dikirim untuk dicek (ada log 'ajukan'), walau sudah dibatalkan. */
  pernahDiajukan: boolean;
  /** Mentor masih ditugaskan Admin ke subtes ini. */
  ditugaskan: boolean;
  /** Bacaan saja: jumlah soal di dalamnya. */
  jumlahSoal?: number;
}

const NAMA: Record<ObjekStudio, string> = { soal: "Soal", stimulus: "Bacaan" };

/** Alasan bacaan tidak bisa dihapus karena masih berisi soal. */
export const pesanBacaanMasihDipakai = (jumlah: number) =>
  jumlah > 0
    ? `Bacaan ini masih dipakai ${jumlah} soal. Hapus soal-soalnya dulu.`
    : "Bacaan ini masih dipakai soal. Hapus soal-soalnya dulu.";

/** null = boleh dihapus; selain itu alasan yang ditampilkan ke mentor. */
export function alasanTidakBisaHapus(objek: ObjekStudio, k: KondisiHapus): string | null {
  const n = NAMA[objek];
  if (!k.ditugaskan) return "Anda tidak lagi ditugaskan ke subtes ini, jadi draf ini tidak bisa dihapus.";
  switch (k.status) {
    case "draf":
      break;
    case "diajukan":
      return `${n} ini sedang dicek mentor lain. Batalkan kirim dulu kalau mau mengubahnya.`;
    case "ditolak":
    case "terpublikasi":
    case "digantikan":
    case "diarsipkan":
      return `${n} ini sudah pernah dikirim untuk dicek, jadi tidak bisa dihapus.`;
    default:
      return `${n} ini tidak bisa dihapus.`;
  }
  if (k.pernahDiajukan) return `${n} ini sudah pernah dikirim untuk dicek, jadi tidak bisa dihapus.`;
  if (objek === "stimulus" && (k.jumlahSoal ?? 0) > 0) return pesanBacaanMasihDipakai(k.jumlahSoal ?? 0);
  return null;
}

/**
 * Tombol "Hapus draf" tampil untuk draf, ditolak, dan sedang dicek — supaya
 * mentor yang mencarinya mendapat alasan, bukan tombol yang hilang begitu
 * saja. Yang sudah terbit/versi lama/diarsipkan memang bukan draf lagi.
 */
export const tampilkanTombolHapus = (status: string) =>
  status === "draf" || status === "ditolak" || status === "diajukan";
