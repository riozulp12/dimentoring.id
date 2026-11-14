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
import { execFileSync } from "node:child_process";
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
    assert.ok(klien.includes('placeholder="Cari judul..."'));
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

/**
 * Render komponen di PROSES TERPISAH tanpa kondisi "react-server" (runner tes
 * memakainya, dan react-dom/server menolak kondisi itu), lalu kembalikan HTML-nya.
 */
function renderDaftar(items: unknown[]): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("@/components/beasiswa-event/BeasiswaEventListClient");
    const Komponen = typeof mod.default === "function" ? mod.default : mod.default.default; // interop CJS/ESM dari tsx
    process.stdout.write(renderToStaticMarkup(React.createElement(Komponen, { items: JSON.parse(process.argv[1]) })));
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify(items)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

const CONTOH = [
  { id: "a", tipe: "beasiswa", judul: "Beasiswa Aktif", deskripsi: null, deadline: "2026-12-20", status: "aktif" },
  { id: "b", tipe: "internship", judul: "Internship Tutup", deskripsi: null, deadline: "2026-11-01", status: "ditutup" },
];

describe("baris filter beasiswa/internship/event (render sungguhan)", () => {
  const html = renderDaftar(CONTOH);

  it('dropdown berlabel "Jenis" yang tertaut ke dropdown, opsi pertama "Semua jenis"', () => {
    const label = html.match(/<label for="([^"]+)"[^>]*>Jenis<\/label>/);
    assert.ok(label, 'label "Jenis" ada');
    assert.ok(html.includes(`id="${label![1]}"`), "label menunjuk ke kontrol yang ada");
    assert.match(html, /<option value="semua"[^>]*>Semua jenis<\/option>/);
    assert.ok(!html.includes(">Semua</option>"), 'tidak ada lagi opsi bernama "Semua"');
    const opsi = Array.from(html.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g), (m) => m[2]);
    // "Semua jenis" selalu pertama; sisanya mengikuti KONTEN_INFO_TIPE_LABEL (satu sumber data).
    assert.equal(opsi[0], "Semua jenis");
    assert.deepEqual(
      [...opsi.slice(1)].sort(),
      ["Beasiswa", "Event", "Internship", "Webinar", "Workshop"],
    );
  });

  it("urutan di baris: Jenis -> Cari -> Status", () => {
    const iJenis = html.indexOf(">Jenis</label>");
    const iDropdown = html.indexOf('aria-haspopup="listbox"');
    const iCari = html.indexOf(">Cari</label>");
    const iInput = html.indexOf('placeholder="Cari judul..."');
    const iStatus = html.indexOf(">Status</span>");
    const iTab = html.indexOf('aria-pressed=');
    const urutan = [iJenis, iDropdown, iCari, iInput, iStatus, iTab];
    assert.ok(urutan.every((i) => i >= 0), `semua elemen ada: ${urutan}`);
    assert.deepEqual([...urutan].sort((a, b) => a - b), urutan, "urutan DOM = Jenis, Cari, Status");
  });

  it("satu baris di desktop (lg:flex-row, sejajar bawah), kolom cari mengisi sisa, mobile boleh turun", () => {
    assert.ok(html.includes("lg:flex-row") && html.includes("lg:items-end"));
    assert.match(html, /<div class="flex min-w-0 flex-1 flex-col gap-1\.5"><label for="[^"]+"[^>]*>Cari<\/label>/);
    // base = kolom (mobile), Jenis + Cari satu baris dibungkus lg:contents agar rata di baris desktop
    assert.ok(html.includes('class="flex flex-col gap-3 lg:flex-row'));
    assert.ok(html.includes("lg:contents"));
  });

  it('status awal "Semua" (bukan "Sudah Ditutup"), tombol berstatus aria-pressed', () => {
    const tombol = Array.from(html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g), (m) => [m[2], m[1]]);
    assert.deepEqual(tombol, [
      ["Semua", "true"],
      ["Masih Buka", "false"],
      ["Sudah Ditutup", "false"],
    ]);
  });

  it("status awal menampilkan SEMUA konten (aktif dan ditutup), bukan daftar kosong", () => {
    assert.ok(html.includes("Beasiswa Aktif"));
    assert.ok(html.includes("Internship Tutup"));
    assert.ok(!html.includes("Tidak ada konten yang cocok"));
  });

  it("status yang aktif tidak bisa tertukar dengan hover (hover hanya abu-abu)", () => {
    const klien = baca("components/beasiswa-event/BeasiswaEventListClient.tsx");
    assert.ok(klien.includes("ring-1 ring-[#081EEA] ring-inset"));
    assert.ok(klien.includes("hover:bg-gray-50 hover:text-black"));
    assert.ok(!klien.includes("hover:border-[#081EEA] hover:text-[#081EEA]"));
  });

  it("daftar kosong sungguhan menampilkan pesan kosong yang sama seperti sebelumnya", () => {
    assert.ok(renderDaftar([]).includes("Belum ada info beasiswa, internship, atau event saat ini."));
  });

  it("logika filter/pencarian/status tidak berubah (AND judul, tipe, status)", () => {
    const klien = baca("components/beasiswa-event/BeasiswaEventListClient.tsx");
    assert.ok(klien.includes("if (q && !item.judul.toLowerCase().includes(q)) return false;"));
    assert.ok(klien.includes('if (tipeFilter !== "semua" && item.tipe !== tipeFilter) return false;'));
    assert.ok(klien.includes('if (statusFilter !== "semua" && item.status !== statusFilter) return false;'));
    assert.ok(klien.includes('useState<StatusFilter>("semua")'));
    assert.ok(klien.includes('useState<TipeFilter>("semua")'));
  });

  it("/beasiswa-event dan /program/pendampingan-mahasiswa memakai komponen yang sama", () => {
    for (const berkas of ["app/beasiswa-event/page.tsx", "app/program/[kategori]/page.tsx"]) {
      assert.ok(baca(berkas).includes("<BeasiswaEventListClient"), berkas);
    }
  });
});
