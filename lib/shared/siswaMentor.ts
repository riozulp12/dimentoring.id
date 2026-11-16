import { sebelumPemberlakuan, statusPenerimaanSubtes } from "@/lib/shared/penerimaanSiswa";

/**
 * SATU aturan "siswa ini milik mentor M" — logika murni (tanpa DB), dipakai semua halaman yang menghitung
 * atau menampilkan siswa seorang mentor (profil/detail mentor di Admin, dashboard mentor, Siswa Binaan,
 * Kelas Saya). Pembacaan datanya ada di lib/mentor/siswaMilikMentor.ts; jangan menulis ulang aturan ini
 * di tempat lain.
 *
 * Aturan (mengikuti lib/shared/penerimaanSiswa.ts — di sini hanya DIPAKAI):
 *  1. Mentor tatap muka: enrollments.mentor_offline_id = M → milik M (tidak berubah).
 *  2. Pendaftaran SEBELUM 2026-11-15T00:00:00+07:00 (legacy) → perilaku lama: milik semua mentor yang
 *     terkait kelas (kelas.mentor_id atau kelas_mentor), tanpa klaim.
 *  3. Pendaftaran BARU, per subtes pilihan siswa (enrollment_subtes), milik M bila SALAH SATU:
 *     (a) penerima (enrollment_subtes.mentor_id) = M DAN M masih pemegang AKTIF subtes itu di kelas
 *         (pemegang >= 2 → "siapa cepat dia dapat"; penerima nonaktif/dilepas tidak dihitung lagi);
 *     (b) M satu-satunya pemegang aktif subtes itu → pemilik implisit (mentor_id boleh NULL).
 *     Subtes yang masih "menunggu" (>= 2 pemegang aktif, belum ada penerima aktif) TIDAK milik siapa pun.
 *     Mentor yang hanya terkait kelas (kelas_mentor/kelas.mentor_id) tetapi bukan penerima/pemilik
 *     implisit TIDAK memiliki siswa itu.
 *  4. Dua keadaan tanpa data pemilik jatuh ke perilaku lama (relasi kelas), supaya siswa tidak "hilang":
 *     pendaftaran baru tanpa baris enrollment_subtes sama sekali, dan subtes yang saat ini tidak punya
 *     pemegang aktif satu pun.
 *  Satu siswa dengan beberapa subtes bisa milik beberapa mentor (satu per subtes).
 */

/** Data satu baris enrollment_subtes seorang siswa, beserta pemegang AKTIF subtes itu saat ini. */
export interface SubtesKepemilikan {
  /** enrollment_subtes.mentor_id — NULL = belum ada penerima. */
  mentorIdPenerima: string | null;
  /** Mentor AKTIF pemegang subtes itu di kelas itu (kelas_subtes_mentor ∩ user_roles aktif). */
  mentorAktifSubtes: string[];
}

export interface InputSiswaMilikMentor {
  /** Mentor yang ditanya (M). */
  mentorId: string;
  /** enrollments.tanggal_daftar. */
  tanggalDaftar: string | Date | null | undefined;
  /** enrollments.mentor_offline_id. */
  mentorOfflineId: string | null | undefined;
  /** M terkait kelas lewat relasi lama: kelas.mentor_id = M ATAU M ada di kelas_mentor kelas itu. */
  terkaitKelas: boolean;
  /** Baris enrollment_subtes siswa ini (kosong bila tidak ada). */
  subtes: SubtesKepemilikan[];
}

function unik(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id)));
}

/** Apakah siswa (satu enrollment) ini milik mentor M. */
export function siswaMilikMentor(input: InputSiswaMilikMentor): boolean {
  const { mentorId } = input;
  if (!mentorId) return false;
  if (input.mentorOfflineId && input.mentorOfflineId === mentorId) return true;

  if (sebelumPemberlakuan(input.tanggalDaftar)) return input.terkaitKelas;
  if (input.subtes.length === 0) return input.terkaitKelas;

  for (const subtes of input.subtes) {
    const aktif = unik(subtes.mentorAktifSubtes);
    if (aktif.length === 0) {
      if (input.terkaitKelas) return true;
      continue;
    }
    const status = statusPenerimaanSubtes({
      mentorIdPenerima: subtes.mentorIdPenerima,
      mentorAktifSubtes: aktif,
      tanggalDaftar: input.tanggalDaftar,
    });
    if (status === "tidak_perlu_klaim" && aktif[0] === mentorId) return true; // (b) pemilik implisit
    if (status === "diterima" && subtes.mentorIdPenerima === mentorId) return true; // (a)
  }
  return false;
}
