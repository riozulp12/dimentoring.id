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
import { formBerubah, tujuanTautanDalam, type KlikTautan } from "@/lib/shared/studio-soal/peringatanKeluar";
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
    assert.match(bilah, /KELAS_TOMBOL_BILAH = "w-full min-w-0 max-sm:px-3 sm:w-auto"/);
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

// ---------------------------------------------------------------------------
// Kelompok 4 — peringatan saat menutup tab / keluar (butir 5)
// ---------------------------------------------------------------------------

describe("K4 — peringatan perubahan belum tersimpan", () => {
  const SINI = "https://dimentoring.id/studio-soal/stimulus/abc";
  const tautan = (href: string, attr: Record<string, string> = {}) => {
    const a = {
      href: new URL(href, SINI).href,
      getAttribute: (n: string) => attr[n] ?? null,
      hasAttribute: (n: string) => n in attr,
    };
    return { closest: (sel: string) => (sel === "a[href]" ? a : null) };
  };
  const klik = (target: unknown, ubah: Partial<KlikTautan> = {}): KlikTautan => ({
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: target as EventTarget,
    ...ubah,
  });

  it("tautan internal ke halaman lain dicegat (path + query + hash)", () => {
    assert.equal(tujuanTautanDalam(klik(tautan("/studio-soal")), SINI), "/studio-soal");
    assert.equal(tujuanTautanDalam(klik(tautan("/dashboard/mentor?x=1#a")), SINI), "/dashboard/mentor?x=1#a");
  });

  it("tidak dicegat: tab baru, klik tengah, situs lain, unduhan, target lain, #bagian di halaman ini, bukan tautan", () => {
    assert.equal(tujuanTautanDalam(klik(tautan("/studio-soal"), { ctrlKey: true }), SINI), null);
    assert.equal(tujuanTautanDalam(klik(tautan("/studio-soal"), { metaKey: true }), SINI), null);
    assert.equal(tujuanTautanDalam(klik(tautan("/studio-soal"), { button: 1 }), SINI), null);
    assert.equal(tujuanTautanDalam(klik(tautan("/studio-soal"), { defaultPrevented: true }), SINI), null);
    assert.equal(tujuanTautanDalam(klik(tautan("https://contoh.com/")), SINI), null);
    assert.equal(tujuanTautanDalam(klik(tautan("/berkas.pdf", { download: "" })), SINI), null);
    assert.equal(tujuanTautanDalam(klik(tautan("/studio-soal", { target: "_blank" })), SINI), null);
    assert.equal(tujuanTautanDalam(klik(tautan("#judul-soal-bacaan")), SINI), null);
    assert.equal(tujuanTautanDalam(klik({ closest: () => null }), SINI), null);
    assert.equal(tujuanTautanDalam(klik(null), SINI), null);
  });

  it("form baru yang belum disentuh tidak dianggap berubah; sesudah simpan peringatan hilang", () => {
    const awal = JSON.stringify({ a: "" });
    const isi = JSON.stringify({ a: "x" });
    assert.equal(formBerubah({ jejakTersimpan: null, jejakAwal: awal, jejakSekarang: awal }), false);
    assert.equal(formBerubah({ jejakTersimpan: null, jejakAwal: awal, jejakSekarang: isi }), true);
    assert.equal(formBerubah({ jejakTersimpan: isi, jejakAwal: awal, jejakSekarang: isi }), false);
    assert.equal(formBerubah({ jejakTersimpan: isi, jejakAwal: awal, jejakSekarang: awal }), true);
  });

  it("listener beforeunload: preventDefault + returnValue, dipasang sekali, dibersihkan; tautan dicegat di fase capture", () => {
    const p = baca("components/studio-soal/PenjagaKeluar.tsx");
    assert.match(p, /e\.preventDefault\(\);\s*\/\/[^\n]*\n\s*e\.returnValue = "";/);
    assert.match(p, /window\.addEventListener\("beforeunload", sebelumTutup\)/);
    assert.match(p, /window\.removeEventListener\("beforeunload", sebelumTutup\)/);
    assert.match(p, /document\.addEventListener\("click", klik, true\)/);
    assert.match(p, /document\.removeEventListener\("click", klik, true\)/);
    assert.match(p, /\}, \[\]\);/, "dipasang sekali, keadaan dibaca lewat ref");
    assert.match(p, /Keluar tanpa menyimpan\?/);
  });

  it("halaman bacaan + soal dan halaman soal memakai penjaga; perubahan di semua bagian dihitung", () => {
    const st = baca("components/studio-soal/FormStimulus.tsx");
    const so = baca("components/studio-soal/FormSoal.tsx");
    for (const isi of [st, so]) {
      assert.match(isi, /<PenjagaKeluar adaPerubahan=\{adaPerubahan\} \/>/);
      assert.doesNotMatch(isi, /addEventListener\("beforeunload"/, "tidak ada listener lama");
    }
    // Bacaan (judul, sumber, blok teks & tabel = satu objek form) + setiap kartu soal.
    assert.match(st, /const adaPerubahan = \(bolehEdit && formBerubah\([^)]*\)\) \|\| kartuKotor;/);
    assert.match(st, /kartuSoal\.some\(\(k\) => keadaanKartu\(k\) === "belum"\)/);
  });
});

// ---------------------------------------------------------------------------
// Kelompok 5 — pratinjau menempel (butir 6)
// ---------------------------------------------------------------------------

describe("K5 — pratinjau menempel di kolom kanan layar besar", () => {
  const gaya = baca("components/studio-soal/gaya.ts");
  const css = baca("app/globals.css");
  const stimulus = baca("components/studio-soal/FormStimulus.tsx");
  const soal = baca("components/studio-soal/FormSoal.tsx");
  const kartu = baca("components/studio-soal/KartuSoalBacaan.tsx");

  it("tinggi navbar satu sumber (--tinggi-navbar), dipakai header, <main>, dan jarak sticky", () => {
    assert.match(css, /--tinggi-navbar: 5rem;/);
    assert.match(baca("components/dashboard/header.tsx"), /h-\[var\(--tinggi-navbar\)\]/);
    assert.match(baca("components/dashboard/dashboardLayout.tsx"), /pt-\[var\(--tinggi-navbar\)\]/);
    assert.match(gaya, /lg:sticky lg:top-\[calc\(var\(--tinggi-navbar\)\+1rem\)\]/);
    assert.match(gaya, /lg:max-h-\[calc\(100dvh-var\(--tinggi-navbar\)-9rem\)\] lg:overflow-y-auto/);
    assert.doesNotMatch(stimulus + soal + kartu, /lg:top-4/, "tidak ada lagi sticky yang tertutup header");
  });

  it("dua kolom mulai dari judul: grid lg:items-start membungkus judul + form, aside memakai KOLOM_PRATINJAU", () => {
    for (const isi of [stimulus, soal]) {
      const iGrid = isi.indexOf('lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">');
      const iJudul = isi.indexOf("<h1");
      const iAside = isi.indexOf("KOLOM_PRATINJAU", isi.indexOf("return ("));
      assert.ok(iGrid > 0 && iGrid < iJudul && iJudul < iAside, "judul di dalam kolom kiri grid");
    }
  });

  it("halaman bacaan: kolom kanan berisi pratinjau bacaan + soal yang dibuka (uji kunci), HP tidak menempel", () => {
    assert.match(stimulus, /\["hidden min-w-0 flex-col gap-4 lg:flex", KOLOM_PRATINJAU\]/);
    assert.match(stimulus, /<SoalPratinjau key=\{kartuAktif\.id\} soal=\{kartuAktif\.form\}/);
    assert.match(stimulus, /onAktif=\{\(\) => setIdAktif\(k\.id\)\}/);
    // Di HP pratinjau soal tetap di dalam kartu (tab), pratinjau bacaan lewat tab.
    assert.match(kartu, /\["min-w-0 lg:hidden", tab === "pratinjau" \? "" : "hidden"\]/);
    assert.match(stimulus, /className=\{`\$\{kartu\} lg:hidden`\}/);
  });
});

// ---------------------------------------------------------------------------
// Kelompok 6 — tampilan HP (butir 7, 9)
// ---------------------------------------------------------------------------

describe("K6 — tombol design system di HP, keterangan sejajar", () => {
  const files = [
    "components/studio-soal/FormSoal.tsx",
    "components/studio-soal/FormStimulus.tsx",
    "components/studio-soal/KartuSoalBacaan.tsx",
    "components/studio-soal/SoalPratinjau.tsx",
    "components/studio-soal/EditorRumus.tsx",
    "components/studio-soal/TabTulisPratinjau.tsx",
    "components/mentor/StudioSoalMentor.tsx",
  ];

  it("tidak ada lagi tombol hitam (bg-black) di Studio Soal", () => {
    for (const f of files) assert.doesNotMatch(baca(f), /bg-black/, f);
  });

  it("tab Tulis/Pratinjau (hanya tampil di HP) memakai gaya tombol primary/secondary", () => {
    assert.match(baca("components/studio-soal/TabTulisPratinjau.tsx"), /buttonClassName\(\{ variant: tab === t \? "primary" : "secondary"/);
    for (const f of files.slice(0, 3)) assert.match(baca(f), /<TabTulisPratinjau /, f);
  });

  it("tombol uji kunci jawaban memakai Button", () => {
    const p = baca("components/studio-soal/SoalPratinjau.tsx");
    assert.match(p, /<Button size="sm" onClick=\{periksa\}>/);
    assert.match(p, /<Button size="sm" variant="secondary" onClick=\{ulangi\}>/);
  });

  it("keyboard rumus MathLive dipaksa tema terang (tidak hitam di mode gelap HP)", () => {
    assert.match(baca("components/studio-soal/EditorRumus.tsx"), /document\.body\.setAttribute\("theme", "light"\)/);
  });

  it("keterangan simpan di bilah aksi berada di kotak ber-padding", () => {
    assert.match(baca("components/studio-soal/BilahAksi.tsx"), /rounded-\[12px\] bg-surface-muted px-3 py-1\.5 text-xs/);
  });
});
