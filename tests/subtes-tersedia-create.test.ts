/**
 * Test penolakan subtes tanpa mentor aktif di POST /api/payment/create:
 * - subtes dipilih yang tidak tersedia -> 409;
 * - semua subtes tidak tersedia -> 409;
 * - pembacaan ketersediaan gagal -> 500 (fail-closed);
 * dan pada KETIGA kasus: invoice gateway TIDAK dibuat (tidak ada fetch ke Mayar)
 * dan TIDAK ada baris payments / payment_subtes_pilihan tertulis. Kasus kontrol
 * (semua tersedia -> 200) membuktikan tes ini tidak kosong.
 * Supabase & Mayar TIRUAN di memori.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null; count?: number };

let db: Record<string, Row[]>;
let idSeq = 0;
let tabelGagal: string | null;
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
    return this.run().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }));
  }
  then<A, B>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<Result> {
    if (this.op === "select" && tabelGagal === this.table) {
      return { data: null, error: { code: "XX000", message: "gagal tiruan" } };
    }
    const rows = (db[this.table] ??= []);
    const match = (row: Row) => this.filters.every((f) => f(row));
    if (this.op === "update") {
      const hit = rows.filter(match);
      for (const row of hit) Object.assign(row, this.values[0]);
      return { data: this.returning ? hit : null, error: null };
    }
    if (this.op === "insert") {
      const out: Row[] = [];
      for (const value of this.values) {
        const row = { id: `${this.table}-${++idSeq}`, ...value };
        rows.push(row);
        out.push(row);
      }
      return { data: this.returning ? out : null, error: null };
    }
    const hit = rows.filter(match);
    return { data: hit, error: null, count: hit.length };
  }
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  mayarCalls.push(`${init?.method ?? "GET"} ${url}`);
  assert.ok(url.startsWith("https://api.mayar.io/hl/v2/"), `fetch ke host tak terduga: ${url}`);
  const body = JSON.parse(String(init?.body ?? "{}"));
  const id = `mayar-${++idSeq}`;
  return new Response(
    JSON.stringify({
      statusCode: 200,
      messages: "success",
      data: { id, transactionId: `trx-${id}`, link: `https://contoh.myr.id/invoices/${id}`, redirectUrl: body.redirectUrl ?? null },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

type CreateModule = typeof import("@/app/api/payment/create/route");
type SessionModule = typeof import("@/lib/auth/session");
let createRoute: CreateModule;
let sessionLib: SessionModule;

const SISWA = "siswa-1";
const KELAS = "kelas-paket";
const mentorAktif = (id: string) => ({ user_id: id, role_type: "mentor", status: "active" });

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

beforeEach(() => {
  tabelGagal = null;
  mayarCalls = [];
  db = {
    kelas: [
      {
        id: KELAS,
        nama: "Paket Saintek",
        harga: 300000,
        diskon_persen: 0,
        mode_pembelajaran: "online",
        link_lynkid: null,
        jadwal: null,
        jadwal_pilih_siswa: false,
        tampil_di_katalog: true,
        subtes_id: null,
      },
    ],
    kelas_subtes: [
      { kelas_id: KELAS, subtes_id: "mtk", subtes: { nama: "Matematika" } },
      { kelas_id: KELAS, subtes_id: "fis", subtes: { nama: "Fisika" } },
      { kelas_id: KELAS, subtes_id: "kim", subtes: { nama: "Kimia" } },
    ],
    kelas_subtes_mentor: [
      { kelas_id: KELAS, subtes_id: "mtk", mentor_id: "m1" },
      { kelas_id: KELAS, subtes_id: "fis", mentor_id: "m2" },
      { kelas_id: KELAS, subtes_id: "kim", mentor_id: "m1" },
    ],
    kelas_mentor: [],
    user_roles: [mentorAktif("m1"), mentorAktif("m2")],
    users: [{ id: SISWA, nama: "Siswa", email: "siswa@example.com" }],
    enrollments: [],
    payments: [],
    payment_subtes_pilihan: [],
    kode_promo: [],
  };
});

async function buat(body: Record<string, unknown>) {
  const { NextRequest } = await import("next/server");
  const token = sessionLib.createSessionToken({ userId: SISWA, role: "student" });
  const semula = process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
  process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = "true";
  try {
    const res = await createRoute.POST(
      new NextRequest("http://localhost/api/payment/create", {
        method: "POST",
        headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ kelasId: KELAS, ...body }),
      }),
    );
    return { res, json: (await res.json()) as { success: boolean; error?: string; orderId?: string } };
  } finally {
    if (semula === undefined) delete process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
    else process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = semula;
  }
}

/** Tidak ada invoice gateway, tidak ada payments, tidak ada pilihan subtes tertulis. */
function pastikanTidakAdaYangDibuat() {
  assert.deepEqual(mayarCalls, [], "tidak boleh ada panggilan ke Mayar (invoice)");
  assert.deepEqual(db.payments, [], "tidak boleh ada baris payments");
  assert.deepEqual(db.payment_subtes_pilihan, [], "tidak boleh ada baris payment_subtes_pilihan");
}

describe("kontrol: semua subtes tersedia", () => {
  it("subtes yang dipilih punya mentor aktif -> 200, invoice Mayar dibuat, payments tertulis", async () => {
    const { res, json } = await buat({ subtesIds: ["mtk", "fis"] });
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(mayarCalls.length, 1);
    assert.equal(db.payments.length, 1);
    assert.deepEqual(
      db.payment_subtes_pilihan.map((r) => r.subtes_id).sort(),
      ["fis", "mtk"],
    );
  });
});

describe("subtes dipilih yang tidak tersedia -> 409", () => {
  it("campuran tersedia + tidak tersedia ditolak seluruhnya", async () => {
    db.kelas_subtes_mentor = [{ kelas_id: KELAS, subtes_id: "mtk", mentor_id: "m1" }];
    const { res, json } = await buat({ subtesIds: ["mtk", "fis"] });
    assert.equal(res.status, 409);
    assert.equal(json.success, false);
    assert.equal(json.error, "Ada subtes yang belum tersedia karena belum ada mentornya. Pilih subtes lain, ya.");
    pastikanTidakAdaYangDibuat();
  });

  it("hanya subtes tidak tersedia yang dikirim", async () => {
    db.kelas_subtes_mentor = [{ kelas_id: KELAS, subtes_id: "mtk", mentor_id: "m1" }];
    const { res } = await buat({ subtesIds: ["kim"] });
    assert.equal(res.status, 409);
    pastikanTidakAdaYangDibuat();
  });

  it("mentor satu-satunya nonaktif (peran pending) dianggap tidak tersedia", async () => {
    db.user_roles = [mentorAktif("m1"), { user_id: "m2", role_type: "mentor", status: "pending" }];
    const { res } = await buat({ subtesIds: ["fis"] });
    assert.equal(res.status, 409);
    pastikanTidakAdaYangDibuat();
  });
});

describe("semua subtes tidak tersedia -> 409", () => {
  it("kelas lama tanpa pasangan (kelas_mentor aktif tidak menyelamatkan)", async () => {
    db.kelas_subtes_mentor = [];
    db.kelas_mentor = [{ kelas_id: KELAS, mentor_id: "m1" }];
    const { res, json } = await buat({ subtesIds: ["mtk"] });
    assert.equal(res.status, 409);
    assert.equal(json.error, "Kelas ini belum bisa didaftar karena belum ada mentor untuk subtesnya.");
    pastikanTidakAdaYangDibuat();
  });

  it("semua mentor pasangan nonaktif", async () => {
    db.user_roles = [];
    const { res, json } = await buat({ subtesIds: ["mtk", "fis"] });
    assert.equal(res.status, 409);
    assert.equal(json.error, "Kelas ini belum bisa didaftar karena belum ada mentor untuk subtesnya.");
    pastikanTidakAdaYangDibuat();
  });
});

describe("pembacaan ketersediaan gagal -> 500 (fail-closed)", () => {
  it("kelas_subtes_mentor gagal dibaca", async () => {
    tabelGagal = "kelas_subtes_mentor";
    const { res, json } = await buat({ subtesIds: ["mtk"] });
    assert.equal(res.status, 500);
    assert.equal(json.error, "Gagal memeriksa ketersediaan subtes. Coba lagi nanti.");
    pastikanTidakAdaYangDibuat();
  });

  it("user_roles gagal dibaca", async () => {
    tabelGagal = "user_roles";
    const { res, json } = await buat({ subtesIds: ["mtk"] });
    assert.equal(res.status, 500);
    assert.equal(json.error, "Gagal memeriksa ketersediaan subtes. Coba lagi nanti.");
    pastikanTidakAdaYangDibuat();
  });
});

describe("satu aturan di UI dan server: blok ketersediaan hanya untuk kelas paket ONLINE", () => {
  it("kelas online paket tanpa pasangan sama sekali (kelas_mentor juga kosong) -> 409", async () => {
    db.kelas_subtes_mentor = [];
    db.kelas_mentor = [];
    const { res, json } = await buat({ subtesIds: ["mtk"] });
    assert.equal(res.status, 409);
    assert.equal(json.error, "Kelas ini belum bisa didaftar karena belum ada mentor untuk subtesnya.");
    pastikanTidakAdaYangDibuat();
  });

  it("kelas OFFLINE dengan >1 subtes tanpa pasangan TIDAK ditolak 409 oleh blok ini (lanjut ke validasi mentor tatap muka)", async () => {
    db.kelas[0].mode_pembelajaran = "offline";
    db.kelas_subtes_mentor = [];
    db.kelas_mentor = [];
    const { res, json } = await buat({ subtesIds: ["mtk"] });
    assert.notEqual(res.status, 409);
    assert.doesNotMatch(json.error ?? "", /belum tersedia|belum ada mentor untuk subtesnya/);
    // sampai ke validasi kelas offline (mentor dipilih siswa, bukan pasangan kelas_subtes_mentor)
    assert.equal(res.status, 400);
    assert.equal(json.error, "Pilih mentor tatap muka dulu sebelum checkout.");
    pastikanTidakAdaYangDibuat();
  });

  it("kelas OFFLINE tidak membaca kelas_subtes_mentor/user_roles sama sekali untuk ketersediaan", async () => {
    db.kelas[0].mode_pembelajaran = "offline";
    tabelGagal = "kelas_subtes_mentor"; // kalau dibaca, hasilnya 500 (fail-closed)
    const { res } = await buat({ subtesIds: ["mtk"] });
    assert.notEqual(res.status, 500);
    assert.equal(res.status, 400);
    pastikanTidakAdaYangDibuat();
  });

  it("kondisi di server sama dengan kondisi di UI dan halaman checkout (paket online)", () => {
    const route = readFileSync(path.join(process.cwd(), "app/api/payment/create/route.ts"), "utf8");
    const form = readFileSync(path.join(process.cwd(), "components/siswa/CheckoutForm.tsx"), "utf8");
    const halaman = readFileSync(path.join(process.cwd(), "app/(protected)/(siswa)/checkout/[kelasId]/page.tsx"), "utf8");
    // UI: isPaket = !isOffline && subtesOptions.length > 1
    assert.ok(form.includes("const isPaket = !isOffline && subtesOptions.length > 1;"));
    // halaman checkout: hanya kelas paket online
    assert.ok(halaman.includes('kelas.modePembelajaran !== "offline" && subtesPool.length > 1'));
    // server: blok ketersediaan dibatasi kondisi yang sama
    const awalBlok = route.indexOf('if (kelas.modePembelajaran !== "offline") {');
    const komentar = route.indexOf("// Subtes tanpa mentor aktif tidak boleh dijual");
    assert.ok(awalBlok > 0 && komentar > awalBlok, "blok ketersediaan berada di dalam kondisi non-offline");
    assert.ok(route.indexOf("getKetersediaanSubtes(kelasId, subtesPool)") > awalBlok);
  });
});

describe("bagian lain route tidak berubah", () => {
  it("subtes di luar pool tetap 400 (validasi pool lebih dulu, bukan 409)", async () => {
    const { res } = await buat({ subtesIds: ["tidak-ada"] });
    assert.equal(res.status, 400);
    pastikanTidakAdaYangDibuat();
  });

  it("kelas non-paket (satu subtes) tidak dikenai pemeriksaan ketersediaan", async () => {
    db.kelas_subtes = [{ kelas_id: KELAS, subtes_id: "mtk", subtes: { nama: "Matematika" } }];
    db.kelas_subtes_mentor = [];
    const { res } = await buat({});
    assert.equal(res.status, 200);
    assert.equal(mayarCalls.length, 1);
  });
});
