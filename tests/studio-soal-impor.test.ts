/**
 * Test impor soal massal Studio Soal (lib/shared/studio-soal/impor.ts +
 * deteksi pemisah/BOM di lib/admin/parseCsv.ts): parser, pemetaan subtes/topik,
 * galat per jenis, duplikat, batas 300, bacaan, rumus rusak, gambar, template.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deteksiPemisahCsv, parseCsv } from "@/lib/admin/parseCsv";
import {
  BATAS_SOAL_IMPOR,
  KOLOM_BACAAN,
  KOLOM_SOAL,
  SUMBER_BAWAAN,
  bisaSimpan,
  buatTemplateCsv,
  susunImpor,
  type HasilImpor,
  type SubtesImpor,
  type TopikImpor,
} from "@/lib/shared/studio-soal/impor";

const PU: SubtesImpor = { id: "11111111-1111-4111-8111-111111111111", nama: "Penalaran Umum", kategori: "tps" };
const PK: SubtesImpor = { id: "22222222-2222-4222-8222-222222222222", nama: "Pengetahuan Kuantitatif", kategori: "tps" };
const MTK: SubtesImpor = { id: "33333333-3333-4333-8333-333333333333", nama: "Matematika", kategori: "tka_wajib" };
const SUBTES = [PU, PK, MTK];
const TOPIK: TopikImpor[] = [{ id: "44444444-4444-4444-8444-444444444444", subtes_id: PU.id, nama: "Logika Dasar" }];

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Satu baris soal PG valid; `ubah` menimpa kolom tertentu. */
function barisPg(ubah: Partial<Record<(typeof KOLOM_SOAL)[number], string>> = {}): string[] {
  const dasar: Partial<Record<(typeof KOLOM_SOAL)[number], string>> = {
    subtes: "Penalaran Umum",
    topik: "",
    tipe: "pilihan_ganda",
    redaksi: "Berapakah \\(2+3\\)?",
    opsi_a: "3",
    opsi_b: "4",
    opsi_c: "5",
    opsi_d: "6",
    opsi_e: "7",
    kunci: "C",
    pembahasan: "Dua ditambah tiga sama dengan lima.",
    kesulitan: "mudah",
    level_kognitif: "",
    estimasi_detik: "",
    sumber_rujukan: "Buatan sendiri",
    kode_bacaan: "",
    urutan_dalam_bacaan: "",
  };
  const gabung = { ...dasar, ...ubah };
  return KOLOM_SOAL.map((k) => gabung[k] ?? "");
}

function csvSoal(baris: string[][], pemisah = ","): string {
  return [KOLOM_SOAL.join(pemisah), ...baris.map((b) => b.map(q).join(pemisah))].join("\n");
}
function csvBacaan(baris: string[][], pemisah = ","): string {
  return [KOLOM_BACAAN.join(pemisah), ...baris.map((b) => b.map(q).join(pemisah))].join("\n");
}
const impor = (soalCsv: string, bacaanCsv?: string, redaksiAda: string[] = []) =>
  susunImpor({ soalCsv, bacaanCsv, subtes: SUBTES, topik: TOPIK, redaksiAda });

const galatDi = (h: HasilImpor, baris: number, kolom: string) => h.galat.filter((g) => g.baris === baris && g.kolom === kolom);

describe("parseCsv — pemisah & BOM", () => {
  it("mendeteksi ; vs , dari baris judul", () => {
    assert.equal(deteksiPemisahCsv("a;b;c\n1;2;3"), ";");
    assert.equal(deteksiPemisahCsv("a,b,c\n1,2,3"), ",");
    assert.equal(deteksiPemisahCsv("a,b;c,d\n1"), ",");
  });
  it("membuang BOM UTF-8 dan mengurai kutip, kutip ganda, newline dalam sel", () => {
    const rows = parseCsv('﻿a;b\n"x;y";"dia berkata ""halo""\nbaris dua"\n\n', ";");
    assert.deepEqual(rows, [["a", "b"], ["x;y", 'dia berkata "halo"\nbaris dua']]);
  });
  it("perilaku lama tidak berubah: tanpa argumen = koma", () => {
    assert.deepEqual(parseCsv("a,b\n1;2,3"), [["a", "b"], ["1;2", "3"]]);
  });
});

describe("impor — berkas valid", () => {
  it("menerima pemisah koma dan titik koma, serta BOM", () => {
    const baris = [barisPg(), barisPg({ redaksi: "Berapakah \\(3+3\\)?", kunci: "d" })];
    for (const pemisah of [",", ";"]) {
      const h = impor(`﻿${csvSoal(baris, pemisah)}`);
      assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
      assert.equal(h.ringkasan.jumlahOk, 2);
      assert.equal(h.soal[1].kunci.opsi, "D", "kunci huruf kecil dinormalkan");
    }
  });

  it("menyusun payload PG: opsi A–E, kunci, subtes id, kesulitan bawaan sedang, baris kosong dilewati", () => {
    const csv = `${csvSoal([barisPg({ kesulitan: "" })])}\n,,,,,,,,,,,,,,,,\n`;
    const h = impor(csv);
    assert.equal(h.galat.length, 0);
    assert.equal(h.soal.length, 1);
    const s = h.soal[0];
    assert.equal(s.subtes_id, PU.id);
    assert.equal(s.tingkat_kesulitan, "sedang");
    assert.deepEqual((s.konten.opsi as { label: string }[]).map((o) => o.label), ["A", "B", "C", "D", "E"]);
    assert.equal(h.pratinjau[0].baris, 2);
  });

  it("memetakan nama subtes dan topik tanpa peduli huruf besar/kecil dan spasi", () => {
    const h = impor(csvSoal([barisPg({ subtes: "  penalaran   UMUM ", topik: " logika dasar " })]));
    assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
    assert.equal(h.soal[0].subtes_id, PU.id);
    assert.equal(h.soal[0].topik_id, TOPIK[0].id);
  });

  it("isian: kunci dipisah |, otomatis angka atau teks, penanda {{r1}} ditambahkan di akhir", () => {
    const angka = impor(csvSoal([barisPg({ tipe: "isian", redaksi: "Hasil dari \\(2+3\\) adalah", kunci: "5| 5,5", opsi_a: "", opsi_b: "", opsi_c: "", opsi_d: "", opsi_e: "" })]));
    assert.equal(angka.galat.length, 0, JSON.stringify(angka.galat));
    assert.match(angka.soal[0].redaksi, /\{\{r1\}\}$/);
    assert.deepEqual(angka.soal[0].konten.rumpang, [{ id: "r1", jenis: "angka" }]);
    assert.deepEqual((angka.soal[0].kunci.rumpang as Record<string, { diterima: string[] }>).r1.diterima, ["5", "5,5"]);

    const teks = impor(csvSoal([barisPg({ tipe: "isian", redaksi: "Ibu kota Indonesia adalah {{r1}}.", kunci: "Jakarta|DKI Jakarta", opsi_a: "", opsi_b: "", opsi_c: "", opsi_d: "", opsi_e: "" })]));
    assert.equal(teks.galat.length, 0, JSON.stringify(teks.galat));
    assert.deepEqual(teks.soal[0].konten.rumpang, [{ id: "r1", jenis: "teks" }]);
  });
});

describe("impor — galat per baris", () => {
  it("subtes kosong, tidak dikenal, dan bukan SNBT", () => {
    const h = impor(csvSoal([barisPg({ subtes: "" }), barisPg({ subtes: "Ngawur" }), barisPg({ subtes: "Matematika" })]));
    assert.equal(galatDi(h, 2, "subtes").length, 1);
    assert.match(galatDi(h, 3, "subtes")[0].pesan, /tidak dikenal/);
    assert.match(galatDi(h, 4, "subtes")[0].pesan, /bukan subtes SNBT/);
    assert.equal(h.soal.length, 0);
    assert.equal(h.ringkasan.jumlahGalat, 3);
  });

  it("topik tak dikenal dan tipe tak dikenal", () => {
    const h = impor(csvSoal([barisPg({ topik: "Tidak Ada" }), barisPg({ tipe: "esai" })]));
    assert.match(galatDi(h, 2, "topik")[0].pesan, /Tidak Ada/);
    assert.match(galatDi(h, 3, "tipe")[0].pesan, /tidak dikenal/);
  });

  it("PG: kunci kosong/salah, opsi kosong, pembahasan terlalu pendek, redaksi kosong", () => {
    const h = impor(csvSoal([
      barisPg({ kunci: "" }),
      barisPg({ kunci: "Z" }),
      barisPg({ opsi_d: "" }),
      barisPg({ pembahasan: "pendek" }),
      barisPg({ redaksi: "" }),
    ]));
    assert.match(galatDi(h, 2, "kunci")[0].pesan, /belum diisi/);
    assert.match(galatDi(h, 3, "kunci")[0].pesan, /A sampai E/);
    assert.equal(galatDi(h, 4, "opsi_d").length >= 1, true);
    assert.equal(galatDi(h, 5, "pembahasan").length >= 1, true);
    assert.equal(galatDi(h, 6, "redaksi").length >= 1, true);
  });

  it("kesulitan, level kognitif, dan estimasi di luar batas", () => {
    const h = impor(csvSoal([barisPg({ kesulitan: "gampang" }), barisPg({ level_kognitif: "4" }), barisPg({ estimasi_detik: "5" })]));
    assert.equal(galatDi(h, 2, "kesulitan").length, 1);
    assert.equal(galatDi(h, 3, "level_kognitif").length, 1);
    assert.equal(galatDi(h, 4, "estimasi_detik").length, 1);
  });

  it("isian: kunci kosong dan lebih dari satu kotak", () => {
    const h = impor(csvSoal([
      barisPg({ tipe: "isian", kunci: "" }),
      barisPg({ tipe: "isian", redaksi: "{{r1}} dan {{r2}}", kunci: "a" }),
    ]));
    assert.equal(galatDi(h, 2, "kunci").length >= 1, true);
    assert.equal(galatDi(h, 3, "redaksi").length >= 1, true);
  });

  it("rumus rusak dan pembatas rumus tidak berpasangan", () => {
    const h = impor(csvSoal([barisPg({ redaksi: "Hitung \\(\\frac{1}{\\)" }), barisPg({ opsi_a: "\\(x^" }), barisPg({ pembahasan: "Lihat \\(x tanpa penutup" })]));
    assert.equal(galatDi(h, 2, "redaksi").length >= 1, true);
    assert.equal(galatDi(h, 3, "opsi_a").length >= 1, true);
    assert.equal(galatDi(h, 4, "pembahasan").length >= 1, true);
  });

  it("menolak gambar di teks, di opsi, dan di kolom gambar", () => {
    const h = impor(csvSoal([
      barisPg({ redaksi: "Perhatikan ![grafik](http://x.test/a.png) berikut" }),
      barisPg({ opsi_b: '<img src="a.png">' }),
      barisPg({ pembahasan: "Lihat https://contoh.id/gambar/jawaban.jpg untuk jelasnya." }),
    ]));
    for (const baris of [2, 3, 4]) {
      assert.equal(h.galat.some((g) => g.baris === baris && /Gambar belum didukung/.test(g.pesan)), true, `baris ${baris}`);
    }
    const dgKolom = `${[...KOLOM_SOAL, "gambar"].join(",")}\n${[...barisPg(), "foto1.png"].map(q).join(",")}`;
    const h2 = impor(dgKolom);
    assert.equal(h2.galat.some((g) => /Gambar belum didukung/.test(g.pesan)), true);
    assert.equal(h2.soal.length, 0);
  });

  it("kolom lebih banyak dari judul (koma tak berkutip) diberi tahu", () => {
    const h = impor(`${KOLOM_SOAL.join(",")}\n${barisPg().join(",")},ekstra`);
    assert.equal(h.galat.some((g) => /Kolom lebih banyak/.test(g.pesan)), true);
  });
});

describe("impor — tingkat berkas", () => {
  it("kolom wajib hilang, berkas kosong, tidak ada baris data", () => {
    const hilang = impor("subtes,tipe\nPenalaran Umum,pilihan_ganda");
    assert.equal(hilang.galat.some((g) => g.kolom === "redaksi" && g.baris === 1), true);
    assert.equal(bisaSimpan(hilang).ok, false);
    assert.equal(impor("").galat.length > 0, true);
    const kosong = impor(KOLOM_SOAL.join(","));
    assert.equal(kosong.galat.length, 1);
    assert.equal(bisaSimpan(kosong).ok, false);
  });

  it("batas 300 soal: 300 lolos, 301 diblokir walau opsi lewati galat dinyalakan", () => {
    const satu = barisPg();
    const buat = (n: number) => csvSoal(Array.from({ length: n }, (_, i) => barisPg({ redaksi: `Soal nomor ${i + 1}: \\(${i}+1\\)` })));
    assert.equal(BATAS_SOAL_IMPOR, 300);
    const ok = impor(buat(300));
    assert.equal(ok.galat.length, 0);
    assert.equal(bisaSimpan(ok).ok, true);
    const lebih = impor(buat(301));
    assert.equal(lebih.galat.some((g) => g.baris === 0 && /Maksimal 300/.test(g.pesan)), true);
    assert.equal(bisaSimpan(lebih, true).ok, false);
    assert.ok(satu.length === KOLOM_SOAL.length);
  });

  it("kolom tak dikenal hanya peringatan", () => {
    const h = impor(`${KOLOM_SOAL.join(",")},catatan\n${[...barisPg(), "x"].map(q).join(",")}`);
    assert.equal(h.galat.length, 0);
    assert.equal(h.peringatan.some((p) => p.kolom === "catatan"), true);
    assert.equal(h.soal.length, 1);
  });
});

describe("impor — bacaan", () => {
  const bacaanOk = csvBacaan([["B1", "Penalaran Umum", "Banjir kembali merendam kota.", "Buatan sendiri"]]);

  it("menghubungkan soal ke bacaan, urutan otomatis berurutan", () => {
    const h = impor(csvSoal([barisPg({ kode_bacaan: "b1" }), barisPg({ redaksi: "Soal dua?", kode_bacaan: "B1" })]), bacaanOk);
    assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
    assert.equal(h.stimulus.length, 1);
    assert.deepEqual(h.soal.map((s) => [s.stimulus_kode, s.urutan_dalam_stimulus]), [["b1", 1], ["b1", 2]]);
    assert.equal(h.stimulus[0].subtes_id, PU.id);
  });

  it("sumber_rujukan kosong (bacaan maupun soal) = \"Buatan Sendiri\"; sumber terlalu pendek tetap galat dan soalnya ikut galat", () => {
    const tanpaSumber = csvBacaan([["B1", "Penalaran Umum", "Isi bacaan.", ""]]);
    const h = impor(csvSoal([barisPg({ kode_bacaan: "B1", sumber_rujukan: "" })]), tanpaSumber);
    assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
    assert.equal(h.stimulus[0].sumber_rujukan, SUMBER_BAWAAN);
    assert.equal(h.soal[0].sumber_rujukan, SUMBER_BAWAAN);
    assert.equal(SUMBER_BAWAAN, "Buatan Sendiri");
    const pendek = impor(csvSoal([barisPg({ kode_bacaan: "B1" })]), csvBacaan([["B1", "Penalaran Umum", "Isi.", "ab"]]));
    assert.equal(pendek.galat.some((g) => g.berkas === "bacaan" && g.kolom === "sumber_rujukan"), true);
    assert.equal(pendek.galat.some((g) => g.berkas === "soal" && g.kolom === "kode_bacaan" && /bermasalah/.test(g.pesan)), true);
    assert.equal(pendek.soal.length, 0);
  });

  it("kode tidak ada, bacaan.csv tidak diunggah, kode ganda, subtes beda, urutan ganda", () => {
    assert.equal(galatDi(impor(csvSoal([barisPg({ kode_bacaan: "ZZ" })]), bacaanOk), 2, "kode_bacaan").length, 1);
    assert.match(galatDi(impor(csvSoal([barisPg({ kode_bacaan: "B1" })])), 2, "kode_bacaan")[0].pesan, /tidak diunggah/);
    const ganda = impor(csvSoal([barisPg()]), csvBacaan([["B1", "Penalaran Umum", "A", "Sumber A"], ["b1", "Penalaran Umum", "B", "Sumber B"]]));
    assert.equal(ganda.galat.some((g) => g.berkas === "bacaan" && /lebih dari sekali/.test(g.pesan)), true);
    const beda = impor(csvSoal([barisPg({ subtes: "Pengetahuan Kuantitatif", kode_bacaan: "B1" })]), bacaanOk);
    assert.equal(galatDi(beda, 2, "kode_bacaan").some((g) => /berbeda dengan subtes bacaan/.test(g.pesan)), true);
    const urutan = impor(csvSoal([barisPg({ kode_bacaan: "B1", urutan_dalam_bacaan: "1" }), barisPg({ redaksi: "Dua?", kode_bacaan: "B1", urutan_dalam_bacaan: "1" })]), bacaanOk);
    assert.equal(galatDi(urutan, 3, "urutan_dalam_bacaan").length, 1);
  });

  it("bacaan yang tidak dipakai hanya peringatan dan tidak disimpan; rumus rusak di bacaan = galat", () => {
    const h = impor(csvSoal([barisPg()]), bacaanOk);
    assert.equal(h.galat.length, 0);
    assert.equal(h.stimulus.length, 0);
    assert.equal(h.peringatan.some((p) => p.berkas === "bacaan"), true);
    const rusak = impor(csvSoal([barisPg({ kode_bacaan: "B1" })]), csvBacaan([["B1", "Penalaran Umum", "Rumus \\(\\frac{1}{\\) rusak", "Buatan sendiri"]]));
    assert.equal(rusak.galat.some((g) => g.berkas === "bacaan" && g.kolom === "teks"), true);
  });
});

describe("impor — duplikat", () => {
  it("duplikat dalam berkas dan terhadap bank adalah PERINGATAN (tetap bisa disimpan)", () => {
    const h = impor(
      csvSoal([barisPg({ redaksi: "Soal Kembar?" }), barisPg({ redaksi: "  soal   kembar? " }), barisPg({ redaksi: "Sudah ada di bank" })]),
      undefined,
      ["SUDAH ada di BANK"],
    );
    assert.equal(h.galat.length, 0);
    assert.equal(h.soal.length, 3);
    assert.equal(h.peringatan.some((p) => p.baris === 3 && /baris 2/.test(p.pesan)), true);
    assert.equal(h.peringatan.some((p) => p.baris === 4 && /bank soal/.test(p.pesan)), true);
    assert.deepEqual(h.pratinjau.map((p) => p.status), ["ok", "peringatan", "peringatan"]);
    assert.equal(bisaSimpan(h).ok, true);
  });
});

describe("bisaSimpan — opsi lewati galat", () => {
  it("default menolak bila ada galat; lewati galat hanya menyimpan baris lolos", () => {
    const h = impor(csvSoal([barisPg(), barisPg({ kunci: "Z" }), barisPg({ redaksi: "Lain?" })]));
    assert.equal(bisaSimpan(h).ok, false);
    const lewati = bisaSimpan(h, true);
    assert.equal(lewati.ok, true);
    assert.equal(h.soal.length, 2);
  });
  it("tidak ada soal lolos = tidak bisa disimpan", () => {
    assert.equal(bisaSimpan(impor(csvSoal([barisPg({ kunci: "Z" })])), true).ok, false);
  });
});

describe("template CSV v1.1", () => {
  it("lolos validasinya sendiri: 3 soal, 1 bacaan, tanpa galat", () => {
    const t = buatTemplateCsv();
    const h = impor(t.soal, t.bacaan);
    assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
    assert.equal(h.soal.length, 3);
    assert.equal(h.stimulus.length, 1);
    assert.equal(h.soal.some((s) => s.stimulus_kode === "b1"), true);
  });
  it("berisi BOM, semua kolom judul, dan contoh rumus \\( \\)", () => {
    const t = buatTemplateCsv();
    assert.equal(t.soal.charCodeAt(0), 0xfeff);
    assert.equal(parseCsv(t.soal)[0].join(","), KOLOM_SOAL.join(","));
    assert.equal(parseCsv(t.bacaan)[0].join(","), KOLOM_BACAAN.join(","));
    assert.match(t.soal, /\\\(x\^2 = 9\\\)/);
  });
});
