/**
 * Normalisasi nomor WhatsApp Indonesia ke satu format: 628xxxxxxxxx
 * (PRD 7.4.6 / BR-38). Dipakai tabel leads — nomor yang sama dalam format
 * 08…, 628…, atau +628… selalu jadi satu baris.
 *
 * Diterima: 08xx / 628xx / +628xx, boleh dengan spasi, tanda hubung, titik,
 * atau kurung. Ditolak: huruf/karakter lain, prefiks lain, dan panjang di
 * luar "628 + 8-12 digit".
 */
export const NO_WA_RE = /^628[0-9]{8,12}$/;

export function normalisasiNoWa(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const tanpaPemisah = input.trim().replace(/[\s\-.()]/g, "");
  if (!/^\+?[0-9]+$/.test(tanpaPemisah)) return null;

  let digit = tanpaPemisah;
  if (digit.startsWith("+")) {
    digit = digit.slice(1);
    if (!digit.startsWith("62")) return null;
  } else if (digit.startsWith("0")) {
    digit = `62${digit.slice(1)}`;
  }

  return NO_WA_RE.test(digit) ? digit : null;
}
