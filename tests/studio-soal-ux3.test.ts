/**
 * Test Studio Soal UX-3:
 *   A. tombol kartu di halaman "Buat soal" (statis)
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// A. Halaman "Buat soal"
// ---------------------------------------------------------------------------

describe("A — tombol kartu Buat soal", () => {
  const isi = baca("app/(protected)/(mentor)/studio-soal/buat/page.tsx");

  it("teks 'Pilih →' diganti tombol sungguhan dengan label jelas", () => {
    assert.doesNotMatch(isi, /Pilih →/);
    assert.match(isi, /Pilih soal biasa/);
    assert.match(isi, /Pilih soal dengan bacaan/);
    assert.match(isi, /buttonClassName\(\{ variant: "primary", className: "w-full" \}\)/);
  });

  it("tidak ada link di dalam link: kartu = div, hanya tombol yang menjadi <Link>", () => {
    const kartu = isi.slice(isi.indexOf("pilihan.map"), isi.indexOf("))}", isi.indexOf("pilihan.map")));
    assert.equal((kartu.match(/<Link\b/g) ?? []).length, 1);
    assert.match(kartu, /^pilihan\.map\(\(p\) => \(\s*<div/);
    // padding kartu (p-5 / sm:p-6) — tombol tidak menempel ke tepi
    assert.match(kartu, /\bp-5\b[^"]*\bsm:p-6\b/);
  });
});
