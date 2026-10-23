/**
 * Teks persetujuan Lead Capture (PRD 7.4.6 / BR-38).
 *
 * ⚠️ DRAF — WAJIB ditinjau pihak yang paham hukum (UU PDP, data anak di
 * bawah 18 tahun) sebelum dirilis ke publik. Begitu teks diubah, NAIKKAN
 * CONSENT_VERSI supaya setiap baris leads tetap tahu versi teks mana yang
 * disetujui. Kebijakan Privasi (/kebijakan-privasi) juga masih DRAF.
 *
 * Versi yang tersimpan di leads.consent_versi SELALU diambil dari konstanta
 * ini di server, tidak pernah dari body request.
 */
export const CONSENT_VERSI = "v1-draf";

export const LEAD_CONSENT_TEXT =
  "Saya setuju nomor WhatsApp ini dihubungi tim Dimentoring untuk membahas hasil Assessment saya dan informasi layanan belajar Dimentoring. Saya bisa meminta berhenti dihubungi kapan saja.";

export const LEAD_SUMBER = ["assessment_snbp"] as const;
export type LeadSumber = (typeof LEAD_SUMBER)[number];

export const LEAD_STATUS = ["baru", "dihubungi", "daftar", "tidak_tertarik"] as const;
export type LeadStatus = (typeof LEAD_STATUS)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  baru: "Baru",
  dihubungi: "Dihubungi",
  daftar: "Sudah Daftar",
  tidak_tertarik: "Tidak Tertarik",
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUS as readonly string[]).includes(value);
}

export const LEAD_NAMA_MAX = 100;
export const LEAD_CATATAN_MAX = 2000;

/**
 * Batas percobaan POST /api/leads per jam. Per IP sengaja lebih longgar:
 * satu IP bisa dipakai banyak siswa sekaligus (wifi sekolah, NAT operator).
 */
export const LEAD_RATE_LIMIT_PER_TRIAL = 5;
export const LEAD_RATE_LIMIT_PER_IP = 15;
