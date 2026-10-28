/**
 * Test Studio Soal UX-3 D — editor rumus visual (MathLive):
 *   - lib/shared/studio-soal/sisipRumus.ts: cari rumus di posisi kursor,
 *     sisipkan/ganti, cek rumus hasil editor (pakai cekRumus yang sama)
 *   - hasil editor tersimpan dalam format lama dan lolos validasi Ajukan
 *   - pemeriksaan statis: versi dikunci, dimuat malas, tanpa CDN, tombol ada
 *     di semua kolom teks yang mendukung rumus
 *
 * Mengetik di MathLive (DOM/keyboard) tidak bisa diuji di sini — lihat laporan.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { validasiRumusSoal, validasiRumusStimulus } from "@/lib/shared/studio-soal/rumus";
import { bungkusRumus, cekRumusEditor, daftarRumus, rumusDiPosisi, sisipkanRumus } from "@/lib/shared/studio-soal/sisipRumus";
import { ambilRumus } from "@/lib/shared/studio-soal/teksKaya";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("D — cari rumus di posisi kursor", () => {
  const teks = String.raw`Hitung \(\frac{1}{2}\) lalu \[x^{2}+1\] dan \\(bukan rumus\\).`;

  it("posisi rumus sama dengan pengurai (termasuk \\\\ literal yang dilewati)", () => {
    const d = daftarRumus(teks);
    assert.deepEqual(d.map((r) => [r.tex, r.blok]), [
      [String.raw`\frac{1}{2}`, false],
      ["x^{2}+1", true],
    ]);
    assert.deepEqual(d.map((r) => ({ tex: r.tex, blok: r.blok })), ambilRumus(teks));
    for (const r of d) assert.equal(teks.slice(r.awal, r.akhir), bungkusRumus(r.tex, r.blok));
  });

  it("kursor di dalam rumus -> rumus itu; di luar/tepat di pembatas luar -> null", () => {
    const d = daftarRumus(teks);
    assert.equal(rumusDiPosisi(teks, d[0].awal + 4)?.tex, String.raw`\frac{1}{2}`);
    assert.equal(rumusDiPosisi(teks, d[1].akhir - 1)?.blok, true);
    assert.equal(rumusDiPosisi(teks, 0), null);
    assert.equal(rumusDiPosisi(teks, d[0].awal), null);
    assert.equal(rumusDiPosisi(teks, d[0].akhir), null);
    assert.equal(rumusDiPosisi(teks, teks.indexOf("bukan")), null);
  });

  it("rumus tanpa penutup bukan rumus", () => {
    assert.deepEqual(daftarRumus(String.raw`a \(x+1 b`), []);
  });
});

describe("D — sisipkan / ganti rumus", () => {
  it("sisip di kursor (pilihan teks diganti), kursor sesudah rumus", () => {
    const h = sisipkanRumus("Nilai  adalah", { awal: 6, akhir: 6 }, String.raw`\sqrt{2}`, false);
    assert.equal(h.teks, String.raw`Nilai \(\sqrt{2}\) adalah`);
    assert.equal(h.teks.slice(0, h.kursor), String.raw`Nilai \(\sqrt{2}\)`);
    assert.equal(sisipkanRumus("a XX b", { awal: 2, akhir: 4 }, "y", true).teks, String.raw`a \[y\] b`);
  });

  it("mengubah rumus lama: diganti di tempatnya, teks lain utuh", () => {
    const teks = String.raw`A \(\frac{1}{2}\) B`;
    const lama = rumusDiPosisi(teks, 5);
    assert.ok(lama);
    const h = sisipkanRumus(teks, { awal: 5, akhir: 5 }, String.raw`\frac{3}{4}`, lama.blok, lama);
    assert.equal(h.teks, String.raw`A \(\frac{3}{4}\) B`);
  });
});

describe("D — hasil editor tersimpan dalam format lama & lolos validasi", () => {
  // Bentuk keluaran khas MathLive (getValue("latex-expanded")).
  const KELUARAN = [
    String.raw`\frac{1}{2}`,
    "x^{2}+y^{3}",
    String.raw`\sqrt{x}`,
    String.raw`\sqrt[3]{x}`,
    String.raw`U_{n}`,
    String.raw`3\times4\div2`,
    String.raw`x\le5`,
    String.raw`\pi r^{2}`,
    String.raw`\left(\frac{a}{b}\right)^{2}`,
    String.raw`\log_{2}8`,
  ];

  it("keluaran umum lolos cekRumusEditor dan validasi rumus soal/bacaan", () => {
    for (const tex of KELUARAN) {
      assert.equal(cekRumusEditor(tex), null, tex);
      const redaksi = sisipkanRumus("Hitung ", { awal: 7, akhir: 7 }, tex, false).teks;
      assert.deepEqual(validasiRumusSoal({ redaksi, konten: {} }), [], tex);
      assert.deepEqual(ambilRumus(redaksi), [{ tex, blok: false }]);
    }
    const bacaan = { konten: { blok: [{ jenis: "teks", teks: `Rumus: ${bungkusRumus(KELUARAN[0], true)}` }] } };
    assert.deepEqual(validasiRumusStimulus(bacaan), []);
  });

  it("kotak kosong, rumus rusak, perintah terlarang, dan kosong ditolak dengan bahasa biasa", () => {
    assert.match(cekRumusEditor(String.raw`\frac{\placeholder{}}{2}`) ?? "", /kotak kosong/);
    assert.match(cekRumusEditor(String.raw`\frac{1}{`) ?? "", /^Rumus belum bisa ditampilkan/);
    assert.match(cekRumusEditor(String.raw`\href{http://x}{y}`) ?? "", /tidak diizinkan/);
    assert.equal(cekRumusEditor("   "), "Rumus masih kosong.");
  });

  it("isi yang bentrok dengan pembatas ditolak", () => {
    assert.notEqual(cekRumusEditor(String.raw`a\)b`), null);
  });
});

function semuaFile(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((n) => {
    const rel = path.join(dir, n);
    return statSync(path.join(ROOT, rel)).isDirectory() ? semuaFile(rel) : [rel.replace(/\\/g, "/")];
  });
}

describe("D — statis", () => {
  const editor = baca("components/studio-soal/EditorRumus.tsx");
  const textarea = baca("components/studio-soal/TextareaKaya.tsx");

  it("mathlive dikunci versi persis (seperti katex)", () => {
    const pkg = JSON.parse(baca("package.json")) as { dependencies: Record<string, string> };
    assert.match(pkg.dependencies.mathlive, /^\d+\.\d+\.\d+$/);
  });

  it("dimuat malas di browser saja: hanya import() dinamis, tidak ada impor statis di file mana pun", () => {
    assert.match(editor, /import\("mathlive"\)/);
    const statis = /^import\s+(?!type\b)[^;]*from\s+"mathlive"/m;
    for (const f of [...semuaFile("components"), ...semuaFile("app"), ...semuaFile("lib")]) {
      if (/\.(ts|tsx)$/.test(f)) assert.doesNotMatch(baca(f), statis, f);
    }
  });

  it("tanpa CDN: font & suara MathLive tidak diunduh dari luar", () => {
    assert.match(editor, /fontsDirectory = null/);
    assert.match(editor, /soundsDirectory = null/);
    assert.doesNotMatch(editor, /https?:\/\//);
  });

  it("modal berlabel Indonesia dengan pratinjau, Sisipkan (primary) & Batal (secondary)", () => {
    assert.match(editor, /Tulis rumusnya/);
    assert.match(editor, /Pratinjau/);
    assert.match(editor, /<Button variant="secondary" size="sm" onClick=\{onBatal\}>\s*Batal/);
    assert.match(editor, /<Button size="sm" disabled=\{!bolehSisip\}.*\r?\n\s*Sisipkan\r?\n/);
    assert.match(editor, /cekRumusEditor/);
  });

  it("tombol Sisipkan rumus di TextareaKaya; semua kolom rumus memakai TextareaKaya tanpa mematikan format", () => {
    assert.match(textarea, /Sisipkan rumus/);
    assert.match(textarea, /rumusDiPosisi\(value, awal\)/);
    const soal = baca("components/studio-soal/FormSoal.tsx");
    for (const id of ["redaksi", "opsi-", "pernyataan-", "pembahasan"]) assert.match(soal, new RegExp(`\\$\\{idAwalan\\}${id}`), id);
    assert.match(baca("components/studio-soal/FormStimulus.tsx"), /\$\{idAwalan\}blok-/);
    for (const f of ["components/studio-soal/FormSoal.tsx", "components/studio-soal/FormStimulus.tsx"]) {
      assert.doesNotMatch(baca(f), /format=\{false\}/, f);
    }
  });

  it("contekan panjang diganti petunjuk singkat", () => {
    assert.doesNotMatch(textarea, /const CONTOH/);
    assert.match(textarea, /untuk pecahan/);
  });
});
