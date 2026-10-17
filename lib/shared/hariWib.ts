/**
 * Hari kalender WIB (Asia/Jakarta, UTC+7, tanpa DST — offset tetap, jadi
 * tidak perlu Intl/tzdata). Dipakai batas "satu penandaan sesi per enrollment
 * per hari" (PRD 7.5.5) dan tanggal_dilaksanakan sesi.
 */

const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;
const SEHARI_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" menurut jam WIB. */
export function tanggalWib(now: Date = new Date()): string {
  return new Date(now.getTime() + OFFSET_WIB_MS).toISOString().slice(0, 10);
}

/** [00:00 WIB hari ini, 00:00 WIB besok) sebagai ISO UTC — untuk filter timestamptz. */
export function rentangHariWib(now: Date = new Date()): { mulai: string; akhir: string } {
  const mulaiMs = Date.parse(`${tanggalWib(now)}T00:00:00.000Z`) - OFFSET_WIB_MS;
  return { mulai: new Date(mulaiMs).toISOString(), akhir: new Date(mulaiMs + SEHARI_MS).toISOString() };
}
