/**
 * Test rumus & validasi sesi tambahan per subtes (lib/shared/sesiTambahan.ts).
 * Fungsi murni — tanpa database. File rumus belum dipakai di kode lain.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  MAKS_SESI_TAMBAHAN,
  MAKS_SUBTES,
  hargaPerSesiTambahan,
  hitungBiayaSesiTambahan,
  validasiPilihanSesi,
  type PilihanSesiSubtes,
} from "../lib/shared/sesiTambahan";

const pilih = (...jumlah: number[]): PilihanSesiSubtes[] => jumlah.map((jumlahSesi, i) => ({ subtesId: `s${i + 1}`, jumlahSesi }));

const cek = (pilihan: PilihanSesiSubtes[], opsi: { jenisKelas?: string; modeKelas?: string; jumlahSesiDasar?: number } = {}) =>
  validasiPilihanSesi({ jenisKelas: "private", modeKelas: "online", jumlahSesiDasar: 10, pilihan, ...opsi });

describe("konstanta", () => {
  it("batas sesuai keputusan: tambahan maks. 10, subtes maks. 3", () => {
    assert.equal(MAKS_SESI_TAMBAHAN, 10);
    assert.equal(MAKS_SUBTES, 3);
  });
});

describe("hargaPerSesiTambahan & hitungBiayaSesiTambahan", () => {
  it("harga 500000, dasar 10 -> 50000 per sesi; 3 sesi tambahan -> 150000", () => {
    assert.equal(hargaPerSesiTambahan(500000, 10), 50000);
    assert.equal(hitungBiayaSesiTambahan({ hargaNormal: 500000, jumlahSesiDasar: 10, totalSesi: 13 }), 150000);
  });

  it("tanpa sesi tambahan biayanya 0", () => {
    assert.equal(hitungBiayaSesiTambahan({ hargaNormal: 500000, jumlahSesiDasar: 10, totalSesi: 10 }), 0);
  });

  it("harga tidak habis dibagi: 499000/10 = 49900 dan 333333/10 = 33333 (integer)", () => {
    assert.equal(hargaPerSesiTambahan(499000, 10), 49900);
    assert.equal(hargaPerSesiTambahan(333333, 10), 33333);
    for (const harga of [499000, 333333, 123457, 999999, 1]) {
      assert.ok(Number.isInteger(hargaPerSesiTambahan(harga, 10)), String(harga));
      assert.ok(Number.isInteger(hitungBiayaSesiTambahan({ hargaNormal: harga, jumlahSesiDasar: 10, totalSesi: 17 })), String(harga));
    }
  });

  it("membulatkan ke rupiah terdekat (.5 naik)", () => {
    assert.equal(hargaPerSesiTambahan(333335, 10), 33334); // 33333,5 -> 33334
    assert.equal(hargaPerSesiTambahan(333334, 10), 33333); // 33333,4 -> 33333
  });

  it("dibulatkan per sesi dulu lalu dikali (bukan dibulatkan di akhir)", () => {
    // 333335/10 = 33333,5 -> 33334 per sesi; x3 = 100002. Membulatkan di akhir akan memberi round(100000,5) = 100001.
    assert.equal(hitungBiayaSesiTambahan({ hargaNormal: 333335, jumlahSesiDasar: 10, totalSesi: 13 }), 100002);
    assert.notEqual(100002, Math.round((333335 * 3) / 10));
  });

  it("rincian n x harga per sesi selalu sama dengan total", () => {
    for (const harga of [499000, 333333, 750001]) {
      for (let tambahan = 0; tambahan <= MAKS_SESI_TAMBAHAN; tambahan++) {
        const biaya = hitungBiayaSesiTambahan({ hargaNormal: harga, jumlahSesiDasar: 10, totalSesi: 10 + tambahan });
        assert.equal(biaya, hargaPerSesiTambahan(harga, 10) * tambahan);
      }
    }
  });

  it("memakai jumlah sesi dasar kelas (bukan angka 10 tetap)", () => {
    assert.equal(hargaPerSesiTambahan(800000, 8), 100000);
    assert.equal(hitungBiayaSesiTambahan({ hargaNormal: 800000, jumlahSesiDasar: 8, totalSesi: 10 }), 200000);
  });

  it("melempar untuk masukan rusak, tidak pernah menghasilkan tagihan diam-diam", () => {
    assert.throws(() => hargaPerSesiTambahan(500000, 0), RangeError);
    assert.throws(() => hargaPerSesiTambahan(500000, -10), RangeError);
    assert.throws(() => hargaPerSesiTambahan(500000, 10.5), RangeError);
    assert.throws(() => hargaPerSesiTambahan(Number.NaN, 10), RangeError);
    assert.throws(() => hargaPerSesiTambahan(-1, 10), RangeError);
    assert.throws(() => hitungBiayaSesiTambahan({ hargaNormal: 500000, jumlahSesiDasar: 10, totalSesi: 9 }), RangeError);
    assert.throws(() => hitungBiayaSesiTambahan({ hargaNormal: 500000, jumlahSesiDasar: 10, totalSesi: 12.5 }), RangeError);
    assert.throws(() => hitungBiayaSesiTambahan({ hargaNormal: 500000, jumlahSesiDasar: 10, totalSesi: Number.NaN }), RangeError);
  });
});

describe("validasiPilihanSesi — jumlah sesi", () => {
  it("total tepat sama dengan dasar diterima (tambahan 0)", () => {
    assert.deepEqual(cek(pilih(4, 3, 3)), { ok: true });
    assert.deepEqual(cek(pilih(10)), { ok: true });
  });

  it("total kurang dari dasar ditolak", () => {
    const hasil = cek(pilih(3, 3, 3));
    assert.equal(hasil.ok, false);
    assert.match((hasil as { error: string }).error, /tidak boleh kurang dari 10/);
  });

  it("subtes dengan 0 sesi ditolak", () => {
    assert.equal(cek(pilih(10, 0)).ok, false);
    assert.equal(cek(pilih(0, 10, 2)).ok, false);
  });

  it("4 subtes ditolak, 3 subtes diterima", () => {
    const hasil = cek(pilih(3, 3, 2, 2));
    assert.equal(hasil.ok, false);
    assert.match((hasil as { error: string }).error, /maksimal 3 subtes/);
    assert.deepEqual(cek(pilih(4, 3, 3)), { ok: true });
  });

  it("tambahan 11 ditolak, tambahan 10 diterima", () => {
    const tolak = cek(pilih(11, 10));
    assert.equal(tolak.ok, false);
    assert.match((tolak as { error: string }).error, /maksimal 10/);
    assert.deepEqual(cek(pilih(10, 10)), { ok: true });
    assert.deepEqual(cek(pilih(5, 5, 10)), { ok: true });
  });

  it("tanpa pilihan sama sekali ditolak", () => {
    assert.equal(cek([]).ok, false);
  });

  it("subtes dobel dan subtesId kosong ditolak", () => {
    assert.equal(cek([{ subtesId: "s1", jumlahSesi: 5 }, { subtesId: "s1", jumlahSesi: 5 }]).ok, false);
    assert.equal(cek([{ subtesId: "", jumlahSesi: 10 }]).ok, false);
  });

  it("pecahan, negatif, NaN, Infinity, dan bukan-angka ditolak", () => {
    for (const buruk of [2.5, -1, Number.NaN, Number.POSITIVE_INFINITY, "5" as unknown as number, null as unknown as number]) {
      assert.equal(cek([{ subtesId: "s1", jumlahSesi: 10 }, { subtesId: "s2", jumlahSesi: buruk }]).ok, false, String(buruk));
    }
    assert.equal(validasiPilihanSesi({ jenisKelas: "private", modeKelas: "online", jumlahSesiDasar: 10.5, pilihan: pilih(10) }).ok, false);
    assert.equal(validasiPilihanSesi({ jenisKelas: "private", modeKelas: "online", jumlahSesiDasar: 0, pilihan: pilih(1) }).ok, false);
    assert.equal(validasiPilihanSesi({ jenisKelas: "private", modeKelas: "online", jumlahSesiDasar: Number.NaN, pilihan: pilih(10) }).ok, false);
  });
});

describe("validasiPilihanSesi — jenis & mode kelas", () => {
  it("private online dengan tambahan diterima", () => {
    assert.deepEqual(cek(pilih(6, 6)), { ok: true });
  });

  it("kelas non-private dengan tambahan ditolak", () => {
    for (const jenisKelas of ["semi_private", "grouping"]) {
      const hasil = cek(pilih(6, 6), { jenisKelas });
      assert.equal(hasil.ok, false, jenisKelas);
      assert.match((hasil as { error: string }).error, /private online/);
    }
  });

  it("private OFFLINE dengan tambahan ditolak", () => {
    const hasil = cek(pilih(6, 6), { modeKelas: "offline" });
    assert.equal(hasil.ok, false);
    assert.match((hasil as { error: string }).error, /private online/);
  });

  it("tambahan 0 diterima untuk semua jenis dan mode", () => {
    for (const jenisKelas of ["private", "semi_private", "grouping"]) {
      for (const modeKelas of ["online", "offline"]) {
        assert.deepEqual(cek(pilih(5, 5), { jenisKelas, modeKelas }), { ok: true }, `${jenisKelas}/${modeKelas}`);
      }
    }
  });

  it("jenis/mode yang tidak dikenal tidak boleh punya tambahan", () => {
    assert.equal(cek(pilih(6, 6), { jenisKelas: "lainnya" }).ok, false);
    assert.equal(cek(pilih(6, 6), { modeKelas: "hybrid" }).ok, false);
  });

  it("dasar kelas offline (8 sesi) dihitung dari jumlahSesiDasar-nya", () => {
    assert.deepEqual(cek(pilih(4, 4), { modeKelas: "offline", jumlahSesiDasar: 8 }), { ok: true });
    assert.equal(cek(pilih(3, 4), { modeKelas: "offline", jumlahSesiDasar: 8 }).ok, false);
  });
});

describe("cakupan: hanya file rumus + tes, belum dipakai di kode lain", () => {
  it("file murni: tidak mengimpor database/server", () => {
    const sumber = readFileSync(path.join(process.cwd(), "lib/shared/sesiTambahan.ts"), "utf8");
    assert.ok(!/^\s*import\s/m.test(sumber), "tidak ada import apa pun");
  });
});
