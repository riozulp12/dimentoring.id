/**
 * Angka eksak untuk isian bertipe angka — modul MURNI, tanpa floating point.
 *
 * Aturan final (dokumen desain Bagian 5, keputusan K5):
 *   diterima : bulat (12, -3, +7), desimal dengan SATU pemisah "," atau "."
 *              (0,5 = 0.5 = .5), pecahan a/b (1/2, -3/4; b ≠ 0)
 *   ditolak  : pemisah ribuan / lebih dari satu pemisah (1.000,5), "5." tanpa
 *              digit desimal, persen, bilangan campuran (1 1/2), notasi ilmiah
 *   catatan  : "1.000" dibaca SATU (desimal), bukan seribu — builder memberi
 *              petunjuk "tulis tanpa pemisah ribuan".
 * Spasi di sekitar tanda/pemisah/garis miring diabaikan ("0 , 5", "1 / 2"),
 * tapi spasi DI ANTARA DUA DIGIT membuat input tidak valid ("1 1/2" bilangan
 * campuran, "1 000" pemisah ribuan) — supaya tidak diam-diam dibaca 11/2 atau
 * 1000. Minus unicode (−) = "-".
 * Perbandingan sebagai pecahan eksak (BigInt): 1/2 = 0,5 = 2/4 = 0.50.
 */

export interface Pecahan {
  /** Pembilang (membawa tanda). */
  p: bigint;
  /** Penyebut, selalu > 0. */
  q: bigint;
}

/** Batas panjang input supaya BigInt tidak dipakai untuk string raksasa. */
const PANJANG_MAKS = 40;

const NOL = BigInt(0);
const SATU = BigInt(1);
const SEPULUH = BigInt(10);

const POLA_DESIMAL = /^([+-]?)(\d*)(?:[.,](\d+))?$/;
const POLA_PECAHAN = /^([+-]?)(\d+)\/(\d+)$/;

function abs(x: bigint): bigint {
  return x < NOL ? -x : x;
}

function fpb(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== NOL) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function sederhanakan(p: bigint, q: bigint): Pecahan {
  if (q < NOL) {
    p = -p;
    q = -q;
  }
  if (p === NOL) return { p: NOL, q: SATU };
  const g = fpb(p, q);
  return { p: p / g, q: q / g };
}

/**
 * Normalisasi sebelum parse: NFKC, minus unicode, lalu buang spasi. null bila
 * ada spasi di antara dua digit (bilangan campuran / pemisah ribuan).
 */
function bersihkan(value: string): string | null {
  const teks = value.normalize("NFKC").replace(/−/g, "-");
  if (/\d\s+\d/u.test(teks)) return null;
  return teks.replace(/\s+/gu, "");
}

/** null = bukan angka yang didukung (lihat aturan di atas). */
export function parseAngka(value: unknown): Pecahan | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const teks = bersihkan(String(value));
  if (teks === null || teks.length === 0 || teks.length > PANJANG_MAKS) return null;

  const pecahan = POLA_PECAHAN.exec(teks);
  if (pecahan) {
    const q = BigInt(pecahan[3]);
    if (q === NOL) return null;
    const p = BigInt(pecahan[2]) * (pecahan[1] === "-" ? -SATU : SATU);
    return sederhanakan(p, q);
  }

  const desimal = POLA_DESIMAL.exec(teks);
  if (!desimal) return null;
  const [, tanda, bulat, pecah = ""] = desimal;
  if (bulat.length === 0 && pecah.length === 0) return null; // "+", "-", ","
  const digit = (bulat || "0") + pecah;
  const p = BigInt(digit) * (tanda === "-" ? -SATU : SATU);
  const q = SEPULUH ** BigInt(pecah.length);
  return sederhanakan(p, q);
}

export function samaPecahan(a: Pecahan, b: Pecahan): boolean {
  // Sudah disederhanakan & q > 0, jadi perbandingan langsung cukup.
  return a.p === b.p && a.q === b.q;
}

/** |a − b| ≤ toleransi (toleransi ≥ 0). */
export function dalamToleransi(a: Pecahan, b: Pecahan, toleransi: Pecahan): boolean {
  // |a.p/a.q − b.p/b.q| ≤ t.p/t.q  ⇔  |a.p·b.q − b.p·a.q| · t.q ≤ t.p · a.q · b.q
  const selisih = abs(a.p * b.q - b.p * a.q);
  return selisih * toleransi.q <= toleransi.p * a.q * b.q;
}

export function isNonNegatif(x: Pecahan): boolean {
  return x.p >= NOL;
}
