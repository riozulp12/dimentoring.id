/**
 * Test presensi multi-mentor (PRD 7.5.5) — otorisasi mentor
 * (lib/mentor/aksesMentor.ts), snapshot mapel (lib/mentor/mapelMentor.ts),
 * dan POST /api/mentor/sesi, dijalankan terhadap Supabase TIRUAN di memori
 * (tidak pernah menyentuh database asli).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

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

/** Tiruan `supabaseServer.from` — embed yang dipakai: enrollments→kelas→subtes
 * & users, kelas_subtes_mentor→subtes, sesi_kelas→mentor (users). Tabel lain
 * memakai referensi baris asli (supaya update tersimpan). */
function fakeFrom(table: string) {
  db[table] ??= [];
  const rows = db[table];
  if (table === "enrollments") {
    return new FakeQuery(
      rows.map((row) => {
        const kelas = db.kelas.find((k) => k.id === row.kelas_id) ?? null;
        return {
          ...row,
          kelas: kelas ? { ...kelas, subtes: subtesOf(kelas.subtes_id) } : null,
          users: db.users.find((u) => u.id === row.user_id) ?? null,
        };
      }),
    );
  }
  if (table === "kelas_subtes_mentor") {
    return new FakeQuery(rows.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) })));
  }
  if (table === "sesi_kelas") {
    // Embed mentor:mentor_id(nama) disegarkan di baris ASLI (update tetap tersimpan).
    for (const row of rows) row.mentor = db.users.find((u) => u.id === row.mentor_id) ?? null;
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
type MapelModule = typeof import("@/lib/mentor/mapelMentor");
type SesiRouteModule = typeof import("@/app/api/mentor/sesi/route");
type SessionModule = typeof import("@/lib/auth/session");
type ProgresModule = typeof import("@/lib/shared/progresSesi");
type KelasSayaMentorModule = typeof import("@/lib/mentor/getKelasSayaData");
let aksesMentor: AksesModule;
let mapelMentor: MapelModule;
let sesiRoute: SesiRouteModule;
let sessionLib: SessionModule;
let progres: ProgresModule;
let kelasSayaMentor: KelasSayaMentorModule;

before(async () => {
  // Nilai dummy — client aslinya tidak pernah dipakai, `from` diganti tiruan.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  aksesMentor = await import("@/lib/mentor/aksesMentor");
  mapelMentor = await import("@/lib/mentor/mapelMentor");
  sesiRoute = await import("@/app/api/mentor/sesi/route");
  sessionLib = await import("@/lib/auth/session");
  progres = await import("@/lib/shared/progresSesi");
  kelasSayaMentor = await import("@/lib/mentor/getKelasSayaData");
});

function sesiRows(enrollmentId: string, total: number): Row[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `${enrollmentId}-s${i + 1}`,
    enrollment_id: enrollmentId,
    nomor_sesi: i + 1,
    tanggal_dilaksanakan: null,
    dikonfirmasi_mentor: false,
    dikonfirmasi_mentor_pada: null,
    status_siswa: "belum",
    dikonfirmasi_siswa_pada: null,
    perlu_review_admin: false,
    mentor_id: null,
    nama_mapel: null,
  }));
}

async function tandai(mentorId: string, enrollmentId: string) {
  const token = sessionLib.createSessionToken({ userId: mentorId, role: "mentor" });
  const request = new NextRequest("http://localhost/api/mentor/sesi", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify({ enrollmentId }),
  });
  const response = await sesiRoute.POST(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

/** Mundurkan semua penandaan sehari — mensimulasikan hari WIB berikutnya. */
function geserSehari() {
  for (const row of db.sesi_kelas) {
    if (typeof row.dikonfirmasi_mentor_pada === "string") {
      row.dikonfirmasi_mentor_pada = new Date(Date.parse(row.dikonfirmasi_mentor_pada) - 24 * 60 * 60 * 1000).toISOString();
    }
  }
}

const ditandai = (enrollmentId: string) =>
  db.sesi_kelas
    .filter((r) => r.enrollment_id === enrollmentId && r.dikonfirmasi_mentor)
    .sort((a, b) => (a.nomor_sesi as number) - (b.nomor_sesi as number));

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
    // "di kelas ini, Subtes X diajar Mentor Y" — sumber mapel per mentor.
    kelas_subtes_mentor: [
      { kelas_id: "K-ON", subtes_id: "s-mtk", mentor_id: MENTOR_UTAMA },
      { kelas_id: "K-ON", subtes_id: "s-ing", mentor_id: MENTOR_KEDUA },
    ],
    enrollment_subtes: [],
    user_roles: [MENTOR_UTAMA, MENTOR_KEDUA, MENTOR_OFFLINE, MENTOR_LAIN].map((id) => ({
      user_id: id,
      role_type: "mentor",
      status: "active",
    })),
    users: [
      { id: MENTOR_UTAMA, nama: "Budi" },
      { id: MENTOR_KEDUA, nama: "Citra" },
      { id: MENTOR_OFFLINE, nama: "Dewi" },
      { id: "siswa-1", nama: "Siswa Satu", avatar_url: null },
      { id: "siswa-2", nama: "Siswa Dua", avatar_url: null },
      { id: "siswa-3", nama: "Siswa Tiga", avatar_url: null },
    ],
    sesi_kelas: [...sesiRows("e-on", 10), ...sesiRows("e-off", 8)],
    notifikasi: [],
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

describe("tentukanNamaMapel (murni)", () => {
  const pasangan = [
    { mentorId: "A", subtesId: "s1", subtesNama: "Matematika" },
    { mentorId: "A", subtesId: "s2", subtesNama: "Fisika" },
    { mentorId: "B", subtesId: "s3", subtesNama: "Biologi" },
  ];
  const input = (mentorId: string, subtesSiswaIds: string[] = [], subtesKelasNama: string | null = null) => ({
    mentorId,
    pasanganKelas: pasangan,
    subtesSiswaIds,
    subtesKelasNama,
  });

  it("satu subtes per mentor → nama subtes itu", () => {
    assert.equal(mapelMentor.tentukanNamaMapel(input("B")), "Biologi");
  });
  it("mentor >1 subtes dipersempit ke pilihan siswa; tanpa pilihan → digabung urut abjad", () => {
    assert.equal(mapelMentor.tentukanNamaMapel(input("A", ["s2"])), "Fisika");
    assert.equal(mapelMentor.tentukanNamaMapel(input("A")), "Fisika, Matematika");
  });
  it("kelas tanpa pasangan (offline / satu subtes) → subtes kelas; kelas tanpa subtes → null", () => {
    const tanpaPasangan = { mentorId: "X", pasanganKelas: [], subtesSiswaIds: [] };
    assert.equal(mapelMentor.tentukanNamaMapel({ ...tanpaPasangan, subtesKelasNama: "Penalaran Matematika" }), "Penalaran Matematika");
    assert.equal(mapelMentor.tentukanNamaMapel({ ...tanpaPasangan, subtesKelasNama: null }), null);
  });
  it("mentor generik di kelas berpasangan → null (bukan label kosong)", () => {
    assert.equal(mapelMentor.tentukanNamaMapel(input("Z", [], "x")), null);
  });
});

describe("POST /api/mentor/sesi (multi-mentor)", () => {
  it("mentor tidak terkait ditolak 403 dan tidak ada sesi yang berubah", async () => {
    const res = await tandai(MENTOR_LAIN, "e-on");
    assert.equal(res.status, 403);
    assert.equal(ditandai("e-on").length, 0);
  });

  it("mentor A dan B boleh menandai siswa yang sama di hari yang sama; A dua kali → 409", async () => {
    assert.equal((await tandai(MENTOR_UTAMA, "e-on")).status, 200);
    assert.equal((await tandai(MENTOR_KEDUA, "e-on")).status, 200);
    const ulang = await tandai(MENTOR_UTAMA, "e-on");
    assert.equal(ulang.status, 409);
    assert.match(String(ulang.json.error), /sudah menandai sesi siswa ini hari ini/);
    assert.equal(ditandai("e-on").length, 2);
    assert.equal(db.notifikasi.length, 2, "409 tidak boleh mengirim notifikasi");
  });

  it("snapshot mentor_id + nama_mapel tersimpan per sesi, urut sesi berikutnya", async () => {
    await tandai(MENTOR_UTAMA, "e-on");
    await tandai(MENTOR_KEDUA, "e-on");
    const [s1, s2] = ditandai("e-on");
    assert.deepEqual([s1.nomor_sesi, s1.mentor_id, s1.nama_mapel], [1, MENTOR_UTAMA, "Penalaran Matematika"]);
    assert.deepEqual([s2.nomor_sesi, s2.mentor_id, s2.nama_mapel], [2, MENTOR_KEDUA, "Literasi B. Inggris"]);
  });

  it("mentor offline mencatat subtes kelas offline", async () => {
    assert.equal((await tandai(MENTOR_OFFLINE, "e-off")).status, 200);
    const [s1] = ditandai("e-off");
    assert.deepEqual([s1.mentor_id, s1.nama_mapel], [MENTOR_OFFLINE, "Penalaran Matematika"]);
  });

  it("total sesi tetap 10 saat dua mentor menandai bergantian (bukan 10 per mentor)", async () => {
    for (let hari = 0; hari < 5; hari++) {
      assert.equal((await tandai(MENTOR_UTAMA, "e-on")).status, 200);
      assert.equal((await tandai(MENTOR_KEDUA, "e-on")).status, 200);
      geserSehari();
    }
    assert.equal((await tandai(MENTOR_UTAMA, "e-on")).status, 400);
    assert.equal(db.sesi_kelas.filter((r) => r.enrollment_id === "e-on").length, 10);
    const semua = ditandai("e-on");
    assert.deepEqual(
      semua.map((r) => r.nomor_sesi),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    assert.equal(semua.filter((r) => r.mentor_id === MENTOR_UTAMA).length, 5);
    assert.equal(semua.filter((r) => r.mentor_id === MENTOR_KEDUA).length, 5);
    const terhitung = progres.hitungSesiTerkonfirmasi(semua as unknown as { dikonfirmasi_mentor: boolean; status_siswa: string }[]);
    assert.deepEqual(progres.hitungProgresSesi(terhitung, 10), { persen: 100, selesai: true });
  });

  it("sesi lama tanpa mentor_id tidak error dan tidak memblokir batas harian siapa pun", async () => {
    Object.assign(db.sesi_kelas[0], {
      dikonfirmasi_mentor: true,
      dikonfirmasi_mentor_pada: new Date().toISOString(),
      status_siswa: "dikonfirmasi",
    });
    const res = await tandai(MENTOR_UTAMA, "e-on");
    assert.equal(res.status, 200);
    assert.equal(res.json.nomorSesi, 2);
    const [lama, baru] = ditandai("e-on");
    assert.equal(lama.mentor_id, null);
    assert.equal(baru.mentor_id, MENTOR_UTAMA);
  });
});

describe("tampilan multi-mentor (Kelas Saya Mentor + notifikasi)", () => {
  it("riwayat menampilkan 'Nama Mentor — Mapel'; hitungan & batas harian per mentor", async () => {
    await tandai(MENTOR_UTAMA, "e-on");
    await tandai(MENTOR_KEDUA, "e-on");

    const [utama] = await kelasSayaMentor.getSesiSiswaByKelasId("K-ON", MENTOR_UTAMA, "utama");
    assert.equal(utama.sesiValidCount, 2, "progress total tetap gabungan semua mentor");
    assert.equal(utama.sesiDitandaiSaya, 1);
    assert.equal(utama.ditandaiHariIni, true);
    assert.deepEqual(
      utama.riwayat.map((r) => [r.nomorSesi, r.mentorLabel, r.olehSaya, r.status]),
      [
        [1, "Budi — Penalaran Matematika", true, "menunggu_siswa"],
        [2, "Citra — Literasi B. Inggris", false, "menunggu_siswa"],
      ],
    );
  });

  it("mentor kedua yang belum menandai hari ini tidak ikut terkunci oleh penandaan mentor utama", async () => {
    await tandai(MENTOR_UTAMA, "e-on");
    const [kedua] = await kelasSayaMentor.getSesiSiswaByKelasId("K-ON", MENTOR_KEDUA, "kelas");
    assert.equal(kedua.ditandaiHariIni, false);
    assert.equal(kedua.sesiDitandaiSaya, 0);
  });

  it("sesi lama tanpa mentor_id: tanpa label (null), tidak error", async () => {
    Object.assign(db.sesi_kelas[0], {
      dikonfirmasi_mentor: true,
      dikonfirmasi_mentor_pada: "2026-01-01T00:00:00.000Z",
      status_siswa: "dikonfirmasi",
      dikonfirmasi_siswa_pada: "2026-01-01T01:00:00.000Z",
    });
    const [item] = await kelasSayaMentor.getSesiSiswaByKelasId("K-ON", MENTOR_UTAMA, "utama");
    assert.deepEqual(item.riwayat.map((r) => [r.mentorLabel, r.olehSaya]), [[null, false]]);
    assert.equal(item.sesiDitandaiSaya, 0);
  });

  it("mentor offline cuma melihat siswa yang ditugaskan ke dia", async () => {
    const items = await kelasSayaMentor.getSesiSiswaByKelasId("K-OFF", MENTOR_OFFLINE, "offline");
    assert.deepEqual(items.map((i) => i.enrollmentId), ["e-off"]);
  });

  it("notifikasi ke siswa menyebut mentor + mapel dan konfirmasi otomatis 24 jam", async () => {
    await tandai(MENTOR_KEDUA, "e-on");
    const [notif] = db.notifikasi;
    assert.equal(notif.user_id, "siswa-1");
    assert.match(String(notif.pesan), /\(Citra — Literasi B\. Inggris\)/);
    assert.match(String(notif.pesan), /akan terkonfirmasi otomatis dalam 24 jam jika tidak ada respons/);
  });

  it("kelas tanpa mapel: notifikasi cuma nama mentor, tanpa label kosong", async () => {
    db.kelas.push({ id: "K-KONSUL", nama: "Konsultasi", mentor_id: MENTOR_UTAMA, subtes_id: null, jumlah_sesi: 4 });
    db.kelas_mentor.push({ kelas_id: "K-KONSUL", mentor_id: MENTOR_UTAMA });
    db.enrollments.push({ id: "e-k", user_id: "siswa-1", kelas_id: "K-KONSUL", status_pembayaran: "lunas", mentor_offline_id: null });
    db.sesi_kelas.push(...sesiRows("e-k", 4));
    const res = await tandai(MENTOR_UTAMA, "e-k");
    assert.equal(res.status, 200);
    assert.equal(res.json.namaMapel, null);
    assert.equal(res.json.mentorLabel, "Budi");
    assert.match(String(db.notifikasi[0].pesan), /kelas Konsultasi \(Budi\) ya\./);
  });
});
