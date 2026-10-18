/**
 * Test presensi multi-mentor (PRD 7.5.5) — otorisasi mentor
 * (lib/mentor/aksesMentor.ts) dijalankan terhadap Supabase TIRUAN di memori
 * (tidak pernah menyentuh database asli).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

let db: Db;

/** Query builder tiruan — cuma method yang dipakai kode yang diuji.
 * update baru dijalankan saat query di-await, ke baris yang lolos filter. */
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
  gte(column: string, value: string) {
    this.rows = this.rows.filter((row) => typeof row[column] === "string" && Date.parse(row[column] as string) >= Date.parse(value));
    return this;
  }
  lt(column: string, value: string) {
    this.rows = this.rows.filter((row) => typeof row[column] === "string" && Date.parse(row[column] as string) < Date.parse(value));
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

function subtesOf(id: unknown) {
  return db.subtes.find((s) => s.id === id) ?? null;
}

/** Tiruan `supabaseServer.from` — embed yang dipakai: enrollments→kelas→subtes,
 * kelas_subtes_mentor→subtes. Tabel lain memakai referensi baris asli
 * (supaya update tersimpan). */
function fakeFrom(table: string) {
  db[table] ??= [];
  const rows = db[table];
  if (table === "enrollments") {
    return new FakeQuery(
      rows.map((row) => {
        const kelas = db.kelas.find((k) => k.id === row.kelas_id) ?? null;
        return { ...row, kelas: kelas ? { ...kelas, subtes: subtesOf(kelas.subtes_id) } : null };
      }),
    );
  }
  if (table === "kelas_subtes_mentor") {
    return new FakeQuery(rows.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) })));
  }
  const query = new FakeQuery(rows);
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      rows.push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

const MENTOR_UTAMA = "mentor-utama";
const MENTOR_KEDUA = "mentor-kedua";
const MENTOR_OFFLINE = "mentor-offline";
const MENTOR_LAIN = "mentor-lain";

type AksesModule = typeof import("@/lib/mentor/aksesMentor");
let aksesMentor: AksesModule;

before(async () => {
  // Nilai dummy — client aslinya tidak pernah dipakai, `from` diganti tiruan.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  aksesMentor = await import("@/lib/mentor/aksesMentor");
});

beforeEach(() => {
  db = {
    subtes: [
      { id: "s-mtk", nama: "Penalaran Matematika" },
      { id: "s-ing", nama: "Literasi B. Inggris" },
    ],
    kelas: [
      // Multi-mentor online: utama = MENTOR_UTAMA (kolom lama), kedua lewat kelas_mentor.
      { id: "K-ON", nama: "Paket SNBT", mentor_id: MENTOR_UTAMA, subtes_id: "s-mtk", jumlah_sesi: 10 },
      // Offline: TANPA kelas.mentor_id, mentor per siswa.
      { id: "K-OFF", nama: "Privat Offline", mentor_id: null, subtes_id: "s-mtk", jumlah_sesi: 8 },
    ],
    kelas_mentor: [
      { kelas_id: "K-ON", mentor_id: MENTOR_UTAMA },
      { kelas_id: "K-ON", mentor_id: MENTOR_KEDUA },
    ],
    enrollments: [
      { id: "e-on", user_id: "siswa-1", kelas_id: "K-ON", status_pembayaran: "lunas", mentor_offline_id: null },
      { id: "e-off", user_id: "siswa-2", kelas_id: "K-OFF", status_pembayaran: "lunas", mentor_offline_id: MENTOR_OFFLINE },
      { id: "e-off-lain", user_id: "siswa-3", kelas_id: "K-OFF", status_pembayaran: "lunas", mentor_offline_id: MENTOR_LAIN },
    ],
  };
});

describe("tentukanAksesMentor (murni)", () => {
  const relasi = { kelasMentorId: MENTOR_UTAMA, kelasMentorIds: [MENTOR_UTAMA, MENTOR_KEDUA], mentorOfflineId: MENTOR_OFFLINE };
  it("prioritas utama > kelas > offline, tidak terkait → null", () => {
    assert.equal(aksesMentor.tentukanAksesMentor(MENTOR_UTAMA, relasi), "utama");
    assert.equal(aksesMentor.tentukanAksesMentor(MENTOR_KEDUA, relasi), "kelas");
    assert.equal(aksesMentor.tentukanAksesMentor(MENTOR_OFFLINE, relasi), "offline");
    assert.equal(aksesMentor.tentukanAksesMentor(MENTOR_LAIN, relasi), null);
    assert.equal(aksesMentor.tentukanAksesMentor("", { kelasMentorId: null, kelasMentorIds: [], mentorOfflineId: null }), null);
  });
});

describe("getAksesMentorEnrollment", () => {
  it("mentor utama (kelas.mentor_id) boleh", async () => {
    const res = await aksesMentor.getAksesMentorEnrollment(MENTOR_UTAMA, "e-on");
    assert.ok(res && res !== "gagal");
    assert.equal(res.akses, "utama");
    assert.equal(res.enrollment.userId, "siswa-1");
    assert.equal(res.kelas.subtesNama, "Penalaran Matematika");
  });

  it("mentor kedua (kelas_mentor) boleh", async () => {
    const res = await aksesMentor.getAksesMentorEnrollment(MENTOR_KEDUA, "e-on");
    assert.ok(res && res !== "gagal");
    assert.equal(res.akses, "kelas");
  });

  it("mentor offline yang ditugaskan boleh walau kelas.mentor_id NULL", async () => {
    const res = await aksesMentor.getAksesMentorEnrollment(MENTOR_OFFLINE, "e-off");
    assert.ok(res && res !== "gagal");
    assert.equal(res.akses, "offline");
  });

  it("mentor tidak terkait ditolak — termasuk mentor offline siswa LAIN di kelas yang sama", async () => {
    assert.equal(await aksesMentor.getAksesMentorEnrollment(MENTOR_LAIN, "e-on"), null);
    assert.equal(await aksesMentor.getAksesMentorEnrollment(MENTOR_OFFLINE, "e-off-lain"), null);
    assert.equal(await aksesMentor.getAksesMentorEnrollment(MENTOR_KEDUA, "e-off"), null);
  });

  it("enrollment tidak ada → null (pesan sama dengan tidak terkait)", async () => {
    assert.equal(await aksesMentor.getAksesMentorEnrollment(MENTOR_UTAMA, "tidak-ada"), null);
  });
});

describe("getKelasAksesMentor (daftar Kelas Saya)", () => {
  it("kelas offline tanpa kelas.mentor_id muncul untuk mentor offline yang ditugaskan", async () => {
    const map = await aksesMentor.getKelasAksesMentor(MENTOR_OFFLINE);
    assert.deepEqual([...map.entries()], [["K-OFF", "offline"]]);
  });

  it("mentor kedua melihat kelas multi-mentor; mentor utama tercatat 'utama'", async () => {
    assert.deepEqual([...(await aksesMentor.getKelasAksesMentor(MENTOR_KEDUA)).entries()], [["K-ON", "kelas"]]);
    assert.deepEqual([...(await aksesMentor.getKelasAksesMentor(MENTOR_UTAMA)).entries()], [["K-ON", "utama"]]);
  });

  it("enrollment offline yang belum lunas tidak membuka kelas", async () => {
    db.enrollments.push({ id: "e-x", user_id: "s", kelas_id: "K-X", status_pembayaran: "menunggu", mentor_offline_id: "mentor-baru" });
    assert.equal((await aksesMentor.getKelasAksesMentor("mentor-baru")).size, 0);
  });
});
