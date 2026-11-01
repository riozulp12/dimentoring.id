/**
 * Progress Kehadiran (PRD 7.5.5 FR-A4, BR-34) — SATU definisi "sesi
 * terkonfirmasi" + rumus persentasenya. Dipakai di SEMUA tempat yang
 * menampilkan progress: Dashboard Siswa & Mentor, Kelas Saya Siswa, Detail
 * Kelas Siswa, Kelas Saya Mentor ("Sesi X dari Y"), Siswa Binaan Mentor, dan
 * Manajemen Siswa Admin — supaya angkanya selalu identik.
 * Tanpa "server-only" supaya aman diimport dari Server maupun Client Component.
 *
 * ATURAN (keputusan produk): sesi HANYA terhitung kalau status efektifnya
 * (hitungStatusSesi, lib/shared/statusSesi.ts) "terkonfirmasi_siswa" atau
 * "terkonfirmasi_otomatis" (24 jam). Sesi yang masih "menunggu_siswa",
 * "disangkal_menunggu_review", atau "belum_terjadi" (termasuk yang dibatalkan
 * Admin) TIDAK terhitung. Sesi disangkal yang disetujui Admin berubah jadi
 * status_siswa='dikonfirmasi' → ikut terhitung. Selaras dengan honor.
 *
 * TERPISAH dari "sesi sudah ditandai mentor" (kolom dikonfirmasi_mentor) —
 * itu dasar NOMOR SESI BERIKUTNYA dan batas SATU PENANDAAN PER HARI, dihitung
 * langsung dari dikonfirmasi_mentor / dikonfirmasi_mentor_pada di
 * lib/mentor/getKelasSayaData.ts dan app/api/mentor/sesi, TIDAK lewat fungsi
 * di file ini, dan tidak berubah.
 *
 * BUKAN progres materi (enrollments.progres_persen / materi_progress) — itu
 * metrik terpisah yang cuma tampil di daftar materi detail kelas.
 *
 * Pengambilan data per pendaftaran ada di lib/shared/progresSesiData.ts.
 */

import { hitungStatusSesi, type SesiWaktuRow } from "@/lib/shared/statusSesi";

/** Kolom sesi_kelas yang dibutuhkan hitungStatusSesi. */
export type SesiStatusRow = SesiWaktuRow;

/** Sesi terhitung untuk progress = terkonfirmasi siswa atau otomatis (24 jam). */
export function isSesiTerkonfirmasi(row: SesiStatusRow, now: Date = new Date()): boolean {
  const { status } = hitungStatusSesi(row, now);
  return status === "terkonfirmasi_siswa" || status === "terkonfirmasi_otomatis";
}

export function hitungSesiTerkonfirmasi(rows: SesiStatusRow[], now: Date = new Date()): number {
  return rows.filter((row) => isSesiTerkonfirmasi(row, now)).length;
}

export interface ProgresSesi {
  /** 0-100, bulat. 0 hanya kalau belum ada sesi terhitung (atau jumlahSesi <= 0). */
  persen: number;
  /** Semua sesi paket sudah terhitung DAN jumlahSesi > 0. */
  selesai: boolean;
}

/**
 * terhitung / total sesi paket, dibulatkan ke persen terdekat. Aturan tepi:
 * - ada sesi terhitung → minimal 1% (tidak pernah tampil 0%);
 * - belum semua sesi terhitung → maksimal 99% (100% hanya kalau benar-benar selesai);
 * - tidak pernah lebih dari 100%.
 */
export function hitungProgresSesi(sesiTerkonfirmasi: number, jumlahSesi: number): ProgresSesi {
  if (!(jumlahSesi > 0) || !Number.isFinite(sesiTerkonfirmasi)) return { persen: 0, selesai: false };
  if (sesiTerkonfirmasi >= jumlahSesi) return { persen: 100, selesai: true };
  if (sesiTerkonfirmasi <= 0) return { persen: 0, selesai: false };
  const persen = Math.min(99, Math.max(1, Math.round((sesiTerkonfirmasi / jumlahSesi) * 100)));
  return { persen, selesai: false };
}

/**
 * Rata-rata persen beberapa pendaftaran (kartu "Rata-rata Progress Siswa
 * Binaan"). null = daftar kosong (belum ada siswa), supaya UI bisa
 * membedakan "kosong" dari "0%". Aturan tepi sama dengan hitungProgresSesi:
 * rata-rata > 0 tidak tampil 0%, dan 100% hanya kalau semuanya 100%.
 */
export function hitungRataRataProgres(persenList: number[]): number | null {
  if (persenList.length === 0) return null;
  const rata = persenList.reduce((jumlah, persen) => jumlah + persen, 0) / persenList.length;
  if (!(rata > 0)) return 0;
  if (persenList.every((persen) => persen >= 100)) return 100;
  return Math.min(99, Math.max(1, Math.round(rata)));
}
