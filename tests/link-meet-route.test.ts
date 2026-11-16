/**
 * Test route Link Meet per siswa (kelas private): PUT /api/mentor/enrollment/[id]/link-meet
 * (mentor penerima), PUT /api/kelola-kelas/[kelasId]/pendaftar/[id]/link-meet (Admin), data daftar
 * mentor (getSesiSiswaByKelasId), dan lonceng ke siswa. Supabase TIRUAN di memori.
 *
 * Skenario: kelas "Matematika TKA Intensif" (private, 3 mentor memegang Matematika).
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null };

let db: Db;
let tabelGagal: Set<string>;
let insertGagal: Set<string>;

class FakeQuery implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
  private mutation: Row | null = null;
  private single = false;

  constructor(
    private rows: Row[],
    private gagal: boolean,
  ) {}

  select() {
    return this;
  }
  update(values: Row) {
    this.mutation = values;
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
  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === "string" && Date.parse(row[column] as string) >= Date.parse(value));
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === "string" && Date.parse(row[column] as string) < Date.parse(value));
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    const dir = options?.ascending === false ? -1 : 1;
    this.rows = [...this.rows].sort((a, b) => ((a[column] as number) < (b[column] as number) ? -dir : dir));
    return this;
  }
  limit(n: number) {
    this.rows = this.rows.slice(0, n);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<A, B>(onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    if (this.gagal) return Promise.resolve({ data: null, error: { message: "galat tiruan" } } as Hasil).then(onfulfilled, onrejected);
    const cocok = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.mutation) for (const row of cocok) Object.assign(row, this.mutation);
    return Promise.resolve({ data: this.single ? (cocok[0] ?? null) : cocok, error: null } as Hasil).then(onfulfilled, onrejected);
  }
}

function fakeFrom(table: string) {
  db[table] ??= [];
  let rows = db[table];
  if (table === "enrollments") {
    // Embed kelas:kelas_id(...subtes) dan users:user_id(...) — salinan, tapi update menulis ke baris ASLI.
    const asli = rows;
    const tampilan = rows.map((row) => {
      const kelas = db.kelas.find((k) => k.id === row.kelas_id) ?? null;
      return { ...row, kelas: kelas ? { ...kelas, subtes: db.subtes.find((s) => s.id === kelas.subtes_id) ?? null } : null, users: db.users.find((u) => u.id === row.user_id) ?? null };
    });
    const query = new FakeQuery(tampilan, tabelGagal.has(table));
    // Mutasi harus mengenai baris asli: bungkus update.
    const updateAsli = query.update.bind(query);
    query.update = (values: Row) => {
      const q = new FakeQuery(asli, tabelGagal.has(table));
      void updateAsli;
      return q.update(values);
    };
    return query;
  }
  if (table === "kelas_subtes_mentor") {
    rows = rows.map((row) => ({ ...row, subtes: db.subtes.find((s) => s.id === row.subtes_id) ?? null }));
  }
  const query = new FakeQuery(rows, tabelGagal.has(table));
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      if (insertGagal.has(table)) return Promise.resolve({ data: null, error: { message: "insert gagal tiruan" } });
      db[table].push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const E_PENDING = "mentor-e";
const ASING = "mentor-asing";
const KELAS_SAJA = "mentor-kelas-saja"; // ada di kelas_mentor, tanpa pasangan subtes — lolos penjaga presensi lama
const GRUP_MENTOR = "mentor-grup";
const BARU = "2026-11-16T10:00:00+07:00";
const LAMA = "2026-11-10T10:00:00+07:00";
const LINK_A = "https://meet.google.com/aaa-aaaa-aaa";

type MentorRoute = typeof import("@/app/api/mentor/enrollment/[enrollmentId]/link-meet/route");
type AdminRoute = typeof import("@/app/api/kelola-kelas/[kelasId]/pendaftar/[enrollmentId]/link-meet/route");
type SessionModule = typeof import("@/lib/auth/session");
type KelasSayaModule = typeof import("@/lib/mentor/getKelasSayaData");
type LinkModule = typeof import("@/lib/shared/linkMeet");
let mentorRoute: MentorRoute;
let adminRoute: AdminRoute;
let sessionLib: SessionModule;
let kelasSaya: KelasSayaModule;
let linkLib: LinkModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  mentorRoute = await import("@/app/api/mentor/enrollment/[enrollmentId]/link-meet/route");
  adminRoute = await import("@/app/api/kelola-kelas/[kelasId]/pendaftar/[enrollmentId]/link-meet/route");
  sessionLib = await import("@/lib/auth/session");
  kelasSaya = await import("@/lib/mentor/getKelasSayaData");
  linkLib = await import("@/lib/shared/linkMeet");
});

async function mentorPut(opsi: { userId?: string; role?: "mentor" | "student" | "admin"; enrollmentId: string; body?: unknown; bodyMentah?: string; tanpaSesi?: boolean }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opsi.tanpaSesi) {
    const token = sessionLib.createSessionToken({ userId: opsi.userId ?? A, role: opsi.role ?? "mentor" });
    headers.cookie = `${sessionLib.SESSION_COOKIE_NAME}=${token}`;
  }
  const request = new NextRequest(`http://localhost/api/mentor/enrollment/${opsi.enrollmentId}/link-meet`, {
    method: "PUT",
    headers,
    body: opsi.bodyMentah ?? JSON.stringify(opsi.body ?? { linkMeet: LINK_A }),
  });
  const response = await mentorRoute.PUT(request, { params: Promise.resolve({ enrollmentId: opsi.enrollmentId }) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function adminPut(opsi: { role?: "admin" | "mentor"; kelasId?: string; enrollmentId: string; body?: unknown; tanpaSesi?: boolean }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opsi.tanpaSesi) {
    const token = sessionLib.createSessionToken({ userId: "admin-1", role: opsi.role ?? "admin" });
    headers.cookie = `${sessionLib.SESSION_COOKIE_NAME}=${token}`;
  }
  const kelasId = opsi.kelasId ?? "K-PRIV";
  const request = new NextRequest(`http://localhost/api/kelola-kelas/${kelasId}/pendaftar/${opsi.enrollmentId}/link-meet`, {
    method: "PUT",
    headers,
    body: JSON.stringify(opsi.body ?? { linkMeet: "https://meet.google.com/admin-link" }),
  });
  const response = await adminRoute.PUT(request, { params: Promise.resolve({ kelasId, enrollmentId: opsi.enrollmentId }) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const enr = (id: string) => db.enrollments.find((e) => e.id === id)!;
const diam = async <T,>(fn: () => Promise<T>) => {
  const asli = { e: console.error, w: console.warn };
  console.error = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.error = asli.e;
    console.warn = asli.w;
  }
};

beforeEach(() => {
  tabelGagal = new Set();
  insertGagal = new Set();
  db = {
    subtes: [{ id: "s-mtk", nama: "Matematika TKA" }],
    kelas: [
      { id: "K-PRIV", nama: "Matematika TKA Intensif", mentor_id: null, subtes_id: null, tipe_kelas: "private", jumlah_sesi: 10 },
      { id: "K-GRUP", nama: "Kelas Grup", mentor_id: GRUP_MENTOR, subtes_id: null, tipe_kelas: "grouping", jumlah_sesi: 10 },
    ],
    kelas_mentor: [
      ...[A, B, C, E_PENDING, KELAS_SAJA].map((mentor_id) => ({ kelas_id: "K-PRIV", mentor_id })),
      { kelas_id: "K-GRUP", mentor_id: GRUP_MENTOR },
    ],
    kelas_subtes_mentor: [A, B, C, E_PENDING].map((mentor_id) => ({ kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id })),
    enrollments: [
      { id: "e-baru", user_id: "siswa-1", kelas_id: "K-PRIV", status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: BARU, link_meet: null, link_meet_oleh: null },
      { id: "e-menunggu", user_id: "siswa-2", kelas_id: "K-PRIV", status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: BARU, link_meet: null, link_meet_oleh: null },
      { id: "e-lama", user_id: "siswa-3", kelas_id: "K-PRIV", status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: LAMA, link_meet: null, link_meet_oleh: null },
      { id: "e-belum-lunas", user_id: "siswa-4", kelas_id: "K-PRIV", status_pembayaran: "menunggu", mentor_offline_id: null, tanggal_daftar: BARU, link_meet: null, link_meet_oleh: null },
      { id: "e-grup", user_id: "siswa-5", kelas_id: "K-GRUP", status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: BARU, link_meet: null, link_meet_oleh: null },
    ],
    enrollment_subtes: [
      { id: "es-baru", enrollment_id: "e-baru", subtes_id: "s-mtk", mentor_id: A, diterima_pada: "2026-11-16T11:00:00+07:00" },
      { id: "es-menunggu", enrollment_id: "e-menunggu", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-lama", enrollment_id: "e-lama", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-belum", enrollment_id: "e-belum-lunas", subtes_id: "s-mtk", mentor_id: A, diterima_pada: "2026-11-16T11:00:00+07:00" },
    ],
    user_roles: [A, B, C, ASING, GRUP_MENTOR, KELAS_SAJA].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })).concat([{ user_id: E_PENDING, role_type: "mentor", status: "pending" }]),
    users: [
      { id: A, nama: "Mentor A" },
      { id: B, nama: "Mentor B" },
      { id: "siswa-1", nama: "Siswa Satu", avatar_url: null },
      { id: "siswa-2", nama: "Siswa Dua", avatar_url: null },
      { id: "siswa-3", nama: "Siswa Tiga", avatar_url: null },
      { id: "siswa-4", nama: "Siswa Empat", avatar_url: null },
      { id: "siswa-5", nama: "Siswa Lima", avatar_url: null },
    ],
    sesi_kelas: [],
    notifikasi: [],
  };
});

describe("PUT /api/mentor/enrollment/[id]/link-meet — hanya mentor PENERIMA untuk private", () => {
  it("mentor penerima mengisi link -> 200, tersimpan bersama pengisinya", async () => {
    const res = await mentorPut({ enrollmentId: "e-baru" });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(enr("e-baru").link_meet, LINK_A);
    assert.equal(enr("e-baru").link_meet_oleh, A);
  });

  it("mentor BUKAN penerima (sudah diterima mentor lain) ditolak 403 dan link tidak berubah", async () => {
    const res = await mentorPut({ userId: B, enrollmentId: "e-baru" });
    assert.equal(res.status, 403);
    // Diubah dengan sengaja (fix/guard-presensi-pemilik): pesan penolakan kepemilikan seragam.
    assert.match(String(res.json.error), /bukan bagian dari kelas yang kamu ampu/);
    assert.equal(enr("e-baru").link_meet, null);
  });

  it("siswa belum diterima siapa pun: pemegang manapun ditolak 403", async () => {
    for (const userId of [A, B, C]) {
      const res = await mentorPut({ userId, enrollmentId: "e-menunggu" });
      assert.equal(res.status, 403, userId);
    }
    assert.equal(enr("e-menunggu").link_meet, null);
  });

  it("mentor tingkat kelas yang BUKAN penerima/pemegang subtes ditolak 403 (link yang ia isi tidak akan pernah berlaku)", async () => {
    const res = await mentorPut({ userId: KELAS_SAJA, enrollmentId: "e-baru" });
    assert.equal(res.status, 403);
    // Diubah dengan sengaja: ditolak lebih awal oleh penjaga kepemilikan (bukan pemilik) dengan pesan seragam.
    assert.match(String(res.json.error), /bukan bagian dari kelas yang kamu ampu/);
    assert.equal(enr("e-baru").link_meet, null);
  });

  it("siswa LAMA (sebelum 15 Nov, tanpa klaim): pemegang aktif boleh (200)", async () => {
    assert.equal((await mentorPut({ userId: B, enrollmentId: "e-lama" })).status, 200);
    assert.equal(enr("e-lama").link_meet_oleh, B);
  });

  it("mentor yang tidak terkait kelas / enrollment tidak ada -> 403 dengan pesan sama", async () => {
    const asing = await mentorPut({ userId: ASING, enrollmentId: "e-baru" });
    const tidakAda = await mentorPut({ userId: A, enrollmentId: "tidak-ada" });
    assert.equal(asing.status, 403);
    assert.equal(tidakAda.status, 403);
    assert.equal(asing.json.error, tidakAda.json.error);
    assert.equal(enr("e-baru").link_meet, null);
  });

  it("kelas non-private (grup) -> 422, link siswa tidak dipakai", async () => {
    const res = await mentorPut({ userId: GRUP_MENTOR, enrollmentId: "e-grup" });
    assert.equal(res.status, 422);
    assert.equal(enr("e-grup").link_meet, null);
  });

  it("tanpa sesi 401; peran selain mentor 403; mentor On Review 403", async () => {
    assert.equal((await mentorPut({ enrollmentId: "e-baru", tanpaSesi: true })).status, 401);
    assert.equal((await mentorPut({ enrollmentId: "e-baru", role: "student" })).status, 403);
    assert.equal((await mentorPut({ enrollmentId: "e-baru", role: "admin" })).status, 403);
    assert.equal((await mentorPut({ userId: E_PENDING, enrollmentId: "e-baru" })).status, 403);
    assert.equal(enr("e-baru").link_meet, null);
  });

  it("URL tidak valid ditolak 400 (javascript:, data:, ftp:, kosong, bukan string, terlalu panjang)", async () => {
    const buruk: unknown[] = ["javascript:alert(1)", "data:text/html,x", "ftp://contoh.id/x", "bukan url", "", "   ", 123, null, { a: 1 }, `https://x.id/${"a".repeat(2100)}`];
    for (const linkMeet of buruk) {
      const res = await mentorPut({ enrollmentId: "e-baru", body: { linkMeet } });
      assert.equal(res.status, 400, String(linkMeet).slice(0, 30));
    }
    assert.equal((await mentorPut({ enrollmentId: "e-baru", bodyMentah: "bukan json" })).status, 400);
    assert.equal(enr("e-baru").link_meet, null);
  });

  it("pengisi dan penerima notifikasi hanya dari sesi: mentorId/oleh di body diabaikan", async () => {
    await mentorPut({ userId: A, enrollmentId: "e-baru", body: { linkMeet: LINK_A, mentorId: B, link_meet_oleh: B, userId: B } });
    assert.equal(enr("e-baru").link_meet_oleh, A);
  });

  it("pendaftaran belum lunas -> 404 dan tidak tersimpan", async () => {
    const res = await mentorPut({ userId: A, enrollmentId: "e-belum-lunas" });
    assert.equal(res.status, 404);
    assert.equal(enr("e-belum-lunas").link_meet, null);
  });

  it("data penerimaan gagal dibaca -> 503 (fail-closed) dan link tidak tersimpan", async () => {
    tabelGagal = new Set(["kelas_subtes_mentor"]);
    const res = await diam(() => mentorPut({ enrollmentId: "e-baru" }));
    assert.equal(res.status, 503);
    assert.equal(enr("e-baru").link_meet, null);
  });
});

describe("lonceng ke siswa saat link terisi", () => {
  const bellSiswa = () => db.notifikasi.filter((n) => n.user_id === "siswa-1");

  it("pertama kali diisi -> satu lonceng tanpa tautan Meet di isinya", async () => {
    await mentorPut({ enrollmentId: "e-baru" });
    assert.equal(bellSiswa().length, 1);
    assert.match(String(bellSiswa()[0].judul), /Link Meet kamu sudah tersedia/);
    assert.equal(bellSiswa()[0].link_tujuan, "/kelas/K-PRIV");
    assert.ok(!JSON.stringify(db.notifikasi).includes("meet.google.com"));
  });

  it("suntingan oleh pengisi yang sama tidak mengirim lonceng lagi", async () => {
    await mentorPut({ enrollmentId: "e-baru" });
    await mentorPut({ enrollmentId: "e-baru", body: { linkMeet: "https://meet.google.com/baru-baru-baru" } });
    assert.equal(bellSiswa().length, 1);
    assert.equal(enr("e-baru").link_meet, "https://meet.google.com/baru-baru-baru");
  });

  it("gagal mengirim lonceng TIDAK membatalkan penyimpanan (tetap 200)", async () => {
    insertGagal = new Set(["notifikasi"]);
    const res = await diam(() => mentorPut({ enrollmentId: "e-baru" }));
    assert.equal(res.status, 200);
    assert.equal(enr("e-baru").link_meet, LINK_A);
  });
});

describe("PUT /api/kelola-kelas/[kelasId]/pendaftar/[id]/link-meet — Admin menimpa", () => {
  it("Admin mengisi link: tersimpan dengan pengisi kosong dan tetap berlaku untuk siswa", async () => {
    const res = await adminPut({ enrollmentId: "e-menunggu" });
    assert.equal(res.status, 200);
    assert.equal(enr("e-menunggu").link_meet, "https://meet.google.com/admin-link");
    assert.equal(enr("e-menunggu").link_meet_oleh, null);
    const hasil = linkLib.resolveLinkMeet({
      tipeKelas: "private",
      linkEnrollment: enr("e-menunggu").link_meet as string,
      linkEnrollmentOleh: null,
      penerimaMentorIds: [],
      linkKelas: null,
    });
    assert.equal(hasil.link, "https://meet.google.com/admin-link");
  });

  it("Admin menimpa link mentor, lalu mengosongkan dengan null", async () => {
    await mentorPut({ enrollmentId: "e-baru" });
    await adminPut({ enrollmentId: "e-baru", body: { linkMeet: "https://meet.google.com/ganti-admin" } });
    assert.equal(enr("e-baru").link_meet_oleh, null);
    const kosong = await adminPut({ enrollmentId: "e-baru", body: { linkMeet: null } });
    assert.equal(kosong.status, 200);
    assert.equal(enr("e-baru").link_meet, null);
  });

  it("bukan Admin 401/403; URL tidak valid 400; kelas bukan private 422; enrollment kelas lain 404", async () => {
    assert.equal((await adminPut({ enrollmentId: "e-baru", tanpaSesi: true })).status, 401);
    assert.equal((await adminPut({ enrollmentId: "e-baru", role: "mentor" })).status, 403);
    assert.equal((await adminPut({ enrollmentId: "e-baru", body: { linkMeet: "javascript:x" } })).status, 400);
    assert.equal((await adminPut({ enrollmentId: "e-baru", body: { linkMeet: 5 } })).status, 400);
    assert.equal((await adminPut({ kelasId: "K-GRUP", enrollmentId: "e-grup" })).status, 422);
    assert.equal((await adminPut({ kelasId: "K-PRIV", enrollmentId: "e-grup" })).status, 404);
    assert.equal((await adminPut({ enrollmentId: "e-belum-lunas" })).status, 404);
    assert.equal(enr("e-baru").link_meet, null);
  });
});

describe("getSesiSiswaByKelasId — Link Meet per siswa di daftar mentor", () => {
  it("kelas private: link berlaku untuk penerima; null (bukan private) untuk kelas grup", async () => {
    await mentorPut({ enrollmentId: "e-baru" });
    const privat = await kelasSaya.getSesiSiswaByKelasId("K-PRIV", A, "kelas", { tipeKelas: "private" });
    assert.deepEqual(privat.find((i) => i.enrollmentId === "e-baru")!.linkMeetSiswa, { link: LINK_A, tidakBerlaku: false });
    // Privasi antar mentor (keputusan Rio): siswa yang MENUNGGU diterima bukan milik A — tidak ada di daftar
    // Absensi sama sekali, jadi tidak ada link Meet-nya pun (sebelumnya tampil dengan link null). Dulu tes ini
    // mengunci perilaku lama itu; diubah mengikuti keputusan produk, bukan dilemahkan.
    assert.equal(privat.find((i) => i.enrollmentId === "e-menunggu"), undefined);
    const grup = await kelasSaya.getSesiSiswaByKelasId("K-GRUP", GRUP_MENTOR, "utama", { tipeKelas: "grouping" });
    assert.equal(grup[0].linkMeetSiswa, null);
  });

  it("pengisi bukan lagi penerima -> link tidak berlaku (tidakBerlaku=true), TANPA jatuh ke link kelas", async () => {
    await mentorPut({ enrollmentId: "e-baru" });
    db.enrollment_subtes.find((r) => r.id === "es-baru")!.mentor_id = B; // penerima berganti
    db.kelas.find((k) => k.id === "K-PRIV")!.link_meet = "https://meet.google.com/link-kelas";
    const itemsB = await kelasSaya.getSesiSiswaByKelasId("K-PRIV", B, "kelas", { tipeKelas: "private" });
    assert.deepEqual(itemsB.find((i) => i.enrollmentId === "e-baru")!.linkMeetSiswa, { link: null, tidakBerlaku: true });
  });

  it("data gagal dibaca: link tidak ditampilkan (fail-closed)", async () => {
    await mentorPut({ enrollmentId: "e-baru" });
    tabelGagal = new Set(["user_roles"]);
    const items = await diam(() => kelasSaya.getSesiSiswaByKelasId("K-PRIV", A, "kelas", { tipeKelas: "private" }));
    // Fail-closed: kepemilikan tidak bisa dipastikan → tidak ada siswa (dan tidak ada link) yang ditampilkan.
    assert.deepEqual(items, []);
  });
});
