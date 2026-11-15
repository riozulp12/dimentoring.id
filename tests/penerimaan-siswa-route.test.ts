/**
 * Test POST /api/mentor/terima-siswa (B1b) — pemetaan alasan -> kode HTTP,
 * mentorId hanya dari sesi login, siswa/kelas lain ditolak, dan dua mentor
 * menerima BERSAMAAN lewat route (tepat satu 200, satu 409). Supabase TIRUAN di
 * memori; filter + mutasi dievaluasi sinkron saat di-await (meniru atomisitas
 * UPDATE ... WHERE di Postgres), jadi tes balapan benar-benar menguji klaim bersyarat.
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
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
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
  const query = new FakeQuery(db[table], tabelGagal.has(table));
  // Notifikasi penerimaan (B2) menulis ke tabel notifikasi — cukup ditampung.
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      db[table].push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const D = "mentor-d"; // satu-satunya pemegang Fisika di K1
const X = "mentor-x"; // pemegang Matematika di kelas LAIN (K2)
const E_PENDING = "mentor-e";
const BARU = "2026-11-16T10:00:00+07:00";
const LAMA = "2026-11-10T10:00:00+07:00";

type RouteModule = typeof import("@/app/api/mentor/terima-siswa/route");
type SessionModule = typeof import("@/lib/auth/session");
let route: RouteModule;
let sessionLib: SessionModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  route = await import("@/app/api/mentor/terima-siswa/route");
  sessionLib = await import("@/lib/auth/session");
});

async function terima(opsi: { userId?: string; role?: "mentor" | "student" | "admin" | "unassigned"; body?: unknown; tanpaSesi?: boolean; bodyMentah?: string }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opsi.tanpaSesi) {
    const token = sessionLib.createSessionToken({ userId: opsi.userId ?? A, role: opsi.role ?? "mentor" });
    headers.cookie = `${sessionLib.SESSION_COOKIE_NAME}=${token}`;
  }
  const request = new NextRequest("http://localhost/api/mentor/terima-siswa", {
    method: "POST",
    headers,
    body: opsi.bodyMentah ?? JSON.stringify(opsi.body ?? { enrollmentSubtesId: "es-baru-mtk" }),
  });
  const response = await route.POST(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const penerimaDi = (id: string) => db.enrollment_subtes.find((r) => r.id === id)?.mentor_id ?? null;

beforeEach(() => {
  tabelGagal = new Set();
  db = {
    enrollments: [
      { id: "e-baru", kelas_id: "K1", tanggal_daftar: BARU },
      { id: "e-lama", kelas_id: "K1", tanggal_daftar: LAMA },
      { id: "e-fis", kelas_id: "K1", tanggal_daftar: BARU },
    ],
    enrollment_subtes: [
      { id: "es-baru-mtk", enrollment_id: "e-baru", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-lama-mtk", enrollment_id: "e-lama", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-fis-fis", enrollment_id: "e-fis", subtes_id: "s-fis", mentor_id: null, diterima_pada: null },
    ],
    kelas_subtes_mentor: [
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: A },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: B },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: C },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: E_PENDING },
      { kelas_id: "K1", subtes_id: "s-fis", mentor_id: D },
      { kelas_id: "K2", subtes_id: "s-mtk", mentor_id: X },
    ],
    user_roles: [A, B, C, D, X].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })).concat([{ user_id: E_PENDING, role_type: "mentor", status: "pending" }]),
  };
});

describe("POST /api/mentor/terima-siswa — kode HTTP per alasan", () => {
  it("ok -> 200 dan penerima tercatat", async () => {
    const res = await terima({ userId: A });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(penerimaDi("es-baru-mtk"), A);
  });

  it("mentor yang sama menekan dua kali -> 200 (idempoten, sudahMilikSendiri)", async () => {
    await terima({ userId: A });
    const res = await terima({ userId: A });
    assert.equal(res.status, 200);
    assert.equal(res.json.sudahMilikSendiri, true);
  });

  it("sudah_diterima_mentor_lain -> 409", async () => {
    await terima({ userId: A });
    const res = await terima({ userId: B });
    assert.equal(res.status, 409);
    assert.match(String(res.json.error), /sudah diterima mentor lain/i);
    assert.equal(penerimaDi("es-baru-mtk"), A);
  });

  it("mentor_tidak_aktif -> 403", async () => {
    const res = await terima({ userId: E_PENDING });
    assert.equal(res.status, 403);
    assert.equal(penerimaDi("es-baru-mtk"), null);
  });

  it("bukan_mentor_subtes -> 403 (pemegang subtes LAIN di kelas yang sama)", async () => {
    const res = await terima({ userId: D });
    assert.equal(res.status, 403);
    assert.equal(penerimaDi("es-baru-mtk"), null);
  });

  it("tidak_ditemukan -> 404", async () => {
    const res = await terima({ userId: A, body: { enrollmentSubtesId: "tidak-ada" } });
    assert.equal(res.status, 404);
  });

  it("tidak_perlu_klaim (subtes 1 mentor) -> 422", async () => {
    const res = await terima({ userId: D, body: { enrollmentSubtesId: "es-fis-fis" } });
    assert.equal(res.status, 422);
    assert.equal(penerimaDi("es-fis-fis"), null);
  });

  it("pendaftaran_sebelum_pemberlakuan (siswa lama) -> 422", async () => {
    const res = await terima({ userId: A, body: { enrollmentSubtesId: "es-lama-mtk" } });
    assert.equal(res.status, 422);
    assert.equal(penerimaDi("es-lama-mtk"), null);
  });

  it("galat database -> 500", async () => {
    tabelGagal = new Set(["enrollment_subtes"]);
    const origError = console.error;
    console.error = () => {};
    try {
      assert.equal((await terima({ userId: A })).status, 500);
    } finally {
      console.error = origError;
    }
  });
});

describe("POST /api/mentor/terima-siswa — keamanan", () => {
  it("tanpa sesi -> 401", async () => {
    assert.equal((await terima({ tanpaSesi: true })).status, 401);
  });

  it("role selain mentor -> 403 dan tidak mengubah apa pun", async () => {
    assert.equal((await terima({ userId: A, role: "student" })).status, 403);
    assert.equal((await terima({ userId: A, role: "admin" })).status, 403);
    assert.equal((await terima({ userId: A, role: "unassigned" })).status, 403);
    assert.equal(penerimaDi("es-baru-mtk"), null);
  });

  it("mentorId TIDAK bisa dipalsukan lewat body: penerima = mentor di sesi, bukan yang ada di body", async () => {
    const res = await terima({ userId: A, body: { enrollmentSubtesId: "es-baru-mtk", mentorId: B, userId: B, role: "admin" } });
    assert.equal(res.status, 200);
    assert.equal(penerimaDi("es-baru-mtk"), A);
  });

  it("body bukan JSON / tanpa enrollmentSubtesId / bukan string -> 400", async () => {
    assert.equal((await terima({ bodyMentah: "bukan json" })).status, 400);
    assert.equal((await terima({ body: {} })).status, 400);
    assert.equal((await terima({ body: { enrollmentSubtesId: 123 } })).status, 400);
    assert.equal((await terima({ body: { enrollmentSubtesId: { $ne: null } } })).status, 400);
  });

  it("siswa di KELAS LAIN ditolak: pemegang Matematika kelas K2 tidak bisa menerima siswa K1", async () => {
    const res = await terima({ userId: X });
    assert.equal(res.status, 403);
    assert.equal(penerimaDi("es-baru-mtk"), null);
  });
});

describe("POST /api/mentor/terima-siswa — balapan", () => {
  it("dua mentor menerima BERSAMAAN lewat route -> tepat satu 200, satu 409", async () => {
    const [x, y] = await Promise.all([terima({ userId: A }), terima({ userId: B })]);
    const statuses = [x.status, y.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const pemenang = x.status === 200 ? A : B;
    assert.equal(penerimaDi("es-baru-mtk"), pemenang);
  });

  it("tiga mentor bersamaan -> tepat satu 200, dua 409", async () => {
    const hasil = await Promise.all([A, B, C].map((userId) => terima({ userId })));
    assert.equal(hasil.filter((h) => h.status === 200).length, 1);
    assert.equal(hasil.filter((h) => h.status === 409).length, 2);
  });
});
