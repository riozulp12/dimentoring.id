/**
 * Test pembayaran Mayar — logika murni (lib/payment/mayarLogic.ts) + route
 * create/webhook dijalankan terhadap Supabase TIRUAN di memori dan fetch
 * TIRUAN untuk API Mayar (tidak pernah menyentuh database atau Mayar asli).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import {
  checkAmount,
  checkMayarBaseUrl,
  computeExpiredAt,
  computeTagihan,
  decideRecheckAction,
  extractWebhookRefs,
  isProductionDeployment,
  isRedirectUrlRejected,
  mapMayarStatus,
  resolveAppBaseUrl,
  resolvePaymentProvider,
} from "@/lib/payment/mayarLogic";

// ---------------------------------------------------------------------------
// Logika murni
// ---------------------------------------------------------------------------

describe("pemilihan provider", () => {
  it("PAYMENT_PROVIDER kosong / tidak dikenali -> mayar", () => {
    for (const value of [undefined, "", "  ", "xendit", "midtrans", "MAYAR", "mayar"]) {
      assert.equal(resolvePaymentProvider(value), "mayar");
    }
  });
});

describe("guard base URL Mayar", () => {
  const cek = (baseUrl: string | undefined, isProductionEnv: boolean, allowProdInPreview = false) =>
    checkMayarBaseUrl({ baseUrl, isProductionEnv, allowProdInPreview });

  it("kombinasi benar diterima, path selalu /hl/v2", () => {
    assert.deepEqual(cek("https://api.mayar.io", false), { ok: true, apiBaseUrl: "https://api.mayar.io/hl/v2" });
    assert.deepEqual(cek("https://api.mayar.id/hl/v1/", true), { ok: true, apiBaseUrl: "https://api.mayar.id/hl/v2" });
  });

  it("production + sandbox ditolak (juga dengan MAYAR_ALLOW_PROD_IN_PREVIEW)", () => {
    assert.equal(cek("https://api.mayar.io/hl/v2", true).ok, false);
    assert.equal(cek("https://api.mayar.io/hl/v2", true, true).ok, false);
  });

  it("non-production + production ditolak, kecuali dilonggarkan eksplisit", () => {
    assert.equal(cek("https://api.mayar.id/hl/v2", false).ok, false);
    assert.equal(cek("https://api.mayar.id/hl/v2", false, true).ok, true);
  });

  it("kosong, bukan https, atau host asing ditolak", () => {
    for (const url of [undefined, "", "bukan url", "http://api.mayar.io", "https://api.mayar.io.evil.com", "https://evil.com"]) {
      assert.equal(cek(url, false).ok, false, String(url));
    }
  });

  it("Production ditentukan VERCEL_ENV kalau ada (Preview = bukan production walau NODE_ENV=production)", () => {
    assert.equal(isProductionDeployment({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
    assert.equal(isProductionDeployment({ NODE_ENV: "production", VERCEL_ENV: "production" }), true);
    assert.equal(isProductionDeployment({ NODE_ENV: "production" }), true);
    assert.equal(isProductionDeployment({ NODE_ENV: "development" }), false);
    assert.equal(isProductionDeployment({}), false);
  });
});

describe("expiredAt & tagihan", () => {
  it("expiredAt = 24 jam dari sekarang, format ISO", () => {
    const now = new Date("2026-10-16T00:00:00.000Z");
    assert.equal(computeExpiredAt(now), "2026-10-17T00:00:00.000Z");
    assert.equal(computeExpiredAt(now, 1), "2026-10-16T01:00:00.000Z");
  });

  it("tagihan = harga final dibulatkan, tanpa potongan tambahan", () => {
    assert.equal(computeTagihan(90000), 90000);
    assert.equal(computeTagihan(89999.6), 90000);
  });
});

describe("pemetaan status Mayar", () => {
  it("cuma 'paid' persis yang dianggap lunas", () => {
    assert.equal(mapMayarStatus("paid"), "paid");
    assert.equal(mapMayarStatus("PAID"), "paid");
    assert.equal(mapMayarStatus("unpaid"), "unpaid");
    assert.equal(mapMayarStatus("closed"), "closed");
    assert.equal(mapMayarStatus("expired"), "closed");
    for (const value of [true, 1, null, undefined, "success", "settled", "pending", ""]) {
      assert.equal(mapMayarStatus(value), "unknown", String(value));
    }
  });
});

describe("pencocokan nominal", () => {
  it("sama -> cocok; beda -> tidak_cocok; beda + biaya ditanggung pembeli -> ragu", () => {
    assert.equal(checkAmount({ expected: 90000, actual: 90000, feeBorneByCustomer: false }), "cocok");
    assert.equal(checkAmount({ expected: 90000, actual: "90000", feeBorneByCustomer: false }), "cocok");
    assert.equal(checkAmount({ expected: 90000, actual: 1000, feeBorneByCustomer: false }), "tidak_cocok");
    assert.equal(checkAmount({ expected: 90000, actual: 94000, feeBorneByCustomer: true }), "ragu");
    assert.equal(checkAmount({ expected: 90000, actual: undefined, feeBorneByCustomer: false }), "tidak_cocok");
    assert.equal(checkAmount({ expected: 90000, actual: NaN, feeBorneByCustomer: true }), "ragu");
  });
});

describe("aturan recheck (kedaluwarsa)", () => {
  const createdAt = new Date("2026-10-15T00:00:00.000Z");
  const jam = (h: number) => new Date(createdAt.getTime() + h * 3600_000);

  it("paid -> lunas, berapa pun umurnya", () => {
    assert.equal(decideRecheckAction({ mayarStatus: "paid", createdAt, now: jam(100) }), "lunas");
  });
  it("unpaid < 24 jam -> tunggu; > 24 jam -> gagal", () => {
    assert.equal(decideRecheckAction({ mayarStatus: "unpaid", createdAt, now: jam(23) }), "tunggu");
    assert.equal(decideRecheckAction({ mayarStatus: "unpaid", createdAt, now: jam(25) }), "gagal");
  });
  it("closed -> gagal walau belum 24 jam", () => {
    assert.equal(decideRecheckAction({ mayarStatus: "closed", createdAt, now: jam(1) }), "gagal");
  });
  it("status tidak dikenal TIDAK PERNAH gagal hanya karena waktu", () => {
    assert.equal(decideRecheckAction({ mayarStatus: "unknown", createdAt, now: jam(1000) }), "tunggu");
  });
});

describe("payload webhook & lain-lain", () => {
  it("kandidat id urut productId -> id -> transactionId, non-string diabaikan", () => {
    assert.deepEqual(extractWebhookRefs({ data: { id: "b", transactionId: "c", productId: "a", amount: 1 } }), [
      { field: "productId", value: "a" },
      { field: "id", value: "b" },
      { field: "transactionId", value: "c" },
    ]);
    assert.deepEqual(extractWebhookRefs({ data: { id: 5, productId: "" } }), []);
    assert.deepEqual(extractWebhookRefs(null), []);
    assert.deepEqual(extractWebhookRefs({ id: "top-level-tidak-dipakai" }), []);
  });

  it("deteksi 400 'redirectUrl is not supported'", () => {
    assert.equal(isRedirectUrlRejected(400, { messages: "redirectUrl is not supported on payment requests" }), true);
    assert.equal(isRedirectUrlRejected(400, { messages: "Validation error" }), false);
    assert.equal(isRedirectUrlRejected(429, { messages: "redirectUrl is not supported" }), false);
  });

  it("APP_BASE_URL diutamakan, cadangan origin request", () => {
    assert.equal(resolveAppBaseUrl("https://dimentoring.id/", "https://preview.vercel.app"), "https://dimentoring.id");
    assert.equal(resolveAppBaseUrl("", "https://preview.vercel.app"), "https://preview.vercel.app");
    assert.equal(resolveAppBaseUrl("bukan url", "https://preview.vercel.app"), "https://preview.vercel.app");
  });
});

describe("file statis", () => {
  it("checkout & halaman menunggu tidak memuat snap.js / teks nomor VA", () => {
    for (const file of [
      "components/siswa/CheckoutForm.tsx",
      "components/siswa/PaymentStatusPoller.tsx",
      "app/(protected)/(siswa)/checkout/[kelasId]/page.tsx",
      "app/(protected)/(siswa)/payment-status/[orderId]/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /snap\.js|window\.snap|midtrans/i, file);
      assert.doesNotMatch(source, /nomor VA/i, file);
    }
  });

  it(".env.example cuma placeholder tanpa nilai (4 payment + bendera Lead Capture), tanpa variabel Midtrans", () => {
    const lines = readFileSync(".env.example", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"));
    assert.deepEqual(lines, [
      "PAYMENT_PROVIDER=",
      "MAYAR_API_KEY=",
      "MAYAR_BASE_URL=",
      "APP_BASE_URL=",
      "NEXT_PUBLIC_LEAD_CAPTURE_ENABLED=",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Route create & webhook terhadap Supabase + Mayar tiruan
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let failOnce: { table: string; op: string } | null = null;
let idSeq = 0;

type Result = { data: unknown; error: { code: string; message: string } | null; count?: number };

class FakeQuery implements PromiseLike<Result> {
  private filters: ((row: Row) => boolean)[] = [];
  private op: "select" | "update" | "insert" | "upsert" = "select";
  private values: Row[] = [];
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private limitN: number | null = null;
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
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    return this.run().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }));
  }
  single() {
    return this.run().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }));
  }
  then<A, B>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<Result> {
    if (failOnce && failOnce.table === this.table && failOnce.op === this.op) {
      failOnce = null;
      return { data: null, error: { code: "XX000", message: "gagal tiruan" } };
    }
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
    let hit = rows.filter(match);
    if (this.limitN !== null) hit = hit.slice(0, this.limitN);
    return { data: hit, error: null, count: hit.length };
  }
}

/** Respons Mayar tiruan per gateway_reference. */
let mayarPayments: Record<string, { status: string; amount: number; trx?: { id: string; status: string; amount: number } }>;
let mayarCalls: string[];

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  mayarCalls.push(`${init?.method ?? "GET"} ${url}`);
  assert.ok(url.startsWith("https://api.mayar.io/hl/v2/"), `fetch ke host tak terduga: ${url}`);
  const reply = (statusCode: number, data: unknown) =>
    new Response(JSON.stringify({ statusCode, messages: statusCode === 200 ? "success" : "Not Found", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const path = url.slice("https://api.mayar.io/hl/v2".length);
  if (path === "/payments/create") {
    const body = JSON.parse(String(init?.body));
    const id = `mayar-${++idSeq}`;
    mayarPayments[id] = { status: "unpaid", amount: body.amount };
    return reply(200, { id, transactionId: `trx-${id}`, link: `https://contoh.myr.id/invoices/${id}`, redirectUrl: body.redirectUrl ?? null });
  }
  const paymentMatch = path.match(/^\/payments\/([^/]+)$/);
  if (paymentMatch) {
    const p = mayarPayments[decodeURIComponent(paymentMatch[1])];
    if (!p) return reply(404, null);
    return reply(200, { id: paymentMatch[1], status: p.status, amount: p.amount, transactions: p.trx ? [{ id: p.trx.id }] : [] });
  }
  const trxMatch = path.match(/^\/transactions\/([^/]+)$/);
  if (trxMatch) {
    const entry = Object.entries(mayarPayments).find(([, p]) => p.trx?.id === decodeURIComponent(trxMatch[1]));
    if (!entry) return reply(404, null);
    const [linkId, p] = entry;
    return reply(200, { id: p.trx!.id, status: p.trx!.status, amount: p.trx!.amount, paymentMethod: "QRIS", paymentLinkId: linkId });
  }
  return reply(404, null);
}

type WebhookModule = typeof import("@/app/api/payment/webhook/mayar/route");
type CreateModule = typeof import("@/app/api/payment/create/route");
type SessionModule = typeof import("@/lib/auth/session");
let webhookRoute: WebhookModule;
let createRoute: CreateModule;
let sessionLib: SessionModule;

const SISWA = "siswa-1";
const KELAS = "kelas-1";

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

  webhookRoute = await import("@/app/api/payment/webhook/mayar/route");
  createRoute = await import("@/app/api/payment/create/route");
  sessionLib = await import("@/lib/auth/session");
});

beforeEach(() => {
  failOnce = null;
  mayarCalls = [];
  mayarPayments = {
    "mayar-lunas": { status: "paid", amount: 90000, trx: { id: "trx-lunas", status: "paid", amount: 90000 } },
    "mayar-belum": { status: "unpaid", amount: 90000 },
    "mayar-kurang": { status: "paid", amount: 90000, trx: { id: "trx-kurang", status: "paid", amount: 1000 } },
  };
  const payment = (id: string, gatewayReference: string): Row => ({
    id,
    user_id: SISWA,
    item_type: "kelas",
    item_id: KELAS,
    order_id: `DMT-${id}`,
    status: "menunggu",
    jumlah: 90000,
    jumlah_sebelum_diskon: 100000,
    kode_promo_id: null,
    gateway_reference: gatewayReference,
    dibuat_pada: new Date().toISOString(),
    mentor_offline_id: null,
    lokasi_siswa_lat: null,
    lokasi_siswa_lng: null,
    jadwal_pilihan: null,
  });
  db = {
    payments: [payment("p-lunas", "mayar-lunas"), payment("p-belum", "mayar-belum"), payment("p-kurang", "mayar-kurang")],
    payment_subtes_pilihan: [{ payment_id: "p-lunas", subtes_id: "subtes-1" }],
    kelas: [
      {
        id: KELAS,
        nama: "Kelas Uji",
        harga: 90000,
        mode_pembelajaran: "online",
        link_lynkid: null,
        jadwal: null,
        jadwal_pilih_siswa: false,
        jumlah_sesi: 3,
        tampil_di_katalog: true,
        subtes_id: null,
      },
    ],
    users: [{ id: SISWA, nama: "Siswa", email: "siswa@example.com" }],
    enrollments: [],
    enrollment_subtes: [],
    sesi_kelas: [],
    notifikasi: [],
    referrals: [],
    kelas_mentor: [],
    kelas_subtes: [],
  };
});

async function postWebhook(payload: unknown) {
  const { NextRequest } = await import("next/server");
  return webhookRoute.POST(
    new NextRequest("http://localhost/api/payment/webhook/mayar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

const snapshot = () => JSON.stringify(db);

describe("webhook Mayar", () => {
  it("webhook palsu (id tidak dikenal) tidak mengubah apa pun dan tidak memanggil Mayar", async () => {
    const before = snapshot();
    const res = await postWebhook({ event: "payment.received", data: { id: "palsu", productId: "palsu-2", status: true, amount: 90000 } });
    assert.equal(res.status, 200);
    assert.equal(snapshot(), before);
    assert.deepEqual(mayarCalls, []);
  });

  it("payload mengaku lunas tapi GET Mayar bilang unpaid -> tidak berubah", async () => {
    const before = snapshot();
    const res = await postWebhook({ event: "payment.received", data: { productId: "mayar-belum", status: true, amount: 90000 } });
    assert.equal(res.status, 200);
    assert.equal(snapshot(), before);
    assert.equal(mayarCalls.length, 1);
  });

  it("paid tapi nominal transaksi tidak cocok -> TIDAK dilunasi", async () => {
    const before = snapshot();
    const res = await postWebhook({ data: { productId: "mayar-kurang" } });
    assert.equal(res.status, 200);
    assert.equal(snapshot(), before);
  });

  it("webhook asli: lunas, enrollment + subtes + sesi + notifikasi; dicocokkan lewat data.id kalau productId tidak cocok", async () => {
    const res = await postWebhook({ data: { productId: "bukan-ini", id: "mayar-lunas" } });
    assert.equal(res.status, 200);
    const payment = db.payments.find((p) => p.id === "p-lunas")!;
    assert.equal(payment.status, "berhasil");
    assert.equal(payment.metode, "qris");
    assert.ok(payment.tanggal_lunas);
    assert.equal(db.enrollments.length, 1);
    assert.equal(db.enrollments[0].status_pembayaran, "lunas");
    assert.equal(db.enrollment_subtes.length, 1);
    assert.equal(db.sesi_kelas.length, 3);
    assert.equal(db.notifikasi.length, 1);
  });

  it("webhook ganda tidak membuat enrollment/sesi/notifikasi ganda", async () => {
    for (let i = 0; i < 3; i++) {
      assert.equal((await postWebhook({ data: { productId: "mayar-lunas" } })).status, 200);
    }
    assert.equal(db.enrollments.length, 1);
    assert.equal(db.enrollment_subtes.length, 1);
    assert.equal(db.sesi_kelas.length, 3);
    assert.equal(db.notifikasi.length, 1);
  });

  it("langkah pasca-lunas gagal -> HTTP 500; kiriman ulang melengkapinya tanpa duplikat", async () => {
    failOnce = { table: "enrollments", op: "upsert" };
    assert.equal((await postWebhook({ data: { productId: "mayar-lunas" } })).status, 500);
    assert.equal(db.payments.find((p) => p.id === "p-lunas")!.status, "berhasil");
    assert.equal(db.enrollments.length, 0);
    assert.equal(db.notifikasi.length, 0);

    assert.equal((await postWebhook({ data: { productId: "mayar-lunas" } })).status, 200);
    assert.equal(db.enrollments.length, 1);
    assert.equal(db.sesi_kelas.length, 3);
    assert.equal(db.notifikasi.length, 1);

    assert.equal((await postWebhook({ data: { productId: "mayar-lunas" } })).status, 200);
    assert.equal(db.notifikasi.length, 1);
  });

  it("payment yang sudah 'gagal' tidak dihidupkan lagi oleh webhook", async () => {
    db.payments.find((p) => p.id === "p-lunas")!.status = "gagal";
    assert.equal((await postWebhook({ data: { productId: "mayar-lunas" } })).status, 200);
    assert.equal(db.payments.find((p) => p.id === "p-lunas")!.status, "gagal");
    assert.equal(db.enrollments.length, 0);
  });
});

describe("POST /api/payment/create (Mayar)", () => {
  async function postCreate() {
    const { NextRequest } = await import("next/server");
    const token = sessionLib.createSessionToken({ userId: SISWA, role: "student" });
    return createRoute.POST(
      new NextRequest("http://localhost/api/payment/create", {
        method: "POST",
        headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ kelasId: KELAS }),
      }),
    );
  }

  async function withFlag<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
    const semula = process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
    if (value === undefined) delete process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
    else process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = value;
    try {
      return await fn();
    } finally {
      if (semula === undefined) delete process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
      else process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = semula;
    }
  }

  it('flag bukan "true" -> 403, tidak ada payment & tidak ada panggilan ke Mayar', async () => {
    const jumlahAwal = db.payments.length;
    for (const nilai of [undefined, "True", "1"]) {
      assert.equal((await withFlag(nilai, postCreate)).status, 403);
    }
    assert.equal(db.payments.length, jumlahAwal);
    assert.deepEqual(mayarCalls, []);
  });

  it("flag \"true\" -> payment request Mayar dibuat, gateway_reference + 'menunggu' tersimpan di INSERT yang sama", async () => {
    const res = await withFlag("true", postCreate);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.match(json.paymentUrl, /^https:\/\/contoh\.myr\.id\/invoices\//);
    const baru = db.payments.find((p) => p.order_id === json.orderId)!;
    assert.equal(baru.status, "menunggu");
    assert.equal(baru.jumlah, 90000);
    assert.ok(mayarPayments[baru.gateway_reference as string], "gateway_reference = id payment request Mayar");
    assert.deepEqual(mayarCalls, ["POST https://api.mayar.io/hl/v2/payments/create"]);
  });
});

describe("POST /api/admin/payment/recheck", () => {
  async function postRecheck(role: "admin" | "student", body?: unknown) {
    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/admin/payment/recheck/route");
    const token = sessionLib.createSessionToken({ userId: "u-1", role });
    return route.POST(
      new NextRequest("http://localhost/api/admin/payment/recheck", {
        method: "POST",
        headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  }

  it("bukan Admin -> 403 tanpa menyentuh apa pun", async () => {
    const before = snapshot();
    assert.equal((await postRecheck("student")).status, 403);
    assert.equal(snapshot(), before);
    assert.deepEqual(mayarCalls, []);
  });

  it("batch: paid -> lunas, unpaid < 24 jam tetap menunggu, unpaid > 24 jam -> gagal, nominal salah tetap menunggu", async () => {
    db.payments.push({
      ...db.payments.find((p) => p.id === "p-belum")!,
      id: "p-lama",
      order_id: "DMT-p-lama",
      gateway_reference: "mayar-lama",
      dibuat_pada: new Date(Date.now() - 25 * 3600_000).toISOString(),
    });
    mayarPayments["mayar-lama"] = { status: "unpaid", amount: 90000 };

    const res = await postRecheck("admin");
    assert.equal(res.status, 200);
    const status = (id: string) => db.payments.find((p) => p.id === id)!.status;
    assert.equal(status("p-lunas"), "berhasil");
    assert.equal(status("p-belum"), "menunggu");
    assert.equal(status("p-lama"), "gagal");
    assert.equal(status("p-kurang"), "menunggu");
    assert.equal(db.enrollments.length, 1);
  });

  it("closed di Mayar -> gagal walau baru dibuat; satu orderId", async () => {
    mayarPayments["mayar-belum"].status = "closed";
    const res = await postRecheck("admin", { orderId: "DMT-p-belum" });
    assert.equal(res.status, 200);
    assert.equal(db.payments.find((p) => p.id === "p-belum")!.status, "gagal");
    assert.equal(db.payments.find((p) => p.id === "p-lunas")!.status, "menunggu");
  });
});
