/**
 * Bendera fitur Lead Capture (PRD 7.4.6, BR-38). FAIL-CLOSED: aktif HANYA
 * kalau env NEXT_PUBLIC_LEAD_CAPTURE_ENABLED bernilai persis "true". Tidak
 * ada, kosong, "True", "1", dst -> mati.
 *
 * Bendera mati: kartu WhatsApp di hasil Assessment tidak dirender dan
 * POST /api/leads menolak (403). Halaman Admin /leads TETAP aktif supaya
 * data yang sudah ada bisa dilihat/di-export.
 */

/** Fungsi murni supaya bisa dites tanpa env. */
export function parseLeadCaptureEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function isLeadCaptureEnabled(): boolean {
  // Ditulis literal `process.env.NEXT_PUBLIC_...` supaya ikut di-inline
  // Next.js juga di bundle client (LeadCaptureCard).
  return parseLeadCaptureEnabled(process.env.NEXT_PUBLIC_LEAD_CAPTURE_ENABLED);
}

export const LEAD_CAPTURE_NONAKTIF_MESSAGE = "Fitur ini belum dibuka.";

/**
 * Kartu tampil kalau bendera aktif DAN (hasil milik tamu, ATAU user login
 * pemiliknya belum punya no_wa).
 */
export function harusTampilLeadCapture(params: {
  enabled: boolean;
  milikUserLogin: boolean;
  userPunyaNoWa: boolean;
}): boolean {
  if (!params.enabled) return false;
  return !params.milikUserLogin || !params.userPunyaNoWa;
}
