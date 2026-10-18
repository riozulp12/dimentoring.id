/**
 * Status EFEKTIF satu sesi_kelas (PRD 7.5.5, BR-34) — SATU definisi, dipakai
 * halaman Siswa, halaman Mentor, endpoint konfirmasi Siswa, dan (nanti)
 * perhitungan periode honor.
 *
 * Dihitung saat dibaca dari kolom yang SUDAH ada + waktu server — tanpa
 * cron/job dan tanpa kolom status baru. Konsekuensinya "terkonfirmasi
 * otomatis" tidak pernah ditulis ke DB: baris tetap status_siswa='belum',
 * statusnya berubah murni karena waktu berjalan.
 *
 * Aturan (Oktober 2026):
 *   - Siswa punya BATAS_RESPONS_MS (24 jam) sejak mentor menandai untuk
 *     mengonfirmasi/menyangkal. Tepat di detik ke-24 jam jendela tertutup.
 *   - Tidak dijawab sampai batas itu → terkonfirmasi otomatis, waktu
 *     terkonfirmasinya = waktu penandaan mentor + 24 jam.
 *   - Disangkal → menunggu keputusan Admin (tidak sah maupun tidak sah).
 *
 * Tanpa "server-only" supaya aman diimport dari Server maupun Client Component.
 * Progress Kehadiran TIDAK dihitung di sini — tetap lib/shared/progresSesi.ts.
 */

export const BATAS_RESPONS_JAM = 24;
export const BATAS_RESPONS_MS = BATAS_RESPONS_JAM * 60 * 60 * 1000;

export type StatusSesiEfektif =
  | "belum_terjadi"
  | "menunggu_siswa"
  | "terkonfirmasi_siswa"
  | "terkonfirmasi_otomatis"
  | "disangkal_menunggu_review";

export interface SesiWaktuRow {
  dikonfirmasi_mentor: boolean;
  dikonfirmasi_mentor_pada: string | null;
  status_siswa: string;
  dikonfirmasi_siswa_pada: string | null;
}

export interface StatusSesiInfo {
  status: StatusSesiEfektif;
  /** ISO. Siswa menjawab → dikonfirmasi_siswa_pada; otomatis → penandaan
   * mentor + 24 jam; null untuk belum_terjadi, menunggu_siswa, disangkal. */
  waktuTerkonfirmasi: string | null;
  /** ISO. Batas akhir siswa boleh menjawab — cuma terisi saat menunggu_siswa
   * (dan null juga kalau dikonfirmasi_mentor_pada kosong, lihat di bawah). */
  batasRespons: string | null;
}

function parseMs(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function hitungStatusSesi(row: SesiWaktuRow, now: Date = new Date()): StatusSesiInfo {
  if (!row.dikonfirmasi_mentor) {
    return { status: "belum_terjadi", waktuTerkonfirmasi: null, batasRespons: null };
  }
  if (row.status_siswa === "disangkal") {
    return { status: "disangkal_menunggu_review", waktuTerkonfirmasi: null, batasRespons: null };
  }
  if (row.status_siswa === "dikonfirmasi") {
    return { status: "terkonfirmasi_siswa", waktuTerkonfirmasi: row.dikonfirmasi_siswa_pada, batasRespons: null };
  }

  const ditandaiMs = parseMs(row.dikonfirmasi_mentor_pada);
  // Data tidak lengkap (ditandai tapi tanpa waktu penandaan — tidak pernah
  // terjadi lewat aplikasi, cuma lewat SQL manual): fail-closed, JANGAN
  // dianggap terkonfirmasi otomatis karena tidak ada titik mulai 24 jam.
  if (ditandaiMs === null) {
    return { status: "menunggu_siswa", waktuTerkonfirmasi: null, batasRespons: null };
  }

  const batasMs = ditandaiMs + BATAS_RESPONS_MS;
  const batasIso = new Date(batasMs).toISOString();
  if (now.getTime() >= batasMs) {
    return { status: "terkonfirmasi_otomatis", waktuTerkonfirmasi: batasIso, batasRespons: null };
  }
  return { status: "menunggu_siswa", waktuTerkonfirmasi: null, batasRespons: batasIso };
}

/**
 * "Nama Mentor — Mapel" untuk satu sesi (multi-mentor, PRD 7.5.5). Bagian
 * yang kosong dilewati; dua-duanya kosong (sesi lama tanpa mentor_id) → null,
 * supaya pemanggil tidak menampilkan label kosong.
 */
export function labelMentorSesi(mentorNama: string | null | undefined, namaMapel: string | null | undefined): string | null {
  const bagian = [mentorNama?.trim(), namaMapel?.trim()].filter((v): v is string => Boolean(v));
  return bagian.length > 0 ? bagian.join(" — ") : null;
}
