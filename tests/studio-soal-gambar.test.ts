/**
 * Gambar pada unggah Word — fondasi: pembacaan header gambar, pengurai (urutan,
 * relasi, penolakan, batas), validator penanda & blok gambar, serta rute unggah
 * lewat Storage (Supabase tiruan). Aturan database di
 * db/test_studio_soal_media_DRYRUN.sql.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { olahDocx } from "@/lib/admin/docxIsi";
import { BATAS_GAMBAR, bacaInfoGambar, mediaDariKonten } from "@/lib/shared/studio-soal/gambar";
import { rapikanKontenKunci, rapikanKontenStimulus, penandaDiRedaksi } from "@/lib/shared/studio-soal/formSoal";
import { susunImpor, type HasilImpor, type SubtesImpor } from "@/lib/shared/studio-soal/impor";
import { validasiSoal, validasiStimulus } from "@/lib/shared/studio-soal/validasi";
import { docxBergambar, drawing, jpeg, par, parGambar, png, run, webp, type BerkasMedia, type OpsiGambar } from "./bantuan/docxGambar";
import { ADMIN, ADMIN_NONAKTIF, SISWA, db, pasangDbTiruan, penyimpanan, resetDbTiruan, rpc, u, type Row } from "./bantuan/dbTiruanSoal";

const PU: SubtesImpor = { id: u(101), nama: "Penalaran Umum", kategori: "tps" };
const m = (rId: string, data: Buffer = png(), nama = `${rId}.png`): BerkasMedia => ({ rId, nama, data });
const awalSoal = [par("#SOAL"), par("Subtes: Penalaran Umum"), par("Jenis: PG")];
const OPSI = ["A. 1", "B. 2", "C. 3", "D. 4", "E. 5"].map(par);
const AKHIR = [par("Kunci: C"), par("Pembahasan: Jawabannya tiga karena begitu.")];
const soalXml = (sebelumOpsi: string[] = [], sesudah: string[] = []) =>
  [...awalSoal, par("Soal: Perhatikan gambar."), ...sebelumOpsi, ...OPSI, ...AKHIR, ...sesudah].join("");

async function olah(buffer: Buffer) {
  const r = await olahDocx(buffer);
  if (!r.ok) assert.fail(r.error);
  return { ...r, hasil: susunImpor({ soalCsv: "", ...r.masukan, subtes: [PU], topik: [] }) };
}
async function ditolak(body: string, media: BerkasMedia[]): Promise<string> {
  const r = await olahDocx(docxBergambar(body, media));
  if (r.ok) assert.fail("berkas seharusnya ditolak");
  return r.error;
}
const bersih = (h: HasilImpor) => assert.equal(h.galat.length, 0, JSON.stringify(h.galat));

describe("header gambar (magic bytes & dimensi)", () => {
  it("PNG, JPEG, WebP (tiga ragam) dikenali dari byte awal", () => {
    for (const [data, mime, lebar, tinggi] of [
      [png(640, 480), "image/png", 640, 480],
      [jpeg(1200, 800), "image/jpeg", 1200, 800],
      [webp(300, 200, "VP8 "), "image/webp", 300, 200],
      [webp(301, 201, "VP8L"), "image/webp", 301, 201],
      [webp(2400, 5, "VP8X"), "image/webp", 2400, 5],
    ] as const) {
      const i = bacaInfoGambar(data);
      assert.deepEqual(i.ok && [i.mime, i.lebar, i.tinggi], [mime, lebar, tinggi]);
    }
  });

  it("format lain disebut namanya; berkas terpotong = rusak", () => {
    const emf = Buffer.alloc(48);
    emf.writeUInt32LE(1, 0);
    emf.write(" EMF", 40);
    for (const [data, nama] of [
      [Buffer.from("GIF89a......"), "GIF"],
      [Buffer.from("BM.........."), "BMP"],
      [Buffer.from([0x49, 0x49, 0x2a, 0, 0, 0, 0, 0]), "TIFF"],
      [emf, "EMF"],
      [Buffer.from([0xd7, 0xcd, 0xc6, 0x9a, 0, 0]), "WMF"],
      [Buffer.from('<?xml version="1.0"?><svg/>'), "SVG"],
    ] as const) {
      const i = bacaInfoGambar(data);
      assert.deepEqual(!i.ok && i.alasan === "format" && [i.alasan, i.format], ["format", nama]);
    }
    for (const data of [png().subarray(0, 14), Buffer.from([0xff, 0xd8, 0xff, 0xd9]), png(0, 5)]) {
      const i = bacaInfoGambar(data);
      assert.equal(!i.ok && i.alasan, "rusak");
    }
  });
});

describe("pengurai Word bergambar", () => {
  it("urutan gambar terhadap paragraf: penanda di redaksi & pembahasan sesuai posisi", async () => {
    const xml = [
      ...awalSoal,
      par("Soal: Perhatikan."),
      parGambar("rId3", { alt: "Grafik satu" }),
      `<w:p>${run('<w:t xml:space="preserve">Bandingkan </w:t>')}${run(drawing("rId2", { alt: "Dua" }))}${run('<w:t xml:space="preserve"> dengan teks.</w:t>')}</w:p>`,
      ...OPSI,
      par("Kunci: C"),
      par("Pembahasan: Lihat diagram berikut."),
      parGambar("rId4", { alt: "Tiga" }),
      par("Selesai."),
    ].join("");
    const r = await olah(docxBergambar(xml, [m("rId2", png(22, 2)), m("rId3", jpeg(33, 3), "a.jpg"), m("rId4", webp(44, 4, "VP8 "), "b.webp")]));
    bersih(r.hasil);
    const s = r.hasil.soal[0];
    assert.equal(s.redaksi, "Perhatikan.\n\n{{g1}}\n\nBandingkan {{g2}} dengan teks.");
    assert.equal(s.pembahasan, "Lihat diagram berikut.\n\n{{g3}}\n\nSelesai.");
    const entri = s.konten.gambar as { kode: string; media_id: string; alt: string }[];
    assert.deepEqual(entri.map((g) => [g.kode, g.alt]), [["g1", "Grafik satu"], ["g2", "Dua"], ["g3", "Tiga"]]);
    // Relasi: tiap entri menunjuk byte yang benar.
    const lebar = entri.map((g) => r.media.find((x) => x.media_id === g.media_id)?.lebar);
    assert.deepEqual(lebar, [33, 22, 44]);
    assert.equal(new Set(entri.map((g) => g.media_id)).size, 3);
    assert.deepEqual(validasiSoal({ ...s, subtes_kategori: "tps", stimulus_id: null }, "ajukan"), []);
    assert.equal(r.hasil.pratinjau[0].jumlahGambar, 3);
    assert.equal(r.hasil.ringkasan.jumlahGambar, 3);
  });

  it("di #BACAAN menjadi blok gambar berurutan, termasuk di tengah paragraf", async () => {
    const xml = [
      par("#BACAAN kode=B1"),
      par("Subtes: Penalaran Umum"),
      par("Awal."),
      parGambar("rId2", { alt: "Peta" }),
      `<w:p>${run("<w:t>Tengah</w:t>")}${run(drawing("rId3", { alt: "Foto" }))}${run("<w:t>akhir</w:t>")}</w:p>`,
      ...awalSoal,
      par("Bacaan: B1"),
      par("Soal: Apa?"),
      ...OPSI,
      ...AKHIR,
    ].join("");
    const r = await olah(docxBergambar(xml, [m("rId2"), m("rId3")]));
    bersih(r.hasil);
    const blok = r.hasil.stimulus[0].konten.blok;
    assert.deepEqual(
      blok.map((b) => (b.jenis === "gambar" ? `gambar:${b.alt}` : b.jenis === "teks" ? b.teks : b.jenis)),
      ["Awal.", "gambar:Peta", "Tengah", "gambar:Foto", "akhir"],
    );
    assert.deepEqual(validasiStimulus(r.hasil.stimulus[0], "ajukan"), []);
    assert.deepEqual(r.hasil.gambarBacaan, [{ baris: 2, kode: "B1", jumlah: 2 }]);
    assert.equal(mediaDariKonten(r.hasil.stimulus[0].konten).length, 2);
  });

  it("teks alternatif kosong memakai 'Gambar soal' dengan peringatan, bukan galat", async () => {
    const r = await olah(docxBergambar(soalXml([parGambar("rId2")]), [m("rId2")]));
    bersih(r.hasil);
    assert.equal((r.hasil.soal[0].konten.gambar as { alt: string }[])[0].alt, "Gambar soal");
    assert.equal(r.hasil.peringatan.some((p) => p.baris === 2 && /teks alternatif/.test(p.pesan)), true);
    assert.equal(r.hasil.pratinjau[0].status, "peringatan");
  });

  it("isian dengan gambar: {{r1}} tetap ditambahkan, penanda gambar tidak dianggap kotak jawaban", async () => {
    const xml = [par("#SOAL"), par("Subtes: Penalaran Umum"), par("Jenis: Isian"), par("Soal: Hitung."), parGambar("rId2", { alt: "x" }), par("Kunci: 5"), par("Pembahasan: Hasilnya lima.")].join("");
    const r = await olah(docxBergambar(xml, [m("rId2")]));
    bersih(r.hasil);
    assert.equal(r.hasil.soal[0].redaksi, "Hitung.\n\n{{g1}} {{r1}}");
    assert.deepEqual(r.hasil.soal[0].konten.rumpang, [{ id: "r1", jenis: "angka" }]);
  });

  it("Word tanpa gambar tidak mendapat kunci gambar apa pun", async () => {
    const r = await olah(docxBergambar(soalXml(), []));
    bersih(r.hasil);
    assert.equal("gambar" in r.hasil.soal[0].konten, false);
    assert.deepEqual([r.media, r.hasil.gambarBacaan, r.hasil.ringkasan.jumlahGambar], [[], [], 0]);
  });

  it("lebih dari 5 gambar per soal = galat soal itu", async () => {
    const r = await olah(docxBergambar(soalXml(Array.from({ length: 6 }, () => parGambar("rId2", { alt: "x" }))), [m("rId2")]));
    assert.equal(r.hasil.soal.length, 0);
    assert.equal(r.hasil.galat.some((g) => g.baris === 2 && /maksimal 5/.test(g.pesan)), true, JSON.stringify(r.hasil.galat));
  });
});

describe("penolakan seluruh berkas, menyebut soal/bacaan terdekat", () => {
  const satu = (o: OpsiGambar) => ditolak(soalXml([parGambar("rId2", o)]), [m("rId2")]);

  it("gambar mengambang", async () => {
    assert.match(await satu({ letak: "anchor" }), /mengambang.*soal ke-1.*In line with text/);
  });
  it("grafik Word, SmartArt, bentuk/kotak teks, pembungkus AlternateContent", async () => {
    for (const isi of [
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId2"/></a:graphicData>',
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds r:dm="rId2"/></a:graphicData>',
      '<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp/></a:graphicData>',
    ]) {
      assert.match(await satu({ isi }), /bentuk, kotak teks, SmartArt, atau grafik Word.*soal ke-1/);
    }
    const bungkus = `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps">${drawing("rId2")}</mc:Choice><mc:Fallback/></mc:AlternateContent></w:r></w:p>`;
    assert.match(await ditolak(soalXml([bungkus]), [m("rId2")]), /bentuk, kotak teks.*soal ke-1/);
  });
  it("SVG, gambar tertaut, relasi hilang/luar/menyimpang", async () => {
    assert.match(await satu({ svg: true }), /SVG.*soal ke-1.*PNG atau JPEG/);
    assert.match(await satu({ tautan: true }), /tautan.*soal ke-1/);
    assert.match(await ditolak(soalXml([parGambar("rId9")]), []), /soal ke-1.*tidak bisa dibaca/);
    assert.match(await ditolak(soalXml([parGambar("rId2")]), [{ ...m("rId2"), luar: true, target: "https://x.test/a.png" }]), /tautan|tidak bisa dibaca/);
    assert.match(await ditolak(soalXml([parGambar("rId2")]), [{ ...m("rId2"), target: "../../rahasia.png" }]), /tidak bisa dibaca/);
  });
  it("format ditentukan dari byte, bukan ekstensi", async () => {
    const pesan = await ditolak(soalXml([parGambar("rId2")]), [m("rId2", Buffer.from("GIF89a......"), "menipu.png")]);
    assert.match(pesan, /GIF.*soal ke-1.*tempel ulang sebagai PNG atau JPEG/);
    const lolos = await olah(docxBergambar(soalXml([parGambar("rId2", { alt: "x" })]), [m("rId2", png(), "nama.gif")]));
    assert.equal(lolos.media[0].mime, "image/png");
  });
  it("batas 2 MB, 2400 px, dan 60 gambar per berkas", async () => {
    assert.match(await ditolak(soalXml([parGambar("rId2")]), [m("rId2", png(10, 10, BATAS_GAMBAR.byte))]), /soal ke-1.*2 MB/);
    for (const [w, h] of [[2401, 10], [10, 2401]]) {
      assert.match(await ditolak(soalXml([parGambar("rId2")]), [m("rId2", png(w, h))]), /soal ke-1.*2400/);
    }
    await olah(docxBergambar(soalXml([parGambar("rId2")]), [m("rId2", png(2400, 2400))]));
    const banyak = (n: number) => [par("#BACAAN kode=B1"), ...Array.from({ length: n }, () => parGambar("rId2")), soalXml()].join("");
    assert.match(await ditolak(banyak(61), [m("rId2")]), /lebih dari 60 gambar/);
    await olah(docxBergambar(banyak(60), [m("rId2")]));
  });
  it("gambar di tabel, sebelum soal pertama, dan di baris penanda", async () => {
    const tabel = `<w:tbl><w:tr><w:tc>${parGambar("rId2")}</w:tc></w:tr><w:tr><w:tc>${par("1")}</w:tc></w:tr></w:tbl>`;
    assert.match(await ditolak(par("#BACAAN kode=B1") + tabel + soalXml(), [m("rId2")]), /gambar di sel tabel bacaan ke-1/);
    assert.match(await ditolak(parGambar("rId2") + soalXml(), [m("rId2")]), /sebelum soal pertama/);
    const penanda = `<w:p>${run("<w:t>#SOAL </w:t>")}${run(drawing("rId2"))}</w:p>`;
    assert.match(await ditolak(penanda + soalXml(), [m("rId2")]), /baris penanda/);
  });
  const diTempat: [string, string[], RegExp][] = [
    ["pilihan (satu paragraf)", [...OPSI.slice(0, 2), `<w:p>${run("<w:t>C. </w:t>")}${run(drawing("rId2"))}</w:p>`, ...OPSI.slice(3), ...AKHIR], /pilihan jawaban.*soal ke-1/],
    ["pilihan (paragraf lanjutan)", [...OPSI, parGambar("rId2"), ...AKHIR], /pilihan jawaban.*soal ke-1/],
    ["gambar mendahului label pilihan", [OPSI[0], `<w:p>${run(drawing("rId2"))}${run("<w:t>B. 2</w:t>")}</w:p>`, ...OPSI.slice(2), ...AKHIR], /pilihan jawaban.*soal ke-1/],
    ["kunci", [...OPSI, par("Kunci: C"), parGambar("rId2"), AKHIR[1]], /Kunci.*soal ke-1/],
  ];
  for (const [nama, sisa, pola] of diTempat) {
    it(`gambar di ${nama}`, async () => {
      assert.match(await ditolak([...awalSoal, par("Soal: x"), ...sisa].join(""), [m("rId2")]), pola);
    });
  }
  it("gambar di pernyataan majemuk, di label, dan sebelum baris Soal:", async () => {
    const maj = [par("#SOAL"), par("Jenis: Majemuk"), par("Soal: x"), par("P1. satu"), parGambar("rId2"), par("P2. dua"), par("Kunci: P1=Benar, P2=Salah")].join("");
    assert.match(await ditolak(maj, [m("rId2")]), /pernyataan.*soal ke-1/);
    assert.match(await ditolak([...awalSoal, parGambar("rId2"), par("Soal: x")].join(""), [m("rId2")]), /sesudah baris Soal:.*soal ke-1|soal ke-1.*sesudah baris Soal:/);
    const label = `<w:p>${run("<w:t>Subtes: PU </w:t>")}${run(drawing("rId2"))}</w:p>`;
    assert.match(await ditolak(par("#SOAL") + label, [m("rId2")]), /soal ke-1/);
  });
  it("persamaan Word tetap ditolak", async () => {
    assert.match(await ditolak(soalXml(["<w:p><m:oMath/></w:p>"]), []), /persamaan Word/);
  });
});

describe("validator penanda & blok gambar", () => {
  const M1 = u(901);
  const entri = (kode: string, ubah: Row = {}) => ({ kode, media_id: M1, alt: "Grafik", ...ubah });
  const soal = (ubah: { redaksi?: string; pembahasan?: string; konten?: Row; kunci?: Row; tipe?: string } = {}) => ({
    tipe: ubah.tipe ?? "pilihan_ganda",
    redaksi: ubah.redaksi ?? "Lihat {{g1}}.",
    pembahasan: ubah.pembahasan ?? "Penjelasan yang cukup panjang.",
    konten: { v: 1, opsi: ["A", "B", "C", "D", "E"].map((label) => ({ label, teks: label })), gambar: [entri("g1")], ...ubah.konten },
    kunci: ubah.kunci ?? { v: 1, opsi: "A" },
    tingkat_kesulitan: "sedang",
  });
  const pesan = (s: unknown, mode: "draf" | "ajukan" = "draf") => validasiSoal(s, mode).map((e) => `${e.field}: ${e.pesan}`).join(" | ");

  it("lengkap = tanpa galat, penanda boleh di pembahasan", () => {
    assert.equal(pesan(soal(), "ajukan"), "");
    assert.equal(pesan(soal({ redaksi: "Teks.", pembahasan: "Penjelasan {{g1}} yang panjang." }), "ajukan"), "");
  });
  it("penanda hilang, ganda, tanpa entri — juga saat simpan draf", () => {
    assert.match(pesan(soal({ redaksi: "Tanpa tanda." })), /g1.*hilang/);
    assert.match(pesan(soal({ pembahasan: "Penjelasan {{g1}} lagi." })), /\{\{g1\}\} muncul 2 kali/);
    assert.match(pesan(soal({ redaksi: "{{g1}} {{g2}}" })), /\{\{g2\}\} tidak punya gambar/);
    assert.match(pesan(soal({ redaksi: "{{g1}}", konten: { gambar: undefined } })), /\{\{g1\}\} tidak punya gambar/);
  });
  it("entri: kode, media_id uuid, alt, unik, maksimal 5, bentuk daftar", () => {
    assert.match(pesan(soal({ konten: { gambar: [entri("g1", { media_id: "x/y.png" })] } })), /konten\.gambar\.0\.media_id/);
    assert.match(pesan(soal({ konten: { gambar: [entri("gambar1")] } })), /konten\.gambar\.0\.kode/);
    assert.match(pesan(soal({ konten: { gambar: [entri("g1", { alt: " " })] } })), /konten\.gambar\.0\.alt/);
    assert.match(pesan(soal({ konten: { gambar: [entri("g1"), entri("g1")] } })), /dipakai lebih dari sekali/);
    const enam = [1, 2, 3, 4, 5, 6].map((n) => entri(`g${n}`));
    assert.match(pesan(soal({ redaksi: enam.map((g) => `{{${g.kode}}}`).join(" "), konten: { gambar: enam } })), /maksimal 5/);
    assert.match(pesan(soal({ konten: { gambar: "x" } })), /konten\.gambar/);
  });
  it("gambar di pilihan dan pernyataan belum didukung", () => {
    const opsi = ["A", "B", "C", "D", "E"].map((label) => ({ label, teks: label === "B" ? "{{g1}}" : label }));
    assert.match(pesan(soal({ konten: { opsi } })), /konten\.opsi\.1\.teks.*belum didukung/);
  });
  it("isian: penanda gambar bukan kotak jawaban; kotak lama bernama g1 tetap sah", () => {
    const isian = soal({ tipe: "isian", redaksi: "{{g1}} hasil {{r1}}", konten: { rumpang: [{ id: "r1", jenis: "angka" }] }, kunci: { v: 1, rumpang: { r1: { diterima: ["5"] } } } });
    assert.equal(pesan(isian, "ajukan"), "");
    const lama = soal({ tipe: "isian", redaksi: "hasil {{g1}}", konten: { rumpang: [{ id: "g1", jenis: "angka" }], gambar: undefined }, kunci: { v: 1, rumpang: { g1: { diterima: ["5"] } } } });
    assert.equal(pesan(lama, "ajukan"), "");
    assert.deepEqual(penandaDiRedaksi("{{g1}} {{r1}}"), ["r1"]);
  });
  it("blok gambar bacaan: sah dengan media uuid & alt; selain itu ditolak", () => {
    const st = (blok: Row) => validasiStimulus({ judul_internal: "Bacaan", sumber_rujukan: "Buatan sendiri", konten: { v: 1, blok: [blok] } }, "draf").map((e) => e.field);
    assert.deepEqual(st({ jenis: "gambar", media_id: M1, alt: "Peta" }), []);
    assert.deepEqual(st({ jenis: "gambar", media_id: "../a", alt: "Peta" }), ["konten.blok.0.media_id"]);
    assert.deepEqual(validasiStimulus({ judul_internal: "Bacaan", sumber_rujukan: "Buatan sendiri", konten: { v: 1, blok: [{ jenis: "gambar", media_id: M1, alt: "" }] } }, "ajukan").map((e) => e.field), ["konten.blok.0.alt"]);
  });
  it("perapian menyimpan gambar hanya dengan field yang dikenal", () => {
    const rapi = rapikanKontenKunci("pilihan_ganda", { v: 1, gambar: [{ ...entri("g1"), url: "x" }] }, { v: 1 });
    assert.deepEqual(rapi.konten.gambar, [entri("g1")]);
    assert.equal("gambar" in rapikanKontenKunci("pilihan_ganda", { v: 1 }, { v: 1 }).konten, false);
    assert.deepEqual(rapikanKontenStimulus({ v: 1, blok: [{ jenis: "gambar", media_id: M1, alt: "a", ...{ url: "x" } }] }).blok, [{ jenis: "gambar", media_id: M1, alt: "a" }]);
  });
  it("form mentor tidak menerima gambar", () => {
    const api = readFileSync("lib/mentor/studioSoalApi.ts", "utf8");
    assert.equal((api.match(/mediaDariKonten\(data\.konten\)/g) ?? []).length, 2);
  });
});

describe("rute unggah lewat Storage", () => {
  let permintaan: Awaited<ReturnType<typeof pasangDbTiruan>>;
  let siapkan: typeof import("@/app/api/admin/studio-soal/impor/siapkan-unggah/route");
  let pratinjau: typeof import("@/app/api/admin/studio-soal/impor/pratinjau-docx/route");
  let simpan: typeof import("@/app/api/admin/studio-soal/impor/simpan-docx/route");
  before(async () => {
    permintaan = await pasangDbTiruan();
    siapkan = await import("@/app/api/admin/studio-soal/impor/siapkan-unggah/route");
    pratinjau = await import("@/app/api/admin/studio-soal/impor/pratinjau-docx/route");
    simpan = await import("@/app/api/admin/studio-soal/impor/simpan-docx/route");
  });
  const PATH = `${ADMIN}/${u(777)}.docx`;
  beforeEach(() => {
    resetDbTiruan();
    db.subtes = [{ id: PU.id, nama: PU.nama, kategori: "tps" }];
    const xml = soalXml([parGambar("rId2", { alt: "x" })], [...awalSoal, par("Soal: Rusak."), parGambar("rId3", { alt: "y" }), par("Kunci: Z")]);
    penyimpanan.berkas.set(`impor-staging/${PATH}`, docxBergambar(xml, [m("rId2"), m("rId3")]));
    rpc.jawab = { status: "disimpan", batch_id: u(501), jumlah_soal: 1, jumlah_stimulus: 0 };
  });
  const kirim = async (route: { POST: (r: never) => Promise<Response> }, body: unknown, userId: string | null = ADMIN, role: "admin" | "student" = "admin") => {
    const res = await route.POST(permintaan(userId, role, "POST", body) as never);
    return { status: res.status, json: (await res.json()) as Record<string, never> & Row };
  };
  const media = () => [...penyimpanan.berkas.keys()].filter((k) => k.startsWith("soal-media/"));

  it("guard admin di ketiga rute", async () => {
    for (const route of [siapkan, pratinjau, simpan]) {
      assert.equal((await kirim(route, { path: PATH }, null)).status, 401);
      assert.equal((await kirim(route, { path: PATH }, SISWA, "student")).status, 403);
      assert.equal((await kirim(route, { path: PATH }, ADMIN_NONAKTIF)).status, 403);
    }
    assert.deepEqual([rpc.panggilan.length, penyimpanan.diminta.length], [0, 0]);
  });

  it("siapkan-unggah: path acak di bawah id admin; hanya .docx maks. 25 MB", async () => {
    const r = await kirim(siapkan, { namaBerkas: "soal.docx", ukuran: 25 * 1024 * 1024 });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.match(String(r.json.path), new RegExp(`^${ADMIN}/[0-9a-f-]{36}\\.docx$`));
    assert.ok(r.json.token && r.json.url);
    assert.deepEqual(penyimpanan.diminta, [`impor-staging/${String(r.json.path)}`]);
    assert.equal((await kirim(siapkan, { namaBerkas: "soal.pdf", ukuran: 10 })).status, 400);
    assert.equal((await kirim(siapkan, { namaBerkas: "soal.docx", ukuran: 25 * 1024 * 1024 + 1 })).status, 413);
    assert.equal((await kirim(siapkan, { namaBerkas: "soal.docx", ukuran: 0 })).status, 400);
  });

  it("path milik admin lain atau menyimpang ditolak tanpa menyentuh Storage", async () => {
    const lain = `${u(3)}/${u(777)}.docx`;
    penyimpanan.berkas.set(`impor-staging/${lain}`, Buffer.from("x"));
    for (const path of [lain, `${ADMIN}/../${lain}`, `${ADMIN}/a.docx`, `${ADMIN}/${u(777)}.docx/x`, 5]) {
      for (const route of [pratinjau, simpan]) assert.equal((await kirim(route, { path })).status, 403, String(path));
    }
    assert.deepEqual([penyimpanan.diunduh.length, rpc.panggilan.length], [0, 0]);
    assert.equal((await kirim(pratinjau, { path: `${ADMIN}/${u(778)}.docx` })).status, 404);
  });

  it("pratinjau menghitung gambar tanpa menyimpan apa pun", async () => {
    const r = await kirim(pratinjau, { path: PATH });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((r.json.ringkasan as Row).jumlahGambar, 2);
    assert.deepEqual([media(), rpc.panggilan.length], [[], 0]);
    assert.equal(penyimpanan.berkas.has(`impor-staging/${PATH}`), true);
  });

  it("simpan: hanya gambar soal yang disimpan diunggah, baris media ikut ke RPC, staging dihapus", async () => {
    const r = await kirim(simpan, { path: PATH, lewatiGalat: true, namaBerkas: "soal.docx" });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(media().length, 1);
    const batch = rpc.panggilan[0].args.p_batch as { media: Row[]; soal: { konten: { gambar: Row[] } }[]; nama_berkas: string };
    assert.equal(batch.nama_berkas, "soal.docx");
    assert.equal(batch.media.length, 1);
    assert.equal(batch.media[0].id, batch.soal[0].konten.gambar[0].media_id);
    assert.equal(`soal-media/${String(batch.media[0].path)}`, media()[0]);
    assert.deepEqual([batch.media[0].mime, batch.media[0].lebar, batch.media[0].tinggi, batch.media[0].teks_alternatif], ["image/png", 20, 10, "x"]);
    assert.equal(penyimpanan.berkas.has(`impor-staging/${PATH}`), false);
  });

  it("masih ada galat tanpa lewati: tidak ada unggahan, staging dipertahankan", async () => {
    assert.equal((await kirim(simpan, { path: PATH })).status, 422);
    assert.deepEqual([media(), rpc.panggilan.length, penyimpanan.berkas.has(`impor-staging/${PATH}`)], [[], 0, true]);
  });

  it("RPC gagal atau menolak: gambar yang sudah diunggah dihapus lagi", async () => {
    for (const atur of [() => (rpc.gagal = true), () => (rpc.jawab = { status: "data_tidak_valid" })]) {
      atur();
      const r = await kirim(simpan, { path: PATH, lewatiGalat: true });
      assert.ok(r.status >= 400);
      assert.deepEqual(media(), []);
      assert.equal(penyimpanan.berkas.has(`impor-staging/${PATH}`), true);
      rpc.gagal = false;
    }
  });

  it("unggah gambar gagal: tidak memanggil RPC", async () => {
    penyimpanan.gagalUnggah = true;
    const r = await kirim(simpan, { path: PATH, lewatiGalat: true });
    assert.equal(r.status, 500);
    assert.equal(rpc.panggilan.length, 0);
  });
});
