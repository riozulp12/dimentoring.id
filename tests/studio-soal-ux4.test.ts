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
import { ringkasStatus } from "../lib/shared/studio-soal/kirimBanyak";

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

describe("UX-4 — kartu subtes bisa dilipat", () => {
  const daftar = baca("components/mentor/StudioSoalMentor.tsx");

  it("ringkasan status kecil: hanya status yang ada, urutan filter", () => {
    assert.equal(ringkasStatus([]), "");
    assert.equal(
      ringkasStatus([{ status: "draf" }, { status: "diajukan" }, { status: "draf" }, { status: "draf" }, { status: "digantikan" }]),
      "3 draf · 1 sedang dicek",
    );
    assert.equal(ringkasStatus([{ status: "terpublikasi" }, { status: "ditolak" }]), "1 perlu diperbaiki · 1 terbit");
  });

  it("chevron: aria-expanded + aria-controls, area ketuk 44px, berputar, Ikon bersama", () => {
    assert.match(daftar, /import \{ IkonChevron \} from "@\/components\/studio-soal\/Ikon";/);
    assert.match(daftar, /aria-expanded=\{terbuka\}\s*aria-controls=\{idIsi\}/);
    assert.match(daftar, /size-11/);
    assert.match(daftar, /terbuka \? "rotate-180" : ""/);
    assert.match(daftar, /<div id=\{idIsi\} hidden=\{!terbuka\}/);
  });

  it("seluruh kepala kartu bisa diketuk kecuali tautan/tombol", () => {
    assert.match(daftar, /if \(!\(e\.target as HTMLElement\)\.closest\("a, button"\)\) onBukaTutup\(\);/);
  });

  it("awal terbuka; Tutup semua / Buka semua; pilihan tetap di induk", () => {
    assert.match(daftar, /const \[tertutup, setTertutup\] = useState<Set<string>>\(new Set\(\)\);/);
    assert.match(daftar, /Tutup semua/);
    assert.match(daftar, /Buka semua/);
    assert.match(daftar, /terbuka=\{!tertutup\.has\(k\.subtesId\)\}/);
    // Isi tertutup memakai hidden (tetap terpasang), pilihan dihitung di kepala kartu.
    assert.match(daftar, /\{nDipilih\} dipilih/);
  });

  it("+ Buat soal: HP baris sendiri selebar kartu; sm ke atas di kepala kartu sebelum chevron", () => {
    assert.match(daftar, /col-span-2 row-start-2 w-full sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto/);
    assert.match(daftar, /col-start-2 row-start-1 size-11 sm:col-start-3/);
    assert.match(daftar, /sm:grid-cols-\[minmax\(0,1fr\)_auto_auto\]/);
  });
});
