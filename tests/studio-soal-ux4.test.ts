/**
 * Test statis Studio Soal UX-4:
 *   - tanda loading: loading.tsx per route, tombol sibuk (maskot + teks),
 *     navigasi sesudah aksi tetap sibuk (transition), reduced-motion
 *   - kartu subtes bisa dilipat + posisi "+ Buat soal"
 * (Portal Modal diuji di tests/ui-modal.test.ts.)
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("UX-4 — tanda loading", () => {
  it("loading.tsx untuk semua route Studio Soal & penugasan admin, memakai maskot", () => {
    for (const d of [
      "app/(protected)/(mentor)/studio-soal",
      "app/(protected)/(mentor)/studio-soal/buat",
      "app/(protected)/(mentor)/studio-soal/soal/baru",
      "app/(protected)/(mentor)/studio-soal/soal/[id]",
      "app/(protected)/(mentor)/studio-soal/stimulus/baru",
      "app/(protected)/(mentor)/studio-soal/stimulus/[id]",
      "app/(protected)/(admin)/penugasan-studio-soal",
    ]) {
      const f = `${d}/loading.tsx`;
      assert.ok(existsSync(path.join(ROOT, f)), f);
      assert.match(baca(f), /<MemuatHalaman \/>/, f);
    }
    const memuat = baca("components/studio-soal/MemuatHalaman.tsx");
    assert.match(memuat, /<MaskotLoading size="lg" label="Memuat…" \/>/);
    assert.match(memuat, /role="status"/);
  });

  it("isi tombol sibuk = maskot kecil + teks status; maskot diam bila kurangi gerakan", () => {
    const teks = baca("components/ui/TeksSibuk.tsx");
    assert.match(teks, /<MaskotLoading size="xs" \/>/);
    assert.match(baca("components/ui/MaskotLoading.tsx"), /xs: "h-5 w-auto"/);
    assert.match(baca("app/globals.css"), /prefers-reduced-motion: reduce\)\s*\{\s*\.animate-mascot-bounce\s*\{\s*animation: none;/);
  });

  it("tombol bilah aksi memakai TeksSibuk + aria-busy", () => {
    const soal = baca("components/studio-soal/FormSoal.tsx");
    const bacaan = baca("components/studio-soal/FormStimulus.tsx");
    for (const isi of [soal, bacaan]) {
      for (const [jenis, teks] of [
        ["simpan", "Menyimpan…"],
        ["ajukan", "Mengirim…"],
        ["tarik", "Membatalkan…"],
        ["versi", "Membuat…"],
      ]) {
        assert.match(isi, new RegExp(`aria-busy=\{sibuk === "${jenis}"\}`), jenis);
        assert.match(isi, new RegExp(`<TeksSibuk sibuk=\{sibuk === "${jenis}"\} teks="${teks}">`), jenis);
      }
      // Sibuk juga selama halaman berikutnya dimuat.
      assert.match(isi, /const sibuk: Sibuk = jenisPindah \?\? sibukAksi;/);
      assert.doesNotMatch(isi, /router\.(push|refresh)\(/);
    }
    assert.match(soal, /pindah\("versi", \(rt\) => rt\.push\(/);
    assert.match(bacaan, /pindah\("versi", \(rt\) => rt\.push\(/);
    assert.match(bacaan, /pindah\("ajukan", \(rt\) => rt\.refresh\(\)\)/);
    // Progres simpan banyak kartu tetap ada, plus maskot.
    assert.match(bacaan, /<MaskotLoading size="xs" \/>\s*Menyimpan \{proses\.ke\} dari \{proses\.dari\}…/);
    assert.match(baca("components/studio-soal/KartuSoalBacaan.tsx"), /<TeksSibuk sibuk=\{a\.sibuk\} teks=\{a\.labelSibuk\}>/);
  });

  it("navigasi sesudah aksi berjalan di transition", () => {
    const hook = baca("components/studio-soal/useNavigasiSibuk.ts");
    assert.match(hook, /useTransition\(\)/);
    assert.match(hook, /jenisPindah: sedang \? jenis : null/);
  });

  it("hapus draf: Menghapus… sampai halaman berikutnya muncul", () => {
    const hapus = baca("components/studio-soal/TombolHapusDraf.tsx");
    assert.match(hapus, /const sibuk = menghapus \|\| jenisPindah !== null;/);
    assert.match(hapus, /<TeksSibuk sibuk=\{sibuk\} teks="Menghapus…">/);
    assert.match(hapus, /aria-busy=\{sibuk\}/);
  });

  it("kirim banyak, penugasan admin, editor rumus menampilkan maskot", () => {
    const daftar = baca("components/mentor/StudioSoalMentor.tsx");
    assert.match(daftar, /const sedangKirim = proses !== null \|\| jenisPindah !== null;/);
    assert.match(daftar, /<TeksSibuk sibuk=\{sedangKirim\} teks="Mengirim…">/);
    assert.match(daftar, /Memperbarui daftar…/);
    assert.match(baca("components/admin/PenugasanStudioSoalClient.tsx"), /<MaskotLoading size="xs" \/>\s*Menyimpan…/);
    assert.match(baca("components/studio-soal/EditorRumus.tsx"), /<MaskotLoading size="xs" \/>\s*Menyiapkan editor rumus…/);
  });
});
