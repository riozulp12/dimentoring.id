/**
 * Test penjaga kepemilikan untuk dua route TULIS mentor yang menerima enrollmentId:
 * POST /api/mentor/sesi (presensi -> honor) dan PUT /api/mentor/enrollment/[id]/link-meet.
 * Dulu hanya mentor "terkait kelas" yang dicek, jadi mentor yang bukan pemilik siswa bisa lolos bila menebak
 * enrollmentId. Kini guardPemilikSiswa (lib/mentor/guardPemilikSiswa.ts -> siswaMilikMentor) dipakai di kedua
 * route. Supabase TIRUAN di memori; setiap INSERT/UPDATE dicatat di `tulis` untuk membuktikan "tidak ada tulis".
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
/** Setiap INSERT/UPDATE yang masuk ke database tiruan. */
let tulis: string[];

class FakeQuery implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
  private mutation: Row | null = null;
  private single = false;
  private batas: number | null = null;

  constructor(
    private tabel: string,
    private rows: Row[],
    private gagal: boolean,
  ) {}

  select() {
    return this;
  }
  update(values: Row) {
    tulis.push(`update:${this.tabel}`);
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
    this.batas = n; // diterapkan SETELAH filter (seperti SQL), bukan sebelum
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<A, B>(onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    if (this.gagal) return Promise.resolve({ data: null, error: { message: "galat tiruan" } } as Hasil).then(onfulfilled, onrejected);
    let cocok = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.batas !== null) cocok = cocok.slice(0, this.batas);
    if (this.mutation) for (const row of cocok) Object.assign(row, this.mutation);
    return Promise.resolve({ data: this.single ? (cocok[0] ?? null) : cocok, error: null } as Hasil).then(onfulfilled, onrejected);
  }
}

function fakeFrom(table: string) {
  db[table] ??= [];
  const gagal = tabelGagal.has(table);
  let rows = db[table];
  if (table === "enrollments") {
    const asli = rows;
    const tampilan = rows.map((row) => {
      const kelas = db.kelas.find((k) => k.id === row.kelas_id) ?? null;
      return { ...row, kelas: kelas ? { ...kelas, subtes: db.subtes.find((s) => s.id === kelas.subtes_id) ?? null } : null };
    });
    const query = new FakeQuery(table, tampilan, gagal);
    // Mutasi harus mengenai baris asli.
    query.update = (values: Row) => {
      tulis.push("update:enrollments");
      return new FakeQuery(table, asli, gagal).update(values);
    };
    return query;
  }
  if (table === "kelas_subtes_mentor") {
    rows = rows.map((row) => ({ ...row, subtes: db.subtes.find((s) => s.id === row.subtes_id) ?? null }));
  }
  const query = new FakeQuery(table, rows, gagal);
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      tulis.push(`insert:${table}`);
      db[table].push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

const A = "mentor-a"; // penerima e-baru
const B = "mentor-b"; // pemegang Matematika, BUKAN penerima e-baru
const C = "mentor-c";
const F = "mentor-f"; // terkait kelas (kelas_mentor) tanpa subtes — lolos penjaga lama
const SOLO = "mentor-solo"; // kelas satu mentor
const OFF = "mentor-off"; // mentor tatap muka
const ASING = "mentor-asing"; // tidak terkait kelas mana pun
const BARU = "2026-11-16T10:00:00+07:00";
const LAMA = "2026-11-10T10:00:00+07:00";
const LINK = "https://meet.google.com/aaa-aaaa-aaa";

type SesiRoute = typeof import("@/app/api/mentor/sesi/route");
type LinkRoute = typeof import("@/app/api/mentor/enrollment/[enrollmentId]/link-meet/route");
type SessionModule = typeof import("@/lib/auth/session");
type GuardModule = typeof import("@/lib/mentor/guardPemilikSiswa");
let sesiRoute: SesiRoute;
let linkRoute: LinkRoute;
let sessionLib: SessionModule;
let guardLib: GuardModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  sesiRoute = await import("@/app/api/mentor/sesi/route");
  linkRoute = await import("@/app/api/mentor/enrollment/[enrollmentId]/link-meet/route");
  sessionLib = await import("@/lib/auth/session");
  guardLib = await import("@/lib/mentor/guardPemilikSiswa");
});

function cookie(userId: string) {
  return `${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken({ userId, role: "mentor" })}`;
}

async function tandai(mentorId: string, enrollmentId: string) {
  const request = new NextRequest("http://localhost/api/mentor/sesi", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookie(mentorId) },
    body: JSON.stringify({ enrollmentId }),
  });
  const response = await sesiRoute.POST(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function isiLink(mentorId: string, enrollmentId: string) {
  const request = new NextRequest(`http://localhost/api/mentor/enrollment/${enrollmentId}/link-meet`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: cookie(mentorId) },
    body: JSON.stringify({ linkMeet: LINK }),
  });
  const response = await linkRoute.PUT(request, { params: Promise.resolve({ enrollmentId }) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const enr = (id: string) => db.enrollments.find((e) => e.id === id)!;
const ditandai = (id: string) => db.sesi_kelas.filter((r) => r.enrollment_id === id && r.dikonfirmasi_mentor);
const diam = async <T,>(fn: () => Promise<T>) => {
  const asli = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = asli;
  }
};

function sesiRows(enrollmentId: string, total: number): Row[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `${enrollmentId}-s${i + 1}`,
    enrollment_id: enrollmentId,
    nomor_sesi: i + 1,
    tanggal_dilaksanakan: null,
    dikonfirmasi_mentor: false,
    dikonfirmasi_mentor_pada: null,
    mentor_id: null,
    nama_mapel: null,
  }));
}

const enrollment = (id: string, userId: string, kelasId: string, tanggal: string, offline: string | null = null): Row => ({
  id,
  user_id: userId,
  kelas_id: kelasId,
  status_pembayaran: "lunas",
  mentor_offline_id: offline,
  tanggal_daftar: tanggal,
  link_meet: null,
  link_meet_oleh: null,
});

beforeEach(() => {
  tabelGagal = new Set();
  tulis = [];
  db = {
    subtes: [{ id: "s-mtk", nama: "Matematika TKA" }],
    kelas: [
      { id: "K-PRIV", nama: "Matematika TKA Intensif", mentor_id: null, subtes_id: null, tipe_kelas: "private", jumlah_sesi: 6 },
      { id: "K-SOLO", nama: "Kelas Satu Mentor", mentor_id: SOLO, subtes_id: "s-mtk", tipe_kelas: "private", jumlah_sesi: 6 },
      { id: "K-OFF", nama: "Kelas Tatap Muka", mentor_id: null, subtes_id: "s-mtk", tipe_kelas: "private", jumlah_sesi: 6 },
    ],
    kelas_mentor: [...[A, B, C, F].map((mentor_id) => ({ kelas_id: "K-PRIV", mentor_id })), { kelas_id: "K-SOLO", mentor_id: SOLO }],
    kelas_subtes_mentor: [
      ...[A, B, C].map((mentor_id) => ({ kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id })),
      { kelas_id: "K-SOLO", subtes_id: "s-mtk", mentor_id: SOLO },
    ],
    enrollments: [
      enrollment("e-baru", "siswa-1", "K-PRIV", BARU), // diterima A
      enrollment("e-menunggu", "siswa-2", "K-PRIV", BARU), // belum diterima siapa pun
      enrollment("e-lama", "siswa-3", "K-PRIV", LAMA), // legacy
      enrollment("e-solo", "siswa-4", "K-SOLO", BARU), // pemilik implisit SOLO
      enrollment("e-off", "siswa-5", "K-OFF", BARU, OFF), // tatap muka
    ],
    enrollment_subtes: [
      { id: "es-baru", enrollment_id: "e-baru", subtes_id: "s-mtk", mentor_id: A, diterima_pada: "2026-11-16T11:00:00+07:00" },
      { id: "es-menunggu", enrollment_id: "e-menunggu", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-lama", enrollment_id: "e-lama", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-solo", enrollment_id: "e-solo", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
    ],
    user_roles: [A, B, C, F, SOLO, OFF, ASING].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })),
    users: [A, B, C, F, SOLO, OFF, ASING].map((id) => ({ id, nama: `Nama ${id}` })),
    sesi_kelas: ["e-baru", "e-menunggu", "e-lama", "e-solo", "e-off"].flatMap((id) => sesiRows(id, 6)),
    notifikasi: [],
  };
});

describe("pemilik sah — perilaku lama tidak berubah", () => {
  it("penerima menandai sesi (200) dan mengisi link Meet (200)", async () => {
    const sesi = await tandai(A, "e-baru");
    assert.equal(sesi.status, 200);
    assert.equal(ditandai("e-baru").length, 1);
    assert.equal(ditandai("e-baru")[0].mentor_id, A);
    const link = await isiLink(A, "e-baru");
    assert.equal(link.status, 200);
    assert.equal(enr("e-baru").link_meet, LINK);
    assert.equal(enr("e-baru").link_meet_oleh, A);
  });

  it("kelas satu mentor: pemilik implisit langsung boleh (presensi + link)", async () => {
    assert.equal((await tandai(SOLO, "e-solo")).status, 200);
    assert.equal((await isiLink(SOLO, "e-solo")).status, 200);
    assert.equal(ditandai("e-solo")[0].mentor_id, SOLO);
  });

  it("kelas legacy (sebelum 2026-11-15): mentor terkait kelas tetap boleh menandai", async () => {
    for (const mentor of [A, B, F]) {
      db.sesi_kelas.filter((r) => r.enrollment_id === "e-lama").forEach((r) => Object.assign(r, { dikonfirmasi_mentor: false, dikonfirmasi_mentor_pada: null }));
      assert.equal((await tandai(mentor, "e-lama")).status, 200, mentor);
    }
  });

  it("kelas legacy: pemegang subtes boleh mengisi link (200)", async () => {
    assert.equal((await isiLink(B, "e-lama")).status, 200);
  });

  it("mentor tatap muka (mentor_offline_id) boleh menandai siswanya", async () => {
    const res = await tandai(OFF, "e-off");
    assert.equal(res.status, 200);
    assert.equal(ditandai("e-off")[0].mentor_id, OFF);
  });
});

describe("mentor terkait kelas tetapi BUKAN pemilik -> 403, tidak ada tulis", () => {
  const bukanPemilik: [string, string][] = [
    ["pemegang subtes yang sama tapi bukan penerima", B],
    ["pemegang subtes lain yang bukan penerima", C],
    ["terkait kelas (kelas_mentor) tanpa subtes — dulu lolos penjaga lama", F],
  ];

  for (const [nama, mentor] of bukanPemilik) {
    it(`presensi: ${nama}`, async () => {
      const res = await tandai(mentor, "e-baru");
      assert.equal(res.status, 403);
      assert.equal(ditandai("e-baru").length, 0);
      assert.deepEqual(tulis, []);
    });
    it(`link Meet: ${nama}`, async () => {
      const res = await isiLink(mentor, "e-baru");
      assert.equal(res.status, 403);
      assert.equal(enr("e-baru").link_meet, null);
      assert.deepEqual(tulis, []);
    });
  }

  it("mentor yang tidak terkait kelas sama sekali juga 403 tanpa tulis", async () => {
    assert.equal((await tandai(ASING, "e-baru")).status, 403);
    assert.equal((await isiLink(ASING, "e-baru")).status, 403);
    assert.deepEqual(tulis, []);
  });

  it("mentor kelas lain tidak bisa memakai enrollmentId kelas yang bukan miliknya (SOLO -> e-baru)", async () => {
    assert.equal((await tandai(SOLO, "e-baru")).status, 403);
    assert.deepEqual(tulis, []);
  });
});

describe("siswa berstatus MENUNGGU -> 403 untuk semua mentor, tidak ada tulis", () => {
  it("presensi ditolak untuk semua mentor terkait kelas", async () => {
    for (const mentor of [A, B, C, F]) {
      assert.equal((await tandai(mentor, "e-menunggu")).status, 403, mentor);
    }
    assert.equal(ditandai("e-menunggu").length, 0);
    assert.deepEqual(tulis, []);
  });

  it("link Meet ditolak untuk semua mentor terkait kelas", async () => {
    for (const mentor of [A, B, C, F]) {
      assert.equal((await isiLink(mentor, "e-menunggu")).status, 403, mentor);
    }
    assert.equal(enr("e-menunggu").link_meet, null);
    assert.deepEqual(tulis, []);
  });
});

describe("kegagalan membaca kepemilikan -> 503 (fail-closed), tidak ada tulis", () => {
  for (const tabel of ["enrollments", "kelas_mentor", "enrollment_subtes", "kelas_subtes_mentor"]) {
    it(`presensi: tabel ${tabel} gagal dibaca`, async () => {
      tabelGagal = new Set([tabel]);
      const res = await diam(() => tandai(A, "e-baru"));
      assert.equal(res.status, 503);
      assert.equal(ditandai("e-baru").length, 0);
      assert.deepEqual(tulis, []);
    });
    it(`link Meet: tabel ${tabel} gagal dibaca`, async () => {
      tabelGagal = new Set([tabel]);
      const res = await diam(() => isiLink(A, "e-baru"));
      assert.equal(res.status, 503);
      assert.equal(enr("e-baru").link_meet, null);
      assert.deepEqual(tulis, []);
    });
  }

  it("user_roles gagal dibaca: route menolak lebih awal (status mentor tak bisa dipastikan), guard sendiri 503", async () => {
    tabelGagal = new Set(["user_roles"]);
    const res = await diam(() => tandai(A, "e-baru"));
    assert.ok(res.status === 403 || res.status === 503);
    assert.deepEqual(tulis, []);
    const guard = await diam(() => guardLib.guardPemilikSiswa(A, "e-baru"));
    assert.equal(guard.ok, false);
    if (!guard.ok) assert.equal(guard.status, 503);
  });

  it("gagal baca juga 503 untuk kelas legacy (tidak jatuh ke 'boleh')", async () => {
    tabelGagal = new Set(["kelas_mentor"]);
    const res = await diam(() => tandai(B, "e-lama"));
    assert.equal(res.status, 503);
    assert.deepEqual(tulis, []);
  });
});

describe("pesan 403 seragam (tidak membocorkan enrollmentId atau pemiliknya)", () => {
  it("presensi: tidak ada = bukan pemilik = menunggu = bukan kelasnya", async () => {
    const tidakAda = await tandai(B, "uuid-tidak-ada");
    const milikLain = await tandai(B, "e-baru");
    const milikLainKelasSaja = await tandai(F, "e-baru");
    const menunggu = await tandai(B, "e-menunggu");
    const asing = await tandai(ASING, "e-baru");
    for (const r of [tidakAda, milikLain, milikLainKelasSaja, menunggu, asing]) assert.equal(r.status, 403);
    for (const r of [milikLain, milikLainKelasSaja, menunggu, asing]) assert.equal(r.json.error, tidakAda.json.error);
    assert.equal(tidakAda.json.error, guardLib.PESAN_BUKAN_PEMILIK);
    assert.deepEqual(tulis, []);
  });

  it("link Meet: pesan identik untuk semua kasus yang sama", async () => {
    const tidakAda = await isiLink(B, "uuid-tidak-ada");
    const milikLain = await isiLink(B, "e-baru");
    const menunggu = await isiLink(B, "e-menunggu");
    const asing = await isiLink(ASING, "e-baru");
    for (const r of [tidakAda, milikLain, menunggu, asing]) assert.equal(r.status, 403);
    for (const r of [milikLain, menunggu, asing]) assert.equal(r.json.error, tidakAda.json.error);
    assert.deepEqual(tulis, []);
  });

  it("pesan tidak memuat id pemilik, id enrollment, atau nama siapa pun", async () => {
    const res = await tandai(B, "e-baru");
    const teks = JSON.stringify(res.json);
    for (const rahasia of [A, "e-baru", "siswa-1", "Nama mentor-a"]) assert.ok(!teks.includes(rahasia), rahasia);
  });

  it("kelas non-private tidak membocorkan tipe kelas ke non-pemilik (403, bukan 422)", async () => {
    db.kelas.find((k) => k.id === "K-PRIV")!.tipe_kelas = "grouping";
    assert.equal((await isiLink(B, "e-baru")).status, 403);
  });
});

describe("putuskanGuardPemilik (murni)", () => {
  it("'gagal' -> 503; null -> 403; keduanya tanpa data", () => {
    assert.deepEqual(guardLib.putuskanGuardPemilik(A, "gagal"), { ok: false, status: 503, pesan: guardLib.PESAN_GAGAL_BACA_KEPEMILIKAN });
    assert.deepEqual(guardLib.putuskanGuardPemilik(A, null), { ok: false, status: 403, pesan: guardLib.PESAN_BUKAN_PEMILIK });
  });

  it("penerimaan data_gagal -> 503 walau relasi kelas ada", () => {
    const hasil = guardLib.putuskanGuardPemilik(A, {
      akses: "kelas",
      penerimaan: { boleh: false, alasan: "data_gagal" },
      subtesPenerimaan: [],
      enrollment: { id: "e", userId: "u", kelasId: "k", mentorOfflineId: null, tanggalDaftar: LAMA },
      kelas: { id: "k", nama: "K", mentorId: null, subtesId: null, subtesNama: null, tipeKelas: "private" },
    });
    assert.deepEqual(hasil, { ok: false, status: 503, pesan: guardLib.PESAN_GAGAL_BACA_KEPEMILIKAN });
  });
});
