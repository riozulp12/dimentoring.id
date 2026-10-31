/**
 * Test Studio Soal UX-3 C — bacaan dan soalnya dalam satu halaman:
 * lib/shared/studio-soal/bacaanSoal.ts dan pemeriksaan statis. Skenario
 * "Simpan semua" terhadap route asli ada di studio-soal-form.test.ts
 * ("UX-3 — bacaan + soal").
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  LABEL_KEADAAN,
  formSoalUntukBacaan,
  isKartuKosong,
  keadaanKartu,
  perluDisimpan,
  ringkasSimpanSemua,
  type HasilSimpanSemua,
} from "@/lib/shared/studio-soal/bacaanSoal";
import { formAwal } from "@/lib/shared/studio-soal/formSoal";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// C. Bacaan dan soalnya dalam satu halaman
// ---------------------------------------------------------------------------

describe("C — keadaan kartu soal", () => {
  const PU = "00000000-0000-4000-8000-000000000101";
  const ST = "00000000-0000-4000-8000-000000000601";
  const kosong = formAwal(PU, "pilihan_ganda", ST);
  const terisi = { ...kosong, redaksi: "Apa ide pokok paragraf 2?" };
  const k = (form: typeof kosong, status = "draf", jejakTersimpan: string | null = null) => ({ form, status, jejakTersimpan });

  it("kartu baru tanpa isian = kosong (ganti tipe saja tetap kosong)", () => {
    assert.equal(isKartuKosong(kosong), true);
    assert.equal(isKartuKosong(formAwal(PU, "isian", ST)), true);
    assert.equal(isKartuKosong(terisi), false);
    assert.equal(isKartuKosong({ ...kosong, tingkat_kesulitan: "mudah" }), false);
  });

  it("keadaan & perlu disimpan", () => {
    assert.equal(keadaanKartu(k(kosong)), "kosong");
    assert.equal(perluDisimpan(k(kosong)), false);
    assert.equal(keadaanKartu(k(terisi)), "belum");
    assert.equal(perluDisimpan(k(terisi)), true);
    assert.equal(keadaanKartu(k(terisi, "draf", JSON.stringify(terisi))), "tersimpan");
    assert.equal(perluDisimpan(k(terisi, "draf", JSON.stringify(terisi))), false);
    assert.equal(keadaanKartu(k({ ...terisi, redaksi: "ubah" }, "draf", JSON.stringify(terisi))), "belum");
    assert.equal(keadaanKartu(k(terisi, "diajukan", JSON.stringify(terisi))), "terkunci");
    assert.equal(perluDisimpan(k({ ...terisi, redaksi: "x" }, "diajukan", JSON.stringify(terisi))), false);
    assert.equal(perluDisimpan(k(terisi), false), false);
    assert.equal(LABEL_KEADAAN.belum, "Belum tersimpan");
  });

  it("soal selalu memakai id & subtes bacaannya", () => {
    const f = formSoalUntukBacaan({ ...terisi, subtes_id: "", stimulus_id: null }, { id: ST, subtes_id: PU });
    assert.equal(f.stimulus_id, ST);
    assert.equal(f.subtes_id, PU);
  });

  it("ringkasan Simpan semua", () => {
    type HasilSoal = HasilSimpanSemua["soal"] extends Map<string, infer V> ? V : never;
    const ok: HasilSoal = { ok: true, jejak: "{}" };
    const no: HasilSoal = { ok: false, alasan: "x", errors: [] };
    assert.equal(ringkasSimpanSemua({ bacaan: "tersimpan", soal: new Map<string, HasilSoal>([["a", ok], ["b", ok], ["c", ok]]) }).teks, "Bacaan dan 3 soal tersimpan.");
    const campur = ringkasSimpanSemua({ bacaan: "dilewati", soal: new Map<string, HasilSoal>([["a", ok], ["b", no]]) });
    assert.equal(campur.ok, false);
    assert.match(campur.teks, /^1 soal tersimpan\. 1 soal belum tersimpan/);
    assert.equal(ringkasSimpanSemua({ bacaan: "dilewati", soal: new Map() }).teks, "Tidak ada perubahan untuk disimpan.");
    assert.match(ringkasSimpanSemua({ bacaan: { gagal: "Judul terlalu pendek.", errors: [] }, soal: new Map() }).teks, /^Bacaan belum tersimpan/);
  });
});

describe("C — statis", () => {
  const formStimulus = baca("components/studio-soal/FormStimulus.tsx");
  const kartuSoal = baca("components/studio-soal/KartuSoalBacaan.tsx");

  it("isian dipakai ulang, tidak disalin: kartu soal memakai IsianSoal & SoalPratinjau (uji kunci)", () => {
    assert.match(kartuSoal, /import \{ IsianSoal, type SubtesPilihan \} from "@\/components\/studio-soal\/FormSoal"/);
    assert.match(kartuSoal, /<IsianSoal\b/);
    assert.match(kartuSoal, /<SoalPratinjau soal=\{form\} stimulus=\{bacaanBlok\}/);
    assert.match(baca("components/studio-soal/FormSoal.tsx"), /<IsianSoal\b/);
    assert.match(formStimulus, /<IsianStimulus\b/);
    // Bagian khusus isian soal hanya ada di satu tempat.
    assert.doesNotMatch(formStimulus + kartuSoal, /Sisipkan kotak jawaban|Tambah pernyataan/);
  });

  it("satu tombol Simpan (menyimpan semua), kartu baru, buang kartu, peringatan menutup halaman", () => {
    assert.match(formStimulus, /teks="Menyimpan…">\s*Simpan\s*</);
    assert.match(formStimulus, /\+ Tambah soal/);
    assert.match(formStimulus, /<PenjagaKeluar adaPerubahan=/);
    assert.match(baca("components/studio-soal/PenjagaKeluar.tsx"), /beforeunload/);
    assert.match(kartuSoal, /Buang kartu/);
  });

  it("route lama soal/baru?stimulus= diarahkan ke halaman bacaan dengan satu kartu soal baru", () => {
    const halaman = baca("app/(protected)/(mentor)/studio-soal/soal/baru/page.tsx");
    assert.match(halaman, /redirect\(`\/studio-soal\/stimulus\/\$\{sp\.stimulus\}\?tambah=1`\)/);
    assert.match(baca("app/(protected)/(mentor)/studio-soal/stimulus/[id]/page.tsx"), /sp\.tambah === "1"/);
    assert.match(baca("app/(protected)/(mentor)/studio-soal/stimulus/baru/page.tsx"), /idKartuBaru=\{randomUUID\(\)\}/);
  });

  it("menyimpan lewat route yang sudah ada (tidak ada endpoint baru)", () => {
    const lib = baca("lib/shared/studio-soal/bacaanSoal.ts");
    assert.match(lib, /`\/api\/studio-soal\/stimulus\/\$\{opsi\.bacaan\.id\}`/);
    assert.match(lib, /`\/api\/studio-soal\/soal\/\$\{k\.id\}`/);
  });
});
