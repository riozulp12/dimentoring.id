/**
 * Test email bukti pembayaran ke siswa (pembayaran kelas lunas).
 * Supabase TIRUAN di memori; fetch global dicegat: API Mayar tiruan dan
 * api.resend.com tiruan (tidak ada layanan sungguhan yang dipanggil).
 * Di luar request Next.js, jalankanSetelahRespons() berjalan langsung dan
 * ditunggu, jadi hasilnya deterministik.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import "./helpers/envSupabaseUji";
import { NextRequest } from "next/server";
import { CONTOH_EVENT_EMAIL } from "@/lib/email/contohEmail";
import { buatEmailPembayaranBerhasil, buatSubjekPembayaranBerhasil } from "@/lib/email/templateEmail";
import { formatTanggalBayar } from "@/lib/email/kirimEmailPembayaranBerhasil";
import { resetPenjagaBuktiBayarUntukTes } from "@/lib/notifikasi/pembayaranBerhasil";

// ---------------------------------------------------------------------------
// Supabase tiruan (query builder minimal di memori)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };
let db: Record<string, Row[]>;
let idSeq = 0;

class FakeQuery implements PromiseLike<Result> {
  private filters: ((row: Row) => boolean)[] = [];
  private op: "select" | "update" | "insert" | "upsert" = "select";
  private values: Row[] = [];
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
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
    return { data: rows.filter(match), error: null };
  }
}

// ---------------------------------------------------------------------------
// fetch tiruan: Mayar + Resend
// ---------------------------------------------------------------------------

let kirimResend: { body: Record<string, unknown> }[];
let perilakuResend: "ok" | "ditolak" | "putus";

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.startsWith("https://api.resend.com/emails")) {
    kirimResend.push({ body: JSON.parse(String(init?.body ?? "{}")) });
    if (perilakuResend === "putus") throw new Error("koneksi putus siswa@example.com re_kunci_tiruan_untuk_tes");
    if (perilakuResend === "ditolak") {
      return new Response(JSON.stringify({ name: "validation_error", message: "ditolak siswa@example.com", statusCode: 422 }), {
        status: 422,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "email-uji-1" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  assert.ok(url.startsWith("https://api.mayar.io/hl/v2/"), `fetch ke host tak terduga: ${url}`);
  const reply = (statusCode: number, data: unknown) =>
    new Response(JSON.stringify({ statusCode, messages: "success", data }), { status: 200, headers: { "content-type": "application/json" } });
  const path = url.slice("https://api.mayar.io/hl/v2".length);
  if (path === "/payments/mayar-lunas") {
    return reply(200, { id: "mayar-lunas", status: "paid", amount: 90000, transactions: [{ id: "trx-lunas" }] });
  }
  if (path === "/transactions/trx-lunas") {
    return reply(200, { id: "trx-lunas", status: "paid", amount: 90000, paymentMethod: "QRIS", paymentLinkId: "mayar-lunas" });
  }
  return reply(404, null);
}

// ---------------------------------------------------------------------------
// Penyiapan
// ---------------------------------------------------------------------------

type WebhookModule = typeof import("@/app/api/payment/webhook/mayar/route");
type FulfillModule = typeof import("@/lib/payment/fulfillPayment");
let webhook: WebhookModule;
let fulfill: FulfillModule;

const fetchAsli = globalThis.fetch;
const env = { RESEND_API_KEY: process.env.RESEND_API_KEY, EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS };
const logAsli = { log: console.log, info: console.info, warn: console.warn, error: console.error };
let logTertangkap: string[];

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
  webhook = await import("@/app/api/payment/webhook/mayar/route");
  fulfill = await import("@/lib/payment/fulfillPayment");
});

after(() => {
  globalThis.fetch = fetchAsli;
  if (env.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = env.RESEND_API_KEY;
  if (env.EMAIL_FROM_ADDRESS === undefined) delete process.env.EMAIL_FROM_ADDRESS;
  else process.env.EMAIL_FROM_ADDRESS = env.EMAIL_FROM_ADDRESS;
  Object.assign(console, logAsli);
});

const SISWA = "siswa-1";
const KELAS = "kelas-1";

beforeEach(() => {
  kirimResend = [];
  perilakuResend = "ok";
  idSeq = 0;
  logTertangkap = [];
  process.env.RESEND_API_KEY = "re_kunci_tiruan_untuk_tes";
  delete process.env.EMAIL_FROM_ADDRESS;
  resetPenjagaBuktiBayarUntukTes();
  const tangkap = (...args: unknown[]) => {
    logTertangkap.push(args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.log = tangkap;
  console.info = tangkap;
  console.warn = tangkap;
  console.error = tangkap;

  db = {
    payments: [
      {
        id: "p-lunas",
        user_id: SISWA,
        item_type: "kelas",
        item_id: KELAS,
        order_id: "DMT-ORDER-001",
        status: "menunggu",
        jumlah: 90000,
        jumlah_sebelum_diskon: 100000,
        kode_promo_id: "promo-1",
        gateway_reference: "mayar-lunas",
        dibuat_pada: new Date().toISOString(),
        tanggal_lunas: null,
        mentor_offline_id: null,
        lokasi_siswa_lat: null,
        lokasi_siswa_lng: null,
        jadwal_pilihan: null,
      },
    ],
    payment_subtes_pilihan: [],
    kelas: [
      {
        id: KELAS,
        nama: "Intensif <UTBK> & Co",
        harga: 100000,
        mode_pembelajaran: "online",
        jadwal: [{ hari: "Senin", jam_mulai: "16.00" }],
        jumlah_sesi: 3,
        mentor_id: "mentor-1",
      },
    ],
    users: [
      { id: SISWA, nama: "Budi Santoso", email: "siswa@example.com" },
      { id: "mentor-1", nama: "Rina Mentor", email: "rina@example.com" },
    ],
    kode_promo: [{ id: "promo-1", kode: "MERDEKA17", jumlah_terpakai: 0 }],
    enrollments: [],
    enrollment_subtes: [],
    sesi_kelas: [],
    notifikasi: [],
    referrals: [],
    kelas_mentor: [],
    kelas_subtes: [],
  };
});

async function postWebhook() {
  return webhook.POST(
    new NextRequest("https://dimentoring.id/api/payment/webhook/mayar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { id: "mayar-lunas" } }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tes
// ---------------------------------------------------------------------------

describe("email bukti pembayaran: terkirim sekali, hanya saat pertama lunas", () => {
  it("webhook pertama: tepat satu email ke siswa, isi lengkap, text ikut terkirim", async () => {
    const res = await postWebhook();
    assert.equal(res.status, 200);
    assert.equal(db.payments[0].status, "berhasil");
    assert.equal(kirimResend.length, 1, "harus tepat satu email");

    const { body } = kirimResend[0];
    assert.deepEqual(body.to, ["siswa@example.com"]);
    assert.equal(body.from, "Dimentoring <notifikasi@dimentoring.id>");
    assert.equal(body.subject, "Pembayaran berhasil: Intensif <UTBK> & Co");
    assert.ok(!/[\r\n]/.test(String(body.subject)));

    const html = String(body.html);
    const teks = String(body.text);
    // html: semua teks pengguna ter-escape
    assert.ok(!html.includes("<UTBK>"));
    assert.ok(html.includes("Intensif &lt;UTBK&gt; &amp; Co"));
    for (const isi of [html, teks]) {
      assert.ok(isi.includes("Budi Santoso"));
      assert.ok(isi.includes("Rina Mentor"));
      assert.ok(isi.includes("Senin"));
      assert.ok(isi.includes("Rp90.000"));
      assert.ok(isi.includes("MERDEKA17"));
      assert.ok(isi.includes("DMT-ORDER-001"));
      assert.ok(isi.includes("WIB"));
      assert.ok(isi.includes("https://dimentoring.id/kelas/kelas-1"));
    }
    assert.ok(html.includes(">Buka Kelas Saya<"));
    assert.ok(teks.trim().length > 100 && !/<(html|table|a |p )/i.test(teks), "text kosong atau memuat HTML");
  });

  it("webhook kedua (kiriman ulang Mayar): tidak ada email baru", async () => {
    await postWebhook();
    assert.equal(kirimResend.length, 1);
    const res2 = await postWebhook();
    assert.equal(res2.status, 200);
    assert.equal(kirimResend.length, 1, "email dobel pada webhook ganda");
    assert.equal(db.enrollments.length, 1);
  });

  it("webhook ganda hampir bersamaan: tetap satu email", async () => {
    await Promise.all([postWebhook(), postWebhook()]);
    assert.equal(kirimResend.length, 1);
  });

  it("jalankanPascaLunas pertamaKali=false (run ulang / recheck): tidak mengirim email", async () => {
    await postWebhook();
    kirimResend = [];
    resetPenjagaBuktiBayarUntukTes();
    await fulfill.jalankanPascaLunas(
      { id: "p-lunas", user_id: SISWA, item_type: "kelas", item_id: KELAS, status: "berhasil" },
      { pertamaKali: false },
    );
    assert.equal(kirimResend.length, 0);
  });

  it("pembayaran bukan kelas (mis. tryout): tidak ada email bukti kelas", async () => {
    db.payments[0].item_type = "tryout";
    await postWebhook();
    assert.equal(kirimResend.length, 0);
  });

  it("status payment, enrollment, dan promo tetap sama seperti tanpa email (tidak ada perubahan logika)", async () => {
    const res = await postWebhook();
    assert.deepEqual(await res.json(), { success: true, outcome: "lunas_diproses" });
    assert.equal(db.payments[0].status, "berhasil");
    assert.equal(db.enrollments.length, 1);
    assert.equal(db.enrollments[0].status_pembayaran, "lunas");
    assert.equal(db.kode_promo[0].jumlah_terpakai, 1);
    assert.equal(db.sesi_kelas.length, 3);
    assert.ok(db.notifikasi.some((n) => n.judul === "Pembayaran berhasil!"));
  });

  it("pendaftaran manual Admin tidak memicu email bukti pembayaran (tidak ada pembayaran)", () => {
    const route = readFileSync("app/api/admin/enrollment-manual/route.ts", "utf8");
    // hanya baris import yang dicek (komentar di route itu menyebut fulfillPayment sebagai penjelasan)
    assert.ok(!/^import .*(pembayaranBerhasil|kirimEmailPembayaranBerhasil|fulfillPayment)/m.test(route));
    assert.ok(!/jalankanPascaLunas|tandaiLunasDanProses|kabariSiswaPembayaranBerhasil/.test(route));
  });
});

describe("email bukti pembayaran: pengaman", () => {
  it("tanpa RESEND_API_KEY: tidak ada permintaan ke Resend, satu peringatan, pembayaran tetap lunas", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await postWebhook();
    assert.equal(res.status, 200);
    assert.equal(kirimResend.length, 0);
    assert.equal(db.payments[0].status, "berhasil");
    assert.equal(db.enrollments.length, 1);
    assert.equal(logTertangkap.filter((l) => l.includes("RESEND_API_KEY belum diset")).length, 1);
  });

  it("Resend menolak: webhook tetap 200, pembayaran & enrollment utuh, log tanpa email/kunci", async () => {
    perilakuResend = "ditolak";
    const res = await postWebhook();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true, outcome: "lunas_diproses" });
    assert.equal(kirimResend.length, 1);
    assert.equal(db.payments[0].status, "berhasil");
    assert.equal(db.enrollments.length, 1);
    // Baris log milik kita ([email] ...): alamat disamarkan, tanpa kunci. (SDK Resend mencatat
    // galat API-nya sendiri dengan awalan "[Resend API Error]" — itu di luar kendali kode kita.)
    const logKita = logTertangkap.filter((l) => l.startsWith("[email]")).join("\n");
    assert.match(logKita, /bukti_bayar ditolak Resend untuk s\*\*\*@example\.com/);
    assert.ok(!logKita.includes("siswa@example.com") && !logKita.includes("re_kunci_tiruan_untuk_tes"));
  });

  it("koneksi ke Resend putus: webhook tetap 200 dan jalankanPascaLunas tidak melempar galat; log tanpa data pribadi", async () => {
    perilakuResend = "putus";
    const res = await postWebhook();
    assert.equal(res.status, 200);
    assert.equal(db.payments[0].status, "berhasil");
    // SDK Resend mengubah galat jaringan jadi hasil error (tidak melempar), jadi labelnya "ditolak";
    // cabang "gagal terhubung" tetap ada untuk jaga-jaga bila SDK melempar.
    const logKita = logTertangkap.filter((l) => l.startsWith("[email]")).join("\n");
    assert.match(logKita, /bukti_bayar (gagal terhubung|ditolak Resend) untuk s\*\*\*@example\.com/);
    assert.ok(!logKita.includes("siswa@example.com") && !logKita.includes("re_kunci_tiruan_untuk_tes"));

    // dipanggil langsung: tidak melempar
    resetPenjagaBuktiBayarUntukTes();
    const { kabariSiswaPembayaranBerhasil } = await import("@/lib/notifikasi/pembayaranBerhasil");
    await assert.doesNotReject(() => kabariSiswaPembayaranBerhasil("p-lunas"));
  });

  it("galat saat membaca database: tidak melempar, tidak mengirim email", async () => {
    const { kabariSiswaPembayaranBerhasil } = await import("@/lib/notifikasi/pembayaranBerhasil");
    await assert.doesNotReject(() =>
      kabariSiswaPembayaranBerhasil("p-lunas", {
        muatData: async () => {
          throw new Error("db putus");
        },
      }),
    );
    assert.equal(kirimResend.length, 0);
  });

  it("users.notif_email = false: tidak dikirim; kosong/true: dikirim", async () => {
    (db.users[0] as Row).notif_email = false;
    await postWebhook();
    assert.equal(kirimResend.length, 0);
    assert.equal(db.payments[0].status, "berhasil");

    // kasus true
    db.payments[0].status = "menunggu";
    (db.users[0] as Row).notif_email = true;
    resetPenjagaBuktiBayarUntukTes();
    await postWebhook();
    assert.equal(kirimResend.length, 1);
  });

  it("siswa tanpa alamat email: dilewati dengan peringatan, tidak ada permintaan ke Resend", async () => {
    (db.users[0] as Row).email = null;
    const res = await postWebhook();
    assert.equal(res.status, 200);
    assert.equal(kirimResend.length, 0);
    assert.ok(logTertangkap.some((l) => l.includes("siswa tanpa alamat email")));
  });

  it("tanpa kode promo, mentor, dan jadwal: barisnya tidak tampil", async () => {
    db.payments[0].kode_promo_id = null;
    (db.kelas[0] as Row).mentor_id = null;
    (db.kelas[0] as Row).jadwal = null;
    await postWebhook();
    assert.equal(kirimResend.length, 1);
    const html = String(kirimResend[0].body.html);
    for (const label of ["Kode promo", "Mentor", "Jadwal"]) assert.ok(!html.includes(`>${label}<`), label);
    assert.ok(html.includes("Jumlah dibayar") && html.includes("Nomor pesanan") && html.includes("Tanggal pembayaran"));
  });
});

describe("email bukti pembayaran: template", () => {
  it("subjek 'Pembayaran berhasil: <nama kelas>' satu baris; tombol 'Buka Kelas Saya' absolut", () => {
    assert.equal(buatSubjekPembayaranBerhasil("Kelas A"), "Pembayaran berhasil: Kelas A");
    assert.ok(!/[\r\n]/.test(buatSubjekPembayaranBerhasil("Kelas\r\nBcc: x@y.com")));
    const contoh = CONTOH_EVENT_EMAIL.find((e) => e.kunci === "pembayaran-berhasil")!.buat();
    assert.ok(contoh.html.includes('class="btn-a" href="https://dimentoring.id/kelas/'));
    assert.ok(contoh.html.includes(">Buka Kelas Saya<"));
    for (const nilai of ["Kelas", "Mentor", "Jadwal", "Jumlah dibayar", "Kode promo", "Tanggal pembayaran", "Nomor pesanan"]) {
      assert.ok(contoh.html.includes(nilai) && contoh.teks.includes(nilai), nilai);
    }
  });

  it("nilai berisi karakter HTML ter-escape", () => {
    const hasil = buatEmailPembayaranBerhasil({
      namaSiswa: "<b>x</b>",
      kelasNama: '"k" & <i>',
      namaMentor: "<m>",
      jadwalDisplay: null,
      jumlahDibayar: "Rp1",
      kodePromo: "<p>",
      tanggalPembayaran: "t",
      nomorPesanan: "<o>",
      tautan: "https://dimentoring.id/kelas/k",
    });
    for (const tag of ["<b>", "<i>", "<m>", "<p>", "<o>"]) assert.ok(!hasil.html.includes(tag), tag);
  });

  it("format tanggal: waktu Jakarta + WIB; nilai tidak valid jatuh ke waktu sekarang", () => {
    const teks = formatTanggalBayar("2026-11-13T18:44:00.000Z");
    assert.match(teks, /14 November 2026/);
    assert.match(teks, /01[.:]44 WIB$/);
    assert.match(formatTanggalBayar("bukan tanggal", new Date("2026-01-02T03:04:00.000Z")), /2 Januari 2026.*10[.:]04 WIB$/);
  });
});
