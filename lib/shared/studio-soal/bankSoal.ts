/**
 * Bank Soal (Admin) — modul MURNI (tanpa server/DB), dipakai data layer, API,
 * dan layar. Aturan yang sebenarnya ditegakkan RPC di
 * db/add_impor_perawatan.sql; modul ini hanya menampilkan & menerjemahkan.
 */

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
    default:
      return no(500, "Ada gangguan. Coba lagi sebentar lagi.");
  }
}
