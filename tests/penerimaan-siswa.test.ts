/**
 * Test fondasi penerimaan siswa per subtes (Tahap A): logika murni
 * (lib/shared/penerimaanSiswa.ts) dan klaim atomik (lib/mentor/terimaSiswa.ts),
 * dijalankan terhadap Supabase TIRUAN di memori (tidak pernah menyentuh database asli).
 *
 * Tiruan ini mengevaluasi filter + mutasi dalam SATU blok sinkron saat query
 * di-await — meniru atomisitas UPDATE ... WHERE di Postgres. Karena itu tes
 * balapan benar-benar membuktikan klaim bersyarat: implementasi baca-lalu-tulis
 * akan membiarkan dua pemenang.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

let db: Db;

type Hasil = { data: Row[] | Row | null; error: null };

class FakeQuery implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
  private mutation: Row | null = null;
  private single = false;

  constructor(private rows: Row[]) {}

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
  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  // Filter dan mutasi dievaluasi SEKALIGUS di sini (sinkron) = atomik.
  then<A, B>(
    onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    const cocok = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.mutation) for (const row of cocok) Object.assign(row, this.mutation);
    const data = this.single ? (cocok[0] ?? null) : cocok;
    return Promise.resolve({ data, error: null } as Hasil).then(onfulfilled, onrejected);
  }
}

function fakeFrom(table: string) {
  db[table] ??= [];
  return new FakeQuery(db[table]);
}

type LogikaModule = typeof import("@/lib/shared/penerimaanSiswa");
type TerimaModule = typeof import("@/lib/mentor/terimaSiswa");
let logika: LogikaModule;
let terima: TerimaModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  logika = await import("@/lib/shared/penerimaanSiswa");
  terima = await import("@/lib/mentor/terimaSiswa");
});

const KELAS = "kelas-mtk-intensif";
const SUBTES_MTK = "subtes-mtk";
const ENROLLMENT = "enr-1";
const ES_ID = "es-1";

// getMentorRoleStatus memakai react cache(), jadi tiap skenario status memakai id mentor sendiri.
const MENTOR_A = "mentor-a";
const MENTOR_B = "mentor-b";
const MENTOR_C = "mentor-c";
const MENTOR_PENDING = "mentor-pending";
const MENTOR_BUKAN_PEMEGANG = "mentor-bukan-pemegang";

beforeEach(() => {
  db = {
    enrollments: [{ id: ENROLLMENT, kelas_id: KELAS, status_pembayaran: "lunas" }],
    enrollment_subtes: [{ id: ES_ID, enrollment_id: ENROLLMENT, subtes_id: SUBTES_MTK, mentor_id: null, diterima_pada: null }],
    kelas_subtes_mentor: [MENTOR_A, MENTOR_B, MENTOR_C, MENTOR_PENDING].map((mentor_id) => ({
      kelas_id: KELAS,
      subtes_id: SUBTES_MTK,
      mentor_id,
    })),
    user_roles: [
      { user_id: MENTOR_A, role_type: "mentor", status: "active" },
      { user_id: MENTOR_B, role_type: "mentor", status: "active" },
      { user_id: MENTOR_C, role_type: "mentor", status: "active" },
      { user_id: MENTOR_PENDING, role_type: "mentor", status: "pending" },
      { user_id: MENTOR_BUKAN_PEMEGANG, role_type: "mentor", status: "active" },
    ],
  };
});

describe("logika murni penerimaan siswa", () => {
  it("1 mentor aktif -> otomatis, tidak perlu klaim", () => {
    assert.equal(logika.perluKlaim([MENTOR_A]), false);
    assert.equal(logika.penerimaOtomatis([MENTOR_A]), MENTOR_A);
  });

  it("3 mentor aktif -> perlu klaim, tidak ada penerima otomatis", () => {
    assert.equal(logika.perluKlaim([MENTOR_A, MENTOR_B, MENTOR_C]), true);
    assert.equal(logika.penerimaOtomatis([MENTOR_A, MENTOR_B, MENTOR_C]), null);
  });

  it("0 mentor aktif -> tidak perlu klaim dan tidak ada penerima", () => {
    assert.equal(logika.perluKlaim([]), false);
    assert.equal(logika.penerimaOtomatis([]), null);
  });

  it("id ganda dihitung sekali (data ganda bukan 2 mentor)", () => {
    assert.equal(logika.perluKlaim([MENTOR_A, MENTOR_A]), false);
    assert.equal(logika.penerimaOtomatis([MENTOR_A, MENTOR_A]), MENTOR_A);
  });

  it("batas jam tanpa penerima = 24", () => {
    assert.equal(logika.BATAS_JAM_TANPA_PENERIMA, 24);
  });
});

describe("terimaSiswaSubtes (klaim atomik)", () => {
  it("klaim pertama menang dan mengisi mentor_id + diterima_pada", async () => {
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: true });
    assert.equal(db.enrollment_subtes[0].mentor_id, MENTOR_A);
    assert.equal(typeof db.enrollment_subtes[0].diterima_pada, "string");
  });

  it("klaim kedua (mentor lain) ditolak dan TIDAK menimpa penerima", async () => {
    await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    const diterimaPada = db.enrollment_subtes[0].diterima_pada;

    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_B, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "sudah_diterima_mentor_lain" });
    assert.equal(db.enrollment_subtes[0].mentor_id, MENTOR_A);
    assert.equal(db.enrollment_subtes[0].diterima_pada, diterimaPada);
  });

  it("DUA klaim bersamaan (Promise.all) -> tepat satu ok, satu ditolak", async () => {
    const [x, y] = await Promise.all([
      terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID }),
      terima.terimaSiswaSubtes({ mentorId: MENTOR_B, enrollmentSubtesId: ES_ID }),
    ]);
    const hasil = [x, y];
    assert.equal(hasil.filter((h) => h.ok).length, 1);
    assert.equal(hasil.filter((h) => !h.ok).length, 1);
    const kalah = hasil.find((h) => !h.ok);
    assert.deepEqual(kalah, { ok: false, alasan: "sudah_diterima_mentor_lain" });
    // Penerima akhir = si pemenang, bukan yang terakhir menulis.
    const pemenang = x.ok ? MENTOR_A : MENTOR_B;
    assert.equal(db.enrollment_subtes[0].mentor_id, pemenang);
  });

  it("TIGA klaim bersamaan -> tepat satu pemenang", async () => {
    const hasil = await Promise.all(
      [MENTOR_A, MENTOR_B, MENTOR_C].map((mentorId) => terima.terimaSiswaSubtes({ mentorId, enrollmentSubtesId: ES_ID })),
    );
    assert.equal(hasil.filter((h) => h.ok).length, 1);
    assert.equal(hasil.filter((h) => !h.ok && h.alasan === "sudah_diterima_mentor_lain").length, 2);
  });

  it("mentor nonaktif (pending) ditolak dan baris tidak berubah", async () => {
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_PENDING, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "mentor_tidak_aktif" });
    assert.equal(db.enrollment_subtes[0].mentor_id, null);
  });

  it("mentor aktif yang BUKAN pemegang subtes ditolak dan baris tidak berubah", async () => {
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_BUKAN_PEMEGANG, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "bukan_mentor_subtes" });
    assert.equal(db.enrollment_subtes[0].mentor_id, null);
  });

  it("mentor yang sama dua kali -> idempoten, penerima dan waktu tidak berubah", async () => {
    const pertama = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    const diterimaPada = db.enrollment_subtes[0].diterima_pada;
    const kedua = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(pertama, { ok: true });
    assert.deepEqual(kedua, { ok: true, sudahMilikSendiri: true });
    assert.equal(db.enrollment_subtes[0].mentor_id, MENTOR_A);
    assert.equal(db.enrollment_subtes[0].diterima_pada, diterimaPada);
  });

  it("enrollmentSubtesId tidak ada -> tidak_ditemukan", async () => {
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: "tidak-ada" });
    assert.deepEqual(hasil, { ok: false, alasan: "tidak_ditemukan" });
  });

  it("mentor bukan pemegang tidak bisa 'mengintip' siswa yang sudah diterima mentor lain", async () => {
    await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_BUKAN_PEMEGANG, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "bukan_mentor_subtes" });
  });

  it("fungsi klaim tidak menyentuh sesi_kelas", async () => {
    db.sesi_kelas = [{ id: "s1", enrollment_id: ENROLLMENT, nomor_sesi: 1, mentor_id: null }];
    await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.equal(db.sesi_kelas[0].mentor_id, null);
  });
});
