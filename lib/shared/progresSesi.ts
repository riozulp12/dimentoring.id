/**
 * Progress Kehadiran (PRD 7.5.5 FR-A4, BR-34) — SATU definisi "sesi
 * terkonfirmasi" + rumus persentasenya, dipakai halaman Detail Kelas Siswa
 * (lib/siswa/getKelasDetail.ts → SesiKehadiranSection) DAN halaman "Kelas
 * Saya" (lib/siswa/getKelasSayaData.ts) supaya angkanya selalu identik.
 * Tanpa "server-only" supaya aman diimport dari Server maupun Client Component.
 *
 * BUKAN progres materi (enrollments.progres_persen / materi_progress) — itu
 * metrik terpisah yang cuma tampil di halaman detail kelas.
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
  /** 0-100, dibulatkan. 0 kalau jumlahSesi <= 0 atau belum ada baris sesi. */
  persen: number;
  /** persen 100 DAN jumlahSesi > 0. */
  selesai: boolean;
}

export function hitungProgresSesi(sesiTerkonfirmasi: number, jumlahSesi: number): ProgresSesi {
  if (!(jumlahSesi > 0)) return { persen: 0, selesai: false };
  const persen = Math.min(100, Math.max(0, Math.round((sesiTerkonfirmasi / jumlahSesi) * 100)));
  return { persen, selesai: persen === 100 };
}
