/**
 * Test halaman /program/[kategori] untuk program mahasiswa ("Beasiswa & Karier
 * Mahasiswa", slug pendampingan-mahasiswa): tanpa dropdown Tipe/Tingkat kelas
 * SMA, memakai ulang komponen & data /beasiswa-event (kolom cari, filter tipe
 * konten, tab status), bagian Kelas hanya kalau ada kelas, dan empat program
 * lain tidak berubah. Hanya tampilan — tidak menyentuh checkout/pembayaran.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  PROGRAM_KATEGORI_LABEL,
  PROGRAM_KATEGORI_ORDER,
  PROGRAM_KATEGORI_SLUG,
  PROGRAM_KATEGORI_TAMPILAN,
  programKategoriFromSlug,
} from "../lib/shared/kelasLabels";

const baca = (relatif: string) => readFileSync(path.join(process.cwd(), relatif), "utf8");

/** Spesifier modul dari semua baris `import ... from "..."` (komentar tidak ikut). */
const daftarImpor = (sumber: string) => Array.from(sumber.matchAll(/^import[^;]*?from\s+"([^"]+)";/gm), (m) => m[1]);

describe("PROGRAM_KATEGORI_TAMPILAN — jenis tampilan per program", () => {
  it("slug pendampingan-mahasiswa dipetakan ke tampilan mahasiswa", () => {
    const kategori = programKategoriFromSlug("pendampingan-mahasiswa");
    assert.equal(kategori, "pendampingan_mahasiswa");
    assert.equal(PROGRAM_KATEGORI_TAMPILAN[kategori!], "mahasiswa");
    assert.equal(PROGRAM_KATEGORI_LABEL[kategori!], "Beasiswa & Karier Mahasiswa");
  });

  it("empat program lain tetap tampilan kelas SMA", () => {
    for (const slug of ["konsultasi", "tka", "snbt", "ujian-mandiri"]) {
      const kategori = programKategoriFromSlug(slug);
      assert.ok(kategori, slug);
      assert.equal(PROGRAM_KATEGORI_TAMPILAN[kategori], "kelas_sma", slug);
    }
  });

  it("setiap kategori punya tampilan, dan hanya satu yang mahasiswa", () => {
    for (const kategori of PROGRAM_KATEGORI_ORDER) {
      assert.ok(PROGRAM_KATEGORI_TAMPILAN[kategori], kategori);
      assert.ok(PROGRAM_KATEGORI_SLUG[kategori], kategori);
    }
    const mahasiswa = PROGRAM_KATEGORI_ORDER.filter((k) => PROGRAM_KATEGORI_TAMPILAN[k] === "mahasiswa");
    assert.deepEqual(mahasiswa, ["pendampingan_mahasiswa"]);
  });
});

describe("app/program/[kategori]/page.tsx", () => {
  const sumber = baca("app/program/[kategori]/page.tsx");
  const percabangan = sumber.indexOf("{tampilanMahasiswa ? (");
  const cabangMahasiswa = sumber.slice(percabangan, sumber.indexOf(") : (", percabangan));
  const cabangSma = sumber.slice(sumber.indexOf(") : (", percabangan));

  it("memisahkan dua cabang tampilan", () => {
    assert.ok(percabangan > 0);
    assert.ok(cabangMahasiswa.length > 0 && cabangSma.length > 0);
  });

  it("filter Tipe/Tingkat hanya di cabang kelas SMA, tidak di cabang mahasiswa", () => {
    assert.ok(!cabangMahasiswa.includes("KategoriFilterBar"));
    assert.ok(cabangSma.includes("<KategoriFilterBar slug={slug} />"));
  });

  it("cabang mahasiswa memakai komponen yang sama dengan /beasiswa-event", () => {
    assert.ok(cabangMahasiswa.includes("<BeasiswaEventListClient items={kontenInfo} />"));
    assert.ok(sumber.includes('from "@/components/beasiswa-event/BeasiswaEventListClient"'));
  });

  it("bagian Kelas hanya tampil kalau ada kelas, tanpa pesan 'Belum ada kelas'", () => {
    assert.ok(cabangMahasiswa.includes("items.length > 0"));
    assert.ok(!cabangMahasiswa.includes("Belum ada kelas"));
    // empat program lain tetap punya pesan kosong yang lama
    assert.ok(cabangSma.includes("Belum ada kelas di kategori ini."));
    assert.ok(cabangSma.includes("Belum ada kelas yang cocok dengan filter ini."));
  });

  it("program mahasiswa tidak meneruskan filter tipe/tingkat ke query kelas", () => {
    assert.match(sumber, /tampilanMahasiswa \? \{\} : \{ tipeKelas: tipe, tingkatKelas: tingkat \}/);
  });

  it("konten info baru dibaca untuk program mahasiswa saja", () => {
    assert.match(sumber, /tampilanMahasiswa \? getKontenInfoList\(\) : Promise\.resolve\(\[\]\)/);
  });
});

describe("aturan akses data sama dengan /beasiswa-event", () => {
  const halamanProgram = baca("app/program/[kategori]/page.tsx");
  const halamanBeasiswa = baca("app/beasiswa-event/page.tsx");

  it("kedua halaman memakai SATU fungsi pengambil data yang sama", () => {
    assert.ok(halamanProgram.includes("getKontenInfoList"));
    assert.ok(halamanBeasiswa.includes("getKontenInfoList"));
    assert.ok(halamanProgram.includes('from "@/lib/dashboard/getInfoBeasiswaEvent"'));
  });

  it("halaman program tidak membuka query konten_info sendiri atau memakai klien Supabase langsung", () => {
    assert.ok(!halamanProgram.includes('.from("konten_info")'));
    assert.deepEqual(daftarImpor(halamanProgram).filter((spesifier) => /supabase/i.test(spesifier)), []);
  });

  it("pengambil data tetap server-only dan lewat supabaseServer (service_role)", () => {
    const lib = baca("lib/dashboard/getInfoBeasiswaEvent.ts");
    assert.ok(lib.startsWith('import "server-only";'));
    assert.ok(lib.includes('from "@/lib/supabase/server"'));
  });
});

describe("komponen yang dipakai ulang tidak diduplikasi", () => {
  it("BeasiswaEventListClient memuat kolom cari, filter tipe konten, dan tab status", () => {
    const klien = baca("components/beasiswa-event/BeasiswaEventListClient.tsx");
    assert.ok(klien.includes('placeholder="Cari judul beasiswa, internship, atau event..."'));
    assert.ok(klien.includes("KONTEN_INFO_TIPE_LABEL"));
    assert.ok(klien.includes("Masih Buka") && klien.includes("Sudah Ditutup"));
    for (const tipe of ["beasiswa", "internship", "webinar", "workshop", "event"]) {
      assert.ok(klien.includes(`"${tipe}"`), tipe);
    }
  });

  it("filter Tipe & Tingkat kelas tidak ikut ke komponen konten info", () => {
    const klien = baca("components/beasiswa-event/BeasiswaEventListClient.tsx");
    assert.ok(!klien.includes("TINGKAT_KELAS_LABEL"));
    assert.ok(!klien.includes("TIPE_KELAS_LABEL"));
  });

  it("grid kartu kelas dipakai bersama oleh kedua cabang (tidak ada salinan)", () => {
    const halaman = baca("app/program/[kategori]/page.tsx");
    assert.equal(halaman.split("<KategoriKelasGrid").length - 1, 2);
    assert.ok(!halaman.includes("<KelasCardFrame"));
  });
});

describe("cakupan perubahan: tampilan saja", () => {
  it("halaman program tidak menyentuh pembayaran/checkout", () => {
    for (const berkas of ["app/program/[kategori]/page.tsx", "components/program/KategoriKelasGrid.tsx"]) {
      const impor = daftarImpor(baca(berkas));
      assert.deepEqual(impor.filter((spesifier) => /payment|checkout|mayar|midtrans/i.test(spesifier)), [], berkas);
    }
  });
});
