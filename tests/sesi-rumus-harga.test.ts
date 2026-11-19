/**
 * Test rumus harga per jumlah sesi (lib/shared/hargaSesi.ts). Fungsi murni — tanpa database.
 * `hargaNormal` di rumus = HARGA TERCANTUM (hargaTercantum(kelas.harga)); harga turunan = harga charm
 * (kelipatan Rp1.000 terdekat dikurangi Rp1.000), paket penuh = hargaAktif persis.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AMBANG_HARGA_TERCANTUM,
  CHARM_POTONGAN,
  hargaCharm,
  hargaMulaiDari,
  hargaTercantum,
  hitungHargaSesi,
  rincianHargaSemuaSesi,
  type HasilHargaValid,
} from "../lib/shared/hargaSesi";
import { hitungHargaSetelahDiskon } from "../lib/shared/kelasDiskon";

const TERCANTUM = [999_000, 899_000, 299_000, 2_499_000];
const SESI_KELAS = [10, 8];

interface Kombinasi {
  nama: string;
  hargaNormal: number; // = harga tercantum
  hargaAktif: number;
  jumlahSesiKelas: number;
}

const KOMBINASI: Kombinasi[] = [];
for (const t of TERCANTUM) {
  for (const j of SESI_KELAS) {
    KOMBINASI.push({ nama: `tercantum ${t} / ${j} sesi / tanpa diskon`, hargaNormal: t, hargaAktif: t, jumlahSesiKelas: j });
    KOMBINASI.push({ nama: `tercantum ${t} / ${j} sesi / diskon 20%`, hargaNormal: t, hargaAktif: hitungHargaSetelahDiskon(t, 20), jumlahSesiKelas: j });
  }
}

function harga(k: Kombinasi, n: number, subtes = 1): HasilHargaValid {
  const h = hitungHargaSesi({ ...k, jumlahSesiDipilih: n, jumlahSubtes: subtes });
  assert.equal(h.valid, true, `${k.nama} N=${n}`);
  return h as HasilHargaValid;
}

describe("hargaTercantum: SATU-SATUNYA pengurangan harga paket penuh", () => {
  it("konstanta: potongan Rp1.000, ambang Rp500.000", () => {
    assert.equal(CHARM_POTONGAN, 1000);
    assert.equal(AMBANG_HARGA_TERCANTUM, 500_000);
  });

  it("900.000 -> 899.000; 1.000.000 -> 999.000; batas 500.000 -> 499.000", () => {
    assert.equal(hargaTercantum(900_000), 899_000);
    assert.equal(hargaTercantum(1_000_000), 999_000);
    assert.equal(hargaTercantum(1_500_000), 1_499_000);
    assert.equal(hargaTercantum(500_000), 499_000);
  });

  it("di bawah Rp500.000 tidak dikurangi", () => {
    assert.equal(hargaTercantum(499_000), 499_000);
    assert.equal(hargaTercantum(300_000), 300_000);
    assert.equal(hargaTercantum(299_000), 299_000);
  });

  it("bukan bilangan bulat positif -> null (tidak melempar)", () => {
    for (const x of [0, -1000, 1000.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(hargaTercantum(x), null, String(x));
  });

  it("kelas yang disimpan bulat 1.000.000 menghasilkan tabel harga IDENTIK dengan 999.000", () => {
    const t = hargaTercantum(1_000_000) as number;
    const a = rincianHargaSemuaSesi({ hargaNormal: t, hargaAktif: t, jumlahSesiKelas: 10 });
    const b = rincianHargaSemuaSesi({ hargaNormal: 999_000, hargaAktif: 999_000, jumlahSesiKelas: 10 });
    assert.deepEqual(a, b);
  });
});

describe("hargaCharm", () => {
  it("kelipatan Rp1.000 terdekat (setengah ke atas) dikurangi Rp1.000", () => {
    assert.equal(hargaCharm(114_885), 114_000); // 115.000 - 1.000
    assert.equal(hargaCharm(114_499), 113_000); // 114.000 - 1.000
    assert.equal(hargaCharm(114_500), 114_000); // setengah ke atas
    assert.equal(hargaCharm(1_198_800), 1_198_000);
  });
});

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

      it("semua harga turunan (N bukan paket penuh) kelipatan Rp1.000", () => {
        for (const h of semua.filter((x) => x.sesiTotal !== k.jumlahSesiKelas)) {
          assert.equal(h.totalSebelumPromo % 1000, 0, `N=${h.sesiTotal}: ${h.totalSebelumPromo}`);
        }
      });

      it("harga(N) naik tegas dari N=1 sampai N=2 x jumlahSesiKelas", () => {
        for (let i = 1; i < semua.length; i++) {
          assert.ok(semua[i].totalSebelumPromo > semua[i - 1].totalSebelumPromo, `N=${i} -> ${i + 1}`);
        }
      });

      it("harga(jumlahSesiKelas) = hargaAktif persis (paket penuh tidak berubah)", () => {
        const penuh = harga(k, k.jumlahSesiKelas);
        assert.equal(penuh.totalSebelumPromo, k.hargaAktif);
        assert.equal(penuh.biayaSesiTambahan, 0);
      });

      it("paket kecil tidak pernah lebih mahal dari paket penuh (selalu lebih murah), tanpa biaya tambahan", () => {
        for (const h of semua.filter((x) => x.sesiTotal < k.jumlahSesiKelas)) {
          assert.ok(h.totalSebelumPromo < k.hargaAktif, `N=${h.sesiTotal}`);
          assert.equal(h.biayaSesiTambahan, 0);
        }
      });

      it("N > jumlahSesiKelas: harga = hargaAktif + (N - dasar) x hargaPerSesi dibulatkan charm", () => {
        for (const h of semua.filter((x) => x.sesiTotal > k.jumlahSesiKelas)) {
          const mentah = k.hargaAktif + (h.sesiTotal - k.jumlahSesiKelas) * h.hargaPerSesi;
          assert.equal(h.totalSebelumPromo, hargaCharm(mentah), `N=${h.sesiTotal}`);
          assert.ok(h.totalSebelumPromo > k.hargaAktif);
          assert.equal(h.hargaDasar + h.biayaSesiTambahan, h.totalSebelumPromo);
          // charm hanya menggeser antara -1.500 dan -500 dari hitungan mentah
          assert.ok(mentah - h.totalSebelumPromo >= 500 && mentah - h.totalSebelumPromo <= 1500, `N=${h.sesiTotal}`);
        }
      });

      it("tambahan tarif per sesi paket kecil paling banyak Rp15.000", () => {
        for (const h of semua.filter((x) => x.sesiTotal < k.jumlahSesiKelas)) {
          assert.ok(h.totalSebelumPromo / h.sesiTotal - h.hargaPerSesi <= 15_000, `N=${h.sesiTotal}`);
        }
      });

      it("diskonKelasBerlaku dan kodePromoBerlaku false untuk N < jumlahSesiKelas, true selain itu", () => {
        for (const h of semua) {
          const penuh = h.sesiTotal >= k.jumlahSesiKelas;
          assert.equal(h.diskonKelasBerlaku, penuh, `N=${h.sesiTotal}`);
          assert.equal(h.kodePromoBerlaku, penuh, `N=${h.sesiTotal}`);
        }
      });

      it("kesetaraan: kartu 'Mulai dari' = nominal 1 sesi = baris tabel N=1; tabel = hitungHargaSesi per N", () => {
        const mulai = hargaMulaiDari(k);
        assert.equal(mulai.valid, true);
        const nilai = mulai.valid ? mulai.harga : -1;
        assert.equal(nilai, harga(k, 1).totalSebelumPromo);
        assert.equal(nilai, Math.min(...semua.map((h) => h.totalSebelumPromo)));
        const r = rincianHargaSemuaSesi(k);
        assert.equal(r.valid, true);
        if (!r.valid) return;
        assert.deepEqual(r.daftar, semua);
        assert.equal(r.daftar.length, maks);
        for (const h of r.daftar) assert.equal(h.totalSebelumPromo, harga(k, h.sesiTotal).totalSebelumPromo);
      });
    });
  }
});

describe("angka konkret: hargaTercantum 999.000 (kelas disimpan 1.000.000), tanpa diskon, 10 sesi", () => {
  const k: Kombinasi = { nama: "999", hargaNormal: 999_000, hargaAktif: 999_000, jumlahSesiKelas: 10 };
  const tabel: Record<number, number> = {
    1: 114_000,
    2: 229_000,
    3: 344_000,
    4: 429_000,
    5: 536_000,
    6: 643_000,
    7: 698_000,
    8: 798_000,
    9: 898_000,
    10: 999_000,
    11: 1_098_000,
    12: 1_198_000,
    13: 1_298_000,
    14: 1_398_000,
    15: 1_498_000,
    16: 1_597_000,
    17: 1_697_000,
    18: 1_797_000,
    19: 1_897_000,
    20: 1_997_000,
  };
  for (const [n, nilai] of Object.entries(tabel)) {
    it(`${n} sesi = ${nilai}`, () => {
      assert.equal(harga(k, Number(n)).totalSebelumPromo, nilai);
    });
  }

  it("hargaPerSesi = 99.900", () => {
    assert.equal(harga(k, 5).hargaPerSesi, 99_900);
  });

  it("hargaMulaiDari = 114.000 = harga yang dibayar siswa untuk 1 sesi", () => {
    assert.deepEqual(hargaMulaiDari(k), { valid: true, harga: 114_000 });
  });

  it("batas atas terhadap paket penuh tidak aktif tanpa diskon", () => {
    const aktif = Array.from({ length: 20 }, (_, i) => harga(k, i + 1)).filter((h) => h.batasAtasAktif);
    assert.deepEqual(aktif, []);
  });

  it("dengan diskon kelas (aktif 899.000) batas atas aktif di N=9: 899.100 mentah -> 854.050 -> charm 853.000", () => {
    const h = harga({ ...k, hargaAktif: 899_000 }, 9);
    assert.equal(h.batasAtasAktif, true);
    assert.equal(h.totalSebelumPromo, 853_000);
    assert.ok(h.totalSebelumPromo < 899_000);
  });
});

describe("premium paket kecil per kelas (maks. Rp15.000 per sesi)", () => {
  // Premium efektif dihitung dari harga SEBELUM charm: N=1 ~ hargaPerSesi + premium.
  const sebelumCharm = (t: number, n: number) => {
    const h = harga({ nama: "", hargaNormal: t, hargaAktif: t, jumlahSesiKelas: 10 }, n);
    return { h, premiumMaks: h.totalSebelumPromo / n - h.hargaPerSesi };
  };

  it("kelas tercantum 299.000: 1 sesi = 33.000 (29.900 + premium 4.485 = 34.385 -> charm), jauh di bawah premium 15.000", () => {
    const { h, premiumMaks } = sebelumCharm(299_000, 1);
    assert.equal(h.totalSebelumPromo, 33_000);
    assert.ok(premiumMaks < 4_485 + 1);
  });

  it("kelas tercantum 2.499.000: premium dibatasi 15.000 (15% = 37.485)", () => {
    // 1 sesi: 249.900 + 15.000 = 264.900 -> 265.000 -> charm 264.000
    assert.equal(harga({ nama: "", hargaNormal: 2_499_000, hargaAktif: 2_499_000, jumlahSesiKelas: 10 }, 1).totalSebelumPromo, 264_000);
  });

  it("di atas 60% paket tidak ada premium (N=7 = hargaPerSesi x 7 -> charm)", () => {
    assert.equal(harga({ nama: "", hargaNormal: 999_000, hargaAktif: 999_000, jumlahSesiKelas: 10 }, 7).totalSebelumPromo, hargaCharm(7 * 99_900));
  });
});

describe("galat sebagai nilai (tidak melempar)", () => {
  const dasar = { hargaNormal: 999_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSesiDipilih: 10, jumlahSubtes: 1 };
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
  it("hargaAktif > hargaNormal ditolak", () => galat({ hargaAktif: 999_001 }));
  it("masukan pecahan ditolak", () => {
    galat({ hargaNormal: 999_000.5 });
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
    assert.equal(rincianHargaSemuaSesi({ hargaNormal: 999_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSubtes: 4 }).valid, false);
  });

  it("rincian dengan 3 subtes dimulai dari N=3", () => {
    const r = rincianHargaSemuaSesi({ hargaNormal: 999_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSubtes: 3 });
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
    const masukan = { hargaNormal: 999_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSesiDipilih: 7, jumlahSubtes: 2 };
    assert.deepEqual(hitungHargaSesi(masukan), hitungHargaSesi(masukan));
    const dasar = { hargaNormal: 999_000, hargaAktif: 899_000, jumlahSesiKelas: 10 };
    assert.deepEqual(rincianHargaSemuaSesi(dasar), rincianHargaSemuaSesi(dasar));
    assert.equal(hargaTercantum(1_000_000), hargaTercantum(1_000_000));
  });

  it("masukan tidak diubah", () => {
    const masukan = Object.freeze({ hargaNormal: 999_000, hargaAktif: 899_000, jumlahSesiKelas: 10, jumlahSesiDipilih: 4, jumlahSubtes: 1 });
    assert.doesNotThrow(() => hitungHargaSesi(masukan));
  });
});
