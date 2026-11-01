/**
 * Progress Kehadiran (PRD 7.5.5 FR-A4, BR-34) — SATU definisi "sesi
 * terkonfirmasi" + rumus persentasenya. Dipakai di SEMUA tempat yang
 * menampilkan progress: Dashboard Siswa & Mentor, Kelas Saya Siswa, Detail
 * Kelas Siswa, Siswa Binaan Mentor, dan Manajemen Siswa Admin — supaya
 * angkanya selalu identik (mis. 2 dari 10 sesi = 20% di mana pun).
 * Tanpa "server-only" supaya aman diimport dari Server maupun Client Component.
 *
 * BUKAN progres materi (enrollments.progres_persen / materi_progress) — itu
 * metrik terpisah yang cuma tampil di daftar materi detail kelas. Keputusan
 * produk: progress di dashboard = presensi saja.
 *
 * Pengambilan data per pendaftaran ada di lib/shared/progresSesiData.ts.
 */

export interface SesiStatusRow {
  dikonfirmasi_mentor: boolean;
  status_siswa: string;
}

/** Sesi dihitung kalau sudah ditandai mentor DAN tidak disangkal siswa. */
export function isSesiTerkonfirmasi(row: SesiStatusRow): boolean {
  return row.dikonfirmasi_mentor && row.status_siswa !== "disangkal";
}

export function hitungSesiTerkonfirmasi(rows: SesiStatusRow[]): number {
  return rows.filter(isSesiTerkonfirmasi).length;
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
