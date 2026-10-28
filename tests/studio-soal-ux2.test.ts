/**
 * Test Studio Soal UX-2 — fungsi murni lib/shared/studio-soal/kirimBanyak.ts
 * (filter status, pilih soal, kelayakan kirim sendiri, ringkasan hasil) dan
 * pemeriksaan statis (pintu "+ Buat soal", route lama tetap ada, tidak ada
 * endpoint baru). Skenario API kirim banyak ada di studio-soal-form.test.ts.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  BATAS_KIRIM,
  alasanDariJawaban,
  antreanKirim,
  hitungPerStatus,
  kelayakanKirim,
  keadaanPilihSemua,
  petaStatusBacaan,
  pilihSemua,
  ringkasHasilKirim,
  saringStatus,
  ubahPilihan,
} from "@/lib/shared/studio-soal/kirimBanyak";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const soal = (id: string, status: string, stimulusId: string | null = null) => ({ id, status, stimulusId });
const DAFTAR = [
  soal("a", "draf"),
  soal("b", "draf"),
  soal("c", "diajukan"),
  soal("d", "ditolak"),
  soal("e", "terpublikasi"),
  soal("f", "diarsipkan"),
  soal("g", "draf", "bacaan-draf"),
  soal("h", "draf", "bacaan-terbit"),
];
const BACAAN = petaStatusBacaan([
  { id: "bacaan-draf", status: "draf" },
  { id: "bacaan-terbit", status: "terpublikasi" },
]);
const terlihat = (list: typeof DAFTAR) => list.map((s) => ({ id: s.id, boleh: kelayakanKirim(s, BACAAN).boleh }));

describe("filter status", () => {
  it("jumlah per status benar; Semua termasuk status lain", () => {
    assert.deepEqual(hitungPerStatus(DAFTAR), { semua: 8, draf: 4, diajukan: 1, ditolak: 1, terpublikasi: 1 });
  });

  it("saring per status", () => {
    assert.deepEqual(saringStatus(DAFTAR, "draf").map((s) => s.id), ["a", "b", "g", "h"]);
    assert.deepEqual(saringStatus(DAFTAR, "ditolak").map((s) => s.id), ["d"]);
    assert.equal(saringStatus(DAFTAR, "semua").length, 8);
  });
});

describe("kelayakanKirim (aturan sama dengan RPC studio_soal_ajukan_soal)", () => {
  const boleh = (s: (typeof DAFTAR)[number]) => kelayakanKirim(s, BACAAN).boleh;
  it("draf & ditolak mandiri boleh; sedang dicek/terbit/arsip tidak", () => {
    assert.deepEqual(DAFTAR.slice(0, 6).map(boleh), [true, true, false, true, false, false]);
  });
  it("soal di bacaan draf ikut bacaannya; di bacaan terbit boleh sendiri", () => {
    const g = kelayakanKirim(DAFTAR[6], BACAAN);
    assert.equal(g.boleh, false);
    if (!g.boleh) assert.match(g.alasan, /bersama bacaannya/);
    assert.equal(boleh(DAFTAR[7]), true);
  });
  it("bacaan tidak dikenal (versi lama/arsip) atau tidak ditugaskan -> tidak boleh", () => {
    assert.equal(kelayakanKirim(soal("x", "draf", "hilang"), BACAAN).boleh, false);
    assert.equal(kelayakanKirim(soal("y", "draf"), BACAAN, false).boleh, false);
  });
});

describe("pilihan", () => {
  it("centang hanya yang boleh; centang lagi = lepas", () => {
    let p = ubahPilihan(new Set(), "a", true);
    assert.deepEqual([...p], ["a"]);
    p = ubahPilihan(p, "c", false);
    assert.deepEqual([...p], ["a"]);
    p = ubahPilihan(p, "a", true);
    assert.equal(p.size, 0);
  });

  it("pilih semua hanya memilih yang boleh dikirim; ditekan lagi = lepas semua", () => {
    const t = terlihat(DAFTAR);
    const p = pilihSemua(new Set(), t);
    assert.deepEqual([...p].sort(), ["a", "b", "d", "h"]);
    assert.equal(keadaanPilihSemua(p, t), "semua");
    assert.equal(pilihSemua(p, t).size, 0);
    assert.equal(keadaanPilihSemua(new Set(["a"]), t), "sebagian");
    assert.equal(keadaanPilihSemua(new Set(), t), "kosong");
  });

  it("filter Draf lalu pilih semua: hanya draf yang boleh (soal di bacaan draf tidak ikut)", () => {
    const p = pilihSemua(new Set(), terlihat(saringStatus(DAFTAR, "draf")));
    assert.deepEqual([...p].sort(), ["a", "b", "h"]);
  });

  it(`batas ${BATAS_KIRIM} ditegakkan pada pilih semua dan centang satu-satu`, () => {
    const banyak = Array.from({ length: 70 }, (_, i) => ({ id: `s${i}`, boleh: true }));
    const p = pilihSemua(new Set(), banyak);
    assert.equal(p.size, BATAS_KIRIM);
    assert.equal(ubahPilihan(p, "s69", true).size, BATAS_KIRIM);
    // pilihan dari subtes lain ikut dihitung dalam batas
    const awal = new Set(Array.from({ length: 45 }, (_, i) => `lain${i}`));
    assert.equal(pilihSemua(awal, banyak).size, BATAS_KIRIM);
  });
});

describe("antrean & ringkasan kirim", () => {
  it("antrean: tanpa duplikat, lewati yang sudah terkirim/tidak boleh, maksimal 50", () => {
    const boleh = (id: string) => id !== "x";
    assert.deepEqual(antreanKirim(["a", "a", "b", "x", "c"], new Set(["b"]), boleh), ["a", "c"]);
    const besar = Array.from({ length: 80 }, (_, i) => `s${i}`);
    assert.equal(antreanKirim(besar, new Set(), () => true).length, BATAS_KIRIM);
  });

  it("ringkasan: kalimat pembuka sesuai hasil", () => {
    assert.equal(ringkasHasilKirim([{ id: "a", ok: true }, { id: "b", ok: true }]).judul, "2 soal terkirim.");
    const campur = ringkasHasilKirim([
      { id: "a", ok: true },
      { id: "b", ok: false, alasan: "Pilih satu jawaban benar (A–E)." },
      { id: "c", ok: false },
    ]);
    assert.equal(campur.judul, "1 soal terkirim. 2 belum terkirim:");
    assert.deepEqual(campur.gagal, [
      { id: "b", jenis: "soal", alasan: "Pilih satu jawaban benar (A–E)." },
      { id: "c", jenis: "soal", alasan: "Belum terkirim. Coba lagi." },
    ]);
    assert.equal(ringkasHasilKirim([{ id: "b", ok: false, alasan: "x" }]).judul, "1 belum terkirim:");
  });

  it("alasan: pesan validasi didahulukan (maks 2, sisanya dihitung), lalu pesan umum", () => {
    assert.equal(
      alasanDariJawaban({ error: "Soal belum lengkap.", errors: [{ pesan: "A." }, { pesan: "A." }, { pesan: "B." }, { pesan: "C." }] }),
      "A. B. (+1 hal lain)",
    );
    assert.equal(alasanDariJawaban({ error: "Soal tidak ditemukan." }), "Soal tidak ditemukan.");
    assert.equal(alasanDariJawaban({}), "Belum terkirim. Coba lagi.");
  });
});

function semuaFile(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((n) => {
    const rel = path.join(dir, n);
    return statSync(path.join(ROOT, rel)).isDirectory() ? semuaFile(rel) : [rel.replace(/\\/g, "/")];
  });
}

describe("statis UX-2", () => {
  it("satu pintu '+ Buat soal' menggantikan dua tombol lama di daftar", () => {
    const isi = baca("components/mentor/StudioSoalMentor.tsx");
    assert.match(isi, /\+ Buat soal/);
    assert.match(isi, /\/studio-soal\/buat\?subtes=/);
    assert.doesNotMatch(isi, /\+ Tulis soal|\+ Buat bacaan/);
  });

  it("halaman pilihan punya dua kartu yang menuju form lama; route lama tetap ada", () => {
    const isi = baca("app/(protected)/(mentor)/studio-soal/buat/page.tsx");
    assert.match(isi, /Soal biasa/);
    assert.match(isi, /Satu soal berdiri sendiri\./);
    assert.match(isi, /Soal dengan bacaan/);
    assert.match(isi, /\/studio-soal\/soal\/baru/);
    assert.match(isi, /\/studio-soal\/stimulus\/baru/);
    for (const r of ["soal/baru", "stimulus/baru"]) {
      assert.ok(existsSync(path.join(ROOT, `app/(protected)/(mentor)/studio-soal/${r}/page.tsx`)), r);
    }
  });

  it("halaman bacaan punya tombol tambah soal (UX-3: kartu soal di halaman yang sama)", () => {
    assert.match(baca("components/studio-soal/FormStimulus.tsx"), /\+ Tambah soal/);
  });

  it("kirim banyak memakai endpoint ajukan yang sudah ada; tidak ada endpoint baru", () => {
    assert.match(baca("components/mentor/StudioSoalMentor.tsx"), /\/api\/studio-soal\/soal\/\$\{id\}\/ajukan/);
    assert.deepEqual(semuaFile("app/api/studio-soal").sort(), [
      "app/api/studio-soal/soal/[id]/[aksi]/route.ts",
      "app/api/studio-soal/soal/[id]/route.ts",
      "app/api/studio-soal/stimulus/[id]/[aksi]/route.ts",
      "app/api/studio-soal/stimulus/[id]/route.ts",
    ]);
  });
});
