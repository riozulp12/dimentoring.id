/**
 * Test validator Studio Soal (lib/shared/studio-soal/validasi.ts) — modul
 * murni, tanpa DB. Desain: docs/design/studio-soal-snbt-tahap1.md Bagian 1.6.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validasiAlasanTolak,
  validasiPaket,
  validasiSoal,
  validasiStimulus,
  validasiUrutanPaket,
  type ErrorValidasi,
} from "@/lib/shared/studio-soal/validasi";
import { cekPembatasRumus, normalisasiTeks } from "@/lib/shared/studio-soal/teks";

type Data = Record<string, unknown>;

function pg(ubah: Data = {}): Data {
  return {
    subtes_kategori: "tps",
    tipe: "pilihan_ganda",
    redaksi: "Berapakah \\(2+3\\)?",
    konten: {
      v: 1,
      opsi: ["3", "4", "5", "6", "7"].map((teks, i) => ({ label: "ABCDE"[i], teks })),
    },
    kunci: { v: 1, opsi: "C" },
    pembahasan: "Dua ditambah tiga sama dengan lima.",
    tingkat_kesulitan: "mudah",
    ...ubah,
  };
}

function majemuk(jumlah = 3, ubah: Data = {}): Data {
  const pernyataan = Array.from({ length: jumlah }, (_, i) => ({ id: `p${i + 1}`, teks: `Pernyataan ${i + 1}` }));
  return {
    subtes_kategori: "literasi",
    tipe: "majemuk_kompleks",
    redaksi: "Tentukan sesuai/tidak sesuai berdasarkan bacaan.",
    konten: { v: 1, label_kolom: ["Sesuai", "Tidak Sesuai"], pernyataan },
    kunci: { v: 1, per_baris: Object.fromEntries(pernyataan.map((p, i) => [p.id, i % 2])) },
    pembahasan: "Pernyataan ganjil sesuai, genap tidak sesuai.",
    tingkat_kesulitan: "sedang",
    ...ubah,
  };
}

function isian(jumlah = 2, ubah: Data = {}): Data {
  const ids = Array.from({ length: jumlah }, (_, i) => `r${i + 1}`);
  return {
    subtes_kategori: "tps",
    tipe: "isian",
    redaksi: ids.map((id) => `Nilai ${id} adalah {{${id}}}.`).join(" "),
    konten: { v: 1, rumpang: ids.map((id) => ({ id, jenis: "angka" })) },
    kunci: { v: 1, rumpang: Object.fromEntries(ids.map((id, i) => [id, { diterima: [String(i + 1)] }])) },
    pembahasan: "Hitung masing-masing nilai dengan teliti.",
    tingkat_kesulitan: "hots",
    ...ubah,
  };
}

function fields(errors: ErrorValidasi[]): string[] {
  return errors.map((e) => e.field);
}

function adaError(errors: ErrorValidasi[], field: string, jenis?: "bentuk" | "kelengkapan"): boolean {
  return errors.some((e) => e.field === field && (!jenis || e.jenis === jenis));
}

describe("validasiSoal — umum", () => {
  it("tiga tipe yang lengkap lolos mode ajukan", () => {
    assert.deepEqual(validasiSoal(pg()), []);
    assert.deepEqual(validasiSoal(majemuk()), []);
    assert.deepEqual(validasiSoal(isian()), []);
  });

  it("input bukan objek / tipe tidak dikenal → error bentuk", () => {
    assert.equal(validasiSoal(null)[0].jenis, "bentuk");
    assert.ok(adaError(validasiSoal(pg({ tipe: "esai" })), "tipe", "bentuk"));
  });

  it("subtes non-SNBT ditolak; tanpa subtes_kategori tidak dicek", () => {
    assert.ok(adaError(validasiSoal(pg({ subtes_kategori: "tka_wajib" })), "subtes_id", "bentuk"));
    const tanpaKategori = pg();
    delete tanpaKategori.subtes_kategori;
    assert.deepEqual(validasiSoal(tanpaKategori), []);
  });

  it("tingkat kesulitan wajib & valid; level kognitif opsional 1–3", () => {
    assert.ok(adaError(validasiSoal(pg({ tingkat_kesulitan: "sulit" })), "tingkat_kesulitan"));
    assert.deepEqual(validasiSoal(pg({ level_kognitif: null })), []);
    assert.deepEqual(validasiSoal(pg({ level_kognitif: 3 })), []);
    assert.ok(adaError(validasiSoal(pg({ level_kognitif: 4 })), "level_kognitif", "bentuk"));
    assert.ok(adaError(validasiSoal(pg({ level_kognitif: 1.5 })), "level_kognitif", "bentuk"));
  });

  it("estimasi waktu 10–1800 detik bulat", () => {
    assert.deepEqual(validasiSoal(pg({ estimasi_waktu_detik: 90 })), []);
    assert.ok(adaError(validasiSoal(pg({ estimasi_waktu_detik: 5 })), "estimasi_waktu_detik"));
    assert.ok(adaError(validasiSoal(pg({ estimasi_waktu_detik: 1801 })), "estimasi_waktu_detik"));
  });

  it("redaksi kosong = kelengkapan; > 5000 karakter = bentuk", () => {
    assert.ok(adaError(validasiSoal(pg({ redaksi: "   " })), "redaksi", "kelengkapan"));
    assert.ok(adaError(validasiSoal(pg({ redaksi: "a".repeat(5001) })), "redaksi", "bentuk"));
    assert.deepEqual(validasiSoal(pg({ redaksi: "a".repeat(5000) })), []);
  });

  it("pembahasan minimal 10 karakter (per code point, setelah trim)", () => {
    assert.ok(adaError(validasiSoal(pg({ pembahasan: "  123456789  " })), "pembahasan", "kelengkapan"));
    assert.deepEqual(validasiSoal(pg({ pembahasan: "1234567890" })), []);
    // 10 emoji = 10 karakter walau .length JS = 20
    assert.deepEqual(validasiSoal(pg({ pembahasan: "😀".repeat(10) })), []);
    assert.ok(adaError(validasiSoal(pg({ pembahasan: "😀".repeat(9) })), "pembahasan"));
  });

  it("sumber rujukan soal opsional; kalau diisi ≥ 3 dan ≤ 300 karakter", () => {
    assert.deepEqual(validasiSoal(pg({ sumber_rujukan: null })), []);
    assert.deepEqual(validasiSoal(pg({ sumber_rujukan: "" })), []);
    assert.deepEqual(validasiSoal(pg({ sumber_rujukan: "Buatan sendiri" })), []);
    assert.ok(adaError(validasiSoal(pg({ sumber_rujukan: "ab" })), "sumber_rujukan", "kelengkapan"));
    assert.ok(adaError(validasiSoal(pg({ sumber_rujukan: "a".repeat(301) })), "sumber_rujukan", "bentuk"));
  });

  it("stimulus_id dan urutan_dalam_stimulus berpasangan, urutan 1–50", () => {
    assert.deepEqual(validasiSoal(pg({ stimulus_id: "st-1", urutan_dalam_stimulus: 2 })), []);
    assert.ok(adaError(validasiSoal(pg({ stimulus_id: "st-1" })), "urutan_dalam_stimulus", "bentuk"));
    assert.ok(adaError(validasiSoal(pg({ urutan_dalam_stimulus: 1 })), "urutan_dalam_stimulus", "bentuk"));
    assert.ok(adaError(validasiSoal(pg({ stimulus_id: "st-1", urutan_dalam_stimulus: 0 })), "urutan_dalam_stimulus"));
  });

  it("pembatas rumus tidak seimbang = kelengkapan", () => {
    assert.ok(adaError(validasiSoal(pg({ redaksi: "Hitung \\(x+1" })), "redaksi", "kelengkapan"));
    assert.ok(adaError(validasiSoal(pg({ pembahasan: "Jawabannya \\[x\\) jelas sekali." })), "pembahasan"));
  });

  it("mode draf hanya mengembalikan error bentuk", () => {
    const draf = pg({ redaksi: "", pembahasan: "", kunci: { v: 1 } });
    assert.ok(validasiSoal(draf, "ajukan").length >= 3);
    assert.deepEqual(validasiSoal(draf, "draf"), []);
    // bentuk tetap ditolak di draf
    assert.ok(adaError(validasiSoal(pg({ redaksi: "a".repeat(5001) }), "draf"), "redaksi", "bentuk"));
  });
});

describe("validasiSoal — pilihan ganda", () => {
  it("tepat 5 opsi: 4 = kelengkapan, 6 = bentuk", () => {
    const opsi = (pg().konten as { opsi: unknown[] }).opsi;
    assert.ok(adaError(validasiSoal(pg({ konten: { v: 1, opsi: opsi.slice(0, 4) } })), "konten.opsi", "kelengkapan"));
    const enam = [...opsi, { label: "F", teks: "8" }];
    assert.ok(adaError(validasiSoal(pg({ konten: { v: 1, opsi: enam } })), "konten.opsi", "bentuk"));
  });

  it("label harus A–E berurutan", () => {
    const opsi = (pg().konten as { opsi: { label: string; teks: string }[] }).opsi.map((o) => ({ ...o }));
    opsi[1].label = "C";
    assert.ok(adaError(validasiSoal(pg({ konten: { v: 1, opsi } })), "konten.opsi.1.label", "bentuk"));
  });

  it("opsi kosong dan opsi duplikat (setelah normalisasi) = kelengkapan", () => {
    const opsi = (pg().konten as { opsi: { label: string; teks: string }[] }).opsi.map((o) => ({ ...o }));
    opsi[0].teks = " ";
    opsi[4].teks = "  5 ";
    const errors = validasiSoal(pg({ konten: { v: 1, opsi } }));
    assert.ok(adaError(errors, "konten.opsi.0.teks", "kelengkapan"));
    assert.ok(adaError(errors, "konten.opsi.4.teks", "kelengkapan"));
  });

  it("kunci: belum dipilih = kelengkapan; F / huruf kecil = bentuk", () => {
    assert.ok(adaError(validasiSoal(pg({ kunci: { v: 1 } })), "kunci.opsi", "kelengkapan"));
    assert.ok(adaError(validasiSoal(pg({ kunci: { v: 1, opsi: "F" } })), "kunci.opsi", "bentuk"));
    assert.ok(adaError(validasiSoal(pg({ kunci: { v: 1, opsi: "c" } })), "kunci.opsi", "bentuk"));
  });

  it("opsi > 1000 karakter = bentuk", () => {
    const opsi = (pg().konten as { opsi: { label: string; teks: string }[] }).opsi.map((o) => ({ ...o }));
    opsi[2].teks = "x".repeat(1001);
    assert.ok(adaError(validasiSoal(pg({ konten: { v: 1, opsi } })), "konten.opsi.2.teks", "bentuk"));
  });

  it("konten/kunci bukan objek = bentuk", () => {
    assert.ok(adaError(validasiSoal(pg({ konten: "A,B,C" })), "konten", "bentuk"));
    assert.ok(adaError(validasiSoal(pg({ kunci: null })), "kunci", "bentuk"));
  });
});

describe("validasiSoal — majemuk kompleks", () => {
  it("2 dan 6 pernyataan lolos (batas), 1 = kelengkapan, 7 = bentuk", () => {
    assert.deepEqual(validasiSoal(majemuk(2)), []);
    assert.deepEqual(validasiSoal(majemuk(6)), []);
    assert.ok(adaError(validasiSoal(majemuk(1)), "konten.pernyataan", "kelengkapan"));
    assert.ok(adaError(validasiSoal(majemuk(7)), "konten.pernyataan", "bentuk"));
  });

  it("label kolom: wajib dua, tidak kosong, ≤ 30, tidak sama", () => {
    const dasar = majemuk().konten as Data;
    assert.ok(adaError(validasiSoal(majemuk(3, { konten: { ...dasar, label_kolom: ["Benar"] } })), "konten.label_kolom", "bentuk"));
    assert.ok(adaError(validasiSoal(majemuk(3, { konten: { ...dasar, label_kolom: ["Benar", " "] } })), "konten.label_kolom.1", "kelengkapan"));
    assert.ok(adaError(validasiSoal(majemuk(3, { konten: { ...dasar, label_kolom: ["Ya", "x".repeat(31)] } })), "konten.label_kolom.1", "bentuk"));
    assert.ok(adaError(validasiSoal(majemuk(3, { konten: { ...dasar, label_kolom: ["Benar", " benar "] } })), "konten.label_kolom.1", "kelengkapan"));
    assert.deepEqual(validasiSoal(majemuk(3, { konten: { ...dasar, label_kolom: ["Ya", "Tidak"] } })), []);
  });

  it("id pernyataan unik & berpola", () => {
    const dasar = majemuk().konten as Data;
    const ganda = [{ id: "p1", teks: "a" }, { id: "p1", teks: "b" }];
    assert.ok(adaError(validasiSoal(majemuk(2, { konten: { ...dasar, pernyataan: ganda } })), "konten.pernyataan.1.id", "bentuk"));
    const salahPola = [{ id: "P 1", teks: "a" }, { id: "p2", teks: "b" }];
    assert.ok(adaError(validasiSoal(majemuk(2, { konten: { ...dasar, pernyataan: salahPola } })), "konten.pernyataan.0.id", "bentuk"));
  });

  it("kunci: kurang satu baris = kelengkapan, nilai 2 = bentuk, baris asing = kelengkapan", () => {
    assert.ok(adaError(validasiSoal(majemuk(3, { kunci: { v: 1, per_baris: { p1: 0, p2: 1 } } })), "kunci.per_baris.p3", "kelengkapan"));
    assert.ok(adaError(validasiSoal(majemuk(2, { kunci: { v: 1, per_baris: { p1: 0, p2: 2 } } })), "kunci.per_baris.p2", "bentuk"));
    assert.ok(adaError(validasiSoal(majemuk(2, { kunci: { v: 1, per_baris: { p1: 0, p2: 1, p9: 0 } } })), "kunci.per_baris.p9", "kelengkapan"));
  });
});

describe("validasiSoal — isian", () => {
  it("1 dan 5 rumpang lolos (batas), 0 = kelengkapan, 6 = bentuk", () => {
    assert.deepEqual(validasiSoal(isian(1)), []);
    assert.deepEqual(validasiSoal(isian(5)), []);
    assert.ok(adaError(validasiSoal(isian(0)), "konten.rumpang", "kelengkapan"));
    assert.ok(adaError(validasiSoal(isian(6)), "konten.rumpang", "bentuk"));
  });

  it("penanda yatim / rumpang tanpa penanda / penanda ganda / kurung tidak lengkap", () => {
    assert.ok(adaError(validasiSoal(isian(1, { redaksi: "Nilai {{r1}} dan {{r2}}." })), "redaksi", "kelengkapan"));
    assert.ok(adaError(validasiSoal(isian(2, { redaksi: "Nilai {{r1}} saja." })), "redaksi", "kelengkapan"));
    assert.ok(adaError(validasiSoal(isian(1, { redaksi: "{{r1}} lalu {{r1}}." })), "redaksi", "kelengkapan"));
    assert.ok(adaError(validasiSoal(isian(1, { redaksi: "Nilai {{r1}} dan {{ r2." })), "redaksi", "kelengkapan"));
  });

  it("tiap rumpang minimal satu jawaban diterima, maks. 10", () => {
    const k = (diterima: unknown) => ({ v: 1, rumpang: { r1: { diterima } } });
    assert.ok(adaError(validasiSoal(isian(1, { kunci: k([]) })), "kunci.rumpang.r1.diterima", "kelengkapan"));
    assert.ok(adaError(validasiSoal(isian(1, { kunci: { v: 1, rumpang: {} } })), "kunci.rumpang.r1", "kelengkapan"));
    const sebelas = Array.from({ length: 11 }, (_, i) => String(i));
    assert.ok(adaError(validasiSoal(isian(1, { kunci: k(sebelas) })), "kunci.rumpang.r1.diterima", "bentuk"));
  });

  it("rumpang angka: jawaban bukan angka / pemisah ribuan / nilai ganda ditolak", () => {
    const k = (diterima: string[]) => ({ v: 1, rumpang: { r1: { diterima } } });
    assert.ok(adaError(validasiSoal(isian(1, { kunci: k(["abc"]) })), "kunci.rumpang.r1.diterima.0", "kelengkapan"));
    assert.ok(adaError(validasiSoal(isian(1, { kunci: k(["1.000,5"]) })), "kunci.rumpang.r1.diterima.0", "kelengkapan"));
    assert.ok(adaError(validasiSoal(isian(1, { kunci: k(["0,5", "1/2"]) })), "kunci.rumpang.r1.diterima.1", "kelengkapan"));
    assert.deepEqual(validasiSoal(isian(1, { kunci: k(["0,5", "0,25"]) })), []);
  });

  it("rumpang teks: duplikat setelah normalisasi ditolak; toleransi hanya untuk angka", () => {
    const konten = { v: 1, rumpang: [{ id: "r1", jenis: "teks" }] };
    const redaksi = "Ibu kota Indonesia adalah {{r1}}.";
    assert.ok(adaError(validasiSoal(isian(1, { konten, redaksi, kunci: { v: 1, rumpang: { r1: { diterima: ["Jakarta", " jakarta "] } } } })), "kunci.rumpang.r1.diterima.1", "kelengkapan"));
    assert.ok(adaError(validasiSoal(isian(1, { konten, redaksi, kunci: { v: 1, rumpang: { r1: { diterima: ["Jakarta"], toleransi: 1 } } } })), "kunci.rumpang.r1.toleransi", "bentuk"));
    assert.deepEqual(validasiSoal(isian(1, { konten, redaksi, kunci: { v: 1, rumpang: { r1: { diterima: ["Jakarta", "DKI Jakarta"] } } } })), []);
  });

  it("toleransi angka harus ≥ 0", () => {
    const k = (toleransi: unknown) => ({ v: 1, rumpang: { r1: { diterima: ["3,14"], toleransi } } });
    assert.deepEqual(validasiSoal(isian(1, { kunci: k("0,01") })), []);
    assert.deepEqual(validasiSoal(isian(1, { kunci: k(0.01) })), []);
    assert.ok(adaError(validasiSoal(isian(1, { kunci: k("-1") })), "kunci.rumpang.r1.toleransi", "bentuk"));
  });

  it("jenis rumpang harus teks/angka", () => {
    const konten = { v: 1, rumpang: [{ id: "r1", jenis: "tanggal" }] };
    assert.ok(adaError(validasiSoal(isian(1, { konten })), "konten.rumpang.0.jenis", "bentuk"));
  });
});

describe("validasiStimulus", () => {
  const stimulus = (ubah: Data = {}): Data => ({
    subtes_kategori: "literasi",
    judul_internal: "Bacaan tentang energi terbarukan",
    sumber_rujukan: "Buatan sendiri",
    konten: {
      v: 1,
      blok: [
        { jenis: "teks", teks: "Paragraf pertama.\n\nParagraf kedua dengan \\(x^2\\)." },
        { jenis: "tabel", judul: "Tabel 1", kepala: ["Tahun", "Ton"], baris: [["2024", "1.200"], ["2025", ""]] },
      ],
    },
    ...ubah,
  });

  it("stimulus teks + tabel lengkap lolos (sel tabel boleh kosong)", () => {
    assert.deepEqual(validasiStimulus(stimulus()), []);
  });

  it("sumber rujukan WAJIB (K4) — kosong = kelengkapan, draf boleh", () => {
    assert.ok(adaError(validasiStimulus(stimulus({ sumber_rujukan: "" })), "sumber_rujukan", "kelengkapan"));
    assert.ok(adaError(validasiStimulus(stimulus({ sumber_rujukan: undefined })), "sumber_rujukan", "kelengkapan"));
    assert.deepEqual(validasiStimulus(stimulus({ sumber_rujukan: "" }), "draf"), []);
  });

  it("judul internal 3–150 karakter (bentuk, berlaku juga di draf)", () => {
    assert.ok(adaError(validasiStimulus(stimulus({ judul_internal: "ab" }), "draf"), "judul_internal", "bentuk"));
  });

  it("blok: 0 = kelengkapan, 21 = bentuk; gambar belum didukung (K6)", () => {
    assert.ok(adaError(validasiStimulus(stimulus({ konten: { v: 1, blok: [] } })), "konten.blok", "kelengkapan"));
    const banyak = Array.from({ length: 21 }, () => ({ jenis: "teks", teks: "a" }));
    assert.ok(adaError(validasiStimulus(stimulus({ konten: { v: 1, blok: banyak } })), "konten.blok", "bentuk"));
    const gambar = { v: 1, blok: [{ jenis: "gambar", path: "x.webp", alt: "Grafik" }] };
    assert.ok(adaError(validasiStimulus(stimulus({ konten: gambar }), "draf"), "konten.blok.0.jenis", "bentuk"));
  });

  it("tabel: kolom 1–8, baris 1–20, jumlah sel per baris = jumlah kolom", () => {
    const tabel = (kepala: string[], baris: string[][]) => ({ v: 1, blok: [{ jenis: "tabel", kepala, baris }] });
    assert.ok(adaError(validasiStimulus(stimulus({ konten: tabel(Array(9).fill("k"), [Array(9).fill("x")]) })), "konten.blok.0.kepala", "bentuk"));
    assert.ok(adaError(validasiStimulus(stimulus({ konten: tabel(["a", "b"], [["1"]]) })), "konten.blok.0.baris.0", "bentuk"));
    assert.ok(adaError(validasiStimulus(stimulus({ konten: tabel(["a"], []) })), "konten.blok.0.baris", "kelengkapan"));
    assert.ok(adaError(validasiStimulus(stimulus({ konten: tabel(["a"], Array(21).fill(["1"])) })), "konten.blok.0.baris", "bentuk"));
  });

  it("teks bacaan panjang sampai 15.000 karakter", () => {
    const panjang = (n: number) => ({ v: 1, blok: [{ jenis: "teks", teks: "a".repeat(n) }] });
    assert.deepEqual(validasiStimulus(stimulus({ konten: panjang(15000) })), []);
    assert.ok(adaError(validasiStimulus(stimulus({ konten: panjang(15001) })), "konten.blok.0.teks", "bentuk"));
  });
});

describe("validasiPaket & validasiUrutanPaket", () => {
  it("metadata paket", () => {
    assert.deepEqual(validasiPaket({ subtes_kategori: "tps", judul: "Paket PU #1", deskripsi: null, durasi_menit: 30 }), []);
    assert.ok(adaError(validasiPaket({ judul: "ab" }), "judul"));
    assert.ok(adaError(validasiPaket({ judul: "Paket", deskripsi: "x".repeat(501) }), "deskripsi"));
    assert.ok(adaError(validasiPaket({ judul: "Paket", durasi_menit: 0 }), "durasi_menit"));
    assert.ok(adaError(validasiPaket({ judul: "Paket", subtes_kategori: "tka_elektif" }), "subtes_id"));
  });

  it("paket campuran dengan blok stimulus berurutan lolos; terpisah ditolak", () => {
    const item = (soal_id: string, stimulus_id: string | null = null) => ({ soal_id, subtes_id: "pu", stimulus_id });
    assert.deepEqual(validasiUrutanPaket([item("a"), item("b", "st"), item("c", "st"), item("d")], "pu"), []);
    assert.ok(fields(validasiUrutanPaket([item("b", "st"), item("a"), item("c", "st")], "pu")).includes("item.0"));
  });

  it("duplikat, beda subtes, kosong (draf boleh), > 100", () => {
    const item = (soal_id: string, subtes_id = "pu") => ({ soal_id, subtes_id, stimulus_id: null });
    assert.ok(adaError(validasiUrutanPaket([item("a"), item("a")], "pu"), "item.1", "bentuk"));
    assert.ok(adaError(validasiUrutanPaket([item("a", "pk")], "pu"), "item.0", "bentuk"));
    assert.ok(adaError(validasiUrutanPaket([], "pu"), "item", "kelengkapan"));
    assert.deepEqual(validasiUrutanPaket([], "pu", "draf"), []);
    const banyak = Array.from({ length: 101 }, (_, i) => item(`s${i}`));
    assert.ok(adaError(validasiUrutanPaket(banyak, "pu"), "item", "bentuk"));
  });
});

describe("validasiAlasanTolak (BR-37)", () => {
  it("min. 10 karakter setelah trim, dihitung per code point", () => {
    assert.ok(validasiAlasanTolak(undefined));
    assert.ok(validasiAlasanTolak(""));
    assert.ok(validasiAlasanTolak("   123456789   "));
    assert.equal(validasiAlasanTolak("1234567890"), null);
    assert.ok(validasiAlasanTolak("😀".repeat(9)));
    assert.equal(validasiAlasanTolak("😀".repeat(10)), null);
    assert.ok(validasiAlasanTolak("a".repeat(1001)));
  });
});

describe("teks — normalisasi & pembatas rumus", () => {
  it("normalisasiTeks: NFKC, kutip lengkung, spasi, huruf kecil", () => {
    assert.equal(normalisasiTeks("  Jakarta  Pusat\t"), "jakarta pusat");
    assert.equal(normalisasiTeks("“Ya”"), '"ya"');
    assert.equal(normalisasiTeks("ＡＢＣ"), "abc"); // huruf lebar penuh
  });

  it("cekPembatasRumus: $ biasa bukan rumus, \\\\ literal dilewati", () => {
    assert.equal(cekPembatasRumus("Harga $5 dan \\(x\\) serta \\[y\\]"), null);
    assert.equal(cekPembatasRumus("\\(a \\\\ b\\)"), null);
    assert.ok(cekPembatasRumus("\\(a \\(b\\)\\)"));
    assert.ok(cekPembatasRumus("tutup saja \\)"));
    assert.ok(cekPembatasRumus("\\[belum ditutup"));
  });
});
