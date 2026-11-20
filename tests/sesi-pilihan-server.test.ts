/**
 * Tes sesi pilihan siswa — SERVER (jalur uang): /api/payment/create, /api/payment/validate-promo,
 * fulfillPayment. Route DIJALANKAN sungguhan; Supabase + Mayar TIRUAN di memori. Kelas 10 sesi (899.000)
 * dan kelas 8 sesi (719.200). Saklar SESI_PILIHAN_AKTIF dinyalakan/dimatikan per tes.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import "./helpers/envSupabaseUji";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null; count?: number };
let db: Record<string, Row[]>;
let idSeq = 0;

class FakeQuery implements PromiseLike<Result> {
  private filters: ((row: Row) => boolean)[] = [];
  private op: "select" | "update" | "insert" | "upsert" = "select";
  private values: Row[] = [];
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private returning = false;

  constructor(private table: string) {}

  private hitungBaris = false;
  select(_kolom?: string, opsi?: { count?: string }) {
    this.returning = true;
    this.hitungBaris = opsi?.count === "exact";
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.values = [values];
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = "insert";
    this.values = Array.isArray(values) ? values : [values];
    return this;
  }
  upsert(values: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.values = Array.isArray(values) ? values : [values];
    this.upsertOpts = opts;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  not(column: string, _op: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    return this.run().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }));
  }
  single() {
    return this.maybeSingle();
  }
  then<A, B>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<Result> {
    const rows = (db[this.table] ??= []);
    const match = (row: Row) => this.filters.every((f) => f(row));
    if (this.op === "update") {
      const hit = rows.filter(match);
      for (const row of hit) Object.assign(row, this.values[0]);
      return { data: this.returning ? hit : null, error: null };
    }
    if (this.op === "insert" || this.op === "upsert") {
      const out: Row[] = [];
      const keys = this.upsertOpts.onConflict?.split(",") ?? [];
      for (const value of this.values) {
        const existing = keys.length ? rows.find((row) => keys.every((k) => row[k] === value[k])) : undefined;
        if (existing) {
          if (!this.upsertOpts.ignoreDuplicates) Object.assign(existing, value);
          out.push(existing);
        } else {
          const row = { id: `${this.table}-${++idSeq}`, ...value };
          rows.push(row);
          out.push(row);
        }
      }
      return { data: this.returning ? out : null, error: null };
    }
    const hasil = rows.filter(match);
    return { data: hasil, error: null, ...(this.hitungBaris ? { count: hasil.length } : {}) };
  }
}


let mayarBodies: Record<string, unknown>[];

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body ?? "{}"));
  mayarBodies.push(body);
  const id = `mayar-${++idSeq}`;
  return new Response(
    JSON.stringify({ statusCode: 200, messages: "success", data: { id, transactionId: `trx-${id}`, link: `https://contoh.myr.id/invoices/${id}`, redirectUrl: body.redirectUrl ?? null } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

type CreateModule = typeof import("@/app/api/payment/create/route");
type PromoModule = typeof import("@/app/api/payment/validate-promo/route");
type FulfillModule = typeof import("@/lib/payment/fulfillPayment");
type SessionModule = typeof import("@/lib/auth/session");
let createRoute: CreateModule;
let promoRoute: PromoModule;
let fulfill: FulfillModule;
let sessionLib: SessionModule;
const envAwal = { ...process.env };

const SISWA = "siswa-1";
const M1 = "mentor-1";
const SUB = ["s-a", "s-b", "s-c"];

before(async () => {
  process.env.MAYAR_BASE_URL = "https://api.mayar.io";
  process.env.MAYAR_API_KEY = "kunci-tiruan";
  process.env.APP_BASE_URL = "https://dimentoring.id";
  process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = "true";
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.VERCEL_ENV;
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => FakeQuery }).from = (table: string) => new FakeQuery(table);
  globalThis.fetch = fakeFetch as typeof fetch;
  createRoute = await import("@/app/api/payment/create/route");
  promoRoute = await import("@/app/api/payment/validate-promo/route");
  fulfill = await import("@/lib/payment/fulfillPayment");
  sessionLib = await import("@/lib/auth/session");
});

after(() => {
  if (envAwal.SESI_PILIHAN_AKTIF === undefined) delete process.env.SESI_PILIHAN_AKTIF;
});

const kelas = (id: string, harga: number, sesi: number, ekstra: Row = {}): Row => ({
  id,
  nama: `Kelas ${id}`,
  harga,
  diskon_persen: 0,
  mode_pembelajaran: "online",
  tipe_kelas: "private",
  link_lynkid: null,
  jadwal: [],
  jadwal_pilih_siswa: false,
  kapasitas: null,
  jumlah_sesi: sesi,
  tampil_di_katalog: true,
  subtes_id: SUB[0],
  ...ekstra,
});

const promo = (kode: string, persen: number): Row => ({
  id: `promo-${kode}`,
  kode,
  tipe_diskon: "persen",
  nilai_diskon: persen,
  tanggal_mulai: null,
  tanggal_selesai: null,
  kuota_pemakaian: null,
  jumlah_terpakai: 0,
  status: "aktif",
  berlaku_semua_kelas: true,
});

beforeEach(() => {
  mayarBodies = [];
  process.env.SESI_PILIHAN_AKTIF = "true";
  db = {
    kelas: [
      kelas("K10", 899000, 10),
      kelas("K8", 719200, 8),
      kelas("K-OFF", 899000, 10, { mode_pembelajaran: "offline" }),
      kelas("K-REG", 899000, 10, { tipe_kelas: "regular" }),
    ],
    kelas_subtes: ["K10", "K8"].flatMap((k) => SUB.map((s) => ({ kelas_id: k, subtes_id: s }))),
    kelas_subtes_mentor: ["K10", "K8"].flatMap((k) => SUB.map((s) => ({ kelas_id: k, subtes_id: s, mentor_id: M1 }))),
    user_roles: [{ user_id: M1, role_type: "mentor", status: "active" }],
    users: [{ id: SISWA, nama: "Siswa", email: "siswa@example.com" }],
    enrollments: [],
    payments: [],
    payment_subtes_pilihan: [],
    sesi_kelas: [],
    enrollment_subtes: [],
    kode_promo: [promo("HEMAT5", 5), promo("HEMAT10", 10)],
  };
});

async function create(kelasId: string, body: Record<string, unknown>) {
  const token = sessionLib.createSessionToken({ userId: SISWA, role: "student" });
  const res = await createRoute.POST(
    new NextRequest("http://localhost/api/payment/create", {
      method: "POST",
      headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ kelasId, subtesIds: SUB.slice(0, 1), ...body }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function cekPromo(kelasId: string, body: Record<string, unknown>) {
  const token = sessionLib.createSessionToken({ userId: SISWA, role: "student" });
  const res = await promoRoute.POST(
    new NextRequest("http://localhost/api/payment/validate-promo", {
      method: "POST",
      headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ kelasId, ...body }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const sebaran = (...n: number[]) => n.map((jumlahSesi, i) => ({ subtesId: SUB[i], jumlahSesi }));

function pastikanDitolakTanpaJejak() {
  assert.deepEqual(mayarBodies, [], "invoice gateway TIDAK boleh dibuat");
  assert.equal(db.payments.length, 0);
  assert.equal(db.payment_subtes_pilihan.length, 0);
}

function pastikanInvoiceSamaDenganPayment(jumlah: number) {
  assert.equal(db.payments.length, 1);
  assert.equal(db.payments[0].jumlah, jumlah);
  assert.equal(mayarBodies.length, 1);
  assert.equal(mayarBodies[0].amount, jumlah, "nominal invoice Mayar harus = payments.jumlah");
}

// Nominal yang diharapkan (hasil lib/shared/hargaSesi.ts, dihitung tangan): [N, jumlah]
const KELAS_10: [number, number][] = [
  [1, 102000],
  [3, 309000],
  [8, 718000],
  [10, 899000],
  [12, 1078000],
  [20, 1797000],
];
const KELAS_8: [number, number][] = [
  [1, 102000],
  [3, 289000],
  [8, 719200],
  [10, 898000],
  [12, 1078000],
  [16, 1437000],
];

describe("create — nominal & penulisan baris (saklar hidup)", () => {
  for (const [id, daftar] of [["K10", KELAS_10], ["K8", KELAS_8]] as const) {
    for (const [n, jumlah] of daftar) {
      it(`${id}: N=${n} -> payments.jumlah = invoice Mayar = ${jumlah}`, async () => {
        const subtesIds = n >= 3 ? SUB : SUB.slice(0, 1);
        const per = n >= 3 ? sebaran(n - 2, 1, 1) : sebaran(n);
        const res = await create(id, { subtesIds, jumlahSesiTotal: n, sesiPerSubtes: per });
        assert.equal(res.status, 200, JSON.stringify(res.json));
        pastikanInvoiceSamaDenganPayment(jumlah);
        const p = db.payments[0];
        const dasar = id === "K10" ? 10 : 8;
        assert.equal(p.jumlah_sesi_dibeli, n);
        assert.equal(p.sesi_tambahan, Math.max(0, n - dasar));
        assert.equal(p.jumlah_sebelum_diskon, jumlah);
        assert.equal(p.biaya_sesi_tambahan, n > dasar ? jumlah - (id === "K10" ? 899000 : 719200) : 0);
        assert.deepEqual(
          db.payment_subtes_pilihan.map((r) => r.jumlah_sesi),
          per.map((x) => x.jumlahSesi),
        );
      });
    }
  }

  it("N = jumlah_sesi (regresi): nominal lama persis; kolom sesi pilihan terisi N", async () => {
    const res = await create("K10", { jumlahSesiTotal: 10, sesiPerSubtes: sebaran(10) });
    assert.equal(res.status, 200);
    pastikanInvoiceSamaDenganPayment(899000);
    assert.equal(db.payments[0].sesi_tambahan, 0);
  });
});

describe("create — penolakan (tanpa invoice, tanpa baris)", () => {
  it("N di bawah jumlah subtes (2 sesi untuk 3 subtes) -> 400", async () => {
    const res = await create("K10", { subtesIds: SUB, jumlahSesiTotal: 2, sesiPerSubtes: sebaran(1, 1, 0) });
    assert.equal(res.status, 400);
    pastikanDitolakTanpaJejak();
  });
  it("N = 21 (> 2x jumlah_sesi) dan N = 0 -> 400", async () => {
    assert.equal((await create("K10", { jumlahSesiTotal: 21, sesiPerSubtes: sebaran(21) })).status, 400);
    assert.equal((await create("K10", { jumlahSesiTotal: 0, sesiPerSubtes: sebaran(0) })).status, 400);
    assert.equal((await create("K10", { jumlahSesiTotal: 10.5 })).status, 400);
    assert.equal((await create("K10", { jumlahSesiTotal: "5" })).status, 400);
    pastikanDitolakTanpaJejak();
  });
  it("sebaran tidak menjumlah ke N / subtes ganda / ada subtes di luar pilihan / sesi 0 -> 400", async () => {
    assert.equal((await create("K10", { subtesIds: SUB, jumlahSesiTotal: 6, sesiPerSubtes: sebaran(2, 2, 3) })).status, 400);
    assert.equal((await create("K10", { subtesIds: SUB, jumlahSesiTotal: 6 })).status, 400);
    assert.equal((await create("K10", { subtesIds: SUB, jumlahSesiTotal: 6, sesiPerSubtes: sebaran(3, 3, 0) })).status, 400);
    assert.equal((await create("K10", { subtesIds: SUB.slice(0, 2), jumlahSesiTotal: 4, sesiPerSubtes: sebaran(2, 1, 1) })).status, 400);
    assert.equal((await create("K10", { subtesIds: SUB.slice(0, 2), jumlahSesiTotal: 4, sesiPerSubtes: [{ subtesId: "s-a", jumlahSesi: 2 }, { subtesId: "s-a", jumlahSesi: 2 }] })).status, 400);
    pastikanDitolakTanpaJejak();
  });
  it("kelas offline / bukan private dengan N berbeda -> 400; N sama dengan paket = jalur lama", async () => {
    assert.equal((await create("K-OFF", { jumlahSesiTotal: 5, sesiPerSubtes: sebaran(5) })).status, 400);
    assert.equal((await create("K-REG", { jumlahSesiTotal: 5, sesiPerSubtes: sebaran(5) })).status, 400);
    pastikanDitolakTanpaJejak();
  });
  it("promo + N kecil -> 400 (promo hanya untuk paket penuh/lebih)", async () => {
    const res = await create("K10", { kodePromo: "HEMAT5", jumlahSesiTotal: 5, sesiPerSubtes: sebaran(5) });
    assert.equal(res.status, 400);
    pastikanDitolakTanpaJejak();
  });
  it("promo melanggar margin 30% pada paket penuh -> 400; promo aman -> lolos", async () => {
    const ditolak = await create("K10", { kodePromo: "HEMAT10", jumlahSesiTotal: 10, sesiPerSubtes: sebaran(10) });
    assert.equal(ditolak.status, 400);
    assert.ok(!String(ditolak.json.error).includes("honor"), "pesan siswa tidak membocorkan honor/margin");
    pastikanDitolakTanpaJejak();
    const lolos = await create("K10", { kodePromo: "HEMAT5", jumlahSesiTotal: 10, sesiPerSubtes: sebaran(10) });
    assert.equal(lolos.status, 200);
    pastikanInvoiceSamaDenganPayment(899000 - 44950);
  });
  it("promo + N tambahan: hanya hargaDasar dipotong; biaya sesi tambahan utuh", async () => {
    const res = await create("K10", { kodePromo: "HEMAT5", jumlahSesiTotal: 12, sesiPerSubtes: sebaran(12) });
    assert.equal(res.status, 200);
    pastikanInvoiceSamaDenganPayment(899000 - 44950 + 179000);
    assert.equal(db.payments[0].jumlah_sebelum_diskon, 1078000);
  });
});

describe("create — klien tidak menentukan harga; jalur lama; saklar", () => {
  it("nominal palsu dari klien diabaikan", async () => {
    const res = await create("K10", { jumlahSesiTotal: 3, subtesIds: SUB, sesiPerSubtes: sebaran(1, 1, 1), jumlah: 1, harga: 1, total: 1, biayaSesiTambahan: 1, hargaDasar: 1, amount: 1 });
    assert.equal(res.status, 200);
    pastikanInvoiceSamaDenganPayment(309000);
  });
  it("tanpa input baru = jalur lama: nominal lama, kolom baru TIDAK ada di baris", async () => {
    const res = await create("K10", {});
    assert.equal(res.status, 200);
    pastikanInvoiceSamaDenganPayment(899000);
    const p = db.payments[0];
    for (const k of ["jumlah_sesi_dibeli", "sesi_tambahan", "harga_per_sesi_tambahan", "biaya_sesi_tambahan"]) assert.ok(!(k in p), k);
    assert.ok(!("jumlah_sesi" in db.payment_subtes_pilihan[0]));
  });
  it("saklar mati: input dikirim diabaikan -> nominal lama, baris lama (tanpa penolakan N=21)", async () => {
    for (const nilai of [undefined, "", "false", "TRUE", "1"]) {
      if (nilai === undefined) delete process.env.SESI_PILIHAN_AKTIF;
      else process.env.SESI_PILIHAN_AKTIF = nilai;
      db.payments = [];
      db.payment_subtes_pilihan = [];
      mayarBodies = [];
      const res = await create("K10", { jumlahSesiTotal: 21, sesiPerSubtes: sebaran(21) });
      assert.equal(res.status, 200, `saklar=${String(nilai)}`);
      pastikanInvoiceSamaDenganPayment(899000);
      assert.ok(!("jumlah_sesi_dibeli" in db.payments[0]));
    }
  });
  it("saklar mati: promo besar tetap lolos seperti dulu (pagar margin hanya saat saklar hidup)", async () => {
    process.env.SESI_PILIHAN_AKTIF = "false";
    const res = await create("K10", { kodePromo: "HEMAT10" });
    assert.equal(res.status, 200);
    pastikanInvoiceSamaDenganPayment(899000 - 89900);
  });
});

describe("validate-promo — fungsi bersama yang sama", () => {
  it("tanpa jumlahSesi: seperti dulu (subtotal = hargaAktif)", async () => {
    const res = await cekPromo("K10", { kode: "hemat5" });
    assert.equal(res.status, 200);
    assert.deepEqual([res.json.subtotal, res.json.diskon, res.json.total], [899000, 44950, 854050]);
  });
  it("N tambahan: total = dasar - promo + biaya; N kecil -> 400; margin -> 400", async () => {
    const a = await cekPromo("K10", { kode: "HEMAT5", jumlahSesi: 12, jumlahSubtes: 1 });
    assert.deepEqual([a.json.subtotal, a.json.diskon, a.json.total], [1078000, 44950, 1033050]);
    assert.equal((await cekPromo("K10", { kode: "HEMAT5", jumlahSesi: 5, jumlahSubtes: 1 })).status, 400);
    assert.equal((await cekPromo("K10", { kode: "HEMAT10", jumlahSesi: 10, jumlahSubtes: 1 })).status, 400);
  });
  it("saklar mati: jumlahSesi diabaikan, promo besar lolos seperti dulu", async () => {
    process.env.SESI_PILIHAN_AKTIF = "false";
    const res = await cekPromo("K10", { kode: "HEMAT10", jumlahSesi: 5 });
    assert.equal(res.status, 200);
    assert.deepEqual([res.json.subtotal, res.json.total], [899000, 809100]);
  });
});

describe("fulfillPayment — sesi dibeli", () => {
  async function bayar(kelasId: string, body: Record<string, unknown>) {
    const res = await create(kelasId, body);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    return db.payments[0].id as string;
  }
  const jumlahSesi = () => db.sesi_kelas.length;

  it("N=12 3 subtes: sesi_kelas = 12, enrollments & enrollment_subtes terisi; webhook ulang idempoten", async () => {
    const id = await bayar("K10", { subtesIds: SUB, jumlahSesiTotal: 12, sesiPerSubtes: sebaran(5, 4, 3) });
    assert.equal(await fulfill.tandaiLunasDanProses(id, { metode: "qris" }), "diproses");
    assert.equal(jumlahSesi(), 12);
    assert.equal(db.enrollments.length, 1);
    assert.equal(db.enrollments[0].jumlah_sesi_total, 12);
    assert.equal(db.enrollments[0].sesi_tambahan, 2);
    assert.deepEqual(db.enrollment_subtes.map((r) => r.kuota_sesi).sort(), [3, 4, 5]);
    assert.equal(await fulfill.tandaiLunasDanProses(id, { metode: "qris" }), "sudah_lunas");
    assert.equal(jumlahSesi(), 12);
    assert.equal(db.enrollments.length, 1);
    assert.equal(db.enrollment_subtes.length, 3);
  });
  it("N=1 (kurang dari paket): sesi_kelas = 1, jumlah_sesi_total 1", async () => {
    const id = await bayar("K10", { jumlahSesiTotal: 1, sesiPerSubtes: sebaran(1) });
    await fulfill.tandaiLunasDanProses(id, { metode: null });
    assert.equal(jumlahSesi(), 1);
    assert.equal(db.enrollments[0].jumlah_sesi_total, 1);
    assert.equal(db.enrollments[0].sesi_tambahan, 0);
  });
  it("jalur lama (kolom NULL): sesi_kelas = kelas.jumlah_sesi; kolom baru enrollments/enrollment_subtes tidak ditulis", async () => {
    const id = await bayar("K8", {});
    await fulfill.tandaiLunasDanProses(id, { metode: null });
    assert.equal(jumlahSesi(), 8);
    assert.ok(!("jumlah_sesi_total" in db.enrollments[0]));
    assert.ok(!("kuota_sesi" in db.enrollment_subtes[0]));
  });
});

describe("tes statis", () => {
  const baca = (rel: string) => readFileSync(rel, "utf8");
  it("model lama lib/shared/sesiTambahan.ts tidak diimpor jalur baru", () => {
    for (const f of ["lib/payment/hitungCheckout.ts", "lib/shared/sebaranSesiSubtes.ts", "app/api/payment/create/route.ts", "app/api/payment/validate-promo/route.ts", "lib/payment/fulfillPayment.ts"]) {
      assert.ok(!/shared\/sesiTambahan/.test(baca(f)), f);
    }
  });
  it("create & validate-promo memakai hitungCheckout (satu fungsi); tidak ada rumus harga salinan", () => {
    assert.match(baca("app/api/payment/create/route.ts"), /hitungCheckout\(/);
    assert.match(baca("app/api/payment/validate-promo/route.ts"), /hitungCheckout\(/);
    assert.ok(!/hargaCharm|PREMIUM_|Math\.round/.test(baca("lib/payment/hitungCheckout.ts")));
  });
  it("tidak ada berkas SQL baru di branch ini", () => {
    assert.ok(readdirSync("db").every((f) => !/sesi_pilihan_checkout/.test(f)));
  });
});
