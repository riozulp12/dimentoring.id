/**
 * Aturan bersama pendaftaran manual Admin (PRD 7.5.10) — dipakai form di
 * browser DAN route server (server tetap memvalidasi ulang semuanya).
 */

export const METODE_PEMBAYARAN_MANUAL = ["transfer", "tunai", "mayar_luar", "beasiswa", "lainnya"] as const;
export type MetodePembayaranManual = (typeof METODE_PEMBAYARAN_MANUAL)[number];

export const METODE_PEMBAYARAN_LABEL: Record<MetodePembayaranManual, string> = {
  transfer: "Transfer bank",
  tunai: "Tunai",
  mayar_luar: "Link Mayar di luar website",
  beasiswa: "Beasiswa / gratis",
  lainnya: "Lainnya",
};

export const ALASAN_MIN = 10;
export const ALASAN_MAKS = 1000;
/** Sama dengan checkout (app/api/payment/create) — maks. subtes kelas paket. */
export const MAX_SUBTES_MANUAL = 3;

export function isMetodePembayaranManual(value: unknown): value is MetodePembayaranManual {
  return typeof value === "string" && (METODE_PEMBAYARAN_MANUAL as readonly string[]).includes(value);
}

/**
 * Jumlah karakter (code point), BUKAN unit UTF-16 — sama dengan length()
 * Postgres yang dipakai CHECK enrollment_manual_log.alasan. "😀".length = 2
 * tapi panjangKarakter("😀") = 1.
 */
export function panjangKarakter(value: string): number {
  return [...value].length;
}

/** null = valid. Alasan dipangkas spasi dulu sebelum dihitung. */
export function validateAlasan(value: unknown): string | null {
  if (typeof value !== "string") return `Alasan wajib diisi (min. ${ALASAN_MIN} karakter).`;
  const panjang = panjangKarakter(value.trim());
  if (panjang < ALASAN_MIN) return `Alasan wajib diisi (min. ${ALASAN_MIN} karakter).`;
  if (panjang > ALASAN_MAKS) return `Alasan maksimal ${ALASAN_MAKS} karakter.`;
  return null;
}

/** Nominal opsional: undefined/null/"" -> null; selain itu bilangan bulat >= 0. */
export function parseNominal(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value.replace(/[.\s]/g, "")) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 1_000_000_000) return { ok: false };
  return { ok: true, value: n };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
