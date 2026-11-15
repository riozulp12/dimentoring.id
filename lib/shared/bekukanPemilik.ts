import { sebelumPemberlakuan } from "@/lib/shared/penerimaanSiswa";

/**
 * "Bekukan pemilik" (B5) — logika MURNI (tanpa DB).
 *
 * Latar belakang: subtes dengan <=1 mentor aktif TIDAK memakai klaim — siswanya otomatis milik
 * pemegang tunggal, dan enrollment_subtes.mentor_id dibiarkan NULL (lib/shared/penerimaanSiswa.ts).
 * Begitu pemegang aktif naik dari 1 menjadi >=2, baris-baris NULL itu otomatis berubah menjadi
 * "menunggu penerima" yang bisa direbut mentor baru. Agar siswa yang SUDAH ber-mentor tunggal tidak
 * berpindah, baris NULL itu DIBEKUKAN ke pemegang tunggal yang lama.
 *
 * Aturan:
 *  - Pemicu per subtes: pemegang AKTIF sebelum = tepat 1, sesudah >= 2, dan pemegang lama itu masih
 *    ada di antara pemegang baru (kalau dia sendiri dilepas, tidak ada yang dibekukan ke dia).
 *  - Yang dibekukan: enrollment_subtes kelas itu pada subtes itu dengan mentor_id NULL DAN pendaftaran
 *    pada/setelah TANGGAL_PEMBERLAKUAN_PENERIMAAN (2026-11-15T00:00:00+07:00). Siswa lama (legacy)
 *    TIDAK disentuh, begitu juga baris yang sudah punya penerima.
 *  - Subtes tanpa siswa: tidak ada yang dibekukan.
 */

export interface BarisEnrollmentSubtes {
  id: string;
  subtesId: string;
  /** enrollment_subtes.mentor_id — NULL = belum ada penerima. */
  mentorId: string | null;
  /** enrollments.tanggal_daftar. */
  tanggalDaftar: string | null;
}

export interface ItemBekukan {
  /** enrollment_subtes.id */
  id: string;
  subtesId: string;
  mentorId: string;
}

/** Subtes yang memicu pembekuan beserta pemegang tunggal lamanya. */
export function subtesPemicuBekukan(
  aktifSebelumPerSubtes: Map<string, string[]>,
  aktifSesudahPerSubtes: Map<string, string[]>,
): Map<string, string> {
  const hasil = new Map<string, string>();
  for (const [subtesId, sesudahRaw] of aktifSesudahPerSubtes) {
    const sebelum = Array.from(new Set(aktifSebelumPerSubtes.get(subtesId) ?? []));
    const sesudah = Array.from(new Set(sesudahRaw));
    if (sebelum.length === 1 && sesudah.length >= 2 && sesudah.includes(sebelum[0])) {
      hasil.set(subtesId, sebelum[0]);
    }
  }
  return hasil;
}

/** Baris yang harus dibekukan, diberi pemegang tunggal lama sebagai pemilik. */
export function tentukanPembekuan(pemicu: Map<string, string>, baris: BarisEnrollmentSubtes[]): ItemBekukan[] {
  const hasil: ItemBekukan[] = [];
  for (const b of baris) {
    const pemilik = pemicu.get(b.subtesId);
    if (!pemilik) continue;
    if (b.mentorId !== null) continue; // sudah punya penerima
    if (sebelumPemberlakuan(b.tanggalDaftar)) continue; // siswa lama (legacy)
    hasil.push({ id: b.id, subtesId: b.subtesId, mentorId: pemilik });
  }
  return hasil;
}
