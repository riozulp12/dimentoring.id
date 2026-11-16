import "server-only";
import { getAksesMentorEnrollment, type EnrollmentAksesMentor } from "@/lib/mentor/aksesMentor";
import { milikDariPenerimaan } from "@/lib/mentor/siswaMilikMentor";

/**
 * Penjaga bersama untuk route TULIS mentor yang menerima enrollmentId (presensi sesi, Link Meet per siswa):
 * hanya mentor PEMILIK siswa itu — aturan SATU-SATUNYA di lib/shared/siswaMentor.ts (siswaMilikMentor), dipakai
 * lewat milikDariPenerimaan; aturan kepemilikan TIDAK ditulis ulang di sini. Presensi menentukan honor, jadi
 * cukup terkait kelas (getAksesMentorEnrollment) TIDAK cukup.
 *
 * Hasil:
 *  - enrollment tidak ada / mentor tidak terkait / bukan pemilik / siswa masih "menunggu" (belum milik
 *    siapa pun) → 403 dengan SATU pesan yang sama (tidak membocorkan apakah enrollmentId ada atau siapa
 *    pemiliknya);
 *  - data kepemilikan gagal dibaca (galat database) → 503, FAIL-CLOSED: pemanggil tidak boleh menulis apa pun.
 */

/** Pesan 403 tunggal — identik untuk "tidak ada", "bukan kelasmu", "bukan pemilik", dan "menunggu". */
export const PESAN_BUKAN_PEMILIK = "Siswa ini bukan bagian dari kelas yang kamu ampu.";
export const PESAN_GAGAL_BACA_KEPEMILIKAN = "Coba lagi sebentar.";

export type HasilGuardPemilik =
  | { ok: true; akses: EnrollmentAksesMentor }
  | { ok: false; status: 403 | 503; pesan: string };

/** Murni (tanpa DB): putuskan dari hasil getAksesMentorEnrollment. */
export function putuskanGuardPemilik(
  mentorId: string,
  akses: EnrollmentAksesMentor | null | "gagal",
): HasilGuardPemilik {
  if (akses === "gagal") return { ok: false, status: 503, pesan: PESAN_GAGAL_BACA_KEPEMILIKAN };
  if (!akses) return { ok: false, status: 403, pesan: PESAN_BUKAN_PEMILIK };
  // Data penerimaan per subtes gagal dibaca → kepemilikan tidak bisa dipastikan → tolak (fail-closed).
  if (!akses.penerimaan.boleh && akses.penerimaan.alasan === "data_gagal") {
    return { ok: false, status: 503, pesan: PESAN_GAGAL_BACA_KEPEMILIKAN };
  }
  const milik = milikDariPenerimaan({
    mentorId,
    tanggalDaftar: akses.enrollment.tanggalDaftar,
    mentorOfflineId: akses.enrollment.mentorOfflineId,
    terkaitKelas: akses.akses === "utama" || akses.akses === "kelas",
    subtes: akses.subtesPenerimaan,
  });
  if (!milik) return { ok: false, status: 403, pesan: PESAN_BUKAN_PEMILIK };
  return { ok: true, akses };
}

export async function guardPemilikSiswa(mentorId: string, enrollmentId: string): Promise<HasilGuardPemilik> {
  return putuskanGuardPemilik(mentorId, await getAksesMentorEnrollment(mentorId, enrollmentId));
}
