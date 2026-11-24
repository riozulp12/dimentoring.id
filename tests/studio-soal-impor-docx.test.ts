/**
 * Test unggah soal lewat Word (.docx): lib/shared/studio-soal/imporDocx.ts
 * (pengurai paragraf -> baris perantara, deteksi persamaan Word/gambar dari XML,
 * template) + lib/admin/docxZip.ts (ZIP minimal) + bukti bahwa hasil DOCX dan
 * CSV untuk soal yang sama menghasilkan keluaran susunImpor yang identik.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractRawText } from "mammoth";
import { bacaEntriZip, berawalanZip, buatDocx } from "@/lib/admin/docxZip";
import { KOLOM_BACAAN, KOLOM_SOAL, susunImpor, type SubtesImpor, type TopikImpor } from "@/lib/shared/studio-soal/impor";
import {
  cariObjekTerlarangDocx,
  paragrafDariTeksMentah,
  paragrafTemplateDocx,
  pesanObjekTerlarang,
  uraiParagrafDocx,
} from "@/lib/shared/studio-soal/imporDocx";

const PU: SubtesImpor = { id: "11111111-1111-4111-8111-111111111111", nama: "Penalaran Umum", kategori: "tps" };
const SUBTES = [PU];
const TOPIK: TopikImpor[] = [{ id: "44444444-4444-4444-8444-444444444444", subtes_id: PU.id, nama: "Logika Dasar" }];

/** Jalur lengkap tanpa berkas: paragraf -> uraiParagrafDocx -> susunImpor. */
function dariParagraf(paragraf: string[]) {
  const urai = uraiParagrafDocx(paragraf);
  return susunImpor({
    soalCsv: "",
    soalBaris: urai.soalBaris,
    bacaanBaris: urai.bacaanBaris,
    galatTambahan: urai.catatan,
    subtes: SUBTES,
    topik: TOPIK,
  });
}

const soalPg = (n: number, ekstra: string[] = []): string[] => [
  "#SOAL",
  "Subtes: Penalaran Umum",
  "Jenis: PG",
  ...ekstra,
  `Soal: Berapakah \\(${n}+1\\)?`,
  "A. 1",
  "B. 2",
  "C. 3",
  "D. 4",
  "E. 5",
  "Kunci: C",
  `Pembahasan: Hasilnya ${n + 1}, jadi pilihan yang benar adalah C.`,
];

describe("DOCX — pengurai blok", () => {
  it("bacaan + soal berbacaan + soal mandiri: baris perantara dan susunImpor tanpa galat", () => {
    const h = dariParagraf([
      "#BACAAN kode=B1",
      "Subtes: Penalaran Umum",
      "Sumber: Koran Hari Ini",
      "Paragraf satu bacaan.",
      "Paragraf dua bacaan.",
      ...soalPg(1, ["Bacaan: B1", "Kesulitan: HOTS", "Level: 2", "Waktu: 90 detik"]),
      ...soalPg(2),
    ]);
    assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
    assert.equal(h.soal.length, 2);
    assert.equal(h.stimulus.length, 1);
    assert.equal(h.stimulus[0].sumber_rujukan, "Koran Hari Ini");
    assert.equal(h.stimulus[0].konten.blok[0].teks, "Paragraf satu bacaan.\n\nParagraf dua bacaan.");
    assert.deepEqual([h.soal[0].stimulus_kode, h.soal[0].urutan_dalam_stimulus], ["b1", 1]);
    assert.equal(h.soal[0].tingkat_kesulitan, "hots");
    assert.equal(h.soal[0].level_kognitif, 2);
    assert.equal(h.soal[0].estimasi_waktu_detik, 90);
    assert.equal(h.soal[1].stimulus_kode, null);
    assert.equal(h.soal[1].redaksi, "Berapakah \\(2+1\\)?");
  });

  it("tahan nomor di depan, huruf besar/kecil label, dan spasi berlebih", () => {
    const h = dariParagraf([
      "  1.  #SOAL  ",
      "  SUBTES :   penalaran   umum ",
      "jenis:  pg",
      "2. Soal:   1. Berapakah \\(2+2\\)?",
      "Lanjutan soal paragraf kedua.",
      " a) 3 ",
      "B.   4",
      "c. 5",
      "D.  6",
      "e)  7",
      "  KUNCI  :  b. ",
      "pembahasan : Dua ditambah dua sama dengan empat.",
      "Paragraf kedua pembahasan.",
    ]);
    assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
    assert.equal(h.soal.length, 1);
    const s = h.soal[0];
    assert.equal(s.redaksi, "Berapakah \\(2+2\\)?\n\nLanjutan soal paragraf kedua.");
    assert.equal(s.kunci.opsi, "B");
    assert.equal((s.konten.opsi as { teks: string }[])[0].teks, "3");
    assert.equal(s.pembahasan, "Dua ditambah dua sama dengan empat.\n\nParagraf kedua pembahasan.");
    assert.equal(s.subtes_id, PU.id);
  });

  it("isian: jawaban dipisah |, penanda {{r1}} ditambahkan, jenis angka terdeteksi", () => {
    const h = dariParagraf([
      "#SOAL",
      "Subtes: Penalaran Umum",
      "Jenis: Isian",
      "Soal: Ibu kota Indonesia adalah",
      "Kunci: Jakarta | DKI Jakarta",
      "Pembahasan: Ibu kota negara saat ini adalah Jakarta.",
      "#SOAL",
      "Subtes: Penalaran Umum",
      "Jenis: isian",
      "Soal: Hasil \\(2+3\\) adalah",
      "Kunci: 5",
      "Pembahasan: Dua ditambah tiga sama dengan lima.",
    ]);
    assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
    assert.deepEqual((h.soal[0].kunci.rumpang as Record<string, { diterima: string[] }>).r1.diterima, ["Jakarta", "DKI Jakarta"]);
    assert.deepEqual(h.soal[0].konten.rumpang, [{ id: "r1", jenis: "teks" }]);
    assert.deepEqual(h.soal[1].konten.rumpang, [{ id: "r1", jenis: "angka" }]);
  });

  it("galat disertai nomor soal (baris = N+1) dan label: bacaan tak dikenal, kunci di luar A–E", () => {
    const h = dariParagraf([
      ...soalPg(1),
      ...soalPg(2, ["Bacaan: ZZ"]),
      ...soalPg(3).map((l) => (l === "Kunci: C" ? "Kunci: F" : l)),
    ]);
    assert.equal(h.soal.length, 1);
    assert.equal(h.galat.some((g) => g.baris === 3 && g.kolom === "kode_bacaan"), true, "soal ke-2: bacaan tak dikenal");
    assert.equal(h.galat.some((g) => g.baris === 4 && g.kolom === "kunci"), true, "soal ke-3: kunci F");
    assert.equal(h.pratinjau.map((p) => p.status).join(","), "ok,galat,galat");
  });

  it("kunci menunjuk pilihan yang tidak ada dan pilihan kurang = galat di kolom pilihan", () => {
    const tanpaE = soalPg(1).filter((l) => l !== "E. 5").map((l) => (l === "Kunci: C" ? "Kunci: E" : l));
    const h = dariParagraf(tanpaE);
    assert.equal(h.soal.length, 0);
    assert.equal(h.galat.some((g) => g.baris === 2 && g.kolom === "opsi_e"), true);
    const tanpaBC = dariParagraf(soalPg(1).filter((l) => l !== "B. 2" && l !== "C. 3"));
    assert.equal(tanpaBC.galat.some((g) => g.kolom === "opsi_b"), true);
    assert.equal(tanpaBC.galat.some((g) => g.kolom === "opsi_c"), true);
  });

  it("label ganda dan pilihan ganda dua kali dilaporkan, soalnya tidak ikut tersimpan", () => {
    const h = dariParagraf(soalPg(1, ["Subtes: Penalaran Umum"]));
    assert.equal(h.galat.some((g) => g.baris === 2 && /lebih dari sekali/.test(g.pesan)), true);
    const dobel = dariParagraf(soalPg(1).flatMap((l) => (l === "B. 2" ? [l, "B. 22"] : [l])));
    assert.equal(dobel.galat.some((g) => g.kolom === "opsi_b" && /dua kali|lebih dari sekali/.test(g.pesan)), true);
    assert.equal(dobel.soal.length, 0);
  });

  it("jenis/subtes tak dikenal dan teks sebelum penanda pertama", () => {
    const h = dariParagraf(["Judul dokumen", ...soalPg(1).map((l) => (l === "Jenis: PG" ? "Jenis: Esai" : l))]);
    assert.equal(h.galat.some((g) => g.baris === 2 && g.kolom === "tipe"), true);
    assert.equal(h.peringatan.some((p) => p.baris === 0 && /sebelum penanda/.test(p.pesan)), true);
    const tanpaSubtes = dariParagraf(soalPg(1).filter((l) => !l.startsWith("Subtes")));
    assert.equal(tanpaSubtes.galat.some((g) => g.kolom === "subtes"), true);
  });

  it("berkas tanpa #SOAL = galat tingkat berkas", () => {
    const h = dariParagraf(["Hanya teks biasa"]);
    assert.equal(h.soal.length, 0);
    assert.equal(h.galat.some((g) => g.baris === 0), true);
  });

  it("rumus rusak ditolak oleh cekRumus yang sama dengan jalur CSV", () => {
    const h = dariParagraf(soalPg(1).map((l) => (l.startsWith("Soal:") ? "Soal: Hitung \\(\\frac{1}{\\)" : l)));
    assert.equal(h.galat.some((g) => g.kolom === "redaksi"), true);
  });

  it("batas 300 soal per berkas: 300 lolos, 301 ditolak", () => {
    const buat = (n: number) => Array.from({ length: n }, (_, i) => soalPg(i + 1)).flat();
    const ok = dariParagraf(buat(300));
    assert.equal(ok.galat.length, 0);
    assert.equal(ok.soal.length, 300);
    const lebih = dariParagraf(buat(301));
    assert.equal(lebih.galat.some((g) => g.baris === 0 && /Maksimal 300/.test(g.pesan)), true);
  });
});

describe("DOCX — persamaan Word dan gambar ditolak, bukan dibuang diam-diam", () => {
  const p = (teks: string) => `<w:p><w:r><w:t xml:space="preserve">${teks}</w:t></w:r></w:p>`;

  it("persamaan Word (m:oMath) dilaporkan di soal terdekat", () => {
    const xml =
      `<w:document><w:body>${p("#BACAAN kode=B1")}${p("#SOAL")}${p("#SOAL")}` +
      `<w:p><w:r><w:t>Soal: hitung</w:t></w:r><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:p>${p("#SOAL")}</w:body></w:document>`;
    const t = cariObjekTerlarangDocx(xml);
    assert.deepEqual(t, [{ jenis: "persamaan", konteks: "soal", nomor: 2 }]);
    assert.match(pesanObjekTerlarang(t)[0], /persamaan Word.*soal ke-2/);
    assert.match(pesanObjekTerlarang(t)[0], /\\\(/);
  });

  it("paragraf persamaan (m:oMathPara) dan gambar (w:drawing, w:pict) di bacaan", () => {
    const xml =
      `<w:body>${p("#BACAAN kode=B1")}<w:p><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p>` +
      `${p("#BACAAN kode=B2")}<w:p><w:r><w:pict/></w:r></w:p><m:oMathPara><m:oMath/></m:oMathPara></w:body>`;
    const t = cariObjekTerlarangDocx(xml);
    assert.deepEqual(
      t.map((x) => `${x.jenis}:${x.konteks}:${x.nomor}`),
      ["gambar:bacaan:1", "gambar:bacaan:2", "persamaan:bacaan:2"],
    );
    assert.match(pesanObjekTerlarang(t)[0], /gambar di bacaan ke-1/);
  });

  it("objek sebelum penanda pertama menyebut 'sebelum soal pertama'; dokumen bersih = tidak ada temuan", () => {
    const t = cariObjekTerlarangDocx(`<w:body><w:p><w:r><w:drawing/></w:r></w:p>${p("#SOAL")}</w:body>`);
    assert.equal(t[0].konteks, "awal");
    assert.match(pesanObjekTerlarang(t)[0], /sebelum soal pertama/);
    assert.deepEqual(cariObjekTerlarangDocx(`<w:body>${p("#SOAL")}${p("Soal: biasa \\(x\\)")}</w:body>`), []);
  });

  it("penanda dengan nomor di depan atau entitas XML tetap terhitung", () => {
    const xml = `<w:body>${p("1. #SOAL")}${p("2.&#160;#SOAL")}<w:p><w:r><w:t>a &amp; b</w:t></w:r><m:oMath/></w:p></w:body>`;
    assert.deepEqual(cariObjekTerlarangDocx(xml).map((x) => x.nomor), [2]);
  });
});

describe("DOCX — berkas nyata (ZIP + mammoth)", () => {
  it("template Word: ZIP valid, bersih dari objek terlarang, lolos validasi, 1 bacaan + 2 soal", async () => {
    const buffer = buatDocx(paragrafTemplateDocx());
    assert.equal(berawalanZip(buffer), true);
    assert.equal(berawalanZip(Buffer.from("%PDF-1.7")), false);
    const xml = bacaEntriZip(buffer, "word/document.xml");
    assert.ok(xml && xml.includes("#BACAAN"));
    assert.equal(bacaEntriZip(buffer, "tidak/ada.xml"), null);
    assert.deepEqual(cariObjekTerlarangDocx(xml ?? ""), []);

    const mentah = (await extractRawText({ buffer })).value;
    const paragraf = paragrafDariTeksMentah(mentah);
    assert.equal(paragraf[0], "#BACAAN kode=B1");
    const h = dariParagraf(paragraf);
    assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
    assert.equal(h.soal.length, 2);
    assert.equal(h.stimulus.length, 1);
    assert.equal(h.soal.some((s) => s.stimulus_kode === "b1"), true);
  });

  it("berkas ZIP rusak atau terpotong tidak melempar error", () => {
    const buffer = buatDocx(["#SOAL"]);
    assert.equal(bacaEntriZip(buffer.subarray(0, 20), "word/document.xml"), null);
    assert.equal(bacaEntriZip(Buffer.from("PK\x03\x04bukan zip sungguhan"), "word/document.xml"), null);
  });
});

describe("DOCX vs CSV — keluaran susunImpor identik untuk soal yang sama", () => {
  it("bacaan + 2 soal (PG berbacaan, isian) dari Word dan dari CSV", () => {
    const paragraf = [
      "#BACAAN kode=B1",
      "Subtes: Penalaran Umum",
      "Sumber: Koran Hari Ini",
      "Banjir kembali merendam kota.",
      "#SOAL",
      "Subtes: Penalaran Umum",
      "Topik: Logika Dasar",
      "Jenis: PG",
      "Kesulitan: hots",
      "Level: 3",
      "Waktu: 120",
      "Bacaan: B1",
      "Soal: Apa gagasan utamanya?",
      "A. Hujan",
      "B. Banjir",
      "C. Kemarau",
      "D. Angin",
      "E. Gempa",
      "Kunci: B",
      "Pembahasan: Bacaan membahas banjir yang merendam kota.",
      "#SOAL",
      "Subtes: Penalaran Umum",
      "Jenis: Isian",
      "Soal: Hasil \\(2+3\\) adalah",
      "Kunci: 5",
      "Pembahasan: Dua ditambah tiga sama dengan lima.",
    ];
    const dariDocx = dariParagraf(paragraf);

    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const barisCsv = [
      [
        "Penalaran Umum", "Logika Dasar", "pilihan_ganda", "Apa gagasan utamanya?", "Hujan", "Banjir", "Kemarau", "Angin", "Gempa", "B",
        "Bacaan membahas banjir yang merendam kota.", "hots", "3", "120", "", "B1", "",
      ],
      [
        "Penalaran Umum", "", "isian", "Hasil \\(2+3\\) adalah", "", "", "", "", "", "5",
        "Dua ditambah tiga sama dengan lima.", "", "", "", "", "", "",
      ],
    ];
    const soalCsv = [KOLOM_SOAL.join(","), ...barisCsv.map((r) => r.map(q).join(","))].join("\n");
    const bacaanCsv = [KOLOM_BACAAN.join(","), ["B1", "Penalaran Umum", "Banjir kembali merendam kota.", "Koran Hari Ini"].map(q).join(",")].join("\n");
    const dariCsv = susunImpor({ soalCsv, bacaanCsv, subtes: SUBTES, topik: TOPIK });

    assert.equal(dariDocx.galat.length, 0, JSON.stringify(dariDocx.galat));
    assert.deepEqual(dariDocx.soal, dariCsv.soal);
    assert.deepEqual(dariDocx.stimulus, dariCsv.stimulus);
    assert.deepEqual(dariDocx.galat, dariCsv.galat);
    assert.deepEqual(dariDocx.peringatan, dariCsv.peringatan);
    assert.deepEqual(dariDocx.ringkasan, dariCsv.ringkasan);
    assert.deepEqual(dariDocx.pratinjau, dariCsv.pratinjau);
  });
});
