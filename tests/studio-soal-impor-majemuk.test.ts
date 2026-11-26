/**
 * Test majemuk kompleks pada unggah soal: jalur Word (imporDocx.ts, berkas .docx
 * nyata) dan CSV, keduanya lewat susunImpor() + validasiSoal yang sama.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { olahDocx } from "@/lib/admin/docxIsi";
import { buatDocx } from "@/lib/admin/docxZip";
import { parseCsv } from "@/lib/admin/parseCsv";
import { KOLOM_SOAL, buatTemplateCsv, susunImpor, type HasilImpor, type SubtesImpor } from "@/lib/shared/studio-soal/impor";
import { isiTemplateDocx, type ItemDocx } from "@/lib/shared/studio-soal/imporDocx";
import { validasiSoal } from "@/lib/shared/studio-soal/validasi";

const PU: SubtesImpor = { id: "11111111-1111-4111-8111-111111111111", nama: "Penalaran Umum", kategori: "tps" };

async function dariWord(isi: ItemDocx[]): Promise<HasilImpor> {
  const olah = await olahDocx(buatDocx(isi));
  if (!olah.ok) assert.fail(olah.error);
  return susunImpor({ soalCsv: "", ...olah.masukan, subtes: [PU], topik: [] });
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const csv = (judul: readonly string[], baris: Record<string, string>[]) =>
  [judul.join(","), ...baris.map((b) => judul.map((k) => q(b[k] ?? "")).join(","))].join("\n");
const dariCsv = (baris: Record<string, string>[], judul: readonly string[] = KOLOM_SOAL) =>
  susunImpor({ soalCsv: csv(judul, baris), subtes: [PU], topik: [] });

const PEMBAHASAN = "Pernyataan pertama benar sedangkan yang kedua salah.";
const kepala = (jenis = "Majemuk"): string[] => ["#SOAL", "Subtes: Penalaran Umum", `Jenis: ${jenis}`, "Soal: Tentukan benar atau salah."];
const ekor = (kunci: string) => [`Kunci: ${kunci}`, `Pembahasan: ${PEMBAHASAN}`];
const majemuk = (pernyataan: string[], kunci: string, kolom: string[] = []) => [...kepala(), ...kolom, ...pernyataan, ...ekor(kunci)];
const DUA = ["P1. Air mendidih pada suhu tertentu.", "P2. Es lebih panas dari uap."];
const KUNCI_DUA = "P1=Benar, P2=Salah";
const nP = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}. Pernyataan nomor ${i + 1}`);
const nKunci = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}=${i % 2 ? "Salah" : "Benar"}`).join(", ");

const lolosAjukan = (h: HasilImpor) => {
  assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
  for (const s of h.soal) {
    assert.deepEqual(validasiSoal({ ...s, subtes_kategori: "tps", stimulus_id: null }, "ajukan"), []);
  }
};

/** Soal bermasalah ada di urutan ke-2: galatnya harus menunjuk soal itu (baris 3), soal ke-1 tetap lolos. */
async function galatKe2(kedua: string[], kolom: string, pola: RegExp) {
  const h = await dariWord([...majemuk(DUA, KUNCI_DUA), ...kedua]);
  assert.equal(h.soal.length, 1, JSON.stringify(h.galat));
  assert.equal(h.galat.every((g) => g.baris === 3), true, JSON.stringify(h.galat));
  assert.equal(h.galat.some((g) => g.kolom === kolom && pola.test(g.pesan)), true, JSON.stringify(h.galat));
  return h;
}

describe("Majemuk — Word yang benar", () => {
  it("format dasar: label bawaan, konten & kunci sesuai bentuk validator", async () => {
    const h = await dariWord(majemuk(DUA, KUNCI_DUA));
    lolosAjukan(h);
    const s = h.soal[0];
    assert.equal(s.tipe, "majemuk_kompleks");
    assert.equal(s.redaksi, "Tentukan benar atau salah.");
    assert.deepEqual(s.konten, {
      v: 1,
      label_kolom: ["Benar", "Salah"],
      pernyataan: [
        { id: "p1", teks: "Air mendidih pada suhu tertentu." },
        { id: "p2", teks: "Es lebih panas dari uap." },
      ],
    });
    assert.deepEqual(s.kunci, { v: 1, per_baris: { p1: 0, p2: 1 } });
    assert.equal(h.pratinjau[0].kunci, "Benar|Salah");
  });

  it("alias 'Majemuk Kompleks', label kustom, tanpa peka huruf, pernyataan & kunci multi-paragraf, rumus", async () => {
    const h = await dariWord([
      ...kepala("  MAJEMUK   kompleks "),
      "kolom :  Fakta  |  Opini ",
      "p1) Nilai \\(x^2\\) tidak negatif",
      "untuk semua bilangan real.",
      "2. P2. Matematika itu menyenangkan.",
      "Kunci: P1 = fakta;",
      "P2=OPINI",
      `Pembahasan: ${PEMBAHASAN}`,
      "P1. baris ini bagian pembahasan.",
    ]);
    lolosAjukan(h);
    const s = h.soal[0];
    assert.deepEqual(s.konten.label_kolom, ["Fakta", "Opini"]);
    assert.deepEqual(
      (s.konten.pernyataan as { teks: string }[]).map((p) => p.teks),
      ["Nilai \\(x^2\\) tidak negatif untuk semua bilangan real.", "Matematika itu menyenangkan."],
    );
    assert.deepEqual(s.kunci, { v: 1, per_baris: { p1: 0, p2: 1 } });
    assert.equal(s.pembahasan, `${PEMBAHASAN}\n\nP1. baris ini bagian pembahasan.`);
  });

  it("tepat 2 dan tepat 6 pernyataan diterima", async () => {
    for (const n of [2, 6]) {
      const h = await dariWord(majemuk(nP(n), nKunci(n)));
      lolosAjukan(h);
      assert.equal((h.soal[0].konten.pernyataan as unknown[]).length, n);
      assert.equal(Object.keys(h.soal[0].kunci.per_baris as object).length, n);
    }
  });
});

describe("Majemuk — galat Word menunjuk soal ke-N", () => {
  it("pernyataan kurang dari 2 atau lebih dari 6", async () => {
    await galatKe2(majemuk(nP(1), nKunci(1)), "pernyataan_1", /minimal 2/);
    await galatKe2(majemuk([], ""), "pernyataan_1", /minimal 2/);
    await galatKe2(majemuk(nP(7), nKunci(6)), "pernyataan_7", /[Mm]aksimal 6/);
  });

  it("nomor loncat, duplikat, tidak berurutan, nol, dan pernyataan kosong", async () => {
    await galatKe2(majemuk(["P1. satu", "P3. tiga"], "P1=Benar, P3=Salah"), "pernyataan_2", /berurutan/);
    await galatKe2(majemuk(["P1. satu", "P1. satu lagi", "P2. dua"], KUNCI_DUA), "pernyataan_1", /lebih dari sekali/);
    await galatKe2(majemuk(["P2. dua", "P1. satu"], KUNCI_DUA), "pernyataan_1", /berurutan/);
    await galatKe2(majemuk(["P0. nol", ...DUA], KUNCI_DUA), "pernyataan_1", /mulai dari P1/);
    await galatKe2(majemuk([...DUA, "P3."], KUNCI_DUA), "pernyataan_3", /P3 kosong/);
  });

  it("kunci kurang, lebih, kosong, ganda, atau salah bentuk", async () => {
    await galatKe2(majemuk(nP(3), "P1=Benar, P3=Salah"), "kunci", /pernyataan 2 belum ada/);
    await galatKe2(majemuk(nP(3), "P1=Benar, P2=Salah"), "kunci", /pernyataan 3 belum ada/);
    await galatKe2(majemuk(DUA, `${KUNCI_DUA}, P3=Benar`), "kunci", /lebih banyak/);
    await galatKe2(majemuk(DUA, ""), "kunci", /belum diisi/);
    await galatKe2(majemuk(DUA, `${KUNCI_DUA}, P1=Salah`), "kunci", /P1 .*lebih dari sekali/);
    await galatKe2(majemuk(DUA, "Benar, Salah"), "kunci", /P1=Benar, P2=Salah/);
    await galatKe2(majemuk(DUA, "P1=Benar|Salah, P2=Salah"), "kunci", /P1=Benar, P2=Salah/);
    await galatKe2(majemuk(DUA, `${KUNCI_DUA}, P9=Benar`), "kunci", /P1 sampai P6/);
  });

  it("nilai kunci harus salah satu label kolom", async () => {
    await galatKe2(majemuk(DUA, "P1=Benar, P2=Keliru"), "kunci", /pernyataan 2 "Keliru" harus "Benar" atau "Salah"/);
    await galatKe2(majemuk(DUA, KUNCI_DUA, ["Kolom: Ya | Tidak"]), "kunci", /harus "Ya" atau "Tidak"/);
  });

  it("Kolom harus tepat 2 label berbeda; galat label tidak merembet ke kunci", async () => {
    for (const kolom of ["Kolom: Benar", "Kolom: A | B | C", "Kolom: Benar |", "Kolom:"]) {
      const h = await galatKe2(majemuk(DUA, KUNCI_DUA, [kolom]), "label_kolom_1", /tepat 2 label/);
      assert.equal(h.galat.length, 1, JSON.stringify(h.galat));
    }
    const sama = await galatKe2(majemuk(DUA, "P1=Ya, P2=Ya", ["Kolom: Ya | ya"]), "label_kolom_2", /tidak boleh sama/);
    assert.equal(sama.galat.length, 1, JSON.stringify(sama.galat));
  });

  it("baris pilihan A–E di soal majemuk ditolak, di mana pun letaknya (di luar pembahasan)", async () => {
    await galatKe2(majemuk([...DUA, "A. pilihan nyasar"], KUNCI_DUA), "opsi_a", /majemuk tidak memakai pilihan A–E/);
    await galatKe2(majemuk(["B) pilihan nyasar", ...DUA], KUNCI_DUA), "opsi_b", /majemuk tidak memakai pilihan A–E/);
    await galatKe2(majemuk(DUA, KUNCI_DUA, ["Kolom: Benar | Salah", "C. nyasar"]), "opsi_c", /pilihan A–E/);
    await galatKe2(majemuk([...DUA, "D."], KUNCI_DUA), "opsi_d", /pilihan A–E/);
  });

  it("baris P atau Kolom di soal PG/isian ditolak", async () => {
    const opsi = ["A. 1", "B. 2", "C. 3", "D. 4", "E. 5"];
    await galatKe2([...kepala("PG"), ...opsi, "P1. nyasar", ...ekor("C")], "pernyataan_1", /hanya untuk soal majemuk/);
    await galatKe2([...kepala("PG"), "P1. premis", ...opsi, ...ekor("C")], "pernyataan_1", /hanya untuk soal majemuk/);
    await galatKe2([...kepala("Isian"), "P2. nyasar", ...ekor("5")], "pernyataan_2", /hanya untuk soal majemuk/);
    await galatKe2([...kepala("PG"), "Kolom: Benar | Salah", ...opsi, ...ekor("C")], "label_kolom_1", /hanya untuk soal majemuk/);
  });

  it("rumus rusak dan gambar tertulis di pernyataan ditolak", async () => {
    await galatKe2(majemuk(["P1. satu", "P2. \\(\\frac{1}{\\)"], KUNCI_DUA), "pernyataan_2", /Rumus/);
    await galatKe2(majemuk(["P1. satu", "P2. ![x](y.png)"], KUNCI_DUA), "redaksi", /Gambar belum didukung/);
  });

  it("tabel di soal ditolak dengan petunjuk memakai Jenis: Majemuk", async () => {
    const olah = await olahDocx(buatDocx([...kepala(), { tabel: [["Pernyataan", "Benar"], ["x", ""]] }]));
    if (olah.ok) assert.fail("berkas seharusnya ditolak");
    assert.match(olah.error, /untuk soal benar\/salah per pernyataan, tulis sebagai Jenis: Majemuk dengan baris P1\., P2\., \.\.\./);
  });
});

const barisMajemuk = (ubah: Record<string, string> = {}): Record<string, string> => ({
  subtes: "Penalaran Umum",
  tipe: "majemuk_kompleks",
  redaksi: "Tentukan benar atau salah.",
  pernyataan_1: "Air mendidih pada suhu tertentu.",
  pernyataan_2: "Es lebih panas dari uap.",
  kunci: "Benar|Salah",
  pembahasan: PEMBAHASAN,
  ...ubah,
});

describe("Majemuk — CSV", () => {
  it("kolom baru ada di akhir KOLOM_SOAL, urut", () => {
    assert.deepEqual(KOLOM_SOAL.slice(-9), [
      "urutan_dalam_bacaan",
      "label_kolom_1",
      "label_kolom_2",
      "pernyataan_1",
      "pernyataan_2",
      "pernyataan_3",
      "pernyataan_4",
      "pernyataan_5",
      "pernyataan_6",
    ]);
  });

  it("label bawaan & kustom, 2 dan 6 pernyataan, lolos validasiSoal", () => {
    const enam = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`pernyataan_${i}`, `Nomor ${i}`]));
    const h = dariCsv([
      barisMajemuk(),
      barisMajemuk({ ...enam, redaksi: "Enam.", label_kolom_1: "Fakta", label_kolom_2: "Opini", kunci: "opini| fakta |Fakta|Opini|Fakta|Opini" }),
    ]);
    lolosAjukan(h);
    assert.deepEqual(h.soal[0].konten.label_kolom, ["Benar", "Salah"]);
    assert.deepEqual(h.soal[0].kunci, { v: 1, per_baris: { p1: 0, p2: 1 } });
    assert.deepEqual(h.soal[1].konten.label_kolom, ["Fakta", "Opini"]);
    assert.deepEqual(h.soal[1].kunci.per_baris, { p1: 1, p2: 0, p3: 0, p4: 1, p5: 0, p6: 1 });
  });

  const salah: [string, Record<string, string>, string, RegExp][] = [
    ["1 pernyataan", { pernyataan_2: "", kunci: "Benar" }, "pernyataan_1", /minimal 2/],
    ["lubang di tengah", { pernyataan_2: "", pernyataan_3: "tiga", kunci: "Benar|Salah|Benar" }, "pernyataan_2", /berurutan/],
    ["kunci kurang", { pernyataan_3: "tiga" }, "kunci", /pernyataan 3 belum ada/],
    ["kunci lebih", { kunci: "Benar|Salah|Benar" }, "kunci", /lebih banyak/],
    ["kunci kosong", { kunci: "" }, "kunci", /belum diisi/],
    ["nilai bukan label", { kunci: "Benar|Keliru" }, "kunci", /"Keliru" harus "Benar" atau "Salah"/],
    ["satu label saja", { label_kolom_1: "Ya" }, "label_kolom_2", /Label kolom 2 belum diisi/],
    ["label sama", { label_kolom_1: "Ya", label_kolom_2: "YA", kunci: "Ya|Ya" }, "label_kolom_2", /tidak boleh sama/],
    ["opsi terisi", { opsi_a: "nyasar" }, "opsi_a", /majemuk tidak memakai pilihan A–E/],
    ["rumus rusak", { pernyataan_2: "\\(\\frac{1}{\\)" }, "pernyataan_2", /Rumus/],
  ];
  for (const [nama, ubah, kolom, pola] of salah) {
    it(`galat: ${nama}`, () => {
      const h = dariCsv([barisMajemuk(ubah)]);
      assert.equal(h.soal.length, 0);
      assert.equal(h.galat.some((g) => g.baris === 2 && g.kolom === kolom && pola.test(g.pesan)), true, JSON.stringify(h.galat));
    });
  }

  it("kolom pernyataan_7 berisi = galat maksimal 6, bukan diabaikan diam-diam", () => {
    const enam = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [`pernyataan_${i}`, `Nomor ${i}`]));
    const h = dariCsv([barisMajemuk({ ...enam, kunci: "Benar|Salah|Benar|Salah|Benar|Salah" })], [...KOLOM_SOAL, "pernyataan_7"]);
    assert.equal(h.soal.length, 0);
    assert.equal(h.galat.some((g) => g.kolom === "pernyataan_7" && /[Mm]aksimal 6/.test(g.pesan)), true, JSON.stringify(h.galat));
    assert.equal(h.peringatan.some((p) => p.kolom === "pernyataan_7"), false);
  });

  it("PG/isian dengan kolom pernyataan atau label terisi ditolak", () => {
    const pg = { tipe: "pilihan_ganda", opsi_a: "1", opsi_b: "2", opsi_c: "3", opsi_d: "4", opsi_e: "5", kunci: "C", pernyataan_1: "", pernyataan_2: "" };
    const h = dariCsv([
      barisMajemuk({ ...pg, pernyataan_1: "nyasar" }),
      barisMajemuk({ ...pg, redaksi: "Lain.", label_kolom_2: "Salah" }),
      barisMajemuk({ tipe: "isian", redaksi: "Isi.", kunci: "5" }),
    ]);
    assert.equal(h.soal.length, 0);
    for (const [baris, kolom] of [[2, "pernyataan_1"], [3, "label_kolom_2"], [4, "pernyataan_1"]] as const) {
      assert.equal(h.galat.some((g) => g.baris === baris && g.kolom === kolom && /hanya untuk soal majemuk/.test(g.pesan)), true, `${baris} ${JSON.stringify(h.galat)}`);
    }
  });

  it("CSV lama tanpa kolom majemuk tetap terbaca (PG & isian); majemuk di sana ditolak jelas", () => {
    const lama = KOLOM_SOAL.slice(0, KOLOM_SOAL.indexOf("label_kolom_1"));
    const h = dariCsv(
      [
        { subtes: "Penalaran Umum", tipe: "pilihan_ganda", redaksi: "Berapa?", opsi_a: "1", opsi_b: "2", opsi_c: "3", opsi_d: "4", opsi_e: "5", kunci: "C", pembahasan: PEMBAHASAN },
        { subtes: "Penalaran Umum", tipe: "isian", redaksi: "Hasilnya", kunci: "5", pembahasan: PEMBAHASAN },
      ],
      lama,
    );
    lolosAjukan(h);
    assert.equal(h.soal.length, 2);
    assert.equal(h.peringatan.length, 0);
    const m = dariCsv([barisMajemuk()], lama);
    assert.equal(m.galat.some((g) => g.kolom === "pernyataan_1" && /minimal 2/.test(g.pesan)), true);
  });
});

describe("Majemuk — Word dan CSV identik", () => {
  it("soal yang sama menghasilkan keluaran susunImpor yang sama", async () => {
    const word = await dariWord([
      ...majemuk(DUA, KUNCI_DUA),
      "#SOAL",
      "Subtes: Penalaran Umum",
      "Jenis: Majemuk Kompleks",
      "Soal: Golongkan \\(x\\).",
      "Kolom: Fakta | Opini",
      "P1. satu",
      "P2. dua \\(x^2\\)",
      "P3. tiga",
      ...ekor("P1=Opini, P2=Fakta, P3=Opini"),
    ]);
    const lewatCsv = dariCsv([
      barisMajemuk(),
      barisMajemuk({
        redaksi: "Golongkan \\(x\\).",
        label_kolom_1: "Fakta",
        label_kolom_2: "Opini",
        pernyataan_1: "satu",
        pernyataan_2: "dua \\(x^2\\)",
        pernyataan_3: "tiga",
        kunci: "Opini|Fakta|Opini",
      }),
    ]);
    lolosAjukan(word);
    assert.equal(word.soal.length, 2);
    assert.deepEqual(word, lewatCsv);
  });
});

describe("Majemuk — template contoh", () => {
  it("template Word dan CSV masing-masing memuat satu soal majemuk yang lolos", async () => {
    const word = await dariWord(isiTemplateDocx());
    const t = buatTemplateCsv();
    const lewatCsv = susunImpor({ soalCsv: t.soal, bacaanCsv: t.bacaan, subtes: [PU], topik: [] });
    for (const h of [word, lewatCsv]) {
      assert.equal(h.galat.length, 0, JSON.stringify(h.galat));
      assert.equal(h.peringatan.length, 0, JSON.stringify(h.peringatan));
      assert.equal(h.soal.filter((s) => s.tipe === "majemuk_kompleks").length, 1);
      assert.equal(h.soal.length, 3);
    }
    for (const baris of parseCsv(t.soal)) assert.equal(baris.length, KOLOM_SOAL.length);
  });
});
