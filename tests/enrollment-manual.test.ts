/**
 * Test pendaftaran siswa & penugasan mentor offline MANUAL oleh Admin (PRD
 * 7.5.10, BR-36) — app/api/admin/enrollment-manual/** dijalankan terhadap
 * Supabase TIRUAN di memori (tidak pernah menyentuh database asli). Fungsi DB
 * daftar_siswa_manual & ubah_mentor_offline_manual ditiru di `fakeRpc`
 * mengikuti db/add_enrollment_manual.sql (satu panggilan = satu transaksi).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

let db: Db;
let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${++idCounter}`;

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: null; count: number }> {
  private mutation: Row | null = null;
  private head = false;

  constructor(private rows: Row[]) {}

  select(_columns?: string, options?: { head?: boolean }) {
    if (options?.head) this.head = true;
    return this;
  }
  update(values: Row) {
    this.mutation = values;
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
  gt(column: string, value: string) {
    this.rows = this.rows.filter((row) => typeof row[column] === "string" && Date.parse(row[column] as string) > Date.parse(value));
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.rows = this.rows.slice(0, n);
    return this;
  }
  maybeSingle() {
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  then<A, B>(
    onfulfilled?: ((value: { data: Row[] | null; error: null; count: number }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    if (this.mutation) for (const row of this.rows) Object.assign(row, this.mutation);
    const data = this.head ? null : this.rows;
    return Promise.resolve({ data, error: null, count: this.rows.length }).then(onfulfilled, onrejected);
  }
}

const userOf = (id: unknown) => db.users.find((u) => u.id === id) ?? null;
const subtesOf = (id: unknown) => db.subtes.find((s) => s.id === id) ?? null;

/** Embed yang dipakai kode yang diuji; tabel lain memakai baris asli. */
function fakeFrom(table: string) {
  db[table] ??= [];
  const rows = db[table];
  let view: Row[] = rows;
  if (table === "enrollments") {
    view = rows.map((row) => ({ ...row, kelas: db.kelas.find((k) => k.id === row.kelas_id) ?? null }));
  } else if (table === "kelas_subtes" || table === "kelas") {
    view = rows.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) }));
  } else if (table === "kelas_subtes_mentor" || table === "kelas_mentor") {
    view = rows.map((row) => ({ ...row, users: userOf(row.mentor_id) }));
  } else if (table === "mentor_profiles") {
    view = rows.map((row) => ({
      ...row,
      users: userOf(row.user_id),
      mentor_subtes_diampu: db.mentor_subtes_diampu
        .filter((d) => d.mentor_profile_id === row.id)
        .map((d) => ({ ...d, subtes: subtesOf(d.subtes_id) })),
    }));
  }
  const query = new FakeQuery(view);
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      rows.push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

/** CHECK (length(btrim(alasan)) >= 10) Postgres — length() menghitung code point. */
function cekAlasanPostgres(alasan: unknown) {
  if (typeof alasan !== "string" || [...alasan.trim()].length < 10) {
    throw new Error("new row for relation \"enrollment_manual_log\" violates check constraint");
  }
}

/** Tiruan fungsi DB — logika sama dengan db/add_enrollment_manual.sql. */
function fakeRpc(name: string, p: Row) {
  rpcCalls.push(name);
  try {
    return fakeRpcInner(name, p);
  } catch (error) {
    return Promise.resolve({ data: null, error: { message: (error as Error).message, code: "23514" } });
  }
}

function fakeRpcInner(name: string, p: Row) {
  if (name === "daftar_siswa_manual") {
    if (p.p_mentor_offline_id && p.p_mentor_offline_id === p.p_siswa_id) {
      return Promise.resolve({ data: { status: "mentor_sama_dengan_siswa" }, error: null });
    }
    if (p.p_request_id) {
      const log = db.enrollment_manual_log.find((l) => l.request_id === p.p_request_id);
      if (log && (log.siswa_id !== p.p_siswa_id || log.kelas_id !== p.p_kelas_id)) {
        return Promise.resolve({ data: { status: "request_id_bentrok" }, error: null });
      }
      if (log) return Promise.resolve({ data: { status: "sudah_diproses", enrollment_id: log.enrollment_id }, error: null });
    }
    const kelas = db.kelas.find((k) => k.id === p.p_kelas_id);
    if (!kelas) return Promise.resolve({ data: { status: "kelas_tidak_ada" }, error: null });
    cekAlasanPostgres(p.p_alasan);
    if (db.enrollments.some((e) => e.user_id === p.p_siswa_id && e.kelas_id === p.p_kelas_id)) {
      return Promise.resolve({ data: { status: "duplikat" }, error: null });
    }
    const batas = Date.now() - (p.p_payment_kedaluwarsa_jam as number) * 60 * 60 * 1000;
    const menunggu = db.payments.some(
      (x) =>
        x.user_id === p.p_siswa_id &&
        x.item_type === "kelas" &&
        x.item_id === p.p_kelas_id &&
        x.status === "menunggu" &&
        Date.parse(x.dibuat_pada as string) > batas,
    );
    if (menunggu) return Promise.resolve({ data: { status: "payment_menunggu" }, error: null });
    const terisi = db.enrollments.filter((e) => e.kelas_id === p.p_kelas_id && e.status_pembayaran === "lunas").length;
    if (terisi >= (kelas.kapasitas as number)) {
      return Promise.resolve({ data: { status: "penuh" }, error: null });
    }
    const enrollment = {
      id: newId("enr"),
      user_id: p.p_siswa_id,
      kelas_id: p.p_kelas_id,
      status_pembayaran: "lunas",
      sumber: "manual",
      nominal_dibayar: p.p_nominal,
      dibuat_oleh: p.p_admin_id,
      mentor_offline_id: p.p_mentor_offline_id,
      lokasi_siswa_lat: p.p_lokasi_lat,
      lokasi_siswa_lng: p.p_lokasi_lng,
    };
    db.enrollments.push(enrollment);
    for (const s of (p.p_subtes_ids as string[]) ?? []) db.enrollment_subtes.push({ enrollment_id: enrollment.id, subtes_id: s });
    for (let n = 1; n <= (kelas.jumlah_sesi as number); n++) {
      db.sesi_kelas.push({ id: newId("sesi"), enrollment_id: enrollment.id, nomor_sesi: n, dikonfirmasi_mentor: false });
    }
    db.enrollment_manual_log.push({
      id: newId("log"),
      admin_id: p.p_admin_id,
      aksi: "daftar_siswa",
      enrollment_id: enrollment.id,
      kelas_id: p.p_kelas_id,
      siswa_id: p.p_siswa_id,
      metode_pembayaran: p.p_metode,
      nominal: p.p_nominal,
      alasan: p.p_alasan,
      request_id: p.p_request_id,
    });
    return Promise.resolve({
      data: { status: "dibuat", enrollment_id: enrollment.id, jumlah_sesi: kelas.jumlah_sesi },
      error: null,
    });
  }
  if (name === "ubah_mentor_offline_manual") {
    const e = db.enrollments.find((r) => r.id === p.p_enrollment_id);
    if (!e) return Promise.resolve({ data: { status: "tidak_ditemukan" }, error: null });
    if (p.p_mentor_baru === e.user_id) return Promise.resolve({ data: { status: "mentor_sama_dengan_siswa" }, error: null });
    cekAlasanPostgres(p.p_alasan);
    if (e.mentor_offline_id === p.p_mentor_baru) return Promise.resolve({ data: { status: "sama" }, error: null });
    const lama = e.mentor_offline_id;
    e.mentor_offline_id = p.p_mentor_baru;
    db.enrollment_manual_log.push({
      id: newId("log"),
      admin_id: p.p_admin_id,
      aksi: "tugaskan_mentor",
      enrollment_id: e.id,
      kelas_id: e.kelas_id,
      siswa_id: e.user_id,
      alasan: p.p_alasan,
      snapshot: { mentor_offline_id_lama: lama, mentor_offline_id_baru: p.p_mentor_baru },
    });
    return Promise.resolve({ data: { status: "diubah", mentor_lama: lama }, error: null });
  }
  throw new Error(`rpc tiruan tidak dikenal: ${name}`);
}

let rpcCalls: string[] = [];

const ADMIN = "admin-1";
const SISWA = "siswa-1";
const SISWA_2 = "siswa-2";
const MENTOR_ON = "mentor-online";
const MENTOR_OFF = "mentor-offline";
const MENTOR_OFF_2 = "mentor-offline-2";
const MENTOR_PENDING = "mentor-pending";
/** Satu akun dengan role Student DAN Mentor aktif (bisa_offline, mengampu mapel). */
const MULTI = "multi-role";
const ALASAN = "Sudah transfer ke BCA tanggal 12 Oktober";
const REQ_1 = "11111111-1111-4111-8111-111111111111";
const REQ_2 = "22222222-2222-4222-8222-222222222222";

type RouteModule = typeof import("@/app/api/admin/enrollment-manual/route");
type MentorRouteModule = typeof import("@/app/api/admin/enrollment-manual/mentor-offline/route");
type SessionModule = typeof import("@/lib/auth/session");
type AksesModule = typeof import("@/lib/mentor/aksesMentor");
let route: RouteModule;
let mentorRoute: MentorRouteModule;
let sessionLib: SessionModule;
let aksesMentor: AksesModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  delete process.env.RESEND_API_KEY; // email mentor tidak pernah benar-benar dikirim
  const { supabaseServer } = await import("@/lib/supabase/server");
  Object.assign(supabaseServer as unknown as Record<string, unknown>, { from: fakeFrom, rpc: fakeRpc });
  route = await import("@/app/api/admin/enrollment-manual/route");
  mentorRoute = await import("@/app/api/admin/enrollment-manual/mentor-offline/route");
  sessionLib = await import("@/lib/auth/session");
  aksesMentor = await import("@/lib/mentor/aksesMentor");
});

beforeEach(() => {
  idCounter = 0;
  rpcCalls = [];
  db = {
    users: [
      { id: ADMIN, nama: "Admin", email: "admin@x.id" },
      { id: SISWA, nama: "Siswa Satu", email: "s1@x.id" },
      { id: SISWA_2, nama: "Siswa Dua", email: "s2@x.id" },
      { id: MENTOR_ON, nama: "Mentor Online", email: "mon@x.id" },
      { id: MENTOR_OFF, nama: "Mentor Offline", email: "moff@x.id" },
      { id: MENTOR_OFF_2, nama: "Mentor Offline Dua", email: "moff2@x.id" },
      { id: MENTOR_PENDING, nama: "Mentor Pending", email: "mp@x.id" },
      { id: MULTI, nama: "Siswa Sekaligus Mentor", email: "multi@x.id" },
    ],
    user_roles: [
      { user_id: ADMIN, role_type: "admin", status: "active" },
      { user_id: SISWA, role_type: "student", status: "active" },
      { user_id: SISWA_2, role_type: "student", status: "active" },
      { user_id: MENTOR_ON, role_type: "mentor", status: "active" },
      { user_id: MENTOR_OFF, role_type: "mentor", status: "active" },
      { user_id: MENTOR_OFF_2, role_type: "mentor", status: "active" },
      { user_id: MENTOR_PENDING, role_type: "mentor", status: "pending" },
      { user_id: MULTI, role_type: "student", status: "active" },
      { user_id: MULTI, role_type: "mentor", status: "active" },
    ],
    subtes: [
      { id: "s-mtk", nama: "Penalaran Matematika", mapel_dasar: "matematika" },
      { id: "s-ing", nama: "Literasi B. Inggris", mapel_dasar: "inggris" },
    ],
    kelas: [
      { id: "K-ON", nama: "SNBT Online", kapasitas: 5, jumlah_sesi: 10, mode_pembelajaran: "online", jadwal: null, mentor_id: MENTOR_ON, subtes_id: "s-mtk" },
      { id: "K-PAKET", nama: "Paket SNBT", kapasitas: 5, jumlah_sesi: 10, mode_pembelajaran: "online", jadwal: null, mentor_id: MENTOR_ON, subtes_id: "s-mtk" },
      { id: "K-OFF", nama: "Privat Offline", kapasitas: 5, jumlah_sesi: 8, mode_pembelajaran: "offline", jadwal: null, mentor_id: null, subtes_id: "s-mtk" },
      { id: "K-PENUH", nama: "Kelas Penuh", kapasitas: 1, jumlah_sesi: 10, mode_pembelajaran: "online", jadwal: null, mentor_id: MENTOR_ON, subtes_id: null },
    ],
    kelas_subtes: [
      { kelas_id: "K-ON", subtes_id: "s-mtk" },
      { kelas_id: "K-PAKET", subtes_id: "s-mtk" },
      { kelas_id: "K-PAKET", subtes_id: "s-ing" },
      { kelas_id: "K-OFF", subtes_id: "s-mtk" },
    ],
    kelas_mentor: [{ kelas_id: "K-ON", mentor_id: MENTOR_ON }],
    kelas_subtes_mentor: [{ kelas_id: "K-ON", subtes_id: "s-mtk", mentor_id: MENTOR_ON }],
    mentor_profiles: [
      { id: "mp-off", user_id: MENTOR_OFF, asal_ptn: "UGM", bisa_offline: true, lokasi_lat: null, lokasi_lng: null },
      { id: "mp-off2", user_id: MENTOR_OFF_2, asal_ptn: "UI", bisa_offline: true, lokasi_lat: -6.2, lokasi_lng: 106.8 },
      { id: "mp-on", user_id: MENTOR_ON, asal_ptn: "ITB", bisa_offline: false, lokasi_lat: null, lokasi_lng: null },
      { id: "mp-pending", user_id: MENTOR_PENDING, asal_ptn: "UNY", bisa_offline: true, lokasi_lat: null, lokasi_lng: null },
      { id: "mp-multi", user_id: MULTI, asal_ptn: "UNS", bisa_offline: true, lokasi_lat: null, lokasi_lng: null },
    ],
    mentor_subtes_diampu: [
      { mentor_profile_id: "mp-off", subtes_id: "s-mtk" },
      { mentor_profile_id: "mp-off2", subtes_id: "s-mtk" },
      { mentor_profile_id: "mp-on", subtes_id: "s-mtk" },
      { mentor_profile_id: "mp-pending", subtes_id: "s-mtk" },
      { mentor_profile_id: "mp-multi", subtes_id: "s-mtk" },
    ],
    enrollments: [{ id: "enr-lama", user_id: SISWA_2, kelas_id: "K-PENUH", status_pembayaran: "lunas", sumber: "checkout" }],
    enrollment_subtes: [],
    sesi_kelas: [],
    enrollment_manual_log: [],
    notifikasi: [],
    payments: [],
    payment_subtes_pilihan: [],
    kode_promo: [{ id: "promo-1", jumlah_terpakai: 0 }],
    referrals: [],
    referral_rewards: [],
    gamifikasi_profiles: [{ user_id: SISWA, total_poin: 0 }],
  };
});

function request(method: "POST" | "PATCH", url: string, body: unknown, userId = ADMIN, role: "admin" | "student" | "mentor" = "admin") {
  const token = sessionLib.createSessionToken({ userId, role });
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify(body),
  });
}

async function daftar(body: Record<string, unknown>, userId = ADMIN, role: "admin" | "student" | "mentor" = "admin") {
  const res = await route.POST(request("POST", "http://localhost/api/admin/enrollment-manual", body, userId, role));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function ubahMentor(body: Record<string, unknown>, userId = ADMIN) {
  const res = await mentorRoute.PATCH(
    request("PATCH", "http://localhost/api/admin/enrollment-manual/mentor-offline", body, userId),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const dasar = { siswaId: SISWA, kelasId: "K-ON", metodePembayaran: "transfer", alasan: ALASAN };

describe("POST /api/admin/enrollment-manual", () => {
  it("bukan admin → 403, tanpa menulis apa pun", async () => {
    const r1 = await daftar(dasar, SISWA, "student");
    assert.equal(r1.status, 403);
    const r2 = await daftar(dasar, MENTOR_ON, "mentor");
    assert.equal(r2.status, 403);
    // Cookie admin tapi role admin di DB sudah tidak aktif.
    db.user_roles.find((r) => r.user_id === ADMIN)!.status = "pending";
    const r3 = await daftar(dasar);
    assert.equal(r3.status, 403);
    assert.equal(rpcCalls.length, 0);
    assert.equal(db.enrollments.length, 1);
  });

  it("sukses: enrollment lunas sumber manual + 10 sesi + log + notifikasi", async () => {
    const r = await daftar({ ...dasar, nominalDibayar: "350000", requestId: REQ_1 });
    assert.equal(r.status, 201);
    const e = db.enrollments.find((x) => x.user_id === SISWA && x.kelas_id === "K-ON")!;
    assert.equal(e.status_pembayaran, "lunas");
    assert.equal(e.sumber, "manual");
    assert.equal(e.dibuat_oleh, ADMIN);
    assert.equal(e.nominal_dibayar, 350000);
    assert.equal(db.sesi_kelas.filter((s) => s.enrollment_id === e.id).length, 10);
    assert.deepEqual(
      db.enrollment_subtes.filter((s) => s.enrollment_id === e.id).map((s) => s.subtes_id),
      ["s-mtk"],
    );
    assert.equal(db.enrollment_manual_log.length, 1);
    const log = db.enrollment_manual_log[0];
    assert.equal(log.aksi, "daftar_siswa");
    assert.equal(log.admin_id, ADMIN);
    assert.equal(log.metode_pembayaran, "transfer");
    assert.equal(log.alasan, ALASAN);
    const notifSiswa = db.notifikasi.filter((n) => n.user_id === SISWA);
    assert.equal(notifSiswa.length, 1);
    assert.match(notifSiswa[0].pesan as string, /Kamu telah didaftarkan ke kelas SNBT Online oleh Admin/);
    assert.equal(db.notifikasi.filter((n) => n.user_id === MENTOR_ON).length, 1);
  });

  it("tidak membuat baris payments, poin, referral, atau pemakaian promo", async () => {
    const r = await daftar({ ...dasar, metodePembayaran: "beasiswa" });
    assert.equal(r.status, 201);
    assert.equal(db.payments.length, 0);
    assert.equal(db.payment_subtes_pilihan.length, 0);
    assert.equal(db.referrals.length, 0);
    assert.equal(db.referral_rewards.length, 0);
    assert.equal(db.gamifikasi_profiles[0].total_poin, 0);
    assert.equal(db.kode_promo[0].jumlah_terpakai, 0);
  });

  it("duplikat → 409", async () => {
    assert.equal((await daftar(dasar)).status, 201);
    const r = await daftar(dasar);
    assert.equal(r.status, 409);
    assert.equal(db.enrollments.filter((e) => e.user_id === SISWA && e.kelas_id === "K-ON").length, 1);
  });

  it("kelas penuh → 409 tanpa override", async () => {
    const r = await daftar({ ...dasar, kelasId: "K-PENUH" });
    assert.equal(r.status, 409);
    assert.match(r.json.error as string, /penuh/);
    assert.equal(db.enrollments.filter((e) => e.kelas_id === "K-PENUH").length, 1);
    assert.equal(db.enrollment_manual_log.length, 0);
  });

  it("alasan kosong / pendek → 400", async () => {
    assert.equal((await daftar({ ...dasar, alasan: "" })).status, 400);
    assert.equal((await daftar({ ...dasar, alasan: "   singkat   " })).status, 400);
    assert.equal((await daftar({ ...dasar, alasan: undefined })).status, 400);
    assert.equal(rpcCalls.length, 0);
  });

  it("metode pembayaran tidak valid / nominal tidak valid → 400", async () => {
    assert.equal((await daftar({ ...dasar, metodePembayaran: "gratis" })).status, 400);
    assert.equal((await daftar({ ...dasar, nominalDibayar: -5 })).status, 400);
    assert.equal(rpcCalls.length, 0);
  });

  it("siswa tidak aktif / bukan siswa → 400", async () => {
    assert.equal((await daftar({ ...dasar, siswaId: MENTOR_ON })).status, 400);
    assert.equal(rpcCalls.length, 0);
  });

  it("kelas paket: wajib 1–3 subtes dari pool", async () => {
    assert.equal((await daftar({ ...dasar, kelasId: "K-PAKET" })).status, 400);
    assert.equal((await daftar({ ...dasar, kelasId: "K-PAKET", subtesIds: ["s-asing"] })).status, 400);
    const r = await daftar({ ...dasar, kelasId: "K-PAKET", subtesIds: ["s-ing"] });
    assert.equal(r.status, 201);
    assert.deepEqual(db.enrollment_subtes.map((s) => s.subtes_id), ["s-ing"]);
  });

  it("kelas offline tanpa mentor valid → 400", async () => {
    const off = { ...dasar, kelasId: "K-OFF" };
    assert.equal((await daftar(off)).status, 400); // tanpa mentor
    assert.equal((await daftar({ ...off, mentorOfflineId: MENTOR_ON })).status, 400); // tidak bisa_offline
    assert.equal((await daftar({ ...off, mentorOfflineId: MENTOR_PENDING })).status, 400); // belum active
    assert.equal((await daftar({ ...off, mentorOfflineId: MENTOR_OFF, lokasiSiswaLat: 200, lokasiSiswaLng: 1 })).status, 400);
    assert.equal(rpcCalls.length, 0);
  });

  it("kelas offline dengan mentor valid → mentor langsung dapat akses offline (aksesMentor)", async () => {
    const r = await daftar({ ...dasar, kelasId: "K-OFF", mentorOfflineId: MENTOR_OFF });
    assert.equal(r.status, 201);
    const e = db.enrollments.find((x) => x.kelas_id === "K-OFF")!;
    assert.equal(e.mentor_offline_id, MENTOR_OFF);
    assert.equal(db.sesi_kelas.filter((s) => s.enrollment_id === e.id).length, 8);
    const akses = await aksesMentor.getAksesMentorEnrollment(MENTOR_OFF, e.id as string);
    assert.ok(akses && akses !== "gagal");
    assert.equal(akses.akses, "offline");
    assert.equal(db.notifikasi.filter((n) => n.user_id === MENTOR_OFF).length, 1);
  });

  it("klik dobel (requestId sama, bersamaan) → cuma satu enrollment, keduanya sukses", async () => {
    const body = { ...dasar, requestId: REQ_1 };
    const [a, b] = await Promise.all([daftar(body), daftar(body)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
    assert.equal(db.enrollments.filter((e) => e.user_id === SISWA && e.kelas_id === "K-ON").length, 1);
    assert.equal(db.enrollment_manual_log.length, 1);
    assert.equal(db.notifikasi.filter((n) => n.user_id === SISWA).length, 1);
    // Kirim ulang setelahnya juga tidak membuat apa pun.
    const c = await daftar(body);
    assert.equal(c.status, 200);
    assert.equal(db.enrollments.filter((e) => e.user_id === SISWA).length, 1);
  });

  it("dua siswa bersamaan ke kursi terakhir → cuma satu yang masuk", async () => {
    db.kelas.push({ id: "K-SISA1", nama: "Sisa Satu", kapasitas: 2, jumlah_sesi: 10, mode_pembelajaran: "online", jadwal: null, mentor_id: null, subtes_id: null });
    db.enrollments.push({ id: "enr-k1", user_id: "lain", kelas_id: "K-SISA1", status_pembayaran: "lunas", sumber: "checkout" });
    const [a, b] = await Promise.all([
      daftar({ ...dasar, kelasId: "K-SISA1" }),
      daftar({ ...dasar, siswaId: SISWA_2, kelasId: "K-SISA1" }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal(db.enrollments.filter((e) => e.kelas_id === "K-SISA1" && e.status_pembayaran === "lunas").length, 2);
  });

  it("klik dobel tanpa requestId → yang kedua 409, tetap satu enrollment", async () => {
    const [a, b] = await Promise.all([daftar(dasar), daftar(dasar)]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal(db.enrollments.filter((e) => e.user_id === SISWA && e.kelas_id === "K-ON").length, 1);
    assert.equal(db.sesi_kelas.length, 10);
  });
});

describe("error yang jelas", () => {
  it("request_id sama untuk kelas lain → 409 (bukan 500), tanpa pendaftaran kedua", async () => {
    assert.equal((await daftar({ ...dasar, requestId: REQ_1 })).status, 201);
    const r = await daftar({ ...dasar, kelasId: "K-PAKET", subtesIds: ["s-ing"], requestId: REQ_1 });
    assert.equal(r.status, 409);
    assert.match(r.json.error as string, /Formulir ini sudah dipakai/);
    assert.equal(db.enrollments.filter((e) => e.kelas_id === "K-PAKET").length, 0);
  });

  it("request_id sama untuk siswa lain → 409", async () => {
    assert.equal((await daftar({ ...dasar, requestId: REQ_1 })).status, 201);
    assert.equal((await daftar({ ...dasar, siswaId: SISWA_2, requestId: REQ_1 })).status, 409);
    assert.equal(db.enrollments.filter((e) => e.user_id === SISWA_2 && e.kelas_id === "K-ON").length, 0);
  });

  it("request_id sama, beda kelas, BERSAMAAN → satu 201, satu 409 (dari fungsi DB)", async () => {
    const [a, b] = await Promise.all([
      daftar({ ...dasar, requestId: REQ_2 }),
      daftar({ ...dasar, kelasId: "K-PAKET", subtesIds: ["s-ing"], requestId: REQ_2 }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal(db.enrollment_manual_log.length, 1);
  });

  it("alasan emoji dihitung per karakter, sama dengan CHECK Postgres", async () => {
    // 5 emoji = 10 unit UTF-16 tapi 5 karakter → ditolak API (bukan lolos API lalu 500 di DB).
    const lima = "😀".repeat(5);
    assert.equal(lima.length, 10);
    const r1 = await daftar({ ...dasar, alasan: lima });
    assert.equal(r1.status, 400);
    assert.equal(rpcCalls.length, 0);
    // 10 emoji = 10 karakter → lolos API DAN CHECK Postgres.
    const sepuluh = "😀".repeat(10);
    const r2 = await daftar({ ...dasar, alasan: sepuluh });
    assert.equal(r2.status, 201);
    assert.equal(db.enrollment_manual_log[0].alasan, sepuluh);
  });

  it("panjangKarakter = length() Postgres", async () => {
    const { panjangKarakter, validateAlasan } = await import("@/lib/shared/enrollmentManual");
    assert.equal(panjangKarakter("😀"), 1);
    assert.equal(panjangKarakter("abc"), 3);
    assert.equal(validateAlasan("😀".repeat(9)), "Alasan wajib diisi (min. 10 karakter).");
    assert.equal(validateAlasan("😀".repeat(10)), null);
  });
});

describe("embed PostgREST users <-> enrollments tidak ambigu", () => {
  // enrollments punya 3 FK ke users (user_id, mentor_offline_id, dibuat_oleh):
  // embed tanpa nama constraint / kolom gagal dengan PGRST201.
  function semuaFile(dir: string): string[] {
    return readdirSync(dir).flatMap((nama) => {
      const p = path.join(dir, nama);
      if (statSync(p).isDirectory()) return semuaFile(p);
      return /\.(ts|tsx)$/.test(nama) ? [p] : [];
    });
  }
  const files = ["app", "lib", "components"].flatMap((d) => semuaFile(path.join(process.cwd(), d)));

  it("from(\"users\") tidak meng-embed enrollments(...) tanpa !enrollments_user_id_fkey", () => {
    const pelanggaran: string[] = [];
    for (const f of files) {
      const isi = readFileSync(f, "utf8");
      for (const m of isi.matchAll(/\.from\("users"\)\s*\.select\(\s*(`[^`]*`|"[^"]*")/g)) {
        if (/(^|[\s,(])enrollments(?!!enrollments_user_id_fkey)\s*\(/.test(m[1])) pelanggaran.push(path.relative(process.cwd(), f));
      }
    }
    assert.deepEqual(pelanggaran, []);
  });

  it("from(\"enrollments\") meng-embed users lewat kolom (users:user_id / alias:mentor_offline_id)", () => {
    const pelanggaran: string[] = [];
    for (const f of files) {
      const isi = readFileSync(f, "utf8");
      for (const m of isi.matchAll(/\.from\("enrollments"\)\s*\.select\(\s*(`[^`]*`|"[^"]*")/g)) {
        if (/(^|[\s,(])users\s*\(/.test(m[1])) pelanggaran.push(path.relative(process.cwd(), f));
      }
    }
    assert.deepEqual(pelanggaran, []);
  });
});

describe("privasi snapshot log (db/add_enrollment_manual.sql)", () => {
  const sql = readFileSync(path.join(process.cwd(), "db", "add_enrollment_manual.sql"), "utf8");
  const schema = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");

  for (const [nama, isi] of [
    ["migrasi", sql],
    ["schema.sql", schema],
  ] as const) {
    it(`${nama}: snapshot enrollment membuang lokasi_siswa_lat & lokasi_siswa_lng`, () => {
      const pakai = isi.match(/to_jsonb\(v_enrollment\)[^,\n]*/g) ?? [];
      assert.ok(pakai.length >= 1, "snapshot enrollment tidak ditemukan");
      for (const expr of pakai) {
        assert.match(expr, /- 'lokasi_siswa_lat'/);
        assert.match(expr, /- 'lokasi_siswa_lng'/);
      }
    });
  }

  it("kelas dikunci FOR NO KEY UPDATE sebelum cek duplikat, payment menunggu & kapasitas", () => {
    const fungsi = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION daftar_siswa_manual"),
      sql.indexOf("-- ---- 4. Ubah mentor offline"),
    );
    const kunci = fungsi.indexOf("FROM kelas WHERE id = p_kelas_id FOR NO KEY UPDATE");
    assert.ok(kunci > 0, "kunci FOR NO KEY UPDATE tidak ditemukan");
    const kunciRequest = fungsi.indexOf("pg_advisory_xact_lock");
    assert.ok(kunciRequest > 0 && kunciRequest < kunci, "kunci request_id harus sebelum kunci kelas (urutan tetap, tanpa deadlock)");
    assert.doesNotMatch(fungsi, /FOR UPDATE/);
    for (const cek of ["INTO v_existing FROM enrollments", "FROM payments", "status_pembayaran = 'lunas'", "INSERT INTO enrollments"]) {
      const posisi = fungsi.indexOf(cek);
      assert.ok(posisi > kunci, `${cek} harus sesudah kunci kelas`);
    }
  });

  it("ubah_mentor_offline_manual: snapshot cuma id mentor lama/baru", () => {
    const fungsi = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION ubah_mentor_offline_manual"));
    const snapshot = fungsi.slice(fungsi.indexOf("jsonb_build_object("), fungsi.indexOf("RETURN jsonb_build_object("));
    assert.doesNotMatch(snapshot, /lokasi|to_jsonb/);
  });
});

describe("checkout yang masih menunggu bayar", () => {
  const jamLalu = (jam: number) => new Date(Date.now() - jam * 60 * 60 * 1000).toISOString();
  const payment = (over: Row) => ({
    id: newId("pay"),
    user_id: SISWA,
    item_type: "kelas",
    item_id: "K-ON",
    status: "menunggu",
    dibuat_pada: jamLalu(1),
    ...over,
  });

  it("payment menunggu (link belum kedaluwarsa) untuk kelas yang sama → 409, payments tidak diubah", async () => {
    db.payments.push(payment({}));
    const sebelum = JSON.stringify(db.payments);
    const r = await daftar(dasar);
    assert.equal(r.status, 409);
    assert.match(r.json.error as string, /menunggu/);
    assert.match(r.json.error as string, /kedaluwarsa/);
    assert.equal(rpcCalls.length, 0);
    assert.equal(db.enrollments.filter((e) => e.user_id === SISWA).length, 0);
    assert.equal(JSON.stringify(db.payments), sebelum);
  });

  it("tidak menghalangi: link sudah kedaluwarsa (> 24 jam), status lain, kelas lain, siswa lain", async () => {
    db.payments.push(
      payment({ dibuat_pada: jamLalu(25) }),
      payment({ status: "gagal" }),
      payment({ item_id: "K-PAKET" }),
      payment({ user_id: SISWA_2 }),
    );
    const r = await daftar(dasar);
    assert.equal(r.status, 201);
  });
});

describe("mentor tatap muka tidak boleh siswa itu sendiri", () => {
  async function kandidat(query: string) {
    const token = sessionLib.createSessionToken({ userId: ADMIN, role: "admin" });
    const res = await mentorRoute.GET(
      new NextRequest(`http://localhost/api/admin/enrollment-manual/mentor-offline?${query}`, {
        headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}` },
      }),
    );
    const json = (await res.json()) as { mentor: { mentorId: string }[] };
    return json.mentor.map((m) => m.mentorId);
  }

  it("daftar: mentorOfflineId = siswaId → 400, tanpa memanggil fungsi DB", async () => {
    const r = await daftar({ ...dasar, siswaId: MULTI, kelasId: "K-OFF", mentorOfflineId: MULTI });
    assert.equal(r.status, 400);
    assert.match(r.json.error as string, /tidak boleh akun siswa itu sendiri/);
    assert.equal(rpcCalls.length, 0);
    assert.equal(db.enrollments.filter((e) => e.user_id === MULTI).length, 0);
  });

  it("ubah: mentor baru = siswa enrollment → 400, mentor tidak berubah", async () => {
    const r0 = await daftar({ ...dasar, siswaId: MULTI, kelasId: "K-OFF", mentorOfflineId: MENTOR_OFF });
    assert.equal(r0.status, 201);
    const enrollmentId = r0.json.enrollmentId as string;
    const r = await ubahMentor({ enrollmentId, mentorOfflineId: MULTI, alasan: ALASAN });
    assert.equal(r.status, 400);
    assert.match(r.json.error as string, /tidak boleh akun siswa itu sendiri/);
    assert.equal(db.enrollments.find((e) => e.id === enrollmentId)!.mentor_offline_id, MENTOR_OFF);
    assert.equal(db.enrollment_manual_log.filter((l) => l.aksi === "tugaskan_mentor").length, 0);
  });

  it("daftar kandidat mengecualikan siswa (siswaId & enrollmentId)", async () => {
    assert.ok((await kandidat("kelasId=K-OFF")).includes(MULTI));
    assert.ok(!(await kandidat(`kelasId=K-OFF&siswaId=${MULTI}`)).includes(MULTI));
    const r0 = await daftar({ ...dasar, siswaId: MULTI, kelasId: "K-OFF", mentorOfflineId: MENTOR_OFF });
    const enrollmentId = r0.json.enrollmentId as string;
    assert.ok(!(await kandidat(`kelasId=K-OFF&enrollmentId=${enrollmentId}`)).includes(MULTI));
  });
});

describe("PATCH /api/admin/enrollment-manual/mentor-offline", () => {
  async function siapkanOffline() {
    const r = await daftar({ ...dasar, kelasId: "K-OFF", mentorOfflineId: MENTOR_OFF });
    assert.equal(r.status, 201);
    return r.json.enrollmentId as string;
  }

  it("bukan admin → 403", async () => {
    const enrollmentId = await siapkanOffline();
    const res = await mentorRoute.PATCH(
      request("PATCH", "http://localhost/x", { enrollmentId, mentorOfflineId: MENTOR_OFF_2, alasan: ALASAN }, MENTOR_OFF, "mentor"),
    );
    assert.equal(res.status, 403);
  });

  it("alasan wajib & mentor wajib layak", async () => {
    const enrollmentId = await siapkanOffline();
    assert.equal((await ubahMentor({ enrollmentId, mentorOfflineId: MENTOR_OFF_2, alasan: "pendek" })).status, 400);
    assert.equal((await ubahMentor({ enrollmentId, mentorOfflineId: MENTOR_PENDING, alasan: ALASAN })).status, 400);
    assert.equal((await ubahMentor({ enrollmentId, mentorOfflineId: MENTOR_ON, alasan: ALASAN })).status, 400);
    assert.equal(db.enrollments.find((e) => e.id === enrollmentId)!.mentor_offline_id, MENTOR_OFF);
  });

  it("kelas online → 409 (mentor online diatur di Kelola Kelas)", async () => {
    await daftar(dasar);
    const e = db.enrollments.find((x) => x.kelas_id === "K-ON")!;
    assert.equal((await ubahMentor({ enrollmentId: e.id, mentorOfflineId: MENTOR_OFF_2, alasan: ALASAN })).status, 409);
  });

  it("sukses: mentor baru dapat akses, mentor lama tidak, log + notifikasi", async () => {
    const enrollmentId = await siapkanOffline();
    const r = await ubahMentor({ enrollmentId, mentorOfflineId: MENTOR_OFF_2, alasan: "Mentor lama pindah kota" });
    assert.equal(r.status, 200);
    assert.equal(db.enrollments.find((e) => e.id === enrollmentId)!.mentor_offline_id, MENTOR_OFF_2);

    const baru = await aksesMentor.getAksesMentorEnrollment(MENTOR_OFF_2, enrollmentId);
    assert.ok(baru && baru !== "gagal" && baru.akses === "offline");
    assert.equal(await aksesMentor.getAksesMentorEnrollment(MENTOR_OFF, enrollmentId), null);

    const log = db.enrollment_manual_log.filter((l) => l.aksi === "tugaskan_mentor");
    assert.equal(log.length, 1);
    assert.deepEqual(log[0].snapshot, { mentor_offline_id_lama: MENTOR_OFF, mentor_offline_id_baru: MENTOR_OFF_2 });
    assert.equal(db.notifikasi.filter((n) => n.user_id === MENTOR_OFF_2).length, 1);
  });
});
