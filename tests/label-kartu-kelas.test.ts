/**
 * Test label diskon di kartu kelas /program: ribbon "Diskon X%" hanya untuk
 * diskon kelas sendiri (ikut terlihat di harga), sedangkan kode promo punya
 * label terpisah "Kode X: -Y%" — hanya kalau kode aktif, dalam periode, kuota
 * belum habis, dan berlaku untuk kelas itu. Dijalankan terhadap Supabase
 * TIRUAN di memori. Tidak menyentuh logika pembayaran.
 *
 * Jalankan: npm test
 */
import "./helpers/envSupabaseUji";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import {
  hitungPotonganKode,
  isKodePromoBerlaku,
  labelKodePromo,
  pilihKodePromoTerbaik,
  type KodePromoKandidat,
} from "@/lib/shared/kodePromoAktif";

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: Row[]; error: null; count: number }> {
  constructor(private rows: Row[]) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.rows = this.rows.filter((row) => values.includes(row[column]));
    return this;
  }
  then<A, B>(
    onfulfilled?: ((value: { data: Row[]; error: null; count: number }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null, count: this.rows.length }).then(onfulfilled, onrejected);
  }
}

let db: Record<string, Row[]>;
type ProgramModule = typeof import("@/lib/dashboard/getProgramData");
let programData: ProgramModule;

before(async () => {
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => FakeQuery }).from = (table: string) => new FakeQuery(db[table] ?? []);
  programData = await import("@/lib/dashboard/getProgramData");
});

const HARI = 24 * 60 * 60 * 1000;
const tanggal = (offsetHari: number) => new Date(Date.now() + offsetHari * HARI).toISOString().slice(0, 10);

function kelasRow(id: string, extra: Row = {}): programModuleRow {
  return {
    id,
    nama: `Kelas ${id}`,
    tipe_kelas: "grouping",
    mode_pembelajaran: "online",
    harga: 900000,
    diskon_persen: 0,
    kapasitas: 10,
    deskripsi: null,
    program_kategori: "snbt",
    tingkat_kelas: "kelas_12",
    link_lynkid: null,
    subtes: null,
    mentor: null,
    ...extra,
  } as programModuleRow;
}
type programModuleRow = import("@/lib/dashboard/getProgramData").KelasCardRow;

function promo(id: string, extra: Row = {}): Row {
  return {
    id,
    kode: "PROMO 9.9",
    tipe_diskon: "persen",
    nilai_diskon: 9,
    tanggal_mulai: tanggal(-5),
    tanggal_selesai: tanggal(5),
    kuota_pemakaian: null,
    jumlah_terpakai: 0,
    status: "aktif",
    berlaku_semua_kelas: true,
    ...extra,
  };
}

beforeEach(() => {
  db = { kode_promo: [], kode_promo_kelas: [], enrollments: [] };
});

async function kartu(...rows: programModuleRow[]) {
  const hasil = await programData.toCardPreviewList(rows);
  return new Map(hasil.map((k) => [k.id, k]));
}

describe("label diskon kartu: sumber data", () => {
  it("kelas tanpa diskon kelas dan tanpa kode -> tanpa ribbon dan tanpa label kode", async () => {
    const k = (await kartu(kelasRow("A"))).get("A")!;
    assert.equal(k.diskonAktif, null);
    assert.equal(k.kodePromoAktif, null);
    assert.equal(k.hargaSetelahDiskon, k.harga);
  });

  it("kode aktif berlaku semua kelas -> label kode di SEMUA kartu, ribbon diskon kelas tetap kosong, harga tidak berubah", async () => {
    db.kode_promo = [promo("p1")];
    const map = await kartu(kelasRow("A"), kelasRow("B", { harga: 500000 }));
    for (const id of ["A", "B"]) {
      const k = map.get(id)!;
      assert.equal(k.kodePromoAktif?.label, "Kode PROMO 9.9: -9%");
      assert.equal(k.diskonAktif, null, "kode tidak boleh menjadi ribbon 'Diskon 9%'");
      assert.equal(k.hargaSetelahDiskon, k.harga, "harga kartu tidak berubah oleh kode");
    }
  });

  it("kode hanya untuk kelas tertentu -> label hanya di kelas itu", async () => {
    db.kode_promo = [promo("p1", { berlaku_semua_kelas: false })];
    db.kode_promo_kelas = [{ kode_promo_id: "p1", kelas_id: "B" }];
    const map = await kartu(kelasRow("A"), kelasRow("B"), kelasRow("C"));
    assert.equal(map.get("A")!.kodePromoAktif, null);
    assert.equal(map.get("B")!.kodePromoAktif?.label, "Kode PROMO 9.9: -9%");
    assert.equal(map.get("C")!.kodePromoAktif, null);
  });

  it("kode kedaluwarsa, belum mulai, nonaktif, atau kuota habis -> tanpa label", async () => {
    db.kode_promo = [
      promo("kedaluwarsa", { tanggal_selesai: tanggal(-1) }),
      promo("belum", { tanggal_mulai: tanggal(1) }),
      promo("nonaktif", { status: "nonaktif" }),
      promo("habis", { kuota_pemakaian: 50, jumlah_terpakai: 50 }),
      promo("lebih", { kuota_pemakaian: 50, jumlah_terpakai: 51 }),
    ];
    assert.equal((await kartu(kelasRow("A"))).get("A")!.kodePromoAktif, null);
  });

  it("kuota masih tersisa / tanpa batas waktu -> label tampil", async () => {
    db.kode_promo = [promo("p1", { kuota_pemakaian: 50, jumlah_terpakai: 49, tanggal_mulai: null, tanggal_selesai: null })];
    assert.equal((await kartu(kelasRow("A"))).get("A")!.kodePromoAktif?.label, "Kode PROMO 9.9: -9%");
  });

  it("kelas berdiskon sendiri + kode -> dua label terpisah, tidak digabung jadi satu persen", async () => {
    db.kode_promo = [promo("p1")];
    const k = (await kartu(kelasRow("UJI", { harga: 15000, diskon_persen: 50 }))).get("UJI")!;
    assert.equal(k.diskonAktif?.label, "Diskon 50%");
    assert.equal(k.kodePromoAktif?.label, "Kode PROMO 9.9: -9%");
    assert.equal(k.hargaSetelahDiskon, 7500);
  });

  it("kelas berdiskon sendiri tanpa kode -> hanya ribbon diskon kelas", async () => {
    const k = (await kartu(kelasRow("D", { diskon_persen: 20 }))).get("D")!;
    assert.equal(k.diskonAktif?.label, "Diskon 20%");
    assert.equal(k.kodePromoAktif, null);
  });

  it("beberapa kode berlaku -> dipilih potongan rupiah terbesar untuk harga kelas (bukan angka nilai_diskon mentah)", async () => {
    db.kode_promo = [
      promo("persen", { kode: "PERSEN", nilai_diskon: 9 }),
      promo("nominal", { kode: "HEMAT", tipe_diskon: "nominal", nilai_diskon: 50000 }),
    ];
    // 9% x 900.000 = 81.000 > 50.000 -> PERSEN; 9% x 100.000 = 9.000 < 50.000 -> HEMAT.
    const map = await kartu(kelasRow("MAHAL"), kelasRow("MURAH", { harga: 100000 }));
    assert.equal(map.get("MAHAL")!.kodePromoAktif?.label, "Kode PERSEN: -9%");
    assert.equal(map.get("MURAH")!.kodePromoAktif?.label, "Kode HEMAT: -Rp50.000");
  });

  it("detail kelas publik memakai aturan yang sama", async () => {
    db.kode_promo = [promo("p1")];
    db.kelas = [{ ...kelasRow("DETAIL", { diskon_persen: 10, jumlah_sesi: 4, jadwal: null, tampil_di_katalog: true }) }];
    db.kelas_mentor = [];
    const { supabaseServer } = await import("@/lib/supabase/server");
    const fromAsli = (supabaseServer as unknown as { from: (t: string) => unknown }).from;
    (supabaseServer as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const q = new FakeQuery(db[table] ?? []) as FakeQuery & { maybeSingle: () => Promise<unknown> };
      q.maybeSingle = () => Promise.resolve({ data: (db[table] ?? [])[0] ?? null, error: null });
      return q;
    };
    try {
      const detail = await programData.getKelasDetailPublic("DETAIL");
      assert.equal(detail?.diskonAktif?.label, "Diskon 10%");
      assert.equal(detail?.kodePromoAktif?.label, "Kode PROMO 9.9: -9%");
    } finally {
      (supabaseServer as unknown as { from: unknown }).from = fromAsli;
    }
  });
});

describe("helper kode promo (aturan sama dengan checkout)", () => {
  const dasar: KodePromoKandidat = promo("x") as unknown as KodePromoKandidat;

  it("isKodePromoBerlaku: batas hari ini ikut berlaku (inklusif), kuota pas habis tidak", () => {
    assert.equal(isKodePromoBerlaku({ ...dasar, tanggal_mulai: "2026-09-09", tanggal_selesai: "2026-09-09" }, "2026-09-09"), true);
    assert.equal(isKodePromoBerlaku({ ...dasar, tanggal_selesai: "2026-09-08" }, "2026-09-09"), false);
    assert.equal(isKodePromoBerlaku({ ...dasar, kuota_pemakaian: 1, jumlah_terpakai: 1 }, "2026-09-09"), false);
  });

  it("hitungPotonganKode tidak pernah melebihi harga; label nominal & persen", () => {
    assert.equal(hitungPotonganKode({ tipe_diskon: "nominal", nilai_diskon: 99999 }, 5000), 5000);
    assert.equal(hitungPotonganKode({ tipe_diskon: "persen", nilai_diskon: 9 }, 7500), 675);
    assert.equal(labelKodePromo({ kode: "PROMO 9.9", tipe_diskon: "persen", nilai_diskon: 9 }), "Kode PROMO 9.9: -9%");
    assert.equal(pilihKodePromoTerbaik([dasar], 0), null);
  });
});

describe("tampilan kartu (statis)", () => {
  const baca = (rel: string) => readFileSync(path.resolve(__dirname, "..", rel), "utf8");

  it("ribbon diagonal hanya dari diskonAktif; label kode dirender terpisah dari kodePromo", () => {
    const visual = baca("components/ui/KelasCardVisual.tsx");
    const [sebelumRibbon, ribbonDst] = visual.split("Ribbon diskon");
    assert.match(sebelumRibbon, /kodePromo\.label/);
    assert.match(ribbonDst, /diskonAktif\.label/);
    assert.doesNotMatch(ribbonDst, /kodePromo\.label/);
  });

  it("border merah kartu hanya mengikuti diskon kelas, bukan kode", () => {
    const frame = baca("components/program/KelasCardFrame.tsx");
    assert.match(frame, /\r?\n\s+diskonAktif\r?\n\s+\? "border-2 border-\[#DC2626\]/);
    assert.doesNotMatch(frame, /kodePromoAktif\r?\n\s+\? "border-2/);
  });

  it("semua pemakai kartu meneruskan kodePromoAktif", () => {
    for (const rel of ["app/program/page.tsx", "app/program/[kategori]/page.tsx", "app/(protected)/(siswa)/kelas/page.tsx"]) {
      assert.match(baca(rel), /kodePromoAktif=\{item\.kodePromoAktif\}/, rel);
    }
    assert.match(baca("app/program/kelas/[kelasId]/page.tsx"), /kodePromo=\{kelas\.kodePromoAktif\}/);
  });

  it("jalur pembayaran & validate-promo tidak menyentuh helper tampilan", () => {
    for (const rel of ["app/api/payment/create/route.ts", "app/api/payment/validate-promo/route.ts", "lib/payment/validatePromoCode.ts"]) {
      assert.doesNotMatch(baca(rel), /kodePromoAktif/, rel);
    }
  });
});
