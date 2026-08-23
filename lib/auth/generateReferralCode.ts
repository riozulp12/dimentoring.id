import "server-only";
import { randomInt } from "node:crypto";

/**
 * Format: 3 huruf pertama nama depan (uppercase) + 2 angka random + 3 huruf
 * random, mis. "RIO09XYZ". Ruang kombinasi per prefix nama = 100 x 24^3 =
 * ~1.38 juta. Nama depan yang huruf validnya < 3 di-pad huruf random.
 * Dipakai app/api/auth/register/route.ts & app/api/auth/google-callback/route.ts
 * — SATU implementasi, jangan digandakan.
 */
const RANDOM_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // tanpa O/I, hindari salah baca

function randomLetter() {
  return RANDOM_LETTERS[randomInt(0, RANDOM_LETTERS.length)];
}

export function generateReferralCode(namaLengkap: string) {
  const firstName = namaLengkap.trim().split(/\s+/)[0] ?? "";
  let prefix = firstName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  while (prefix.length < 3) {
    prefix += randomLetter();
  }
  const digits = String(randomInt(0, 100)).padStart(2, "0");
  const randomSuffix = randomLetter() + randomLetter() + randomLetter();
  return `${prefix}${digits}${randomSuffix}`;
}
