/**
 * Test Studio Soal UX-3 — revisi review Rio (11 butir). Bagian yang bisa diuji
 * tanpa browser: fungsi murni + pemeriksaan statis kode tampilan.
 * Mengetuk tombol, menggulir, dan keyboard layar perlu dicek di browser —
 * lihat laporan.
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
// Kelompok 1 — ikon dan tombol (butir 1, 2, 3)
// ---------------------------------------------------------------------------

describe("K1 — ikon hapus & panah buka/tutup", () => {
  const hapus = baca("components/studio-soal/TombolHapusDraf.tsx");
  const kartu = baca("components/studio-soal/KartuSoalBacaan.tsx");
  const stimulus = baca("components/studio-soal/FormStimulus.tsx");
  const gaya = baca("components/studio-soal/gaya.ts");

  it("tombol hapus draf = ikon tong sampah dengan aria-label + title; alur Modal tetap", () => {
    assert.match(hapus, /<IkonTongSampah \/>/);
    assert.match(hapus, /aria-label=\{label\}/);
    assert.match(hapus, /title=\{label\}/);
    assert.match(hapus, /label = "Hapus draf"/);
    assert.match(hapus, /<Modal open=\{buka\}/);
    assert.match(hapus, /Draf ini tidak bisa dihapus/);
    assert.doesNotMatch(hapus, />\s*Hapus draf\s*</, "teks 'Hapus draf' tidak lagi jadi isi tombol");
  });

  it("tombol ikon punya area ketuk 40px", () => {
    assert.match(gaya, /export const tombolIkon[\s\S]*size-10/);
  });

  it("kartu soal: satu panah (chevron) berputar, aria-expanded, kepala kartu bisa diketuk", () => {
    assert.match(kartu, /<IkonChevron/);
    assert.match(kartu, /rotate-180/);
    assert.match(kartu, /aria-expanded=\{kartu\.terbuka\}/);
    assert.match(kartu, /aria-label=\{labelBukaTutup\}/);
    assert.match(kartu, /title=\{labelBukaTutup\}/);
    assert.match(kartu, /cursor-pointer[^"]*" onClick=\{onBukaTutup\}/);
    assert.doesNotMatch(kartu, /Buka & ubah|>\s*Tutup\s*</);
  });

  it("buang kartu = ikon dengan konfirmasi; hapus draf soal tersimpan ada di kartu", () => {
    assert.match(kartu, /aria-label=\{`Buang kartu soal \$\{nomor\}`\}/);
    assert.match(kartu, /Buang kartu soal \{nomor\}\?/);
    assert.match(kartu, /<TombolHapusDraf[\s\S]*onTerhapus=\{hapusDraf\.onTerhapus\}/);
  });

  it("'Halaman soal →' hilang; aksi halaman soal pindah ke kartu", () => {
    assert.doesNotMatch(kartu, /Halaman soal/);
    assert.doesNotMatch(kartu, /href=\{`\/studio-soal\/soal\//);
    for (const url of ["soal/${kid}/ajukan", "soal/${kid}/tarik", "soal/${kid}/versi-baru"]) {
      assert.ok(stimulus.includes(`/api/studio-soal/${url}`), url);
    }
    assert.match(stimulus, /Kirim soal ini untuk dicek/);
    assert.match(stimulus, /Batalkan kirim/);
    assert.match(stimulus, /Buat versi baru/);
    assert.match(stimulus, /alasanTidakBisaHapus\("soal"/);
  });

  it("semua tombol ikon di Studio Soal punya aria-label dan title", () => {
    const files = [
      "components/studio-soal/FormStimulus.tsx",
      "components/studio-soal/FormSoal.tsx",
      "components/studio-soal/KartuSoalBacaan.tsx",
      "components/studio-soal/TombolHapusDraf.tsx",
    ];
    for (const f of files) {
      const isi = baca(f);
      // Setiap <button …>…</button> yang memakai tombolIkon( harus punya aria-label & title.
      const tombol = isi
        .split("<button")
        .slice(1)
        .map((t) => t.slice(0, t.indexOf("</button>")))
        .filter((t) => t.includes("tombolIkon("));
      assert.ok(tombol.length > 0 || f.endsWith("TombolHapusDraf.tsx"), f);
      for (const t of tombol) {
        assert.match(t, /aria-label=/, `${f}: ${t}`);
        assert.match(t, /title=/, `${f}: ${t}`);
      }
    }
  });
});
