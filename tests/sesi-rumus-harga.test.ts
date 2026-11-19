/**
 * Test rumus harga per jumlah sesi (lib/shared/hargaSesi.ts). Fungsi murni — tanpa database.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  hargaMulaiDari,
  hitungHargaSesi,
  rincianHargaSemuaSesi,
  type HasilHargaValid,
} from "../lib/shared/hargaSesi";

const KOMBINASI = [
  { nama: "1.000.000 / aktif 899.000 / 10 sesi", hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 10 },
  { nama: "tanpa diskon 1.000.000 / 10 sesi", hargaNormal: 1_000_000, hargaAktif: 1_000_000, jumlahSesiKelas: 10 },
  { nama: "diskon 20% 1.000.000 / 10 sesi", hargaNormal: 1_000_000, hargaAktif: 800_000, jumlahSesiKelas: 10 },
  { nama: "1.500.000 / aktif 1.349.000 / 10 sesi", hargaNormal: 1_500_000, hargaAktif: 1_349_000, jumlahSesiKelas: 10 },
  { nama: "1.000.000 / aktif 899.000 / 8 sesi", hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 8 },
  { nama: "1.500.000 / diskon 20% / 8 sesi", hargaNormal: 1_500_000, hargaAktif: 1_200_000, jumlahSesiKelas: 8 },
  { nama: "kelas murah 300.000 / 10 sesi", hargaNormal: 300_000, hargaAktif: 300_000, jumlahSesiKelas: 10 },
  { nama: "kelas murah 300.000 / aktif 270.000 / 10 sesi", hargaNormal: 300_000, hargaAktif: 270_000, jumlahSesiKelas: 10 },
  { nama: "kelas mahal 2.500.000 / 10 sesi", hargaNormal: 2_500_000, hargaAktif: 2_500_000, jumlahSesiKelas: 10 },
  { nama: "kelas mahal 2.500.000 / aktif 2.250.000 / 10 sesi", hargaNormal: 2_500_000, hargaAktif: 2_250_000, jumlahSesiKelas: 10 },
];

function harga(k: (typeof KOMBINASI)[number], n: number, subtes = 1): HasilHargaValid {
  const h = hitungHargaSesi({ ...k, jumlahSesiDipilih: n, jumlahSubtes: subtes });
  assert.equal(h.valid, true, `${k.nama} N=${n}`);
  return h as HasilHargaValid;
}

describe("sifat rumus untuk setiap kombinasi dan setiap N valid", () => {
  for (const k of KOMBINASI) {
    describe(k.nama, () => {
      const maks = 2 * k.jumlahSesiKelas;
      const semua = Array.from({ length: maks }, (_, i) => harga(k, i + 1));

      it("semua hasil bilangan bulat", () => {
        for (const h of semua) {
          for (const v of [h.hargaPerSesi, h.hargaDasar, h.biayaSesiTambahan, h.totalSebelumPromo, h.sesiTotal, h.sesiTambahan]) {
            assert.ok(Number.isInteger(v), `N=${h.sesiTotal}: ${v}`);
          }
        }
      });

      it("harga(N) naik tegas dari N=1 sampai N=2 x jumlahSesiKelas", () => {
        for (let i = 1; i < semua.length; i++) {
          assert.ok(semua[i].totalSebelumPromo > semua[i - 1].totalSebelumPromo, `N=${i} -> ${i + 1}`);
        }
      });

      it("harga(jumlahSesiKelas) = hargaAktif persis", () => {
        assert.equal(harga(k, k.jumlahSesiKelas).totalSebelumPromo, k.hargaAktif);
      });

      it("N < jumlahSesiKelas: harga < hargaAktif, tanpa biaya tambahan", () => {
        for (const h of semua.filter((x) => x.sesiTotal < k.jumlahSesiKelas)) {
          assert.ok(h.totalSebelumPromo < k.hargaAktif, `N=${h.sesiTotal}`);
          assert.equal(h.biayaSesiTambahan, 0);
        }
      });

      it("N > jumlahSesiKelas: selisih dari hargaAktif = (N - dasar) x hargaPerSesi", () => {
        for (const h of semua.filter((x) => x.sesiTotal > k.jumlahSesiKelas)) {
          assert.equal(h.totalSebelumPromo - k.hargaAktif, (h.sesiTotal - k.jumlahSesiKelas) * h.hargaPerSesi);
          assert.equal(h.hargaDasar, k.hargaAktif);
        }
      });

      it("tambahan tarif per sesi paket kecil paling banyak Rp15.000 (premium = harga(N)/N - hargaPerSesi, kecuali batas atas)", () => {
        for (const h of semua.filter((x) => x.sesiTotal < k.jumlahSesiKelas)) {
          const premiumEfektif = h.totalSebelumPromo / h.sesiTotal - h.hargaPerSesi;
          assert.ok(premiumEfektif <= 15_000, `N=${h.sesiTotal}: premium ${premiumEfektif}`);
        }
      });

      it("hargaMulaiDari = harga(1) = nilai minimum", () => {
        const mulai = hargaMulaiDari(k);
        assert.equal(mulai.valid, true);
        const nilai = mulai.valid ? mulai.harga : -1;
        assert.equal(nilai, semua[0].totalSebelumPromo);
        assert.equal(nilai, Math.min(...semua.map((h) => h.totalSebelumPromo)));
      });

      it("diskonKelasBerlaku dan kodePromoBerlaku false untuk N < jumlahSesiKelas, true selain itu", () => {
        for (const h of semua) {
          const penuh = h.sesiTotal >= k.jumlahSesiKelas;
          assert.equal(h.diskonKelasBerlaku, penuh, `N=${h.sesiTotal}`);
          assert.equal(h.kodePromoBerlaku, penuh, `N=${h.sesiTotal}`);
        }
      });

      it("rincianHargaSemuaSesi memuat N=1..2 x dasar dan sama dengan hitungHargaSesi", () => {
        const r = rincianHargaSemuaSesi(k);
        assert.equal(r.valid, true);
        if (!r.valid) return;
        assert.deepEqual(r.daftar, semua);
        assert.equal(r.daftar.length, maks);
      });
    });
  }
});

describe("angka konkret: normal 1.000.000, aktif 899.000, 10 sesi", () => {
  const k = KOMBINASI[0];
  const tabel: Record<number, number> = {
    1: 115_000, // premium 15% = 15.000 (tepat di batas)
    2: 230_000,
    3: 345_000,
    4: 430_000, // premium 7,5% = 7.500
    5: 537_500,
    6: 645_000,
    7: 700_000, // di atas 60%: tanpa premium
    8: 800_000,
    9: 854_050, // batas atas aktif (mentah 900.000)
    10: 899_000,
    12: 1_099_000,
    20: 1_899_000,
  };
  for (const [n, nilai] of Object.entries(tabel)) {
    it(`${n} sesi = ${nilai}`, () => {
      assert.equal(harga(k, Number(n)).totalSebelumPromo, nilai);
    });
  }

  it("hargaPerSesi = 100.000", () => {
    assert.equal(harga(k, 5).hargaPerSesi, 100_000);
  });

  it("hargaMulaiDari = 115.000 dan 1 sesi = 115.000", () => {
    const mulai = hargaMulaiDari(k);
    assert.deepEqual(mulai, { valid: true, harga: 115_000 });
  });

  it("batas atas aktif hanya di N=9 (N=1..8 memakai harga mentah)", () => {
    const aktif = Array.from({ length: 20 }, (_, i) => harga(k, i + 1)).filter((h) => h.batasAtasAktif).map((h) => h.sesiTotal);
    assert.deepEqual(aktif, [9]);
  });
});

describe("premium paket kecil per kelas", () => {
  const premium = (hargaNormal: number, n: number) => {
    const h = harga({ nama: "", hargaNormal, hargaAktif: hargaNormal, jumlahSesiKelas: 10 }, n);
    return h.totalSebelumPromo / n - h.hargaPerSesi;
  };

  it("kelas 300.000: premium 4.500 (15% dari 30.000), bukan 15.000", () => {
    assert.equal(premium(300_000, 1), 4_500);
    assert.equal(premium(300_000, 3), 4_500);
    assert.equal(premium(300_000, 4), 2_250); // 7,5%
  });

  it("kelas 2.500.000: premium tepat 15.000 (dibatasi; 15% = 37.500, 7,5% = 18.750)", () => {
    assert.equal(premium(2_500_000, 1), 15_000);
    assert.equal(premium(2_500_000, 3), 15_000);
    assert.equal(premium(2_500_000, 4), 15_000);
    assert.equal(premium(2_500_000, 6), 15_000);
  });

  it("di atas 60% paket tidak ada premium (N=7 = hargaPerSesi x 7)", () => {
    assert.equal(premium(1_000_000, 7), 0);
  });
});

describe("galat sebagai nilai (tidak melempar)", () => {
  const dasar = { hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSesiDipilih: 10, jumlahSubtes: 1 };
  const galat = (ubah: Partial<typeof dasar>) => {
    const h = hitungHargaSesi({ ...dasar, ...ubah });
    assert.equal(h.valid, false);
    assert.ok(!h.valid && h.galat.length > 0);
  };

  it("masukan dasar valid diterima", () => {
    assert.equal(hitungHargaSesi(dasar).valid, true);
  });
  it("N < jumlahSubtes ditolak", () => galat({ jumlahSesiDipilih: 2, jumlahSubtes: 3 }));
  it("N = 0 ditolak", () => galat({ jumlahSesiDipilih: 0 }));
  it("N = 21 ditolak (> 2 x dasar)", () => galat({ jumlahSesiDipilih: 21 }));
  it("N = 20 diterima (batas atas)", () => assert.equal(hitungHargaSesi({ ...dasar, jumlahSesiDipilih: 20 }).valid, true));
  it("hargaAktif > hargaNormal ditolak", () => galat({ hargaAktif: 1_000_001 }));
  it("masukan pecahan ditolak", () => {
    galat({ hargaNormal: 1_000_000.5 });
    galat({ hargaAktif: 899_000.5 });
    galat({ jumlahSesiKelas: 10.5 });
    galat({ jumlahSesiDipilih: 5.5 });
    galat({ jumlahSubtes: 1.5 });
  });
  it("NaN / Infinity ditolak", () => {
    galat({ hargaNormal: Number.NaN });
    galat({ jumlahSesiDipilih: Number.POSITIVE_INFINITY });
  });
  it("jumlahSesiKelas <= 0 ditolak", () => {
    galat({ jumlahSesiKelas: 0 });
    galat({ jumlahSesiKelas: -10 });
  });
  it("jumlahSubtes di luar 1..3 ditolak", () => {
    galat({ jumlahSubtes: 0 });
    galat({ jumlahSubtes: 4 });
  });
  it("harga <= 0 ditolak", () => {
    galat({ hargaNormal: 0, hargaAktif: 0 });
    galat({ hargaAktif: 0 });
  });
  it("hargaMulaiDari dan rincianHargaSemuaSesi mengembalikan galat untuk masukan tidak valid", () => {
    assert.equal(hargaMulaiDari({ hargaNormal: 1000, hargaAktif: 2000, jumlahSesiKelas: 10 }).valid, false);
    assert.equal(rincianHargaSemuaSesi({ hargaNormal: 1000, hargaAktif: 900, jumlahSesiKelas: 0 }).valid, false);
    assert.equal(rincianHargaSemuaSesi({ hargaNormal: 1000, hargaAktif: 900, jumlahSesiKelas: 10, jumlahSubtes: 4 }).valid, false);
  });

  it("rincian dengan 3 subtes dimulai dari N=3", () => {
    const r = rincianHargaSemuaSesi({ hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSubtes: 3 });
    assert.equal(r.valid, true);
    if (r.valid) {
      assert.equal(r.daftar[0].sesiTotal, 3);
      assert.equal(r.daftar.length, 18);
    }
  });
});

describe("keamanan: murni dan deterministik", () => {
  const sumber = readFileSync(new URL("../lib/shared/hargaSesi.ts", import.meta.url), "utf8");

  it("tidak mengimpor supabase, next/headers, atau server-only", () => {
    assert.ok(!/from\s+["'][^"']*supabase[^"']*["']/i.test(sumber));
    assert.ok(!/next\/headers/.test(sumber.replace(/\/\*[\s\S]*?\*\//g, "")));
    assert.ok(!/server-only/.test(sumber.replace(/\/\*[\s\S]*?\*\//g, "")));
    assert.ok(!/^\s*import\s/m.test(sumber), "file ini tidak boleh punya impor apa pun");
  });

  it("dua panggilan identik menghasilkan hasil sama", () => {
    const masukan = { hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSesiDipilih: 7, jumlahSubtes: 2 };
    assert.deepEqual(hitungHargaSesi(masukan), hitungHargaSesi(masukan));
    const dasar = { hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 10 };
    assert.deepEqual(rincianHargaSemuaSesi(dasar), rincianHargaSemuaSesi(dasar));
  });

  it("masukan tidak diubah", () => {
    const masukan = Object.freeze({ hargaNormal: 1_000_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSesiDipilih: 4, jumlahSubtes: 1 });
    assert.doesNotThrow(() => hitungHargaSesi(masukan));
  });
});
