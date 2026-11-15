/**
 * Test otorisasi Link Meet KELAS (kelas.link_meet): bukan hanya kelas.mentor_id (kolom lama),
 * juga mentor Active dari kelas_mentor / kelas_subtes_mentor. Supabase TIRUAN di memori.
 *
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
  return new FakeQuery(db[table], tabelGagal.has(table));
}

const LAMA = "mentor-lama"; // kelas.mentor_id (kolom lama)
const DI_KELAS_MENTOR = "mentor-kelas-mentor"; // hanya di kelas_mentor
const DI_PASANGAN = "mentor-pasangan"; // hanya di kelas_subtes_mentor
const ASING = "mentor-asing";
const OFFLINE = "mentor-offline"; // hanya enrollments.mentor_offline_id
const PENDING = "mentor-pending"; // terkait kelas, tapi belum Active
const LINK_BARU = "https://meet.google.com/kelas-baru";

type RouteModule = typeof import("@/app/api/kelas/[kelasId]/link-meet/route");
type AksesModule = typeof import("@/lib/mentor/aksesMentor");
type SessionModule = typeof import("@/lib/auth/session");
let route: RouteModule;
let akses: AksesModule;
let sessionLib: SessionModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  route = await import("@/app/api/kelas/[kelasId]/link-meet/route");
  akses = await import("@/lib/mentor/aksesMentor");
  sessionLib = await import("@/lib/auth/session");
});

async function patch(opsi: { userId?: string; role?: "mentor" | "student" | "admin"; kelasId?: string; body?: unknown; tanpaSesi?: boolean }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opsi.tanpaSesi) {
    const token = sessionLib.createSessionToken({ userId: opsi.userId ?? LAMA, role: opsi.role ?? "mentor" });
    headers.cookie = `${sessionLib.SESSION_COOKIE_NAME}=${token}`;
  }
  const kelasId = opsi.kelasId ?? "K1";
  const request = new NextRequest(`http://localhost/api/kelas/${kelasId}/link-meet`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(opsi.body ?? { linkMeet: LINK_BARU }),
  });
  const response = await route.PATCH(request, { params: Promise.resolve({ kelasId }) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const linkKelas = () => db.kelas.find((k) => k.id === "K1")!.link_meet;

beforeEach(() => {
  tabelGagal = new Set();
  db = {
    kelas: [
      { id: "K1", mentor_id: LAMA, link_meet: null },
      { id: "K2", mentor_id: ASING, link_meet: null },
    ],
    kelas_mentor: [
      { kelas_id: "K1", mentor_id: DI_KELAS_MENTOR },
      { kelas_id: "K1", mentor_id: PENDING },
    ],
    kelas_subtes_mentor: [{ kelas_id: "K1", subtes_id: "s-mtk", mentor_id: DI_PASANGAN }],
    enrollments: [{ id: "e1", kelas_id: "K1", mentor_offline_id: OFFLINE, status_pembayaran: "lunas" }],
    user_roles: [LAMA, DI_KELAS_MENTOR, DI_PASANGAN, ASING, OFFLINE].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })).concat([{ user_id: PENDING, role_type: "mentor", status: "pending" }]),
  };
});

describe("PATCH /api/kelas/[kelasId]/link-meet — siapa boleh mengubah link kelas", () => {
  it("mentor kelas.mentor_id (kolom lama) tetap boleh", async () => {
    assert.equal((await patch({ userId: LAMA })).status, 200);
    assert.equal(linkKelas(), LINK_BARU);
  });

  it("mentor dari kelas_mentor (bukan mentor_id) boleh", async () => {
    assert.equal((await patch({ userId: DI_KELAS_MENTOR })).status, 200);
    assert.equal(linkKelas(), LINK_BARU);
  });

  it("mentor dari kelas_subtes_mentor saja boleh", async () => {
    assert.equal((await patch({ userId: DI_PASANGAN })).status, 200);
    assert.equal(linkKelas(), LINK_BARU);
  });

  it("mentor tidak terkait kelas ditolak 403; kelas tidak ada 403 dengan pesan sama; link tidak berubah", async () => {
    const asing = await patch({ userId: ASING });
    const tidakAda = await patch({ userId: LAMA, kelasId: "tidak-ada" });
    assert.equal(asing.status, 403);
    assert.equal(tidakAda.status, 403);
    assert.equal(asing.json.error, tidakAda.json.error);
    assert.equal(linkKelas(), null);
  });

  it("mentor offline (hanya mentor_offline_id siswa) TIDAK boleh mengubah link kelas", async () => {
    assert.equal((await patch({ userId: OFFLINE })).status, 403);
    assert.equal(linkKelas(), null);
  });

  it("mentor terkait tapi belum Active (On Review) ditolak 403", async () => {
    assert.equal((await patch({ userId: PENDING })).status, 403);
    assert.equal(linkKelas(), null);
  });

  it("tanpa sesi 401; siswa/admin 403; URL tidak valid 400; galat database 500", async () => {
    assert.equal((await patch({ tanpaSesi: true })).status, 401);
    assert.equal((await patch({ role: "student" })).status, 403);
    assert.equal((await patch({ role: "admin" })).status, 403);
    assert.equal((await patch({ userId: DI_KELAS_MENTOR, body: { linkMeet: "javascript:alert(1)" } })).status, 400);
    assert.equal((await patch({ userId: DI_KELAS_MENTOR, body: {} })).status, 400);
    assert.equal(linkKelas(), null);
    tabelGagal = new Set(["kelas_mentor"]);
    const asli = console.error;
    console.error = () => {};
    try {
      assert.equal((await patch({ userId: DI_KELAS_MENTOR })).status, 500);
    } finally {
      console.error = asli;
    }
    assert.equal(linkKelas(), null);
  });
});

describe("bolehKelolaLinkMeetKelas (helper, dipakai juga halaman mentor)", () => {
  it("true untuk ketiga jenis keterkaitan, false untuk selain itu", async () => {
    assert.equal(await akses.bolehKelolaLinkMeetKelas(LAMA, "K1"), true);
    assert.equal(await akses.bolehKelolaLinkMeetKelas(DI_KELAS_MENTOR, "K1"), true);
    assert.equal(await akses.bolehKelolaLinkMeetKelas(DI_PASANGAN, "K1"), true);
    assert.equal(await akses.bolehKelolaLinkMeetKelas(ASING, "K1"), false);
    assert.equal(await akses.bolehKelolaLinkMeetKelas(OFFLINE, "K1"), false);
    assert.equal(await akses.bolehKelolaLinkMeetKelas(LAMA, "tidak-ada"), false);
    assert.equal(await akses.bolehKelolaLinkMeetKelas("", "K1"), false);
  });

  it("galat database -> 'gagal'", async () => {
    tabelGagal = new Set(["kelas_subtes_mentor"]);
    const asli = console.error;
    console.error = () => {};
    try {
      assert.equal(await akses.bolehKelolaLinkMeetKelas(LAMA, "K1"), "gagal");
    } finally {
      console.error = asli;
    }
  });
});
