/**
 * Test Studio Soal UX-3 — revisi review Rio (11 butir). Bagian yang bisa diuji
 * tanpa browser: fungsi murni + pemeriksaan statis kode tampilan.
 * Mengetuk tombol, menggulir, dan keyboard layar perlu dicek di browser —
 * lihat laporan.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { formAwal, inputValidasiSoal, type FormSoal, type FormStimulus } from "@/lib/shared/studio-soal/formSoal";
import {
  PESAN_KARTU_KOSONG,
  alasanBacaanBelumLengkap,
  alasanSoalBelumLengkap,
  cekBacaanLengkap,
  cekSoalLengkap,
  daftarBelumLengkap,
  susunKelengkapan,
} from "@/lib/shared/studio-soal/kelengkapan";
import { kelayakanDenganKelengkapan, kelayakanKirim, ubahPilihan } from "@/lib/shared/studio-soal/kirimBanyak";
import { validasiRumusSoal } from "@/lib/shared/studio-soal/rumus";
import { validasiSoal } from "@/lib/shared/studio-soal/validasi";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// Kelompok 1 — ikon dan tombol (butir 1, 2, 3)
// ---------------------------------------------------------------------------

describe("K1 — ikon hapus & panah buka/tutup", () => {
  const hapus = baca("components/studio-soal/TombolHapusDraf.tsx");
  const kartu = baca("components/studio-soal/KartuSoalBacaan.tsx");
  const stimulus = baca("components/studio-soal/FormStimulus.tsx");
  const gaya = baca("components/studio-soal/gaya.ts");

  it("tombol hapus draf = ikon tong sampah dengan aria-label + title; alur Modal tetap", () => {
    assert.match(hapus, /<IkonTongSampah \/>/);
    assert.match(hapus, /aria-label=\{label\}/);
    assert.match(hapus, /title=\{label\}/);
    assert.match(hapus, /label = "Hapus draf"/);
    assert.match(hapus, /<Modal open=\{buka\}/);
    assert.match(hapus, /Draf ini tidak bisa dihapus/);
    assert.doesNotMatch(hapus, />\s*Hapus draf\s*</, "teks 'Hapus draf' tidak lagi jadi isi tombol");
  });

  it("tombol ikon punya area ketuk 40px", () => {
    assert.match(gaya, /export const tombolIkon[\s\S]*size-10/);
  });

  it("kartu soal: satu panah (chevron) berputar, aria-expanded, kepala kartu bisa diketuk", () => {
    assert.match(kartu, /<IkonChevron/);
    assert.match(kartu, /rotate-180/);
    assert.match(kartu, /aria-expanded=\{kartu\.terbuka\}/);
    assert.match(kartu, /aria-label=\{labelBukaTutup\}/);
    assert.match(kartu, /title=\{labelBukaTutup\}/);
    assert.match(kartu, /cursor-pointer[^"]*" onClick=\{onBukaTutup\}/);
    assert.doesNotMatch(kartu, /Buka & ubah|>\s*Tutup\s*</);
  });

  it("buang kartu = ikon dengan konfirmasi; hapus draf soal tersimpan ada di kartu", () => {
    assert.match(kartu, /aria-label=\{`Buang kartu soal \$\{nomor\}`\}/);
    assert.match(kartu, /Buang kartu soal \{nomor\}\?/);
    assert.match(kartu, /<TombolHapusDraf[\s\S]*onTerhapus=\{hapusDraf\.onTerhapus\}/);
  });

  it("'Halaman soal →' hilang; aksi halaman soal pindah ke kartu", () => {
    assert.doesNotMatch(kartu, /Halaman soal/);
    assert.doesNotMatch(kartu, /href=\{`\/studio-soal\/soal\//);
    for (const url of ["soal/${kid}/ajukan", "soal/${kid}/tarik", "soal/${kid}/versi-baru"]) {
      assert.ok(stimulus.includes(`/api/studio-soal/${url}`), url);
    }
    assert.match(stimulus, /Kirim soal ini untuk dicek/);
    assert.match(stimulus, /Batalkan kirim/);
    assert.match(stimulus, /Buat versi baru/);
    assert.match(stimulus, /alasanTidakBisaHapus\("soal"/);
  });

  it("semua tombol ikon di Studio Soal punya aria-label dan title", () => {
    const files = [
      "components/studio-soal/FormStimulus.tsx",
      "components/studio-soal/FormSoal.tsx",
      "components/studio-soal/KartuSoalBacaan.tsx",
      "components/studio-soal/TombolHapusDraf.tsx",
    ];
    for (const f of files) {
      const isi = baca(f);
      // Setiap <button …>…</button> yang memakai tombolIkon( harus punya aria-label & title.
      const tombol = isi
        .split("<button")
        .slice(1)
        .map((t) => t.slice(0, t.indexOf("</button>")))
        .filter((t) => t.includes("tombolIkon("));
      assert.ok(tombol.length > 0 || f.endsWith("TombolHapusDraf.tsx"), f);
      for (const t of tombol) {
        assert.match(t, /aria-label=/, `${f}: ${t}`);
        assert.match(t, /title=/, `${f}: ${t}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Kelompok 2 — bilah aksi ringkas (butir 8, 10)
// ---------------------------------------------------------------------------

describe("K2 — bilah aksi ringkas", () => {
  const bilah = baca("components/studio-soal/BilahAksi.tsx");
  const stimulus = baca("components/studio-soal/FormStimulus.tsx");
  const soal = baca("components/studio-soal/FormSoal.tsx");

  it("HP: tombol satu baris sama lebar; layar lebar: rata kanan selebar isi", () => {
    assert.match(bilah, /grid auto-cols-fr grid-flow-col gap-2 sm:flex sm:justify-end/);
    assert.match(bilah, /KELAS_TOMBOL_BILAH = "w-full min-w-0 px-3 sm:w-auto sm:px-5"/);
  });

  it("ikon hapus di baris atas, kanan; keterangan di kiri", () => {
    const iKet = bilah.indexOf("{keterangan}");
    const iHapus = bilah.indexOf("{hapus}");
    const iTombol = bilah.indexOf("{children}");
    assert.ok(iKet > 0 && iKet < iHapus && iHapus < iTombol);
  });

  it("label ringkas: Simpan & Kirim untuk dicek; jumlah soal di keterangan, bukan di label", () => {
    for (const isi of [stimulus, soal]) {
      assert.match(isi, /<BilahAksi/);
      assert.match(isi, /"Menyimpan…" : "Simpan"\}/);
      assert.match(isi, /"Mengirim…" : "Kirim untuk dicek"\}/);
    }
    assert.doesNotMatch(stimulus, /Kirim bacaan \+ \$\{soalAkanDikirim\} soal untuk dicek/);
    assert.match(stimulus, /Bacaan \+ \{soalAkanDikirim\} soal/);
  });
});

// ---------------------------------------------------------------------------
// Kelompok 3 — kirim harus lengkap (butir 4)
// ---------------------------------------------------------------------------

const PU = "00000000-0000-4000-8000-000000000101";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function soalPg(ubah: Partial<FormSoal> = {}): FormSoal {
  return {
    ...formAwal(PU, "pilihan_ganda"),
    redaksi: "Berapakah \\(2+3\\)?",
    konten: { v: 1, opsi: ["3", "4", "5", "6", "7"].map((teks, i) => ({ label: "ABCDE"[i], teks })) },
    kunci: { v: 1, opsi: "C" },
    pembahasan: "Dua ditambah tiga sama dengan lima.",
    tingkat_kesulitan: "mudah",
    ...ubah,
  };
}

function bacaan(ubah: Partial<FormStimulus> = {}): FormStimulus {
  return {
    subtes_id: PU,
    judul_internal: "Bacaan uji",
    sumber_rujukan: "Buatan sendiri",
    konten: { v: 1, blok: [{ jenis: "teks", teks: "Paragraf bacaan." }] },
    ...ubah,
  };
}

describe("K3 — kelengkapan memakai validasi yang sama dengan API Ajukan", () => {
  it("cekSoalLengkap = validasiSoal(…, 'ajukan') + validasi rumus", () => {
    const contoh = [soalPg(), soalPg({ kunci: { v: 1 } }), soalPg({ redaksi: "" }), soalPg({ pembahasan: "\\(\\frac{1}{\\)" })];
    for (const f of contoh) {
      assert.deepEqual(cekSoalLengkap(f, "tps"), [...validasiSoal(inputValidasiSoal(f, "tps"), "ajukan"), ...validasiRumusSoal(f)]);
    }
    assert.deepEqual(cekSoalLengkap(soalPg(), "tps"), []);
  });

  it("API Ajukan memakai fungsi kelengkapan bersama (aturan tidak ditulis ulang)", () => {
    const api = baca("lib/mentor/studioSoalApi.ts");
    assert.match(api, /cekSoalLengkap\(soal, subtesKategori\)/);
    assert.match(api, /cekBacaanLengkap\(stimulus, subtesKategori\)/);
    assert.match(api, /errors: cekSoalLengkap\(s, subtesKategori\)/);
    // Simpan draf tetap memakai mode "draf" (boleh belum lengkap).
    assert.match(api, /validasiSoal\(inputValidasiSoal\(data, subtes\.kategori\), "draf"\)/);
    assert.match(api, /validasiStimulus\(inputValidasiStimulus\(data, subtes\.kategori\), "draf"\)/);
  });

  it("bacaan tanpa sumber belum lengkap; draf tetap boleh disimpan", () => {
    const e = cekBacaanLengkap(bacaan({ sumber_rujukan: "" }), "tps");
    assert.ok(e.some((x) => x.field === "sumber_rujukan"));
    assert.deepEqual(cekBacaanLengkap(bacaan(), "tps"), []);
  });
});

describe("K3 — pesan belum lengkap menyebut soal ke berapa dan apa yang kurang", () => {
  it("bacaan + soal 2 tanpa jawaban benar + soal 3 tanpa teks", () => {
    const d = daftarBelumLengkap({
      bacaan: cekBacaanLengkap(bacaan({ sumber_rujukan: "" }), "tps"),
      soal: [
        { nomor: 2, errors: cekSoalLengkap(soalPg({ kunci: { v: 1 } }), "tps") },
        { nomor: 3, errors: cekSoalLengkap(soalPg({ redaksi: "" }), "tps") },
      ],
    });
    assert.equal(d.length, 3);
    assert.match(d[0], /^Bacaan: Sumber/);
    assert.equal(d[1], "Soal 2: Pilih satu jawaban benar (A–E).");
    assert.equal(d[2], "Soal 3: Teks soal belum diisi.");
  });

  it("kartu kosong ikut disebut; semua lengkap -> daftar kosong", () => {
    assert.deepEqual(daftarBelumLengkap({ soal: [{ nomor: 4, errors: [], kosong: true }] }), [`Soal 4: ${PESAN_KARTU_KOSONG}`]);
    assert.deepEqual(daftarBelumLengkap({ bacaan: [], soal: [{ nomor: 1, errors: [] }] }), []);
  });

  it("per soal maksimal 2 pesan, sisanya dihitung", () => {
    const f = soalPg({ redaksi: "", kunci: { v: 1 }, pembahasan: "", tingkat_kesulitan: "mudah" });
    const errors = cekSoalLengkap(f, "tps");
    assert.ok(new Set(errors.map((e) => e.pesan)).size >= 3);
    assert.match(daftarBelumLengkap({ soal: [{ nomor: 1, errors }] })[0], /^Soal 1: .+ \(\+\d+ hal lain\)$/);
  });

  it("halaman bacaan: kirim memvalidasi bacaan + SEMUA kartu (termasuk kosong) sebelum memanggil API", () => {
    const isi = baca("components/studio-soal/FormStimulus.tsx");
    const ajukan = isi.slice(isi.indexOf("async function ajukan"), isi.indexOf("async function tarik"));
    const iCek = ajukan.indexOf("daftarBelumLengkap({ bacaan: errorsAjukan, soal: kurangSoal })");
    const iApi = ajukan.indexOf("/ajukan`");
    assert.ok(iCek > 0 && iCek < iApi, "validasi sebelum API");
    assert.match(ajukan, /kosong: true/);
    assert.match(ajukan, /terbuka: true/);
    assert.match(isi, /role=\{pesan\.jenis === "gagal" \? "alert" : "status"\}/);
    assert.match(isi, /pesan\.daftar\.map/);
  });
});

describe("K3 — daftar mentor: yang belum lengkap tidak bisa dicentang", () => {
  const kategori = new Map([[PU, "tps"]]);
  const baris = (id: number, f: FormSoal, ubah: Partial<{ status: string; urutan_dalam_stimulus: number | null }> = {}) => ({
    ...f,
    id: ID(id),
    status: "draf",
    urutan_dalam_stimulus: null,
    ...ubah,
  });

  it("susunKelengkapan: alasan pertama per soal & bacaan; yang lengkap tidak ada", () => {
    const st = { ...bacaan(), id: ID(50), status: "draf" };
    const peta = susunKelengkapan(
      [
        baris(1, soalPg()),
        baris(2, soalPg({ kunci: { v: 1 } })),
        baris(3, soalPg({ stimulus_id: ID(50), redaksi: "" }), { urutan_dalam_stimulus: 2 }),
        baris(4, soalPg({ stimulus_id: ID(50) }), { urutan_dalam_stimulus: 1 }),
        baris(5, soalPg({ redaksi: "" }), { status: "diajukan" }),
      ],
      [st],
      kategori,
    );
    assert.equal(peta[`soal:${ID(1)}`], undefined);
    assert.equal(peta[`soal:${ID(2)}`], "Pilih satu jawaban benar (A–E).");
    assert.equal(peta[`soal:${ID(3)}`], "Teks soal belum diisi.");
    assert.equal(peta[`soal:${ID(5)}`], undefined, "bukan draf/ditolak tidak dinilai");
    assert.equal(peta[`bacaan:${ID(50)}`], "Soal ke-2: Teks soal belum diisi.");
  });

  it("bacaan sendiri belum lengkap disebut lebih dulu; subtes yang tidak ditugaskan dilewati", () => {
    assert.match(alasanBacaanBelumLengkap(bacaan({ sumber_rujukan: "" }), [], "tps") ?? "", /^Bacaan: /);
    assert.equal(alasanSoalBelumLengkap(soalPg(), "tps"), null);
    const lain = susunKelengkapan([baris(9, soalPg({ subtes_id: ID(999), redaksi: "" }))], [], kategori);
    assert.deepEqual(lain, {});
  });

  it("kelayakan + kelengkapan: tidak boleh dicentang, alasan 'Belum lengkap: …'", () => {
    const dasar = kelayakanKirim({ status: "draf", stimulusId: null }, new Map());
    assert.deepEqual(kelayakanDenganKelengkapan(dasar, undefined), { boleh: true });
    const k = kelayakanDenganKelengkapan(dasar, "Pilih satu jawaban benar (A–E).");
    assert.deepEqual(k, { boleh: false, alasan: "Belum lengkap: Pilih satu jawaban benar (A–E)." });
    assert.equal(ubahPilihan(new Set(), "soal:x", k.boleh).size, 0);
    // Alasan lain (mis. sudah dikirim) tidak tertimpa.
    const terkirim = kelayakanKirim({ status: "diajukan", stimulusId: null }, new Map());
    assert.deepEqual(kelayakanDenganKelengkapan(terkirim, "x"), terkirim);
  });

  it("halaman daftar memuat kelengkapan di server dengan batas baca; ringkasan gagal tetap ada", () => {
    const page = baca("app/(protected)/(mentor)/studio-soal/page.tsx");
    assert.match(page, /getKelengkapanDraf\(session\.userId\)/);
    const lib = baca("lib/mentor/studioSoal.ts");
    assert.match(lib, /BATAS_CEK_KELENGKAPAN = \{ soal: 300, bacaan: 100 \}/);
    assert.match(lib, /\.limit\(BATAS_CEK_KELENGKAPAN\.soal\)/);
    assert.match(lib, /\.limit\(BATAS_CEK_KELENGKAPAN\.bacaan\)/);
    assert.match(lib, /susunKelengkapan\(/);
    const ui = baca("components/mentor/StudioSoalMentor.tsx");
    assert.match(ui, /Belum lengkap<\/span>/);
    assert.match(ui, /kelayakanDenganKelengkapan\(/);
    assert.match(ui, /ringkasan\.gagal\.map/);
    assert.match(ui, /alasanDariJawabanBacaan\(r\.json\)/);
  });
});
