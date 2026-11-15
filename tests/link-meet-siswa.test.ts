/**
 * Test Link Meet per siswa (kelas private) — logika murni (lib/shared/linkMeet.ts),
 * pembaca mentor berhak (lib/mentor/linkMeetSiswa.ts), reset link saat penerima berganti
 * (lib/mentor/terimaSiswa.ts), dan jaminan jalur pembayaran tidak tersentuh.
 * Supabase TIRUAN di memori (tidak pernah menyentuh database asli).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { before, beforeEach, describe, it } from "node:test";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null };

let db: Db;
let tabelGagal: Set<string>;
/** Tabel yang UPDATE-nya gagal (galat dikembalikan, tidak melempar). */
let updateGagal: Set<string>;
let logQuery: string[];

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
  logQuery.push(table);
  let rows = db[table];
  if (table === "kelas_subtes_mentor") {
    rows = rows.map((row) => ({ ...row, subtes: db.subtes.find((s) => s.id === row.subtes_id) ?? null }));
  }
  const query = new FakeQuery(rows, tabelGagal.has(table));
  // update ke tabel yang sengaja gagal: kembalikan galat TANPA mengubah apa pun
  const asli = query.update.bind(query);
  query.update = (values: Row) => {
    if (updateGagal.has(table)) {
      const gagal = new FakeQuery([], true);
      return gagal as unknown as FakeQuery;
    }
    return asli(values);
  };
  return query;
}

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const D = "mentor-d";
const E_PENDING = "mentor-e";
const KELAS_ONLY = "mentor-kelas-saja"; // di kelas_mentor, tanpa pasangan subtes
const BARU = "2026-11-16T10:00:00+07:00";
const LAMA = "2026-11-10T10:00:00+07:00";

type LinkModule = typeof import("@/lib/shared/linkMeet");
type ReaderModule = typeof import("@/lib/mentor/linkMeetSiswa");
type TerimaModule = typeof import("@/lib/mentor/terimaSiswa");
let link: LinkModule;
let reader: ReaderModule;
let terima: TerimaModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  link = await import("@/lib/shared/linkMeet");
  reader = await import("@/lib/mentor/linkMeetSiswa");
  terima = await import("@/lib/mentor/terimaSiswa");
});

beforeEach(() => {
  tabelGagal = new Set();
  updateGagal = new Set();
  logQuery = [];
  db = {
    subtes: [{ id: "s-mtk", nama: "Matematika TKA" }],
    kelas: [{ id: "K1", mentor_id: null }],
    kelas_mentor: [A, B, C, E_PENDING, KELAS_ONLY].map((mentor_id) => ({ kelas_id: "K1", mentor_id })),
    kelas_subtes_mentor: [A, B, C, E_PENDING].map((mentor_id) => ({ kelas_id: "K1", subtes_id: "s-mtk", mentor_id })),
    enrollments: [
      { id: "e-baru", kelas_id: "K1", tanggal_daftar: BARU, link_meet: null, link_meet_oleh: null },
      { id: "e-menunggu", kelas_id: "K1", tanggal_daftar: BARU, link_meet: null, link_meet_oleh: null },
      { id: "e-lama", kelas_id: "K1", tanggal_daftar: LAMA, link_meet: null, link_meet_oleh: null },
      { id: "e-tanpa-subtes", kelas_id: "K1", tanggal_daftar: BARU, link_meet: null, link_meet_oleh: null },
    ],
    enrollment_subtes: [
      { id: "es-baru", enrollment_id: "e-baru", subtes_id: "s-mtk", mentor_id: A, diterima_pada: "2026-11-16T11:00:00+07:00" },
      { id: "es-menunggu", enrollment_id: "e-menunggu", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-lama", enrollment_id: "e-lama", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
    ],
    user_roles: [A, B, C, D, KELAS_ONLY].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })).concat([{ user_id: E_PENDING, role_type: "mentor", status: "pending" }]),
  };
});

describe("isValidLinkUrl", () => {
  it("hanya http/https", () => {
    assert.equal(link.isValidLinkUrl("https://meet.google.com/abc-defg-hij"), true);
    assert.equal(link.isValidLinkUrl("http://contoh.id/x"), true);
    for (const buruk of ["javascript:alert(1)", "data:text/html,x", "ftp://contoh.id", "bukan url", "", "//meet.google.com/x"]) {
      assert.equal(link.isValidLinkUrl(buruk), false, buruk);
    }
  });
});

describe("resolveLinkMeet — kelas private TIDAK PERNAH jatuh ke link kelas", () => {
  const dasar = {
    tipeKelas: "private",
    linkEnrollment: "https://meet.google.com/siswa-ini",
    linkEnrollmentOleh: A,
    penerimaMentorIds: [A],
    linkKelas: "https://meet.google.com/link-kelas-bersama",
  };

  it("private dengan link milik siswa dari penerima -> link siswa (bukan link kelas)", () => {
    assert.deepEqual(link.resolveLinkMeet(dasar), { link: "https://meet.google.com/siswa-ini", sumber: "enrollment", tidakBerlaku: false });
  });

  it("private TANPA link siswa -> kosong, walau link kelas terisi (tanpa fallback)", () => {
    for (const kosong of [null, undefined, "", "   "]) {
      const hasil = link.resolveLinkMeet({ ...dasar, linkEnrollment: kosong });
      assert.deepEqual(hasil, { link: null, sumber: "tidak_ada", tidakBerlaku: false });
    }
  });

  it("private: pengisi BUKAN lagi mentor penerima/pemegang aktif -> link tidak berlaku, TANPA fallback ke link kelas", () => {
    const hasil = link.resolveLinkMeet({ ...dasar, penerimaMentorIds: [B, C] });
    assert.deepEqual(hasil, { link: null, sumber: "tidak_ada", tidakBerlaku: true });
  });

  it("private: tidak ada mentor berhak sama sekali (menunggu diterima / data gagal) -> tidak berlaku", () => {
    assert.equal(link.resolveLinkMeet({ ...dasar, penerimaMentorIds: [] }).link, null);
  });

  it("private: diisi Admin (pengisi kosong) tetap berlaku", () => {
    const hasil = link.resolveLinkMeet({ ...dasar, linkEnrollmentOleh: null, penerimaMentorIds: [] });
    assert.equal(hasil.link, "https://meet.google.com/siswa-ini");
    assert.equal(hasil.sumber, "enrollment");
  });

  it("private: URL tersimpan rusak (javascript:) -> tidak tampil", () => {
    const hasil = link.resolveLinkMeet({ ...dasar, linkEnrollment: "javascript:alert(1)" });
    assert.equal(hasil.link, null);
    assert.equal(hasil.tidakBerlaku, true);
  });

  it("private: link kelas yang rusak/kosong tidak pernah berpengaruh", () => {
    for (const linkKelas of [null, "", "x", "https://meet.google.com/lain"]) {
      const hasil = link.resolveLinkMeet({ ...dasar, linkKelas, penerimaMentorIds: [] });
      assert.equal(hasil.link, null);
    }
  });
});

describe("resolveLinkMeet — grup/semi-private tetap link kelas", () => {
  const dasar = {
    linkEnrollment: "https://meet.google.com/abaikan-ini",
    linkEnrollmentOleh: A,
    penerimaMentorIds: [A],
    linkKelas: "https://meet.google.com/link-kelas",
  };

  it("grouping, semi_private, tipe kosong -> link kelas, link enrollment diabaikan", () => {
    for (const tipeKelas of ["grouping", "semi_private", null, undefined, "tipe-baru"]) {
      assert.deepEqual(link.resolveLinkMeet({ ...dasar, tipeKelas }), {
        link: "https://meet.google.com/link-kelas",
        sumber: "kelas",
        tidakBerlaku: false,
      });
    }
  });

  it("link kelas kosong/rusak -> kosong (bukan link enrollment)", () => {
    assert.equal(link.resolveLinkMeet({ ...dasar, tipeKelas: "grouping", linkKelas: null }).link, null);
    assert.equal(link.resolveLinkMeet({ ...dasar, tipeKelas: "grouping", linkKelas: "javascript:x" }).link, null);
  });
});

describe("mentorBerhakDariSubtes", () => {
  const sub = (status: "tidak_perlu_klaim" | "menunggu" | "diterima", mentorIdPenerima: string | null, mentorAktifSubtes: string[]) => ({
    status,
    mentorIdPenerima,
    mentorAktifSubtes,
  });

  it("diterima -> hanya penerima; menunggu -> tidak ada; tidak_perlu_klaim -> pemegang aktif", () => {
    assert.deepEqual(link.mentorBerhakDariSubtes([sub("diterima", A, [A, B, C])], [D]), [A]);
    assert.deepEqual(link.mentorBerhakDariSubtes([sub("menunggu", null, [A, B, C])], [D]), []);
    assert.deepEqual(link.mentorBerhakDariSubtes([sub("tidak_perlu_klaim", null, [A, B])], [D]).sort(), [A, B]);
  });

  it("subtes tanpa pemegang aktif, atau siswa tanpa subtes -> mentor tingkat kelas", () => {
    assert.deepEqual(link.mentorBerhakDariSubtes([sub("tidak_perlu_klaim", null, [])], [D]), [D]);
    assert.deepEqual(link.mentorBerhakDariSubtes([], [D, D]), [D]);
  });

  it("'menunggu' TIDAK pernah jatuh ke mentor tingkat kelas", () => {
    assert.deepEqual(link.mentorBerhakDariSubtes([sub("menunggu", null, [A, B])], [D]), []);
  });
});

describe("getMentorBerhakLinkMeet (pembaca)", () => {
  it("per enrollment: diterima=penerima, menunggu=kosong, siswa lama=semua pemegang aktif", async () => {
    const hasil = await reader.getMentorBerhakLinkMeet("K1", ["e-baru", "e-menunggu", "e-lama"]);
    assert.notEqual(hasil, "gagal");
    if (hasil === "gagal") return;
    assert.deepEqual(hasil.get("e-baru"), [A]);
    assert.deepEqual(hasil.get("e-menunggu"), []);
    assert.deepEqual([...(hasil.get("e-lama") ?? [])].sort(), [A, B, C]);
  });

  it("siswa tanpa pilihan subtes -> mentor tingkat kelas yang AKTIF saja (pending dikecualikan)", async () => {
    const hasil = await reader.getMentorBerhakLinkMeet("K1", ["e-tanpa-subtes"]);
    assert.notEqual(hasil, "gagal");
    if (hasil === "gagal") return;
    assert.deepEqual([...(hasil.get("e-tanpa-subtes") ?? [])].sort(), [A, B, C, KELAS_ONLY].sort());
  });

  it("tanpa siswa yang perlu fallback: tidak memakai query tingkat kelas (hemat query)", async () => {
    await reader.getMentorBerhakLinkMeet("K1", ["e-baru", "e-menunggu"]);
    assert.ok(!logQuery.includes("kelas"));
    assert.ok(!logQuery.includes("kelas_mentor"));
    assert.ok(logQuery.length <= 4, logQuery.join(","));
  });

  it("galat database -> 'gagal' (fail-closed)", async () => {
    for (const tabel of ["enrollments", "enrollment_subtes", "kelas_subtes_mentor", "user_roles"]) {
      tabelGagal = new Set([tabel]);
      const asli = console.error;
      console.error = () => {};
      try {
        assert.equal(await reader.getMentorBerhakLinkMeet("K1", ["e-baru"]), "gagal", tabel);
      } finally {
        console.error = asli;
      }
    }
  });
});

describe("reset link saat penerima berganti (terimaSiswaSubtes)", () => {
  const SISWA = () => db.enrollments.find((e) => e.id === "e-baru")!;
  const baris = () => db.enrollment_subtes.find((r) => r.id === "es-baru")!;

  it("klaim atas pemilik NONAKTIF mengosongkan link_meet & link_meet_oleh milik pemilik lama", async () => {
    baris().mentor_id = E_PENDING; // pemilik lama tidak aktif
    SISWA().link_meet = "https://meet.google.com/punya-pemilik-lama";
    SISWA().link_meet_oleh = E_PENDING;
    const hasil = await terima.terimaSiswaSubtes({ mentorId: A, enrollmentSubtesId: "es-baru" });
    assert.deepEqual(hasil, { ok: true });
    assert.equal(baris().mentor_id, A);
    assert.equal(SISWA().link_meet, null);
    assert.equal(SISWA().link_meet_oleh, null);
  });

  it("link yang diisi Admin (pengisi kosong) TIDAK dihapus saat penerima berganti", async () => {
    baris().mentor_id = E_PENDING;
    SISWA().link_meet = "https://meet.google.com/dari-admin";
    SISWA().link_meet_oleh = null;
    await terima.terimaSiswaSubtes({ mentorId: A, enrollmentSubtesId: "es-baru" });
    assert.equal(SISWA().link_meet, "https://meet.google.com/dari-admin");
  });

  it("klaim PERTAMA (belum ada penerima) tidak menyentuh link", async () => {
    baris().mentor_id = null;
    baris().diterima_pada = null;
    SISWA().link_meet = "https://meet.google.com/dari-admin";
    SISWA().link_meet_oleh = null;
    const hasil = await terima.terimaSiswaSubtes({ mentorId: A, enrollmentSubtesId: "es-baru" });
    assert.deepEqual(hasil, { ok: true });
    assert.equal(SISWA().link_meet, "https://meet.google.com/dari-admin");
  });

  it("klaim yang DITOLAK (pemilik aktif) tidak mereset link", async () => {
    baris().mentor_id = B; // B masih aktif
    SISWA().link_meet = "https://meet.google.com/punya-b";
    SISWA().link_meet_oleh = B;
    const hasil = await terima.terimaSiswaSubtes({ mentorId: A, enrollmentSubtesId: "es-baru" });
    assert.deepEqual(hasil, { ok: false, alasan: "sudah_diterima_mentor_lain" });
    assert.equal(SISWA().link_meet, "https://meet.google.com/punya-b");
  });

  it("gagal mereset link TIDAK membatalkan klaim (hanya di-log)", async () => {
    baris().mentor_id = E_PENDING;
    SISWA().link_meet = "https://meet.google.com/lama";
    SISWA().link_meet_oleh = E_PENDING;
    updateGagal = new Set(["enrollments"]);
    const asli = console.error;
    console.error = () => {};
    try {
      const hasil = await terima.terimaSiswaSubtes({ mentorId: A, enrollmentSubtesId: "es-baru" });
      assert.deepEqual(hasil, { ok: true });
      assert.equal(baris().mentor_id, A);
    } finally {
      console.error = asli;
    }
  });

  it("setelah reset, link lama pun tak berlaku lewat resolveLinkMeet walau tidak sempat dihapus (pengisi bukan penerima)", () => {
    const hasil = link.resolveLinkMeet({
      tipeKelas: "private",
      linkEnrollment: "https://meet.google.com/lama",
      linkEnrollmentOleh: E_PENDING,
      penerimaMentorIds: [A],
      linkKelas: "https://meet.google.com/kelas",
    });
    assert.equal(hasil.link, null);
  });
});

describe("jalur pembayaran tidak tersentuh", () => {
  function berkasTs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return berkasTs(path);
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    });
  }

  it("lib/payment, app/api/payment, dan fulfillPayment.ts tidak menyebut link_meet", () => {
    const berkas = [...berkasTs("lib/payment"), ...berkasTs("app/api/payment")];
    assert.ok(berkas.length > 0);
    assert.ok(berkas.includes(join("lib/payment", "fulfillPayment.ts")));
    for (const path of berkas) assert.ok(!/link_meet|linkMeet/i.test(readFileSync(path, "utf8")), path);
  });

  it("upsert enrollments di fulfillPayment hanya menulis kolom yang disebut (kolom baru tidak tertimpa saat webhook diulang)", () => {
    const sumber = readFileSync("lib/payment/fulfillPayment.ts", "utf8");
    const mulai = sumber.indexOf('.from("enrollments")');
    const akhir = sumber.indexOf('{ onConflict: "user_id,kelas_id" }', mulai);
    assert.ok(mulai > 0 && akhir > mulai);
    const upsert = sumber.slice(mulai, akhir);
    const kolom = Array.from(upsert.matchAll(/^\s{8}([a-z_]+):/gm)).map((m) => m[1]);
    assert.deepEqual(kolom.sort(), ["jadwal_pilihan", "kelas_id", "lokasi_siswa_lat", "lokasi_siswa_lng", "mentor_offline_id", "status_pembayaran", "user_id"]);
    assert.ok(!kolom.includes("link_meet") && !kolom.includes("link_meet_oleh"));
  });

  it("migrasi hanya aditif: tidak ada DROP/ALTER selain ADD COLUMN IF NOT EXISTS pada enrollments (baris aktif)", () => {
    const sql = readFileSync("db/add_link_meet_enrollment.sql", "utf8");
    const aktif = sql.split("\n").filter((l) => !l.trim().startsWith("--") && l.trim() !== "");
    assert.deepEqual(aktif, [
      "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS link_meet TEXT;",
      "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS link_meet_oleh UUID REFERENCES users(id) ON DELETE SET NULL;",
    ]);
  });
});
