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

// Semua angka di bagian ini memakai HARGA TERCANTUM (kelas.harga apa adanya, mis. 999.000) sebagai hargaNormal.
describe("hitungMargin & hargaBayarMinimal (hargaTercantum 999.000, 10 sesi)", () => {
  const k = { hargaNormal: 999_000, jumlahSesiKelas: 10 };

  it("tanpa diskon paket penuh: honor 649.350, sisa 349.650, margin 35,0% persis", () => {
    const h = hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: 999_000 });
    assert.deepEqual(h, { valid: true, honor: 649_350, sisaDimentoring: 349_650, marginPersen: 35 });
  });

  it("honor per sesi 64.935 (65% x 99.900), dihitung dari harga tercantum", () => {
    assert.equal(honorPerSesi(999_000, 10), 64_935);
  });

  it("kelas.harga 899.000: honor per sesi 58.435 (65% x 89.900), paket penuh 584.350", () => {
    assert.equal(honorPerSesi(899_000, 10), 58_435);
    const h = hitungMargin({ hargaNormal: 899_000, jumlahSesiKelas: 10, jumlahSesi: 10, hargaDibayar: 899_000 });
    assert.deepEqual(h, { valid: true, honor: 584_350, sisaDimentoring: 314_650, marginPersen: 35 });
  });

  it("honor TIDAK ikut diskon: harga dibayar berubah, honor tetap", () => {
    const tanpa = hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: 999_000 });
    const diskon = hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: 929_070 });
    assert.ok(tanpa.valid && diskon.valid);
    if (tanpa.valid && diskon.valid) assert.equal(tanpa.honor, diskon.honor);
  });

  it("hargaBayarMinimal(999.000, 10 sesi) = 927.643 (dibulatkan ke atas), tepat di batas", () => {
    assert.equal(hargaBayarMinimal({ ...k, jumlahSesi: 10 }), 927_643);
    const bawah = hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: 927_642 });
    const pas = hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: 927_643 });
    assert.ok(bawah.valid && bawah.sisaDimentoring * 100 < 30 * 927_642);
    assert.ok(pas.valid && pas.sisaDimentoring * 100 >= 30 * 927_643);
  });

  it("diskonMaksimal: nominal 71.357, persen 7,1 (dibulatkan ke bawah)", () => {
    assert.deepEqual(diskonMaksimal(k), { valid: true, nominal: 71_357, persen: 7.1 });
  });

  it("masukan tidak valid dikembalikan sebagai nilai, tidak melempar", () => {
    assert.equal(hitungMargin({ ...k, hargaNormal: 1000.5, jumlahSesi: 10, hargaDibayar: 1000 }).valid, false);
    assert.equal(hitungMargin({ ...k, jumlahSesi: 0, hargaDibayar: 1000 }).valid, false);
    assert.equal(hitungMargin({ ...k, jumlahSesi: 10, hargaDibayar: -1 }).valid, false);
    assert.equal(hargaBayarMinimal({ hargaNormal: 0, jumlahSesiKelas: 10, jumlahSesi: 10 }), null);
    assert.equal(diskonMaksimal({ hargaNormal: 999_000, jumlahSesiKelas: 0 }).valid, false);
  });
});

describe("tanpa diskon, margin >= 34,5% untuk setiap N (1..2 x dasar), semua hargaTercantum uji", () => {
  for (const t of [999_000, 899_000, 299_000, 2_499_000]) {
    for (const j of [10, 8]) {
      it(`hargaTercantum ${t} / ${j} sesi`, () => {
        const r = rincianHargaSemuaSesi({ hargaNormal: t, hargaAktif: t, jumlahSesiKelas: j });
        assert.equal(r.valid, true);
        if (!r.valid) return;
        for (const h of r.daftar) {
          const m = hitungMargin({ hargaNormal: t, jumlahSesiKelas: j, jumlahSesi: h.sesiTotal, hargaDibayar: h.totalSebelumPromo });
          assert.ok(m.valid);
          // Bandingkan pada bilangan bulat (bukan pada persen yang sudah dibulatkan): sisa >= 34,5% dari harga.
          if (m.valid) assert.ok(m.sisaDimentoring * 1000 >= 345 * h.totalSebelumPromo, `N=${h.sesiTotal}: margin ${m.marginPersen}%`);
        }
      });
    }
  }

  it("paket penuh tanpa diskon tepat 35,0% dan sesi tambahan satuan (99.900, honor 64.935) = 35,0%", () => {
    const penuh = hitungMargin({ hargaNormal: 999_000, jumlahSesiKelas: 10, jumlahSesi: 10, hargaDibayar: 999_000 });
    assert.ok(penuh.valid && penuh.marginPersen === 35);
    const satu = hitungMargin({ hargaNormal: 999_000, jumlahSesiKelas: 10, jumlahSesi: 1, hargaDibayar: 99_900 });
    assert.ok(satu.valid && satu.honor === 64_935 && satu.marginPersen === 35);
  });

  it("dengan diskon (aktif 899.000), N=9 -> 853.000 bermargin 31,5% (terendah), masih >= 30%", () => {
    const k = { hargaNormal: 999_000, hargaAktif: 899_000, jumlahSesiKelas: 10 };
    const r = rincianHargaSemuaSesi(k);
    assert.ok(r.valid);
    if (!r.valid) return;
    const h9 = r.daftar[8] as HasilHargaValid;
    assert.equal(h9.totalSebelumPromo, 853_000);
    const m = hitungMargin({ hargaNormal: 999_000, jumlahSesiKelas: 10, jumlahSesi: 9, hargaDibayar: h9.totalSebelumPromo });
    assert.ok(m.valid && m.marginPersen === 31.5);
  });
});

describe("cekDiskonAman", () => {
  const dasar = { ...PRIVATE_ONLINE, hargaNormal: 999_000, jumlahSesiKelas: 10 };

  it("menolak Rp898.000 untuk kelas tercantum Rp999.000 (margin 27,7%) dengan pesan sehari-hari", () => {
    const h = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 898_000 });
    assert.ok(h.berlaku && !h.aman);
    if (h.berlaku) {
      assert.equal(h.margin, 27.7);
      assert.equal(h.hargaBayarMinimal, 927_643);
      assert.equal(
        h.pesan,
        "Diskon terlalu besar. Setelah honor mentor, Dimentoring hanya menyisakan 27,7% (batas minimal 30%). Harga bayar paling rendah yang boleh: Rp927.643.",
      );
    }
  });

  it("menerima Rp930.000 dan harga tercantum; tepat di batas 927.643 diterima, 927.642 ditolak", () => {
    for (const harga of [930_000, 999_000, 927_643]) {
      const h = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: harga });
      assert.ok(h.berlaku && h.aman, String(harga));
      assert.equal(h.berlaku && h.pesan, "");
    }
    const tolak = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 927_642 });
    assert.ok(tolak.berlaku && !tolak.aman);
  });

  it("promo ditumpuk: 930.000 aman sendirian, tetapi dengan promo 5.000 menembus batas", () => {
    assert.ok(cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 930_000 }).berlaku);
    const h = cekDiskonAman({ ...dasar, hargaSetelahDiskonKelas: 930_000, nilaiPromo: 5_000 });
    assert.ok(h.berlaku && !h.aman);
    assert.match(h.berlaku ? h.pesan : "", /Diskon dan promo ditumpuk terlalu besar/);
  });

  it("hargaTercantum 299.000 dan 2.499.000 punya batas sendiri (rasio sama: ~92,86% dari harga tercantum)", () => {
    assert.equal(hargaBayarMinimal({ hargaNormal: 299_000, jumlahSesiKelas: 10, jumlahSesi: 10 }), 277_643);
    assert.equal(hargaBayarMinimal({ hargaNormal: 2_499_000, jumlahSesiKelas: 10, jumlahSesi: 10 }), 2_320_500);
    const murahTolak = cekDiskonAman({ ...PRIVATE_ONLINE, hargaNormal: 299_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 270_000 });
    const murahTerima = cekDiskonAman({ ...PRIVATE_ONLINE, hargaNormal: 299_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 280_000 });
    const mahalTolak = cekDiskonAman({ ...PRIVATE_ONLINE, hargaNormal: 2_499_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 2_250_000 });
    const mahalTerima = cekDiskonAman({ ...PRIVATE_ONLINE, hargaNormal: 2_499_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 2_350_000 });
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
      assert.deepEqual(cekDiskonAman({ tipeKelas, modeKelas, hargaNormal: 999_000, jumlahSesiKelas: 10, hargaSetelahDiskonKelas: 100_000 }), { berlaku: false });
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
  const kelas = (id: string, tipeKelas: string, modeKelas: string, hargaSetelahDiskonKelas = 999_000) => ({
    id,
    nama: `Kelas ${id}`,
    tipeKelas,
    modeKelas,
    hargaNormal: 999_000,
    jumlahSesiKelas: 10,
    hargaSetelahDiskonKelas,
  });

  it("promo persen dihitung dari harga setelah diskon kelas; hanya private online diperiksa", () => {
    const daftar = [kelas("a", "private", "online"), kelas("b", "grouping", "online"), kelas("c", "private", "offline")];
    const p = cekPromoTerhadapKelas(daftar, { tipeDiskon: "persen", nilaiDiskon: 50 });
    assert.deepEqual(p.map((x) => x.kelasId), ["a"]);
  });

  it("nominal tepat di batas (71.357 -> 927.643) diterima, lebih 1 rupiah (71.358) ditolak", () => {
    // 999.000 - 71.356 = 927.644 >= 927.643 (aman); 999.000 - 71.357 = 927.643 juga aman; 71.358 -> 927.642 ditolak.
    assert.deepEqual(cekPromoTerhadapKelas([kelas("a", "private", "online")], { tipeDiskon: "nominal", nilaiDiskon: 71_357 }), []);
    assert.equal(cekPromoTerhadapKelas([kelas("a", "private", "online")], { tipeDiskon: "nominal", nilaiDiskon: 71_358 }).length, 1);
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
  harga = 999_000,
) => ({ id, nama: `Kelas ${id}`, harga, diskon_persen: diskon, jumlah_sesi: 10, tipe_kelas: tipe, mode_pembelajaran: mode });

beforeEach(() => {
  db = { kode_promo: [], kelas: [], kode_promo_kelas: [], iklan_campaign: [] };
  fake = buatFakeSupabase(db);
});

describe("pagar server: simpan diskon kelas (validateKelasInput)", () => {
  const body = { nama: "Privat X", programKategori: "tka", tingkatKelas: "kelas_12", tipeKelas: "private", modePembelajaran: "online", jumlahSesi: 10, harga: 999_000 };

  it("diskon 10% (899.100, margin 27,8%) pada kelas private online ditolak dengan pesan jelas", async () => {
    const hasil = await validateKelas.validateKelasInput({ ...body, diskonPersen: 10 });
    assert.equal(hasil.ok, false);
    assert.match(hasil.ok ? "" : hasil.error, /^Diskon terlalu besar\. Setelah honor mentor, Dimentoring hanya menyisakan 27,8% \(batas minimal 30%\)\. Harga bayar paling rendah yang boleh: Rp927.643\.$/);
  });

  it("diskon 7% (929.070) diterima; tanpa diskon diterima; kosong diterima", async () => {
    for (const diskonPersen of [7, 0, undefined, ""]) {
      const hasil = await validateKelas.validateKelasInput({ ...body, diskonPersen });
      assert.equal(hasil.ok, true, String(diskonPersen));
    }
  });

  it("diskon 8% (919.080) ditolak — di bawah batas 927.643", async () => {
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
    assert.match(hasil.ok ? "" : hasil.error, /Harga bayar paling rendah yang boleh: Rp927.643\./);
  });

  it("ditumpuk dengan diskon kelas yang berlaku: 929.070 + promo nominal 5.000 ditolak, 1.000 diterima", async () => {
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

describe("batas pekerjaan: harga kecil mengikuti hargaSesi", () => {
  it("1 sesi 114.000 untuk tercantum 999.000 / aktif 899.000", () => {
    const h = hitungHargaSesi({ hargaNormal: 999_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSesiDipilih: 1, jumlahSubtes: 1 });
    assert.ok(h.valid && h.totalSebelumPromo === 114_000);
  });

  it("file murni: marginKelas.ts tanpa impor database/server", () => {
    const sumber = readFileSync(new URL("../lib/shared/marginKelas.ts", import.meta.url), "utf8");
    assert.ok(!/^\s*import\s/m.test(sumber), "marginKelas.ts tidak boleh punya impor");
    assert.ok(!/server-only|next\/headers|supabase/i.test(sumber.replace(/\/\*[\s\S]*?\*\//g, "")));
  });
});
