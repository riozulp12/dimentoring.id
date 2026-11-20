/**
 * Test POST /api/payment/create — penolakan slot penuh / kelas penuh / gagal baca. Route DIJALANKAN
 * sungguhan (Supabase + Mayar TIRUAN); setiap penolakan harus terjadi SEBELUM invoice gateway
 * (createPayment) dan SEBELUM INSERT payments. Kelas yang tidak memakai slot tidak terpengaruh.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { cekKetersediaanCheckout } from "@/lib/shared/slotTerisi";
import { hitungKapasitasKelas } from "@/lib/shared/kapasitasKelas";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };

let db: Record<string, Row[]>;
let tabelGagal: Set<string>;
let idSeq = 0;
let mayarCalls: string[];

class FakeQuery implements PromiseLike<Result> {
  private filters: ((row: Row) => boolean)[] = [];
  private op: "select" | "update" | "insert" = "select";
  private values: Row[] = [];
  private returning = false;
  constructor(private table: string) {}
  select() {
    this.returning = true;
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
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
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
    if (tabelGagal.has(this.table)) return { data: null, error: { code: "XX000", message: "gagal tiruan" } };
    const rows = (db[this.table] ??= []);
    const match = (row: Row) => this.filters.every((f) => f(row));
    if (this.op === "update") {
      const hit = rows.filter(match);
      for (const row of hit) Object.assign(row, this.values[0]);
      return { data: this.returning ? hit : null, error: null };
    }
    if (this.op === "insert") {
      const out = this.values.map((value) => ({ id: `${this.table}-${++idSeq}`, ...value }));
      rows.push(...out);
      return { data: this.returning ? out : null, error: null };
    }
    return { data: rows.filter(match), error: null };
  }
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  mayarCalls.push(`${init?.method ?? "GET"} ${url}`);
  const body = JSON.parse(String(init?.body ?? "{}"));
  const id = `mayar-${++idSeq}`;
  return new Response(
    JSON.stringify({ statusCode: 200, messages: "success", data: { id, transactionId: `trx-${id}`, link: `https://contoh.myr.id/invoices/${id}`, redirectUrl: body.redirectUrl ?? null } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

type CreateModule = typeof import("@/app/api/payment/create/route");
type SessionModule = typeof import("@/lib/auth/session");
let createRoute: CreateModule;
let sessionLib: SessionModule;

const SISWA = "siswa-baru";
const M1 = "mentor-1";
const M2 = "mentor-2";
const SEN = { hari: "Senin", jam_mulai: "19:00" };
const SEL = { hari: "Selasa", jam_mulai: "19:00" };
const RAB = { hari: "Rabu", jam_mulai: "19:00" };

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.MAYAR_BASE_URL = "https://api.mayar.io";
  process.env.MAYAR_API_KEY = "kunci-tiruan";
  process.env.APP_BASE_URL = "https://dimentoring.id";
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.VERCEL_ENV;
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => FakeQuery }).from = (table: string) => new FakeQuery(table);
  globalThis.fetch = fakeFetch as typeof fetch;
  createRoute = await import("@/app/api/payment/create/route");
  sessionLib = await import("@/lib/auth/session");
});

const kelasPrivat = (ekstra: Row = {}): Row => ({
  id: "K-PRIV",
  nama: "Matematika TKA Intensif",
  harga: 500000,
  diskon_persen: 0,
  mode_pembelajaran: "online",
  tipe_kelas: "private",
  link_lynkid: null,
  jadwal: [SEN, SEL, RAB],
  jadwal_pilih_siswa: true,
  kapasitas: null,
  jumlah_sesi: 10,
  tampil_di_katalog: true,
  subtes_id: "s-mtk",
  ...ekstra,
});

const lunas = (kelasId: string, slot: Row | null, userId = `u-${++idSeq}`, ditetapkan: Row | null = null): Row => ({
  user_id: userId,
  kelas_id: kelasId,
  status_pembayaran: "lunas",
  jadwal_pilihan: slot ? [slot] : null,
  jadwal_ditetapkan: ditetapkan,
});

beforeEach(() => {
  tabelGagal = new Set();
  mayarCalls = [];
  db = {
    kelas: [kelasPrivat()],
    kelas_subtes: [],
    kelas_subtes_mentor: [{ kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id: M1 }],
    user_roles: [{ user_id: M1, role_type: "mentor", status: "active" }],
    users: [{ id: SISWA, nama: "Siswa", email: "siswa@example.com" }],
    enrollments: [],
    payments: [],
    payment_subtes_pilihan: [],
    kode_promo: [],
  };
});

async function create(body: Record<string, unknown>) {
  const semula = process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
  process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = "true";
  try {
    const token = sessionLib.createSessionToken({ userId: SISWA, role: "student" });
    const res = await createRoute.POST(
      new NextRequest("http://localhost/api/payment/create", {
        method: "POST",
        headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ kelasId: "K-PRIV", ...body }),
      }),
    );
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  } finally {
    if (semula === undefined) delete process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
    else process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = semula;
  }
}

function pastikanDitolakTanpaJejak(jumlahPaymentAwal = 0) {
  assert.deepEqual(mayarCalls, [], "createPayment (invoice gateway) TIDAK boleh dipanggil");
  assert.equal(db.payments.length, jumlahPaymentAwal, "tidak boleh ada baris payments baru");
  assert.equal(db.payment_subtes_pilihan.length, 0);
}

describe("POST /api/payment/create — slot jadwal terisi", () => {
  it("KONTROL: slot masih kosong -> 200, invoice dibuat, payments tersimpan dengan pilihan jadwal", async () => {
    const res = await create({ jadwalPilihan: [SEN] });
    assert.equal(res.status, 200);
    assert.equal(mayarCalls.length, 1);
    assert.equal(db.payments.length, 1);
    assert.deepEqual(db.payments[0].jadwal_pilihan, [SEN]);
  });

  it("Pilihan 1 penuh -> 409 'Jadwal ... sudah terisi', TANPA invoice dan TANPA baris payments", async () => {
    db.enrollments = [lunas("K-PRIV", SEN)]; // 1 mentor aktif = kapasitas 1 per slot
    const res = await create({ jadwalPilihan: [SEN] });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "Jadwal Senin, 19:00 WIB sudah terisi. Pilih jadwal lain, ya.");
    pastikanDitolakTanpaJejak();
  });

  it("Pilihan 2 penuh (Pilihan 1 kosong) -> tetap 409 untuk Pilihan 2", async () => {
    db.enrollments = [lunas("K-PRIV", SEN)];
    const res = await create({ jadwalPilihan: [SEL, SEN] });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "Jadwal Senin, 19:00 WIB sudah terisi. Pilih jadwal lain, ya.");
    pastikanDitolakTanpaJejak();
  });

  it("slot efektif memakai jadwal_ditetapkan: siswa memilih Senin tapi ditetapkan Selasa -> Selasa penuh, Senin bebas", async () => {
    db.enrollments = [lunas("K-PRIV", SEN, "u-x", SEL)];
    assert.equal((await create({ jadwalPilihan: [SEL] })).status, 409);
    pastikanDitolakTanpaJejak();
    assert.equal((await create({ jadwalPilihan: [SEN] })).status, 200);
  });

  it("pembayaran MENUNGGU tidak menahan slot (terima balapan) -> 200", async () => {
    db.payments = [{ id: "p-lain", user_id: "u-lain", item_type: "kelas", item_id: "K-PRIV", status: "menunggu", jadwal_pilihan: [SEN] }];
    const res = await create({ jadwalPilihan: [SEN] });
    assert.equal(res.status, 200);
  });

  it("2 mentor aktif: satu siswa di Senin belum penuh (200); dua siswa -> penuh (409)", async () => {
    db.kelas_subtes_mentor.push({ kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id: M2 });
    db.user_roles.push({ user_id: M2, role_type: "mentor", status: "active" });
    db.enrollments = [lunas("K-PRIV", SEN)];
    assert.equal((await create({ jadwalPilihan: [SEN] })).status, 200);
    db.payments = [];
    db.payment_subtes_pilihan = [];
    mayarCalls = [];
    db.enrollments = [lunas("K-PRIV", SEN), lunas("K-PRIV", SEN)];
    assert.equal((await create({ jadwalPilihan: [SEN] })).status, 409);
    pastikanDitolakTanpaJejak();
  });

  it("kelas 1 slot: slot dipilih otomatis oleh server — bila penuh tetap 409", async () => {
    db.kelas = [kelasPrivat({ jadwal: [SEN] })];
    db.enrollments = [lunas("K-PRIV", SEN)];
    const res = await create({});
    assert.equal(res.status, 409);
    pastikanDitolakTanpaJejak();
  });
});

describe("POST /api/payment/create — kelas penuh dan gagal baca", () => {
  it("kelas penuh karena kapasitas manual (slot yang dipilih bebas) -> 409 'Kelas sudah penuh', tanpa jejak", async () => {
    db.kelas = [kelasPrivat({ kapasitas: 1 })];
    db.enrollments = [lunas("K-PRIV", SEN)];
    const res = await create({ jadwalPilihan: [SEL] });
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "Kelas sudah penuh");
    pastikanDitolakTanpaJejak();
  });

  it("kelas biasa (grup) dengan kapasitas manual penuh -> 409 'Kelas sudah penuh' (sebelumnya server tidak mengecek)", async () => {
    db.kelas = [kelasPrivat({ tipe_kelas: "grouping", jadwal_pilih_siswa: false, jadwal: null, kapasitas: 2 })];
    db.enrollments = [lunas("K-PRIV", null), lunas("K-PRIV", null)];
    const res = await create({});
    assert.equal(res.status, 409);
    assert.equal(res.json.error, "Kelas sudah penuh");
    pastikanDitolakTanpaJejak();
  });

  it("kelas tanpa kapasitas (kosong) tidak pernah penuh -> 200 walau banyak siswa", async () => {
    db.kelas = [kelasPrivat({ tipe_kelas: "grouping", jadwal_pilih_siswa: false, jadwal: null, kapasitas: null })];
    db.enrollments = Array.from({ length: 50 }, () => lunas("K-PRIV", null));
    assert.equal((await create({})).status, 200);
  });

  it("gagal baca (enrollments / kelas_subtes_mentor / user_roles) -> 500 'Gagal memeriksa ketersediaan jadwal.', tanpa jejak", async () => {
    for (const tabel of ["enrollments", "kelas_subtes_mentor", "user_roles"]) {
      tabelGagal = new Set([tabel]);
      mayarCalls = [];
      const asli = console.error;
      console.error = () => {};
      let res: Awaited<ReturnType<typeof create>>;
      try {
        res = await create({ jadwalPilihan: [SEN] });
      } finally {
        console.error = asli;
      }
      assert.equal(res.status, 500, tabel);
      assert.equal(res.json.error, "Gagal memeriksa ketersediaan jadwal.", tabel);
      pastikanDitolakTanpaJejak();
    }
  });
});

describe("POST /api/payment/create — kelas yang tidak memakai aturan slot tidak berubah", () => {
  const slotPenuhSemua = (): Row[] => [lunas("K-PRIV", SEN), lunas("K-PRIV", SEN), lunas("K-PRIV", SEL), lunas("K-PRIV", RAB)];

  it("semi_private -> slot yang sama boleh dipilih lagi (200)", async () => {
    db.kelas = [kelasPrivat({ tipe_kelas: "semi_private" })];
    db.enrollments = slotPenuhSemua();
    assert.equal((await create({ jadwalPilihan: [SEN] })).status, 200);
  });

  it("offline -> slot tidak dibatasi (mentor offline dipilih terpisah; di sini cukup tidak kena aturan slot)", async () => {
    db.kelas = [kelasPrivat({ mode_pembelajaran: "offline" })];
    db.enrollments = slotPenuhSemua();
    const res = await create({ jadwalPilihan: [SEN] });
    assert.notEqual(res.status, 409, "offline tidak boleh ditolak oleh aturan slot");
  });

  it("paket multi-subtes (2 subtes di kelas_subtes) -> aturan slot tidak berlaku (200)", async () => {
    db.kelas_subtes = [
      { kelas_id: "K-PRIV", subtes_id: "s-mtk" },
      { kelas_id: "K-PRIV", subtes_id: "s-fis" },
    ];
    db.kelas_subtes_mentor.push({ kelas_id: "K-PRIV", subtes_id: "s-fis", mentor_id: M1 });
    db.enrollments = slotPenuhSemua();
    const res = await create({ jadwalPilihan: [SEN], subtesIds: ["s-mtk"] });
    assert.equal(res.status, 200);
  });

  it("saklar jadwal_pilih_siswa mati -> aturan slot tidak berlaku (200)", async () => {
    db.kelas = [kelasPrivat({ jadwal_pilih_siswa: false })];
    db.enrollments = slotPenuhSemua();
    assert.equal((await create({})).status, 200);
  });
});

describe("cekKetersediaanCheckout (murni) dan susunan blok di route", () => {
  const ok = (ekstra: Partial<Parameters<typeof cekKetersediaanCheckout>[0] & object> = {}) => ({
    memakaiSlot: true,
    slot: [{ slot: SEN, terisi: 0, kapasitas: 1, penuh: false }],
    kapasitas: hitungKapasitasKelas({ kapasitasManual: null, lunas: 0, otomatis: { kapasitas: 1, sisa: 1 } }),
    ...ekstra,
  });

  it("null -> 500; lolos -> null; slot penuh -> 409 berpesan slot; kelas penuh -> 409", () => {
    assert.deepEqual(cekKetersediaanCheckout(null, [SEN]), { status: 500, error: "Gagal memeriksa ketersediaan jadwal." });
    assert.equal(cekKetersediaanCheckout(ok(), [SEN]), null);
    assert.equal(cekKetersediaanCheckout(ok({ slot: [{ slot: SEN, terisi: 1, kapasitas: 1, penuh: true }] }), [SEN])?.status, 409);
    assert.deepEqual(
      cekKetersediaanCheckout(ok({ kapasitas: hitungKapasitasKelas({ kapasitasManual: 1, lunas: 1, otomatis: null }) }), [SEN]),
      { status: 409, error: "Kelas sudah penuh" },
    );
  });

  it("slot penuh tapi kelas TIDAK memakai slot -> tidak ditolak karena slot", () => {
    assert.equal(
      cekKetersediaanCheckout(ok({ memakaiSlot: false, slot: [{ slot: SEN, terisi: 1, kapasitas: 1, penuh: true }] }), [SEN]),
      null,
    );
  });

  it("blok disisipkan SETELAH validateJadwalPilihan dan SEBELUM promo, createPayment, dan INSERT payments", () => {
    const src = readFileSync("app/api/payment/create/route.ts", "utf8");
    const iJadwal = src.indexOf("validateJadwalPilihan(body.jadwalPilihan");
    const iBlok = src.indexOf("cekKetersediaanCheckout(");
    const iPromo = src.indexOf("hitungCheckout(");
    const iGateway = src.indexOf("provider.createPayment(");
    const iInsert = src.indexOf('.from("payments")\n      .insert') >= 0 ? src.indexOf('.from("payments")\n      .insert') : src.indexOf('.from("payments")\r\n      .insert');
    assert.ok(iJadwal > 0 && iBlok > iJadwal && iBlok < iPromo && iBlok < iGateway && iBlok < iInsert, `${iJadwal} ${iBlok} ${iPromo} ${iGateway} ${iInsert}`);
  });
});
