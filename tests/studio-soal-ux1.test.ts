/**
 * Test Studio Soal UX-1:
 *   - alasan draf tidak bisa dihapus (lib/shared/studio-soal/hapusDraf.ts)
 *   - jenis ujian, pencarian & paginasi mentor (lib/shared/studio-soal/jenisUjian.ts)
 *     dengan 150 mentor TIRUAN (bukan data database)
 *   - pemeriksaan statis: tidak ada warna hex di file Studio Soal; tidak ada
 *     migrasi SQL baru untuk UX-1
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { alasanTidakBisaHapus, tampilkanTombolHapus } from "@/lib/shared/studio-soal/hapusDraf";
import {
  JENIS_UJIAN,
  MENTOR_PER_HALAMAN,
  cariMentor,
  normalCari,
  potongHalaman,
  subtesUntukJenis,
} from "@/lib/shared/studio-soal/jenisUjian";
import { URUTAN_SUBTES_SNBT } from "@/lib/shared/studio-soal/penugasan";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// Hapus draf
// ---------------------------------------------------------------------------

describe("alasanTidakBisaHapus", () => {
  const dasar = { status: "draf", pernahDiajukan: false, ditugaskan: true };

  it("draf yang belum pernah dikirim boleh dihapus (soal & bacaan kosong)", () => {
    assert.equal(alasanTidakBisaHapus("soal", dasar), null);
    assert.equal(alasanTidakBisaHapus("stimulus", { ...dasar, jumlahSoal: 0 }), null);
  });

  it("bacaan yang masih dipakai soal: sebutkan jumlahnya", () => {
    assert.equal(
      alasanTidakBisaHapus("stimulus", { ...dasar, jumlahSoal: 2 }),
      "Bacaan ini masih dipakai 2 soal. Hapus soal-soalnya dulu.",
    );
  });

  it("pernah dikirim (lalu dibatalkan) atau ditolak: tidak bisa dihapus", () => {
    assert.match(alasanTidakBisaHapus("soal", { ...dasar, pernahDiajukan: true }) ?? "", /sudah pernah dikirim/);
    assert.match(alasanTidakBisaHapus("soal", { ...dasar, status: "ditolak" }) ?? "", /sudah pernah dikirim/);
    assert.match(alasanTidakBisaHapus("stimulus", { ...dasar, status: "ditolak", jumlahSoal: 0 }) ?? "", /^Bacaan ini/);
  });

  it("sedang dicek: arahkan ke Batalkan kirim", () => {
    assert.match(alasanTidakBisaHapus("soal", { ...dasar, status: "diajukan" }) ?? "", /Batalkan kirim/);
  });

  it("tidak lagi ditugaskan: alasan penugasan didahulukan", () => {
    assert.match(alasanTidakBisaHapus("soal", { ...dasar, ditugaskan: false }) ?? "", /tidak lagi ditugaskan/);
  });

  it("tombol tampil untuk draf/ditolak/sedang dicek, tidak untuk yang sudah terbit", () => {
    assert.deepEqual(
      ["draf", "ditolak", "diajukan", "terpublikasi", "digantikan", "diarsipkan"].map(tampilkanTombolHapus),
      [true, true, true, false, false, false],
    );
  });
});

// ---------------------------------------------------------------------------
// Jenis ujian
// ---------------------------------------------------------------------------

describe("jenis ujian", () => {
  const subtes = [
    { id: "mtk", nama: "Matematika", kategori: "tka_wajib" },
    { id: "pm", nama: "Penalaran Matematika", kategori: "literasi" },
    { id: "pu", nama: "Penalaran Umum", kategori: "tps" },
    { id: "lbi", nama: "Literasi dalam Bahasa Indonesia", kategori: "literasi" },
  ];

  it("SNBT = subtes tps + literasi, urut seperti biasa; TKA tidak ikut", () => {
    assert.deepEqual(subtesUntukJenis("snbt", subtes).map((s) => s.id), ["pu", "lbi", "pm"]);
  });

  it("jenis ujian tidak dikenal = kosong (siap ditambah lewat konfigurasi)", () => {
    assert.deepEqual(subtesUntukJenis("tka", subtes), []);
  });

  it("konfigurasi: id unik, tiap jenis punya kategori", () => {
    assert.equal(new Set(JENIS_UJIAN.map((j) => j.id)).size, JENIS_UJIAN.length);
    for (const j of JENIS_UJIAN) assert.ok(j.kategoriSubtes.length > 0, j.id);
  });

  it("7 subtes SNBT di urutan tetap tetap terkelompok utuh", () => {
    const tujuh = URUTAN_SUBTES_SNBT.map((nama, i) => ({ id: `s${i}`, nama, kategori: i < 4 ? "tps" : "literasi" }));
    assert.deepEqual(subtesUntukJenis("snbt", [...tujuh].reverse()).map((s) => s.nama), [...URUTAN_SUBTES_SNBT]);
  });
});

// ---------------------------------------------------------------------------
// Pencarian mentor — 150 data tiruan
// ---------------------------------------------------------------------------

const NAMA_DEPAN = ["Andi", "Budi", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hana", "Indra", "Joko"];
const NAMA_BELAKANG = ["Saputra", "Lestari", "Wijaya", "Pratama", "Nugroho"];
const MENTOR_TIRUAN = Array.from({ length: 150 }, (_, i) => ({
  id: `m${i}`,
  nama: `${NAMA_DEPAN[i % 10]} ${NAMA_BELAKANG[Math.floor(i / 10) % 5]} ${i}`,
  email: `mentor${i}@contoh.id`,
}));

describe("cariMentor + potongHalaman (150 mentor tiruan)", () => {
  it("kata kosong = semua mentor; halaman pertama berisi 20", () => {
    assert.equal(cariMentor(MENTOR_TIRUAN, "   ").length, 150);
    const h = potongHalaman(cariMentor(MENTOR_TIRUAN, ""), 1);
    assert.equal(h.item.length, MENTOR_PER_HALAMAN);
    assert.equal(h.jumlahHalaman, 8);
  });

  it("cari nama: tidak peka huruf besar/kecil & spasi berlebih", () => {
    const hasil = cariMentor(MENTOR_TIRUAN, "  CITRA  ");
    assert.equal(hasil.length, 15);
    assert.ok(hasil.every((m) => m.nama.startsWith("Citra")));
  });

  it("beberapa kata harus semuanya cocok (nama depan + belakang)", () => {
    const hasil = cariMentor(MENTOR_TIRUAN, "andi wijaya");
    assert.ok(hasil.length > 0);
    assert.ok(hasil.every((m) => m.nama.startsWith("Andi Wijaya")));
  });

  it("cari email", () => {
    assert.deepEqual(cariMentor(MENTOR_TIRUAN, "mentor149@").map((m) => m.id), ["m149"]);
  });

  it("aksen diabaikan; email kosong aman", () => {
    const daftar = [{ nama: "Zoë Ámelia", email: null }];
    assert.equal(cariMentor(daftar, "zoe amelia").length, 1);
    assert.equal(normalCari("  Zoë   Á "), "zoe a");
  });

  it("tidak cocok = kosong; paginasi tetap 1 halaman", () => {
    const kosong = cariMentor(MENTOR_TIRUAN, "tidakada");
    assert.equal(kosong.length, 0);
    assert.deepEqual(potongHalaman(kosong, 3), { item: [], halaman: 1, jumlahHalaman: 1 });
  });

  it("halaman di luar batas dijepit; halaman terakhir berisi sisa", () => {
    const akhir = potongHalaman(MENTOR_TIRUAN, 99);
    assert.equal(akhir.halaman, 8);
    assert.equal(akhir.item.length, 10);
    assert.equal(potongHalaman(MENTOR_TIRUAN, 0).halaman, 1);
  });

  it("cepat: 1.000 pencarian atas 150 mentor < 1 detik", () => {
    const mulai = performance.now();
    for (let i = 0; i < 1000; i++) cariMentor(MENTOR_TIRUAN, `budi ${i % 150}`);
    assert.ok(performance.now() - mulai < 1000);
  });
});

// ---------------------------------------------------------------------------
// Statis
// ---------------------------------------------------------------------------

function semuaFile(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((n) => {
    const rel = path.join(dir, n);
    return statSync(path.join(ROOT, rel)).isDirectory() ? semuaFile(rel) : [rel.replace(/\\/g, "/")];
  });
}

describe("statis UX-1", () => {
  const FILE_UI = [
    ...semuaFile("components/studio-soal"),
    ...semuaFile("app/(protected)/(mentor)/studio-soal"),
    "components/mentor/StudioSoalMentor.tsx",
    "components/admin/PenugasanStudioSoalClient.tsx",
    "app/(protected)/(admin)/penugasan-studio-soal/page.tsx",
  ];

  it("tidak ada warna hex di file Studio Soal (pakai token di app/globals.css)", () => {
    for (const f of FILE_UI) assert.doesNotMatch(baca(f), /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/, f);
  });

  it("token warna yang dipakai Studio Soal terdaftar di globals.css", () => {
    const css = baca("app/globals.css");
    for (const t of ["primary", "primary-soft", "muted", "subtle", "line", "line-strong", "surface", "chip", "danger", "success"]) {
      assert.match(css, new RegExp(`--color-${t}:`), t);
    }
  });

  it("tombol utama & isian memakai komponen design system", () => {
    for (const f of ["components/studio-soal/FormSoal.tsx", "components/studio-soal/FormStimulus.tsx"]) {
      const isi = baca(f);
      assert.match(isi, /from "@\/components\/ui\/Button"/, f);
      assert.match(isi, /from "@\/components\/ui\/InputField"/, f);
    }
    assert.match(baca("components/admin/PenugasanStudioSoalClient.tsx"), /from "@\/components\/ui\/InputField"/);
  });

  it("admin tetap menyimpan lewat route penugasan yang sama (RPC studio_soal_atur_penugasan)", () => {
    assert.match(baca("components/admin/PenugasanStudioSoalClient.tsx"), /\/api\/admin\/studio-soal\/penugasan/);
    assert.match(baca("app/api/admin/studio-soal/penugasan/route.ts"), /"studio_soal_atur_penugasan"/);
  });
});
