/**
 * Test label diskon di kartu kelas /program: ribbon "Diskon X%" + border merah
 * HANYA untuk diskon_persen kelas sendiri (yang terlihat di harga coret). Kode
 * promo (diketik siswa di checkout) TIDAK menghasilkan ribbon/label apa pun di
 * kartu. Dijalankan terhadap Supabase TIRUAN di memori. Tidak menyentuh logika
 * pembayaran.
 *
 * Jalankan: npm test
 */
import "./helpers/envSupabaseUji";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import type { KelasCardRow } from "@/lib/dashboard/getProgramData";

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
  maybeSingle() {
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  then<A, B>(
    onfulfilled?: ((value: { data: Row[]; error: null; count: number }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null, count: this.rows.length }).then(onfulfilled, onrejected);
  }
}

let db: Record<string, Row[]>;
let tabelDiakses: string[];
type ProgramModule = typeof import("@/lib/dashboard/getProgramData");
let programData: ProgramModule;

before(async () => {
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => FakeQuery }).from = (table: string) => {
    tabelDiakses.push(table);
    return new FakeQuery(db[table] ?? []);
  };
  programData = await import("@/lib/dashboard/getProgramData");
});

const HARI = 24 * 60 * 60 * 1000;
const tanggal = (offsetHari: number) => new Date(Date.now() + offsetHari * HARI).toISOString().slice(0, 10);

function kelasRow(id: string, extra: Row = {}): KelasCardRow {
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
  } as KelasCardRow;
}

/** Kode promo yang AKTIF, dalam periode, berkuota, dan berlaku untuk semua kelas. */
function promoAktifSemuaKelas(): Row {
  return {
    id: "p1",
    kode: "PROMO 9.9",
    tipe_diskon: "persen",
    nilai_diskon: 9,
    tanggal_mulai: tanggal(-5),
    tanggal_selesai: tanggal(5),
    kuota_pemakaian: null,
    jumlah_terpakai: 0,
    status: "aktif",
    berlaku_semua_kelas: true,
  };
}

beforeEach(() => {
  db = { kode_promo: [], kode_promo_kelas: [], enrollments: [] };
  tabelDiakses = [];
});

async function kartu(...rows: KelasCardRow[]) {
  const hasil = await programData.toCardPreviewList(rows);
  return new Map(hasil.map((k) => [k.id, k]));
}

describe("ribbon kartu kelas: hanya diskon_persen kelas", () => {
  it("kelas tanpa diskon_persen tidak punya ribbon, harga tidak berubah", async () => {
    const k = (await kartu(kelasRow("A"))).get("A")!;
    assert.equal(k.diskonAktif, null);
    assert.equal(k.hargaSetelahDiskon, k.harga);
  });

  it("diskon_persen kosong/NULL/0 -> tanpa ribbon", async () => {
    const map = await kartu(kelasRow("N", { diskon_persen: null }), kelasRow("Z", { diskon_persen: 0 }));
    assert.equal(map.get("N")!.diskonAktif, null);
    assert.equal(map.get("Z")!.diskonAktif, null);
  });

  it("kode promo aktif untuk SEMUA kelas tidak menghasilkan ribbon atau label di kartu mana pun", async () => {
    db.kode_promo = [promoAktifSemuaKelas()];
    const map = await kartu(kelasRow("A"), kelasRow("B", { harga: 500000 }));
    for (const id of ["A", "B"]) {
      const k = map.get(id)!;
      assert.equal(k.diskonAktif, null, "kode promo tidak boleh menjadi ribbon");
      assert.equal(k.hargaSetelahDiskon, k.harga, "harga kartu tidak berubah oleh kode");
      assert.ok(!("kodePromoAktif" in k), "kartu tidak membawa label kode promo");
      assert.doesNotMatch(JSON.stringify(k), /PROMO 9\.9|Kode /, "tidak ada teks kode di data kartu");
    }
  });

  it("kode promo untuk kelas tertentu juga tidak menghasilkan ribbon/label", async () => {
    db.kode_promo = [{ ...promoAktifSemuaKelas(), berlaku_semua_kelas: false }];
    db.kode_promo_kelas = [{ kode_promo_id: "p1", kelas_id: "B" }];
    const map = await kartu(kelasRow("A"), kelasRow("B"));
    assert.equal(map.get("A")!.diskonAktif, null);
    assert.equal(map.get("B")!.diskonAktif, null);
    assert.doesNotMatch(JSON.stringify(map.get("B")), /PROMO 9\.9|Kode /);
  });

  it('kelas berdiskon sendiri ("[UJI]") + kode aktif -> hanya ribbon diskon kelas, persen kelas saja', async () => {
    db.kode_promo = [promoAktifSemuaKelas()];
    const k = (await kartu(kelasRow("UJI", { harga: 15000, diskon_persen: 50 }))).get("UJI")!;
    assert.equal(k.diskonAktif?.label, "Diskon 50%");
    assert.equal(k.hargaSetelahDiskon, 7500);
    assert.doesNotMatch(JSON.stringify(k), /9%|PROMO 9\.9|Kode /);
  });

  it("kelas berdiskon sendiri tanpa kode -> ribbon diskon kelas", async () => {
    const k = (await kartu(kelasRow("D", { diskon_persen: 20 }))).get("D")!;
    assert.equal(k.diskonAktif?.label, "Diskon 20%");
  });

  it("data kartu tidak lagi membaca tabel kode_promo / kode_promo_kelas", async () => {
    db.kode_promo = [promoAktifSemuaKelas()];
    await kartu(kelasRow("A"));
    assert.ok(!tabelDiakses.includes("kode_promo"));
    assert.ok(!tabelDiakses.includes("kode_promo_kelas"));
  });

  it("detail kelas publik: ribbon hanya dari diskon_persen, kode aktif diabaikan", async () => {
    db.kode_promo = [promoAktifSemuaKelas()];
    db.kelas = [kelasRow("DETAIL", { diskon_persen: 10, jumlah_sesi: 4, jadwal: null, tampil_di_katalog: true }) as unknown as Row];
    db.kelas_mentor = [];
    const detail = await programData.getKelasDetailPublic("DETAIL");
    assert.equal(detail?.diskonAktif?.label, "Diskon 10%");
    assert.ok(detail && !("kodePromoAktif" in detail));

    db.kelas = [kelasRow("TANPA", { jumlah_sesi: 4, jadwal: null, tampil_di_katalog: true }) as unknown as Row];
    assert.equal((await programData.getKelasDetailPublic("TANPA"))?.diskonAktif, null);
  });
});

describe("tampilan kartu (statis)", () => {
  const baca = (rel: string) => readFileSync(path.resolve(__dirname, "..", rel), "utf8");

  it("tidak ada pil/label kode promo di komponen kartu", () => {
    for (const rel of ["components/ui/KelasCardVisual.tsx", "components/program/KelasCardFrame.tsx", "components/program/KelasCardMeta.tsx"]) {
      assert.doesNotMatch(baca(rel), /kodePromo|KodePromo|Kode \$\{/, rel);
    }
  });

  it("ribbon diagonal dan border merah hanya mengikuti diskonAktif (diskon kelas)", () => {
    const visual = baca("components/ui/KelasCardVisual.tsx");
    assert.match(visual, /\{isJual && diskonAktif \? \(/);
    const frame = baca("components/program/KelasCardFrame.tsx");
    assert.match(frame, /\r?\n\s+diskonAktif\r?\n\s+\? "border-2 border-\[#DC2626\]/);
  });

  it("tidak ada pemakai kartu yang meneruskan kode promo", () => {
    for (const rel of [
      "app/program/page.tsx",
      "app/program/[kategori]/page.tsx",
      "app/program/kelas/[kelasId]/page.tsx",
      "app/(protected)/(siswa)/kelas/page.tsx",
      "lib/dashboard/getProgramData.ts",
    ]) {
      assert.doesNotMatch(baca(rel), /kodePromo|getKodePromo|kode_promo/, rel);
    }
  });

  it("checkout tetap menerima kode: create memakai validatePromoCode, validate-promo masih ada", () => {
    assert.match(baca("app/api/payment/create/route.ts"), /validatePromoCode\(kodePromo, kelasId, kelas\.hargaAktif\)/);
    assert.match(baca("app/api/payment/validate-promo/route.ts"), /validatePromoCode/);
    assert.match(baca("components/siswa/CheckoutForm.tsx"), /kodePromo: appliedPromo\?\.kode/);
  });
});
