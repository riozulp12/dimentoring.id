/**
 * Aturan "konten info masih buka" (konten_info: beasiswa/internship/event/webinar/workshop) — SATU sumber untuk
 * bagian "Program lainnya" di detail event dan preview Beasiswa & Event di /program. Tanpa "server-only"
 * supaya mudah diuji. Status enum hanya 'aktif' | 'ditutup' (tidak ada draft); yang tampil: status 'aktif' DAN
 * deadline belum lewat (deadline kosong = tanpa batas = tetap buka). Hari ini dihitung di zona WIB.
 */

/** Tanggal hari ini (YYYY-MM-DD) di Asia/Jakarta — dibandingkan dengan kolom DATE konten_info.deadline. */
export function hariIniWib(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function kontenMasihBuka(item: { status: string; deadline: string | null }, hariIni: string = hariIniWib()): boolean {
  if (item.status !== "aktif") return false;
  if (!item.deadline) return true;
  return item.deadline.slice(0, 10) >= hariIni;
}
