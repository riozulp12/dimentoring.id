import { hrefKelasDimiliki } from "@/lib/shared/kelasHref";

/**
 * SATU tempat pembentuk URL tujuan untuk item yang bisa diklik di Dashboard Mentor & Dashboard Siswa
 * (jangan menyebar string URL di komponen). Murni, tanpa DB.
 *
 * Aturan:
 *  - Hanya menerima id berbentuk UUID; selain itu `null` (item tampil biasa, TIDAK dirender sebagai link).
 *  - PRIVASI: URL hanya memuat id kelas / id konten — TIDAK PERNAH nama siswa, userId, atau enrollmentId.
 *    Baris siswa di dashboard mentor menuju halaman KELAS-nya (dijaga aturan akses mentor di halaman itu),
 *    bukan halaman siswa individual.
 *  - Semua tujuan INTERNAL (link biasa). Tautan pendaftaran eksternal event ada di halaman detailnya.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idValid(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/** Halaman daftar kelas mentor / siswa binaan (kartu angka di dashboard mentor). */
export const HREF_KELAS_SAYA_MENTOR = "/kelas-saya";
export const HREF_SISWA_BINAAN = "/siswa-binaan";
/** Halaman daftar kelas & referral siswa (kartu angka di dashboard siswa). */
export const HREF_KELAS_SISWA = "/kelas";
export const HREF_REFERRAL_SISWA = "/referral";

/** Detail kelas di sisi MENTOR (Kelas Saya) — dijaga akses mentor-ke-kelas di halamannya. */
export function hrefKelasMentor(kelasId: string | null | undefined): string | null {
  return idValid(kelasId) ? `/kelas-saya/${kelasId}` : null;
}

/** Detail kelas di sisi SISWA (kelas yang diikuti). */
export function hrefKelasSiswa(kelasId: string | null | undefined): string | null {
  return idValid(kelasId) ? hrefKelasDimiliki(kelasId) : null;
}

/** Detail beasiswa/internship/event (halaman publik internal). */
export function hrefEvent(kontenId: string | null | undefined): string | null {
  return idValid(kontenId) ? `/beasiswa-event/${kontenId}` : null;
}
