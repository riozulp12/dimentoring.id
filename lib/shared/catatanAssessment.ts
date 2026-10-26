/**
 * Catatan (Note) hasil Assessment: teks cadangan tanpa AI + penyaring gaya.
 * Modul murni (tanpa server-only) supaya bisa dites dan dipakai bersama oleh
 * lib/ai/generateNote.ts dan halaman hasil.
 *
 * Gaya yang dijaga: bahasa sehari-hari, kalimat pendek, tanpa tanda pisah
 * atau strip sebagai jeda kalimat. Strip yang memang wajib tetap aman:
 * kata ulang (kira-kira), nama (Al-Azhar), kode (S1-D3), rentang angka
 * (7-13, 2025–2026) dan angka negatif.
 */

export const CATATAN_CADANGAN =
  "Angka di atas itu gambaran, bukan keputusan akhir. Banyak yang keketatannya terlihat berat tetap lolos karena persiapannya pas. Kalau ada materi yang masih terasa sulit, mulai latihan dari situ dulu. Coba Try Out gratis untuk lihat posisimu sekarang, atau ikut kelas yang sesuai kebutuhanmu. Waktumu masih cukup untuk memperbesar peluang.";

const DIGIT = /\d/;
const HURUF_ANGKA = /[\p{L}\p{N}]/u;

function charSebelum(teks: string, index: number): string {
  return index > 0 ? teks[index - 1] : "";
}

function charSesudah(teks: string, index: number): string {
  return index < teks.length ? teks[index] : "";
}

/** Bersihkan tanda pisah/strip yang tidak pada tempatnya dari teks catatan. */
export function rapikanCatatan(input: string): string {
  if (!input) return "";

  // 1. Penanda bullet di awal baris ("- ", "– ", "• ", "* ") dibuang.
  let teks = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((baris) => baris.replace(/^\s*(?:[-–—•*]+)\s+/, ""))
    .join("\n");

  // 2. Em dash / en dash: dipertahankan hanya di antara dua angka (rentang).
  teks = teks.replace(/\s*[—–]+\s*/g, (cocok, offset: number, asli: string) => {
    const sebelum = charSebelum(asli, offset);
    const sesudah = charSesudah(asli, offset + cocok.length);
    if (DIGIT.test(sebelum) && DIGIT.test(sesudah)) return cocok;
    return ", ";
  });

  // 3. Strip biasa (hyphen), termasuk "--".
  teks = teks.replace(/\s*-+\s*/g, (cocok, offset: number, asli: string) => {
    const sebelum = charSebelum(asli, offset);
    const sesudah = charSesudah(asli, offset + cocok.length);
    const adaSpasiKiri = /^\s/.test(cocok);
    const adaSpasiKanan = /\s$/.test(cocok);
    const inti = cocok.trim();

    // Rentang angka ("7-13", "7 - 13").
    if (DIGIT.test(sebelum) && DIGIT.test(sesudah)) return cocok;
    // Kata ulang, nama, kode: satu strip menempel di kedua sisi.
    if (inti === "-" && !adaSpasiKiri && !adaSpasiKanan && HURUF_ANGKA.test(sebelum) && HURUF_ANGKA.test(sesudah)) {
      return cocok;
    }
    // Angka negatif ("turun -5").
    if (inti === "-" && !adaSpasiKanan && DIGIT.test(sesudah) && (adaSpasiKiri || sebelum === "")) return cocok;
    return ", ";
  });

  // 4. Rapikan sisa tanda baca.
  teks = teks
    .replace(/,(\s*,)+/g, ",")
    .replace(/,\s*([.!?;:)])/g, "$1")
    .replace(/([(])\s*,\s*/g, "$1")
    .replace(/^[ \t]*,[ \t]*/gm, "")
    .replace(/[ \t]*,[ \t]*$/gm, "")
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  return teks.trim();
}
