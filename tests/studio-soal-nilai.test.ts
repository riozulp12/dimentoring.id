/**
 * Test penilaian Studio Soal (lib/shared/studio-soal/nilaiJawaban.ts) dan
 * parser angka eksak (lib/shared/studio-soal/angka.ts) — modul murni.
 * Desain: docs/design/studio-soal-snbt-tahap1.md Bagian 5 (aturan isian final).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cocokRumpang, nilaiJawaban, type SoalUntukDinilai } from "@/lib/shared/studio-soal/nilaiJawaban";
import { dalamToleransi, parseAngka, samaPecahan } from "@/lib/shared/studio-soal/angka";

const PG: SoalUntukDinilai = {
  tipe: "pilihan_ganda",
  konten: { v: 1, opsi: ["3", "4", "5", "6", "7"].map((teks, i) => ({ label: "ABCDE"[i], teks })) },
  kunci: { v: 1, opsi: "C" },
};

const MAJEMUK: SoalUntukDinilai = {
  tipe: "majemuk_kompleks",
  konten: {
    v: 1,
    label_kolom: ["Benar", "Salah"],
    pernyataan: [
      { id: "p1", teks: "A" },
      { id: "p2", teks: "B" },
      { id: "p3", teks: "C" },
    ],
  },
  kunci: { v: 1, per_baris: { p1: 0, p2: 1, p3: 0 } },
};

function isianSoal(jenis: "teks" | "angka", diterima: string[], toleransi?: unknown): SoalUntukDinilai {
  return {
    tipe: "isian",
    konten: { v: 1, rumpang: [{ id: "r1", jenis }] },
    kunci: { v: 1, rumpang: { r1: { diterima, toleransi } } },
  };
}

const ISIAN_DUA: SoalUntukDinilai = {
  tipe: "isian",
  konten: { v: 1, rumpang: [{ id: "r1", jenis: "teks" }, { id: "r2", jenis: "angka" }] },
  kunci: { v: 1, rumpang: { r1: { diterima: ["Jakarta", "DKI Jakarta"] }, r2: { diterima: ["1/2"] } } },
};

const benar = (soal: SoalUntukDinilai, jawaban: unknown) => nilaiJawaban(soal, jawaban).benar;

describe("parseAngka (pecahan eksak)", () => {
  const sama = (a: string, b: string) => {
    const x = parseAngka(a);
    const y = parseAngka(b);
    return x !== null && y !== null && samaPecahan(x, y);
  };

  it("koma = titik desimal, .5 diterima (K5), pecahan setara", () => {
    assert.ok(sama("0,5", "0.5"));
    assert.ok(sama(".5", "0,5"));
    assert.ok(sama(",5", "1/2"));
    assert.ok(sama("2/4", "0.50"));
    assert.ok(sama("007", "7"));
    assert.ok(sama("+7", "7"));
    assert.ok(sama("-0,5", "−0,5")); // minus unicode
    assert.ok(sama(" 0 , 5 ", "0,5")); // spasi di sekitar pemisah diabaikan
    assert.ok(sama("1 / 2", "0,5"));
    assert.ok(sama("- 3", "-3"));
    assert.ok(sama("-3/4", "-0,75"));
    assert.ok(sama("0", "-0"));
  });

  it("bentuk yang tidak didukung → null", () => {
    for (const x of ["", " ", "-", ",", "5.", "1.000,5", "1,000.5", "1.2.3", "50%", "1 1/2", "1 000", "1 2", "1e3", "abc", "1/0", "3/-4", "1/2/3", "--1"]) {
      assert.equal(parseAngka(x), null, `"${x}" harus ditolak`);
    }
  });

  it("1.000 dibaca 1 (desimal, bukan seribu) — sesuai aturan tanpa pemisah ribuan", () => {
    assert.ok(sama("1.000", "1"));
    assert.ok(!sama("1.000", "1000"));
  });

  it("angka panjang tidak kehilangan presisi; input > 40 karakter ditolak", () => {
    assert.ok(sama("123456789012345678901234567890", "123456789012345678901234567890,0"));
    assert.ok(!sama("0,1000000000000000000001", "0,1"));
    assert.equal(parseAngka("1".repeat(41)), null);
  });

  it("menerima number JS berhingga, menolak NaN/Infinity/tipe lain", () => {
    assert.ok(parseAngka(0.25));
    assert.equal(parseAngka(Number.NaN), null);
    assert.equal(parseAngka(Number.POSITIVE_INFINITY), null);
    assert.equal(parseAngka(null), null);
    assert.equal(parseAngka({}), null);
  });

  it("dalamToleransi", () => {
    const p = (x: string) => parseAngka(x)!;
    assert.ok(dalamToleransi(p("3,1416"), p("3,14"), p("0,01")));
    assert.ok(dalamToleransi(p("3,13"), p("3,14"), p("0,01"))); // tepat di batas
    assert.ok(!dalamToleransi(p("3,1"), p("3,14"), p("0,01")));
    assert.ok(dalamToleransi(p("1/3"), p("0,333"), p("0,001")));
  });
});

describe("nilaiJawaban — pilihan ganda", () => {
  it("benar, salah, kosong, huruf kecil, bentuk rusak", () => {
    assert.ok(benar(PG, { opsi: "C" }));
    assert.ok(!benar(PG, { opsi: "B" }));
    assert.ok(!benar(PG, {}));
    assert.ok(!benar(PG, { opsi: "c" }));
    assert.ok(!benar(PG, null));
    assert.ok(!benar(PG, "C"));
    assert.ok(!benar(PG, { opsi: ["C"] }));
  });

  it("skor = bobot bila benar, 0 bila salah; bagian 'opsi'", () => {
    assert.deepEqual(nilaiJawaban(PG, { opsi: "C" }), { benar: true, skor: 1, bagian: [{ id: "opsi", benar: true }] });
    assert.equal(nilaiJawaban({ ...PG, bobot: "2.50" }, { opsi: "C" }).skor, 2.5);
    assert.equal(nilaiJawaban({ ...PG, bobot: 3 }, { opsi: "A" }).skor, 0);
  });
});

describe("nilaiJawaban — majemuk kompleks (semua baris harus benar)", () => {
  it("semua benar → benar", () => {
    assert.ok(benar(MAJEMUK, { per_baris: { p1: 0, p2: 1, p3: 0 } }));
  });

  it("satu baris salah / kosong → salah, dengan detail per baris", () => {
    const hasil = nilaiJawaban(MAJEMUK, { per_baris: { p1: 0, p2: 1, p3: 1 } });
    assert.equal(hasil.benar, false);
    assert.equal(hasil.skor, 0);
    assert.deepEqual(hasil.bagian, [
      { id: "p1", benar: true },
      { id: "p2", benar: true },
      { id: "p3", benar: false },
    ]);
    assert.ok(!benar(MAJEMUK, { per_baris: { p1: 0, p2: 1 } }));
    assert.ok(!benar(MAJEMUK, { per_baris: { p1: 0, p2: 1, p3: null } }));
  });

  it("id asing diabaikan; urutan kunci di objek tidak berpengaruh; '0' (string) bukan 0", () => {
    assert.ok(benar(MAJEMUK, { per_baris: { p3: 0, p2: 1, p1: 0, p9: 1 } }));
    assert.ok(!benar(MAJEMUK, { per_baris: { p1: "0", p2: 1, p3: 0 } }));
  });

  it("jawaban rusak → salah, tidak error", () => {
    assert.ok(!benar(MAJEMUK, null));
    assert.ok(!benar(MAJEMUK, { per_baris: [0, 1, 0] }));
  });
});

describe("nilaiJawaban — isian (semua rumpang harus benar)", () => {
  it("teks: tanpa beda huruf besar-kecil, spasi dirapikan, alternatif diterima", () => {
    const soal = isianSoal("teks", ["Jakarta", "DKI Jakarta"]);
    for (const j of ["Jakarta", "  jakarta ", "JAKARTA", "dki   jakarta", "DKI Jakarta"]) {
      assert.ok(benar(soal, { rumpang: { r1: j } }), `"${j}" harus benar`);
    }
    for (const j of ["Jakarta.", "Jkt", "", "   "]) {
      assert.ok(!benar(soal, { rumpang: { r1: j } }), `"${j}" harus salah`);
    }
  });

  it("angka: koma/titik, .5, pecahan setara, minus unicode", () => {
    const soal = isianSoal("angka", ["0,5"]);
    for (const j of ["0,5", "0.5", ".5", "1/2", "2/4", "0,50", " 0 , 5 "]) {
      assert.ok(benar(soal, { rumpang: { r1: j } }), `"${j}" harus benar`);
    }
    for (const j of ["5.", "0,05", "1.000,5", "50%", "setengah", ""]) {
      assert.ok(!benar(soal, { rumpang: { r1: j } }), `"${j}" harus salah`);
    }
    assert.ok(benar(isianSoal("angka", ["-3/4"]), { rumpang: { r1: "−0,75" } }));
  });

  it("angka dengan toleransi", () => {
    const soal = isianSoal("angka", ["3,14"], "0,01");
    assert.ok(benar(soal, { rumpang: { r1: "3,1416" } }));
    assert.ok(!benar(soal, { rumpang: { r1: "3,1" } }));
    assert.ok(benar(isianSoal("angka", ["3,14"], 0.01), { rumpang: { r1: "3.15" } }));
    // tanpa toleransi harus sama persis
    assert.ok(!benar(isianSoal("angka", ["3,14"]), { rumpang: { r1: "3,1416" } }));
  });

  it("multi-rumpang: semua benar → benar; satu salah → salah; detail per rumpang", () => {
    assert.ok(benar(ISIAN_DUA, { rumpang: { r1: "jakarta", r2: "0,5" } }));
    const hasil = nilaiJawaban(ISIAN_DUA, { rumpang: { r1: "jakarta", r2: "0,4" } });
    assert.equal(hasil.benar, false);
    assert.deepEqual(hasil.bagian, [
      { id: "r1", benar: true },
      { id: "r2", benar: false },
    ]);
    assert.ok(!benar(ISIAN_DUA, { rumpang: { r1: "jakarta" } }));
  });

  it("jawaban bukan teks / rumpang tanpa kunci → salah", () => {
    assert.ok(!benar(isianSoal("angka", ["7"]), { rumpang: { r1: 7 } }));
    const tanpaKunci: SoalUntukDinilai = { ...ISIAN_DUA, kunci: { v: 1, rumpang: { r1: { diterima: ["Jakarta"] } } } };
    assert.ok(!benar(tanpaKunci, { rumpang: { r1: "Jakarta", r2: "1/2" } }));
  });

  it("cocokRumpang langsung", () => {
    assert.ok(cocokRumpang("teks", "Ya", ["ya"]));
    assert.ok(!cocokRumpang("teks", "Ya", [42]));
    assert.ok(cocokRumpang("angka", "1/4", ["0,25"]));
    assert.ok(!cocokRumpang("angka", "x", ["0,25"]));
  });
});

describe("nilaiJawaban — pengaman", () => {
  it("soal tanpa bagian (data rusak) tidak pernah dianggap benar", () => {
    assert.ok(!benar({ tipe: "majemuk_kompleks", konten: { v: 1, pernyataan: [] }, kunci: { v: 1, per_baris: {} } }, { per_baris: {} }));
    assert.ok(!benar({ tipe: "isian", konten: { v: 1 }, kunci: { v: 1 } }, { rumpang: {} }));
    assert.ok(!benar({ ...PG, kunci: { v: 1 } }, { opsi: undefined }));
  });

  it("aturan_skor / tipe / bobot tidak dikenal → throw (kesalahan pemrogram)", () => {
    assert.throws(() => nilaiJawaban({ ...PG, aturan_skor: "parsial_per_bagian" }, { opsi: "C" }), /aturan_skor/);
    assert.throws(() => nilaiJawaban({ ...PG, tipe: "esai" }, {}), /tipe soal/);
    assert.throws(() => nilaiJawaban({ ...PG, bobot: 0 }, { opsi: "C" }), /bobot/);
    assert.throws(() => nilaiJawaban({ ...PG, bobot: "abc" }, { opsi: "C" }), /bobot/);
  });

  it("aturan_skor null/undefined = 'semua_benar'", () => {
    assert.ok(benar({ ...PG, aturan_skor: null }, { opsi: "C" }));
  });
});
