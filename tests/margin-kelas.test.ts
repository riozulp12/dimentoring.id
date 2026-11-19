/**
 * Test pagar margin kelas private online: fungsi murni (lib/shared/marginKelas.ts) dan pemasangannya di sisi
 * server Admin (validateKelasInput = simpan diskon kelas, validateKodePromoInput = buat/ubah kode promo).
 * Supabase TIRUAN di memori (tidak pernah menyentuh database asli).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { hitungHargaSesi, rincianHargaSemuaSesi, type HasilHargaValid } from "../lib/shared/hargaSesi";
import {
  HONOR_PRIVATE_PERSEN,
  MARGIN_MINIMAL_PERSEN,
  cekDiskonAman,
  cekPromoTerhadapKelas,
  diskonMaksimal,
  hargaBayarMinimal,
  hitungMargin,
  honorPerSesi,
} from "../lib/shared/marginKelas";
import { PERSEN_PRIVATE } from "../scripts/laporan-honor-v2/hitung";
import { buatFakeSupabase, type Db } from "./_fakeSupabase";

const PRIVATE_ONLINE = { tipeKelas: "private", modeKelas: "online" } as const;

describe("konstanta", () => {
  it("margin minimal 30%, honor private 65% — dan honor SAMA dengan skrip laporan honor", () => {
    assert.equal(MARGIN_MINIMAL_PERSEN, 30);
    assert.equal(HONOR_PRIVATE_PERSEN, 65);
    assert.equal(HONOR_PRIVATE_PERSEN, PERSEN_PRIVATE);
  });
});

describe("hitungMargin & hargaBayarMinimal", () => {
  const k = { hargaNormal: 1_000_000, jumlahSesiKelas: 10 };

  it("tanpa diskon paket penuh: honor 650.000, sisa 350.000, margin 35,0% persis", () => {
    const h = hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: 1_000_000 });
    assert.deepEqual(h, { valid: true, honor: 650_000, sisaDimentoring: 350_000, marginPersen: 35 });
  });

  it("honor per sesi 65.000 untuk kelas 1.000.000 / 10 sesi", () => {
    assert.equal(honorPerSesi(1_000_000, 10), 65_000);
  });

  it("hargaBayarMinimal(1.000.000, 10 sesi) = 928.572 (dibulatkan ke atas)", () => {
    assert.equal(hargaBayarMinimal({ ...k, jumlahSesi: 10 }), 928_572);
    // 928.571 belum cukup, 928.572 cukup: tepat di batas.
    const bawah = hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: 928_571 });
    const pas = hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: 928_572 });
    assert.ok(bawah.valid && (bawah.sisaDimentoring * 100) < 30 * 928_571);
    assert.ok(pas.valid && (pas.sisaDimentoring * 100) >= 30 * 928_572);
  });

  it("diskonMaksimal: nominal 71.428, persen 7,1 (dibulatkan ke bawah)", () => {
    assert.deepEqual(diskonMaksimal(k), { valid: true, nominal: 71_428, persen: 7.1 });
  });

  it("masukan tidak valid dikembalikan sebagai nilai, tidak melempar", () => {
    assert.equal(hitungMargin({ ...k, hargaNormal: 1000.5, jumlahSesi: 10, hargaDibayar: 1000 }).valid, false);
    assert.equal(hitungMargin({ ...k, jumlahSesi: 0, hargaDibayar: 1000 }).valid, false);
    assert.equal(hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: -1 }).valid, false);
    assert.equal(hargaBayarMinimal({ hargaNormal: 0, jumlahSesiKelas: 10, jumlahSesi: 10 }), null);
    assert.equal(diskonMaksimal({ hargaNormal: 1_000_000, jumlahSesiKelas: 0 }).valid, false);
  });
});

describe("tanpa diskon, margin >= 35% untuk setiap N (1..2 x dasar), semua kelas uji", () => {
  const kelasUji = [
    { nama: "murah 300.000 / 10", hargaNormal: 300_000, jumlahSesiKelas: 10 },
    { nama: "normal 1.000.000 / 10", hargaNormal: 1_000_000, jumlahSesiKelas: 10 },
    { nama: "normal 1.000.000 / 8", hargaNormal: 1_000_000, jumlahSesiKelas: 8 },
    { nama: "normal 1.500.000 / 10", hargaNormal: 1_500_000, jumlahSesiKelas: 10 },
    { nama: "mahal 2.500.000 / 10", hargaNormal: 2_500_000, jumlahSesiKelas: 10 },
  ];
  for (const k of kelasUji) {
    it(k.nama, () => {
      const r = rincianHargaSemuaSesi({ ...k, hargaAktif: k.hargaNormal });
      assert.equal(r.valid, true);
      if (!r.valid) return;
      for (const h of r.daftar) {
        const m = hitungMargin({ hargaNormal: k.hargaNormal, jumlahSesiKelas: k.jumlahSesiKelas, jumlahSesi: h.sesiTotal, hargaDibayar: h.totalSebelumPromo });
        assert.ok(m.valid);
        // Bandingkan pada bilangan bulat (bukan pada persen yang sudah dibulatkan): sisa >= 35% dari harga.
        if (m.valid) assert.ok(m.sisaDimentoring * 100 >= 35 * h.totalSebelumPromo, `N=${h.sesiTotal}: margin ${m.marginPersen}%`);
      }
    });
  }

  it("sesi tambahan Rp100.000 dengan honor Rp65.000 = margin 35%", () => {
    const m = hitungMargin({ hargaNormal: 1_000_000, jumlahSesiKelas: 10, jumlahSesi: 1, hargaDibayar: 100_000 });
    assert.ok(m.valid);
    if (m.valid) {
      assert.equal(m.honor, 65_000);
      assert.equal(m.marginPersen, 35);
    }
  });

  it("dengan diskon 899.000, paket kecil tetap >= 30% (N=9 terendah: 31,5%)", () => {
    const k = { hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 10 };
    const r = rincianHargaSemuaSesi(k);
    assert.ok(r.valid);
    if (!r.valid) return;
    const marginN9 = hitungMargin({ hargaNormal: 1_000_000, jumlahSesiKelas: 10, jumlahSesi: 9, hargaDibayar: (r.daftar[8] as HasilHargaValid).totalSebelumPromo });
    assert.ok(marginN9.valid && marginN9.marginPersen === 31.5);
  });
});

describe("cekDiskonAman", () => {
  const dasar = { ...PRIVATE_ONLINE, hargaNormal: 1_000_000, jumlahSesiKelas: 10 };

  it("menolak Rp899.000 untuk kelas Rp1.000.000 (margin 27,7%) dengan pesan sehari-hari", () => {
    const h = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 899_000 });
    assert.ok(h.berlaku && !h.aman);
    if (h.berlaku) {
      assert.equal(h.margin, 27.7);
      assert.equal(h.hargaBayarMinimal, 928_572);
      assert.equal(
        h.pesan,
        "Diskon terlalu besar. Setelah honor mentor, Dimentoring hanya menyisakan 27,7% (batas minimal 30%). Harga bayar paling rendah yang boleh: Rp928.572.",
      );
    }
  });

  it("menerima Rp930.000 dan harga normal; tepat di batas 928.572 diterima, 928.571 ditolak", () => {
    for (const harga of [930_000, 1_000_000, 928_572]) {
      const h = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: harga });
      assert.ok(h.berlaku && h.aman, String(harga));
      assert.equal(h.berlaku && h.pesan, "");
    }
    const tolak = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 928_571 });
    assert.ok(tolak.berlaku && !tolak.aman);
  });

  it("promo ditumpuk: 930.000 aman sendirian, tetapi dengan promo 5.000 menembus batas", () => {
    assert.ok(cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 930_000 }).berlaku);
    const h = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 930_000, nilaiPromo: 5_000 });
    assert.ok(h.berlaku && !h.aman);
    assert.match(h.berlaku ? h.pesan : "", /Diskon dan promo ditumpuk terlalu besar/);
  });

  it("kelas murah 300.000 dan mahal 2.500.000 punya batas sendiri (rasio sama: 92,857% dari harga normal)", () => {
    assert.equal(hargaBayarMinimal({ hargaNormal: 300_000, jumlahSesiKelas: 10, jumlahSesi: 10 }), 278_572);
    assert.equal(hargaBayarMinimal({ hargaNormal: 2_500_000, jumlahSesiKelas: 10, jumlahSesi: 10 }), 2_321_429);
    const murahTolak = cekDiskonAman({ ...PRIVATE_ONLINE, hargaNormal: 300_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 270_000 });
    const murahTerima = cekDiskonAman({ ...PRIVATE_ONLINE, hargaNormal: 300_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 280_000 });
    const mahalTolak = cekDiskonAman({ ...PRIVATE_ONLINE, hargaNormal: 2_500_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 2_250_000 });
    const mahalTerima = cekDiskonAman({ ...PRIVATE_ONLINE, hargaNormal: 2_500_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 2_350_000 });
    assert.ok(murahTolak.berlaku && !murahTolak.aman);
    assert.ok(murahTerima.berlaku && murahTerima.aman);
    assert.ok(mahalTolak.berlaku && !mahalTolak.aman);
    assert.ok(mahalTerima.berlaku && mahalTerima.aman);
  });

  it("selain kelas private online -> { berlaku: false } dan tidak memblokir apa pun", () => {
    for (const [tipeKelas, modeKelas] of [
      ["private", "offline"],
      ["semi_private", "online"],
      ["grouping", "online"],
      ["grouping", "offline"],
    ]) {
      assert.deepEqual(cekDiskonAman({ tipeKelas, modeKelas, hargaNormal: 1_000_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 100_000 }), { berlaku: false });
    }
  });

  it("masukan rusak gagal-tertutup (aman: false), tidak melempar", () => {
    const h = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 899_000.5 });
    assert.ok(h.berlaku && !h.aman && h.pesan.length > 0);
    const j = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 2_000_000 });
    assert.ok(j.berlaku && !j.aman);
  });

  it("deterministik", () => {
    const masukan = { ...dasar, hargaSetelahDiskonKelas: 899_000, nilaiPromo: 1000 };
    assert.deepEqual(cekDiskonAman(masukan), cekDiskonAman(masukan));
  });
});

describe("cekPromoTerhadapKelas (murni)", () => {
  const kelas = (id: string, tipeKelas: string, modeKelas: string, hargaSetelahDiskonKelas = 1_000_000) => ({
    id,
    nama: `Kelas ${id}`,
    tipeKelas,
    modeKelas,
    hargaNormal: 1_000_000,
    jumlahSesiKelas: 10,
    hargaSetelahDiskonKelas,
  });

  it("promo persen dihitung dari harga setelah diskon kelas; hanya private online diperiksa", () => {
    const daftar = [kelas("a", "private", "online"), kelas("b", "grouping", "online"), kelas("c", "private", "offline")];
    const p = cekPromoTerhadapKelas(daftar, { tipeDiskon: "persen", nilaiDiskon: 50 });
    assert.deepEqual(p.map((x) => x.kelasId), ["a"]);
  });

  it("nominal tepat di batas diterima, lebih 1 rupiah ditolak", () => {
    assert.deepEqual(cekPromoTerhadapKelas([kelas("a", "private", "online")], { tipeDiskon: "nominal", nilaiDiskon: 71_428 }), []);
    assert.equal(cekPromoTerhadapKelas([kelas("a", "private", "online")], { tipeDiskon: "nominal", nilaiDiskon: 71_429 }).length, 1);
  });
});

// ---------------------------------------------------------------------------
// Pemasangan di sisi server Admin
// ---------------------------------------------------------------------------

let db: Db;
let fake: ReturnType<typeof buatFakeSupabase>;
type ValidateKelas = typeof import("@/lib/admin/validateKelasInput");
type ValidatePromo = typeof import("@/lib/admin/validateKodePromoInput");
let validateKelas: ValidateKelas;
let validatePromo: ValidatePromo;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => unknown }).from = (t: string) => fake.from(t);
  validateKelas = await import("@/lib/admin/validateKelasInput");
  validatePromo = await import("@/lib/admin/validateKodePromoInput");
});

const baris = (
  id: string,
  tipe: string,
  mode: string,
  diskon = 0,
  harga = 1_000_000,
) => ({ id, nama: `Kelas ${id}`, harga, diskon_persen: diskon, jumlah_sesi: 10, tipe_kelas: tipe, mode_pembelajaran: mode });

beforeEach(() => {
  db = { kode_promo: [], kelas: [], kode_promo_kelas: [], iklan_campaign: [] };
  fake = buatFakeSupabase(db);
});

describe("pagar server: simpan diskon kelas (validateKelasInput)", () => {
  const body = { nama: "Privat X", programKategori: "tka", tingkatKelas: "kelas_12", tipeKelas: "private", modePembelajaran: "online", jumlahSesi: 10, harga: 1_000_000 };

  it("diskon 10% (900.000, margin 27,8%) pada kelas private online ditolak dengan pesan jelas", async () => {
    const hasil = await validateKelas.validateKelasInput({ ...body, diskonPersen: 10 });
    assert.equal(hasil.ok, false);
    assert.match(hasil.ok ? "" : hasil.error, /^Diskon terlalu besar\. Setelah honor mentor, Dimentoring hanya menyisakan 27,8% \(batas minimal 30%\)\. Harga bayar paling rendah yang boleh: Rp928\.572\.$/);
  });

  it("diskon 7% (930.000) diterima; tanpa diskon diterima; kosong diterima", async () => {
    for (const diskonPersen of [7, 0, undefined, ""]) {
      const hasil = await validateKelas.validateKelasInput({ ...body, diskonPersen });
      assert.equal(hasil.ok, true, String(diskonPersen));
    }
  });

  it("diskon 8% (920.000) ditolak — di bawah batas 928.572", async () => {
    const hasil = await validateKelas.validateKelasInput({ ...body, diskonPersen: 8 });
    assert.equal(hasil.ok, false);
  });

  it("kelas non-private-online TIDAK diblokir walau diskon besar", async () => {
    for (const ubah of [{ tipeKelas: "grouping" }, { tipeKelas: "semi_private" }]) {
      const hasil = await validateKelas.validateKelasInput({ ...body, ...ubah, diskonPersen: 50 });
      assert.equal(hasil.ok, true, JSON.stringify(ubah));
    }
  });
});

describe("pagar server: buat/ubah kode promo (validateKodePromoInput)", () => {
  const dasar = { kode: "HEMAT", status: "aktif", berlakuSemuaKelas: true };

  it("promo semua-kelas yang menembus batas untuk kelas private online ditolak, nama kelas disebut", async () => {
    db.kelas.push(baris("a", "private", "online"));
    const hasil = await validatePromo.validateKodePromoInput({ ...dasar, tipeDiskon: "persen", nilaiDiskon: 10 });
    assert.equal(hasil.ok, false);
    assert.match(hasil.ok ? "" : hasil.error, /^Kelas "Kelas a": Diskon dan promo ditumpuk terlalu besar|^Kelas "Kelas a": Diskon terlalu besar/);
    assert.match(hasil.ok ? "" : hasil.error, /Harga bayar paling rendah yang boleh: Rp928\.572\./);
  });

  it("ditumpuk dengan diskon kelas yang berlaku: 930.000 + promo nominal 5.000 ditolak, 1.000 diterima", async () => {
    db.kelas.push(baris("a", "private", "online", 7));
    const tolak = await validatePromo.validateKodePromoInput({ ...dasar, tipeDiskon: "nominal", nilaiDiskon: 5_000 });
    assert.equal(tolak.ok, false);
    assert.match(tolak.ok ? "" : tolak.error, /ditumpuk terlalu besar/);
    const terima = await validatePromo.validateKodePromoInput({ ...dasar, tipeDiskon: "nominal", nilaiDiskon: 1_000 });
    assert.equal(terima.ok, true);
  });

  it("promo kecil (5%) pada kelas tanpa diskon diterima", async () => {
    db.kelas.push(baris("a", "private", "online"));
    const hasil = await validatePromo.validateKodePromoInput({ ...dasar, tipeDiskon: "persen", nilaiDiskon: 5 });
    assert.equal(hasil.ok, true);
  });

  it("kelas non-private-online TIDAK diblokir walau promo 50% (grup, semi-private, private offline)", async () => {
    db.kelas.push(baris("g", "grouping", "online"), baris("s", "semi_private", "online"), baris("o", "private", "offline"));
    const hasil = await validatePromo.validateKodePromoInput({ ...dasar, tipeDiskon: "persen", nilaiDiskon: 50 });
    assert.equal(hasil.ok, true);
  });

  it("promo untuk kelas tertentu: hanya kelas yang dicakup diperiksa", async () => {
    db.kelas.push(baris("a", "private", "online"), baris("g", "grouping", "online"));
    const aman = await validatePromo.validateKodePromoInput({ ...dasar, berlakuSemuaKelas: false, kelasIds: ["g"], tipeDiskon: "persen", nilaiDiskon: 50 });
    assert.equal(aman.ok, true);
    const tolak = await validatePromo.validateKodePromoInput({ ...dasar, berlakuSemuaKelas: false, kelasIds: ["a", "g"], tipeDiskon: "persen", nilaiDiskon: 50 });
    assert.equal(tolak.ok, false);
  });

  it("beberapa kelas bermasalah: pesan pertama + jumlah kelas lain", async () => {
    db.kelas.push(baris("a", "private", "online"), baris("b", "private", "online"), baris("c", "private", "online"));
    const hasil = await validatePromo.validateKodePromoInput({ ...dasar, tipeDiskon: "persen", nilaiDiskon: 50 });
    assert.equal(hasil.ok, false);
    assert.match(hasil.ok ? "" : hasil.error, /Ada 2 kelas private online lain/);
  });

  it("promo nonaktif tidak diperiksa saat disimpan", async () => {
    db.kelas.push(baris("a", "private", "online"));
    const hasil = await validatePromo.validateKodePromoInput({ ...dasar, status: "nonaktif", tipeDiskon: "persen", nilaiDiskon: 50 });
    assert.equal(hasil.ok, true);
  });

  it("gagal membaca kelas -> ditolak (gagal-tertutup), bukan lolos diam-diam", async () => {
    db.kelas.push(baris("a", "private", "online"));
    fake.gagal.add("kelas");
    const hasil = await validatePromo.validateKodePromoInput({ ...dasar, tipeDiskon: "persen", nilaiDiskon: 5 });
    assert.equal(hasil.ok, false);
  });
});

describe("batas pekerjaan: premium paket kecil mengikuti hargaSesi", () => {
  it("1 sesi 115.000 (premium 15.000) untuk 1.000.000/899.000", () => {
    const h = hitungHargaSesi({ hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSesiDipilih: 1, jumlahSubtes: 1 });
    assert.ok(h.valid && h.totalSebelumPromo === 115_000);
  });

  it("file murni: marginKelas.ts tanpa impor database/server", () => {
    const sumber = readFileSync(new URL("../lib/shared/marginKelas.ts", import.meta.url), "utf8");
    assert.ok(!/^\s*import\s/m.test(sumber), "marginKelas.ts tidak boleh punya impor");
    assert.ok(!/server-only|next\/headers|supabase/i.test(sumber.replace(/\/\*[\s\S]*?\*\//g, "")));
  });
});
