/**
 * Test Studio Soal UX-3:
 *   A. tombol kartu di halaman "Buat soal" (statis)
 *   B. kirim bacaan lewat kirim banyak — fungsi murni
 *      lib/shared/studio-soal/kirimBanyak.ts. Skenario API ada di
 *      studio-soal-form.test.ts ("kirim banyak bacaan").
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  BATAS_KIRIM,
  alasanDariJawabanBacaan,
  hitungPerStatus,
  hitungPilihan,
  kelayakanKirim,
  kelayakanKirimBacaan,
  kunciItem,
  petaStatusBacaan,
  pilihSemua,
  ringkasHasilKirim,
  susunDaftar,
  teksJumlah,
  uraiKunci,
  ubahPilihan,
} from "@/lib/shared/studio-soal/kirimBanyak";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// A. Halaman "Buat soal"
// ---------------------------------------------------------------------------

describe("A — tombol kartu Buat soal", () => {
  const isi = baca("app/(protected)/(mentor)/studio-soal/buat/page.tsx");

  it("teks 'Pilih →' diganti tombol sungguhan dengan label jelas", () => {
    assert.doesNotMatch(isi, /Pilih →/);
    assert.match(isi, /Pilih soal biasa/);
    assert.match(isi, /Pilih soal dengan bacaan/);
    assert.match(isi, /buttonClassName\(\{ variant: "primary", className: "w-full" \}\)/);
  });

  it("tidak ada link di dalam link: kartu = div, hanya tombol yang menjadi <Link>", () => {
    const kartu = isi.slice(isi.indexOf("pilihan.map"), isi.indexOf("))}", isi.indexOf("pilihan.map")));
    assert.equal((kartu.match(/<Link\b/g) ?? []).length, 1);
    assert.match(kartu, /^pilihan\.map\(\(p\) => \(\s*<div/);
    // padding kartu (p-5 / sm:p-6) — tombol tidak menempel ke tepi
    assert.match(kartu, /\bp-5\b[^"]*\bsm:p-6\b/);
  });
});

// ---------------------------------------------------------------------------
// B. Bacaan ikut kirim banyak
// ---------------------------------------------------------------------------

const soal = (id: string, status: string, stimulusId: string | null = null) => ({ id, status, stimulusId });
const bacaan = (id: string, status: string) => ({ id, status });

describe("kunci pilihan & teks", () => {
  it("kunci soal/bacaan bolak-balik; kunci rusak = null", () => {
    assert.equal(kunciItem("bacaan", "x1"), "bacaan:x1");
    assert.deepEqual(uraiKunci("soal:a-b"), { jenis: "soal", id: "a-b" });
    assert.deepEqual(uraiKunci("bacaan:x1"), { jenis: "bacaan", id: "x1" });
    for (const rusak of ["x1", ":x1", "soal:", "lain:x1"]) assert.equal(uraiKunci(rusak), null, rusak);
  });

  it("teks jumlah menyebut soal dan bacaan dengan jelas", () => {
    assert.equal(teksJumlah(3, 2), "3 soal dan 2 bacaan");
    assert.equal(teksJumlah(3, 0), "3 soal");
    assert.equal(teksJumlah(0, 2), "2 bacaan");
    assert.deepEqual(hitungPilihan(["soal:a", "soal:b", "bacaan:c", "rusak"]), { soal: 2, bacaan: 1 });
  });
});

describe("kelayakanKirimBacaan (aturan sama dengan RPC studio_soal_ajukan_stimulus)", () => {
  it("bacaan draf/ditolak berisi soal draf/ditolak boleh dicentang", () => {
    assert.equal(kelayakanKirimBacaan(bacaan("b", "draf"), [soal("s", "draf", "b")]).boleh, true);
    assert.equal(kelayakanKirimBacaan(bacaan("b", "ditolak"), [soal("s", "ditolak", "b")]).boleh, true);
  });

  it("bacaan tanpa soal draf: tidak boleh, alasan menyuruh menambah soal", () => {
    const k = kelayakanKirimBacaan(bacaan("b", "draf"), []);
    assert.equal(k.boleh, false);
    if (!k.boleh) assert.match(k.alasan, /Tambahkan soal/);
  });

  it("sedang dicek / terbit / tidak ditugaskan: tidak boleh", () => {
    for (const st of ["diajukan", "terpublikasi", "diarsipkan"]) {
      assert.equal(kelayakanKirimBacaan(bacaan("b", st), [soal("s", "draf", "b")]).boleh, false, st);
    }
    assert.equal(kelayakanKirimBacaan(bacaan("b", "draf"), [soal("s", "draf", "b")], false).boleh, false);
  });

  it("soal di bacaan yang belum terbit: tanpa checkbox, keterangan 'Ikut terkirim bersama bacaannya'", () => {
    const k = kelayakanKirim(soal("s", "draf", "b"), petaStatusBacaan([bacaan("b", "draf")]));
    assert.equal(k.boleh, false);
    if (!k.boleh) assert.equal(k.alasan, "Ikut terkirim bersama bacaannya.");
    // bacaan terbit: soalnya seperti soal biasa
    assert.equal(kelayakanKirim(soal("s", "draf", "b"), petaStatusBacaan([bacaan("b", "terpublikasi")])).boleh, true);
  });
});

describe("susunDaftar — bacaan dengan soal menjorok + filter", () => {
  const SOAL = [
    soal("m1", "draf"),
    soal("m2", "terpublikasi"),
    soal("d1", "draf", "bd"),
    soal("d2", "draf", "bd"),
    soal("t1", "draf", "bt"),
    soal("t2", "terpublikasi", "bt"),
    soal("y1", "draf", "hilang"),
  ];
  const BACAAN = [bacaan("bd", "draf"), bacaan("bt", "terpublikasi"), bacaan("kosong", "draf")];
  const ringkas = (f: Parameters<typeof susunDaftar>[2]) => {
    const r = susunDaftar(SOAL, BACAAN, f);
    return { grup: r.grup.map((g) => [g.bacaan.id, g.soal.map((s) => s.id)]), mandiri: r.mandiri.map((s) => s.id) };
  };

  it("Semua: soal di bawah bacaannya; soal yang bacaannya tidak ada tampil sebagai soal biasa", () => {
    assert.deepEqual(ringkas("semua"), {
      grup: [["bd", ["d1", "d2"]], ["bt", ["t1", "t2"]], ["kosong", []]],
      mandiri: ["m1", "m2", "y1"],
    });
  });

  it("Draf: bacaan tampil bila dirinya atau soalnya cocok; di bawahnya hanya soal yang cocok", () => {
    assert.deepEqual(ringkas("draf"), {
      grup: [["bd", ["d1", "d2"]], ["bt", ["t1"]], ["kosong", []]],
      mandiri: ["m1", "y1"],
    });
  });

  it("Terbit: bacaan terbit dengan soal terbitnya; bacaan draf tidak tampil", () => {
    assert.deepEqual(ringkas("terpublikasi"), { grup: [["bt", ["t2"]]], mandiri: ["m2"] });
  });

  it("jumlah per filter menghitung soal dan bacaan", () => {
    const n = hitungPerStatus([...SOAL, ...BACAAN]);
    assert.equal(n.semua, 10);
    assert.equal(n.draf, 7);
    assert.equal(n.terpublikasi, 3);
  });
});

describe("pilihan campur soal + bacaan", () => {
  it(`satu bacaan = 1 item; batas ${BATAS_KIRIM} berlaku untuk campuran`, () => {
    const terlihat = [
      ...Array.from({ length: 30 }, (_, i) => ({ id: kunciItem("soal", `s${i}`), boleh: true })),
      ...Array.from({ length: 30 }, (_, i) => ({ id: kunciItem("bacaan", `b${i}`), boleh: true })),
    ];
    const p = pilihSemua(new Set(), terlihat);
    assert.equal(p.size, BATAS_KIRIM);
    assert.deepEqual(hitungPilihan(p), { soal: 30, bacaan: 20 });
    assert.equal(ubahPilihan(p, kunciItem("bacaan", "b29"), true).size, BATAS_KIRIM);
  });

  it("pilih semua melewati bacaan yang tidak boleh & soal yang ikut bacaannya", () => {
    const terlihat = [
      { id: "bacaan:bd", boleh: true },
      { id: "soal:d1", boleh: false },
      { id: "bacaan:kosong", boleh: false },
      { id: "soal:m1", boleh: true },
    ];
    assert.deepEqual([...pilihSemua(new Set(), terlihat)].sort(), ["bacaan:bd", "soal:m1"]);
  });
});

describe("ringkasan & alasan bacaan", () => {
  it("judul menyebut soal dan bacaan", () => {
    const r = ringkasHasilKirim([
      { id: "a", jenis: "soal", ok: true },
      { id: "b", jenis: "soal", ok: true },
      { id: "c", jenis: "soal", ok: true },
      { id: "x", jenis: "bacaan", ok: true },
      { id: "y", jenis: "bacaan", ok: true },
    ]);
    assert.equal(r.judul, "3 soal dan 2 bacaan terkirim.");
    const g = ringkasHasilKirim([
      { id: "x", jenis: "bacaan", ok: true },
      { id: "y", jenis: "bacaan", ok: false, alasan: "Soal ke-1: kurang." },
    ]);
    assert.equal(g.judul, "1 bacaan terkirim. 1 belum terkirim:");
    assert.deepEqual(g.gagal, [{ id: "y", jenis: "bacaan", alasan: "Soal ke-1: kurang." }]);
  });

  it("alasan: error bacaan dan per soal (dengan nomor), maks 2 lalu dihitung", () => {
    const json = {
      error: "Bacaan atau soalnya belum lengkap.",
      errors: [{ field: "sumber_rujukan", pesan: "Isi sumber bacaan." }],
      errorsSoal: [
        { soalId: "s2", urutan: 2, errors: [{ pesan: "Pilih satu jawaban benar." }, { pesan: "Isi pembahasan." }] },
        { soalId: "s3", urutan: null, errors: [{ pesan: "Isi pembahasan." }] },
      ],
    };
    assert.equal(alasanDariJawabanBacaan(json), "Bacaan: Isi sumber bacaan. Soal ke-2: Pilih satu jawaban benar. (+2 hal lain)");
    assert.equal(
      alasanDariJawabanBacaan({ errorsSoal: [{ urutan: null, errors: [{ pesan: "Isi pembahasan." }] }] }),
      "Salah satu soal: Isi pembahasan.",
    );
    assert.equal(alasanDariJawabanBacaan({ error: "Bacaan tidak ditemukan." }), "Bacaan tidak ditemukan.");
  });
});

describe("statis UX-3 B", () => {
  it("daftar mentor mengirim bacaan lewat endpoint ajukan yang sudah ada", () => {
    const isi = baca("components/mentor/StudioSoalMentor.tsx");
    assert.match(isi, /\/api\/studio-soal\/stimulus\/\$\{id\}\/ajukan/);
    assert.match(isi, /alasanDariJawabanBacaan/);
    assert.match(isi, /\/studio-soal\/stimulus\/\$\{g\.id\}/);
  });
});
