/**
 * Tes silabus SNBT "Peta Materi": data statis, helper (strategiHook, cariSilabusSnbt), dan render komponen
 * components/program/PetaMateri.tsx di bawah saklar SILABUS_SNBT_AKTIF (+ SESI_PILIHAN_AKTIF untuk baris penutup).
 * Render di proses terpisah (pola tests/kartu-detail-mulai-dari.test.ts).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import "./helpers/envSupabaseUji";
import { ALUR_SESI, SILABUS_SNBT, cariSilabusSnbt, strategiHook } from "@/lib/silabus/silabusSnbt";
import { silabusSnbtAktif } from "@/lib/shared/silabusSnbtFlag";
import { namaSubtesPetaMateri } from "@/lib/silabus/subtesPaket";

function render(props: unknown, env: Record<string, string | undefined>): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("@/components/program/PetaMateri");
    const Komponen = typeof mod.default === "function" ? mod.default : mod.default.default;
    process.stdout.write(renderToStaticMarkup(React.createElement(Komponen, JSON.parse(process.argv[1]))));
  `;
  const e: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "" };
  delete e.SILABUS_SNBT_AKTIF;
  delete e.SESI_PILIHAN_AKTIF;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify(props)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...e, ...env },
  }).replace(/<!-- -->/g, "");
}

const propsPu = { subtesNama: ["Penalaran Umum"], programKategori: "snbt", tipeKelas: "group", modePembelajaran: "online" };
const NYALA = { SILABUS_SNBT_AKTIF: "true" };

const awal = process.env.SILABUS_SNBT_AKTIF;
after(() => {
  if (awal === undefined) delete process.env.SILABUS_SNBT_AKTIF;
  else process.env.SILABUS_SNBT_AKTIF = awal;
});

describe("strategiHook", () => {
  it("mengambil kalimat pertama saja", () => {
    assert.equal(strategiHook("Satu kalimat. Dua kalimat."), "Satu kalimat.");
    assert.equal(strategiHook("Hafal 1/4, 1/5. Lalu latihan."), "Hafal 1/4, 1/5.");
  });
  it("teks satu kalimat utuh tetap utuh, selalu berakhiran titik", () => {
    assert.equal(strategiHook("Hanya satu"), "Hanya satu.");
    assert.equal(strategiHook("  Hanya satu.  "), "Hanya satu.");
  });
});

describe("data silabus", () => {
  it("memuat 7 subtes dengan kunci yang diharapkan", () => {
    assert.deepEqual(SILABUS_SNBT.map((s) => s.kunci), ["pu", "ppu", "pbm", "pk", "lbi", "lbing", "pm"]);
    assert.equal(ALUR_SESI, "Diagnostik, Latihan per tipe soal, Strategi waktu, Tryout, Pembahasan");
  });
  it("tiap tipe soal punya strategi dua kalimat dan tidak ada nama tipe ganda dalam satu subtes", () => {
    for (const s of SILABUS_SNBT) {
      assert.ok(s.kemampuanInti.length > 0 && s.tipeSoal.length > 0, s.nama);
      const nama = s.tipeSoal.map((x) => x.nama);
      assert.equal(new Set(nama).size, nama.length, `duplikat di ${s.nama}`);
      for (const x of s.tipeSoal) {
        const kalimat = x.strategi.split(". ");
        assert.equal(kalimat.length, 2, `${s.nama} / ${x.nama}`);
        assert.ok(x.strategi.endsWith("."), `${s.nama} / ${x.nama}`);
      }
    }
  });
  it("judul dua subtes literasi sama dengan nama resmi di tabel subtes; alias lama tetap cocok", () => {
    assert.equal(SILABUS_SNBT.find((s) => s.kunci === "lbi")!.nama, "Literasi dalam Bahasa Indonesia");
    assert.equal(SILABUS_SNBT.find((s) => s.kunci === "lbing")!.nama, "Literasi dalam Bahasa Inggris");
    assert.equal(cariSilabusSnbt("Literasi Bahasa Indonesia", "snbt")?.kunci, "lbi");
    assert.equal(cariSilabusSnbt("Literasi Bahasa Inggris", "snbt")?.kunci, "lbing");
  });
  it("Penalaran Umum dikelompokkan Induktif, Deduktif, Kuantitatif", () => {
    const pu = SILABUS_SNBT.find((s) => s.kunci === "pu")!;
    assert.deepEqual([...new Set(pu.tipeSoal.map((x) => x.bagian))], ["Induktif", "Deduktif", "Kuantitatif"]);
  });
});

describe("cariSilabusSnbt", () => {
  it("alias, nama resmi di tabel subtes, huruf besar/diakritik/spasi ganda cocok untuk snbt", () => {
    assert.equal(cariSilabusSnbt("PPU", "snbt")?.kunci, "ppu");
    assert.equal(cariSilabusSnbt("  penalaran   UMUM ", "snbt")?.kunci, "pu");
    assert.equal(cariSilabusSnbt("Literasi dalam Bahasa Indonesia", "snbt")?.kunci, "lbi");
    assert.equal(cariSilabusSnbt("Literasi dalam Bahasa Inggris", "snbt")?.kunci, "lbing");
    assert.equal(cariSilabusSnbt("Literasi Bahasa Inggris", "snbt")?.kunci, "lbing");
    assert.equal(cariSilabusSnbt("Pemahaman Bacaan dan Menulis", "snbt")?.kunci, "pbm");
    assert.equal(cariSilabusSnbt("Pénalaran Matematika", "snbt")?.kunci, "pm");
  });
  it("null untuk kategori lain", () => {
    assert.equal(cariSilabusSnbt("Penalaran Umum", "tka"), null);
    assert.equal(cariSilabusSnbt("Penalaran Umum", null), null);
  });
  it('"Matematika" generik dan nama kosong = null', () => {
    for (const n of ["Matematika", "Bahasa Indonesia", "Bahasa Inggris", "", null, undefined]) {
      assert.equal(cariSilabusSnbt(n, "snbt"), null, String(n));
    }
  });
});

describe("saklar SILABUS_SNBT_AKTIF", () => {
  it("hanya string persis true yang menyalakan", () => {
    for (const [nilai, hasil] of [["true", true], ["TRUE", false], ["1", false], ["", false], [undefined, false]] as const) {
      if (nilai === undefined) delete process.env.SILABUS_SNBT_AKTIF;
      else process.env.SILABUS_SNBT_AKTIF = nilai;
      assert.equal(silabusSnbtAktif(), hasil, String(nilai));
    }
  });
});

describe("render PetaMateri", () => {
  it("menampilkan heading, <details> tertutup, kemampuan inti, bagian, nama tipe, hook, dan alur", () => {
    const html = render(propsPu, NYALA);
    assert.ok(html.includes("Peta Materi"));
    assert.ok(html.includes("<details") && !html.includes("<details open"));
    assert.ok(html.includes("Penalaran Umum"));
    assert.ok(html.includes("Menarik pola, menyimpulkan dari premis"));
    for (const bagian of ["Induktif", "Deduktif", "Kuantitatif"]) assert.ok(html.includes(bagian), bagian);
    assert.ok(html.includes("Pola bilangan dan deret"));
    assert.ok(html.includes("Cari aturannya dari 2-3 contoh dulu."));
    assert.ok(html.includes("Alur 10 sesi") && html.includes(ALUR_SESI));
  });
  it("tidak memuat kalimat kedua strategi untuk semua subtes dan tidak memuat kata jadwal", () => {
    for (const s of SILABUS_SNBT) {
      const html = render({ ...propsPu, subtesNama: [s.nama] }, NYALA);
      assert.ok(html.includes(s.nama));
      for (const x of s.tipeSoal) {
        const [hook, detail] = x.strategi.split(". ");
        assert.ok(html.includes(hook!.replace(/&/g, "&amp;").replace(/'/g, "&#x27;")) || html.includes(hook!), `${s.nama}/${x.nama}`);
        assert.ok(!html.includes(detail!.replace(/\.$/, "")), `kalimat kedua bocor: ${s.nama}/${x.nama}`);
      }
      assert.ok(!/jadwal/i.test(html), s.nama);
    }
  });
  it("flag mati, TRUE, atau 1 = tidak merender apa pun", () => {
    assert.equal(render(propsPu, {}), "");
    assert.equal(render(propsPu, { SILABUS_SNBT_AKTIF: "TRUE" }), "");
    assert.equal(render(propsPu, { SILABUS_SNBT_AKTIF: "1" }), "");
  });
  it("tanpa subtes cocok atau bukan snbt = tidak merender apa pun (tanpa wrapper kosong)", () => {
    assert.equal(render({ ...propsPu, subtesNama: ["Matematika"] }, NYALA), "");
    assert.equal(render({ ...propsPu, subtesNama: [null] }, NYALA), "");
    assert.equal(render({ ...propsPu, programKategori: "tka" }, NYALA), "");
  });
  it('baris "Tambah sesi saat checkout" hanya untuk private online + SESI_PILIHAN_AKTIF', () => {
    const privOnline = { ...propsPu, tipeKelas: "private", modePembelajaran: "online" };
    const baris = "Tambah sesi saat checkout";
    assert.ok(render(privOnline, { ...NYALA, SESI_PILIHAN_AKTIF: "true" }).includes(baris));
    assert.ok(!render(privOnline, NYALA).includes(baris));
    assert.ok(!render({ ...privOnline, modePembelajaran: "offline" }, { ...NYALA, SESI_PILIHAN_AKTIF: "true" }).includes(baris));
    assert.ok(!render({ ...privOnline, tipeKelas: "group" }, { ...NYALA, SESI_PILIHAN_AKTIF: "true" }).includes(baris));
  });
});

describe("PetaMateri di dalam kotak Materi", () => {
  it("varian dalamKotakMateri: tanpa judul ganda 'Peta Materi', daftar tetap tertutup", () => {
    const html = render({ ...propsPu, dalamKotakMateri: true }, NYALA);
    assert.ok(!html.includes("Peta Materi"));
    assert.ok(html.includes("<details") && !html.includes("<details open"));
    assert.ok(html.includes("Pola bilangan dan deret"));
    assert.equal(render({ ...propsPu, dalamKotakMateri: true }, {}), "");
  });

  const src = readFileSync("app/program/kelas/[kelasId]/page.tsx", "utf8");
  const mulaiDeskripsi = src.indexOf(">Deskripsi<");
  const mulaiMateri = src.indexOf("CARD 3");
  const blokDeskripsiSampaiMateri = src.slice(mulaiDeskripsi, mulaiMateri);
  const blokMateri = src.slice(mulaiMateri);

  it("PetaMateri TIDAK ada di blok Deskripsi/Info Kelas, ada di kotak Materi", () => {
    assert.ok(mulaiDeskripsi > 0 && mulaiMateri > mulaiDeskripsi);
    assert.ok(!blokDeskripsiSampaiMateri.includes("<PetaMateri"));
    assert.equal(blokMateri.match(/<PetaMateri/g)?.length, 1);
    assert.ok(blokMateri.includes("dalamKotakMateri"));
  });
  it("teks 'akan segera tersedia' hanya disembunyikan bila ada silabus cocok (tetap ada bila saklar mati / tak cocok)", () => {
    assert.match(blokMateri, /adaPetaMateri \? null : <p[^>]*>Materi untuk kelas ini akan segera tersedia\./);
    assert.match(src, /const adaPetaMateri = silabusCocok\(namaSubtesPeta, kelas\.programKategori\)\.length > 0;/);
  });
  it("silabusCocok kosong bila saklar mati, subtes tak cocok, atau bukan snbt", () => {
    const kode = `
      const { silabusCocok } = await import("@/components/program/PetaMateri");
      process.stdout.write(JSON.stringify([
        silabusCocok(["Penalaran Umum"], "snbt").length,
        silabusCocok(["Matematika"], "snbt").length,
        silabusCocok(["Penalaran Umum"], "tka").length,
      ]));
    `;
    const jalan = (env: Record<string, string>) =>
      JSON.parse(
        execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode], {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, NODE_OPTIONS: "", SILABUS_SNBT_AKTIF: "", ...env },
        }),
      );
    assert.deepEqual(jalan({ SILABUS_SNBT_AKTIF: "true" }), [1, 0, 0]);
    assert.deepEqual(jalan({}), [0, 0, 0]);
    assert.deepEqual(jalan({ SILABUS_SNBT_AKTIF: "TRUE" }), [0, 0, 0]);
  });
});

describe("Peta Materi kelas paket (semua subtes paket)", () => {
  const pool = [{ nama: "Literasi dalam Bahasa Inggris" }, { nama: "Penalaran Umum" }, { nama: "Penalaran Matematika" }];

  it("paket (non-offline, pool > 1): semua subtes pool dengan urutan pool; non-paket tetap satu subtes", () => {
    assert.deepEqual(
      namaSubtesPetaMateri({ modePembelajaran: "online", subtesNama: "Literasi dalam Bahasa Inggris", pool }),
      pool.map((p) => p.nama),
    );
    assert.deepEqual(namaSubtesPetaMateri({ modePembelajaran: "online", subtesNama: "Penalaran Umum", pool: pool.slice(0, 1) }), ["Penalaran Umum"]);
    assert.deepEqual(namaSubtesPetaMateri({ modePembelajaran: "online", subtesNama: "Penalaran Umum", pool: null }), ["Penalaran Umum"]);
    assert.deepEqual(namaSubtesPetaMateri({ modePembelajaran: "offline", subtesNama: "Penalaran Umum", pool }), ["Penalaran Umum"]);
    assert.deepEqual(namaSubtesPetaMateri({ modePembelajaran: "online", subtesNama: null, pool: [] }), []);
  });

  it("paket 3 subtes cocok merender 3 daftar lipat berurutan; subtes tak dikenal dilewati", () => {
    const urut = ["Literasi dalam Bahasa Inggris", "Penalaran Umum", "Penalaran Matematika"];
    const html = render({ ...propsPu, subtesNama: urut, dalamKotakMateri: true }, NYALA);
    assert.equal(html.match(/<details/g)?.length, 3);
    // Judul sama persis dengan nama di tabel subtes (yang tampil di "Pilih Subtes" checkout).
    const pos = urut.map((n) => html.indexOf(`>${n}</summary>`));
    assert.ok(pos.every((x) => x > 0) && pos[0]! < pos[1]! && pos[1]! < pos[2]!, JSON.stringify(pos));

    const campur = render({ ...propsPu, subtesNama: ["Matematika", "Penalaran Umum", "Fisika", "Penalaran Matematika"], dalamKotakMateri: true }, NYALA);
    assert.equal(campur.match(/<details/g)?.length, 2);
    assert.ok(campur.indexOf(">Penalaran Umum</summary>") < campur.indexOf(">Penalaran Matematika</summary>"));
  });

  it("satu subtes (non-paket) tetap satu daftar lipat; saklar mati tidak merender apa pun", () => {
    assert.equal(render({ ...propsPu, dalamKotakMateri: true }, NYALA).match(/<details/g)?.length, 1);
    assert.equal(render({ ...propsPu, subtesNama: pool.map((p) => p.nama), dalamKotakMateri: true }, {}), "");
  });

  it("halaman detail dan checkout memakai helper pool subtes yang SAMA (getKelasSubtesOptions)", () => {
    const detail = readFileSync("app/program/kelas/[kelasId]/page.tsx", "utf8");
    const checkout = readFileSync("app/(protected)/(siswa)/checkout/[kelasId]/page.tsx", "utf8");
    assert.ok(checkout.includes("getKelasSubtesOptions(kelasId)"));
    assert.ok(detail.includes("getKelasSubtesOptions(kelas.id)"));
    assert.equal(detail.match(/getKelasSubtesOptions\(/g)?.length, 1);
    assert.match(detail, /pool: perluPoolSubtes \? await getKelasSubtesOptions/);
    assert.match(detail, /subtesNama=\{namaSubtesPeta\}/);
  });
});
