/**
 * Test penjaga presensi penerimaan siswa (B1b) — pembantu baca status
 * (lib/mentor/statusPenerimaanSiswa.ts), getAksesMentorEnrollment,
 * POST /api/mentor/sesi, getSesiSiswaByKelasId, dan label mapel — dijalankan
 * terhadap Supabase TIRUAN di memori (tidak pernah menyentuh database asli).
 *
 * Skenario nyata: kelas "Matematika TKA Intensif", subtes Matematika dipegang
 * 3 mentor (A, B, C); Fisika dipegang 1 mentor (D); Kimia dipegang A saja.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

let db: Db;
/** Tabel yang sengaja gagal dibaca (meniru galat database) — untuk uji fail-closed. */
let tabelGagal: Set<string>;
/** Setiap panggilan from() — untuk memastikan jumlah query tidak tumbuh per siswa. */
let logQuery: string[];

type Hasil = { data: Row[] | null; error: { message: string } | null; count: number };

class FakeQuery implements PromiseLike<Hasil> {
  private mutation: Row | null = null;
  private head = false;
  private gagal: boolean;

  constructor(
    private rows: Row[],
    gagal: boolean,
  ) {
    this.gagal = gagal;
  }

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
    if (this.gagal) return Promise.resolve({ data: null, error: { message: "galat tiruan" } });
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  then<A, B>(
    onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    if (this.gagal) return Promise.resolve({ data: null, error: { message: "galat tiruan" }, count: 0 } as Hasil).then(onfulfilled, onrejected);
    if (this.mutation) for (const row of this.rows) Object.assign(row, this.mutation);
    const data = this.head ? null : this.rows;
    return Promise.resolve({ data, error: null, count: this.rows.length } as Hasil).then(onfulfilled, onrejected);
  }
}

function subtesOf(id: unknown) {
  return db.subtes.find((s) => s.id === id) ?? null;
}

function fakeFrom(table: string) {
  db[table] ??= [];
  logQuery.push(table);
  const gagal = tabelGagal.has(table);
  const rows = db[table];
  if (table === "enrollments") {
    return new FakeQuery(
      rows.map((row) => {
        const kelas = db.kelas.find((k) => k.id === row.kelas_id) ?? null;
        return { ...row, kelas: kelas ? { ...kelas, subtes: subtesOf(kelas.subtes_id) } : null, users: db.users.find((u) => u.id === row.user_id) ?? null };
      }),
      gagal,
    );
  }
  if (table === "kelas_subtes_mentor") {
    return new FakeQuery(rows.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) })), gagal);
  }
  if (table === "sesi_kelas") {
    for (const row of rows) row.mentor = db.users.find((u) => u.id === row.mentor_id) ?? null;
  }
  const query = new FakeQuery(rows, gagal);
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      rows.push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const D = "mentor-d"; // satu-satunya pemegang Fisika
const F = "mentor-f"; // ada di kelas_mentor tapi tidak memegang subtes apa pun
const E_PENDING = "mentor-e"; // pemegang Matematika tapi belum aktif

const BARU = "2026-11-16T10:00:00+07:00";
const LAMA = "2026-11-10T10:00:00+07:00";

type AksesModule = typeof import("@/lib/mentor/aksesMentor");
type MapelModule = typeof import("@/lib/mentor/mapelMentor");
type StatusModule = typeof import("@/lib/mentor/statusPenerimaanSiswa");
type SesiRouteModule = typeof import("@/app/api/mentor/sesi/route");
type SessionModule = typeof import("@/lib/auth/session");
type KelasSayaModule = typeof import("@/lib/mentor/getKelasSayaData");
let akses: AksesModule;
let mapel: MapelModule;
let status: StatusModule;
let sesiRoute: SesiRouteModule;
let sessionLib: SessionModule;
let kelasSaya: KelasSayaModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  akses = await import("@/lib/mentor/aksesMentor");
  mapel = await import("@/lib/mentor/mapelMentor");
  status = await import("@/lib/mentor/statusPenerimaanSiswa");
  sesiRoute = await import("@/app/api/mentor/sesi/route");
  sessionLib = await import("@/lib/auth/session");
  kelasSaya = await import("@/lib/mentor/getKelasSayaData");
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

const penerima = (enrollmentSubtesId: string, mentorId: string | null) => {
  const baris = db.enrollment_subtes.find((r) => r.id === enrollmentSubtesId);
  assert.ok(baris);
  baris.mentor_id = mentorId;
  baris.diterima_pada = mentorId ? "2026-11-16T11:00:00+07:00" : null;
};

const ditandai = (enrollmentId: string) => db.sesi_kelas.filter((r) => r.enrollment_id === enrollmentId && r.dikonfirmasi_mentor);

beforeEach(() => {
  tabelGagal = new Set();
  logQuery = [];
  db = {
    subtes: [
      { id: "s-mtk", nama: "Matematika TKA" },
      { id: "s-fis", nama: "Fisika" },
      { id: "s-kim", nama: "Kimia" },
    ],
    kelas: [{ id: "K1", nama: "Matematika TKA Intensif", mentor_id: null, subtes_id: null, jumlah_sesi: 6 }],
    kelas_mentor: [A, B, C, D, F, E_PENDING].map((mentor_id) => ({ kelas_id: "K1", mentor_id })),
    kelas_subtes_mentor: [
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: A },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: B },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: C },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: E_PENDING },
      { kelas_id: "K1", subtes_id: "s-fis", mentor_id: D },
      { kelas_id: "K1", subtes_id: "s-kim", mentor_id: A },
    ],
    enrollments: [
      { id: "e-baru", user_id: "siswa-1", kelas_id: "K1", status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: BARU },
      { id: "e-lama", user_id: "siswa-2", kelas_id: "K1", status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: LAMA },
      { id: "e-fis", user_id: "siswa-3", kelas_id: "K1", status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: BARU },
      { id: "e-campur", user_id: "siswa-4", kelas_id: "K1", status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: BARU },
    ],
    enrollment_subtes: [
      { id: "es-baru-mtk", enrollment_id: "e-baru", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-lama-mtk", enrollment_id: "e-lama", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-fis-fis", enrollment_id: "e-fis", subtes_id: "s-fis", mentor_id: null, diterima_pada: null },
      { id: "es-campur-mtk", enrollment_id: "e-campur", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null },
      { id: "es-campur-kim", enrollment_id: "e-campur", subtes_id: "s-kim", mentor_id: null, diterima_pada: null },
    ],
    user_roles: [A, B, C, D, F].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })).concat([{ user_id: E_PENDING, role_type: "mentor", status: "pending" }]),
    users: [
      { id: A, nama: "Mentor A" },
      { id: B, nama: "Mentor B" },
      { id: C, nama: "Mentor C" },
      { id: D, nama: "Mentor D" },
      { id: "siswa-1", nama: "Siswa Satu", avatar_url: null },
      { id: "siswa-2", nama: "Siswa Dua", avatar_url: null },
      { id: "siswa-3", nama: "Siswa Tiga", avatar_url: null },
      { id: "siswa-4", nama: "Siswa Empat", avatar_url: null },
    ],
    sesi_kelas: ["e-baru", "e-lama", "e-fis", "e-campur"].flatMap((id) => sesiRows(id, 6)),
    notifikasi: [],
  };
});

describe("getPenerimaanSubtesSiswa (pembantu baca)", () => {
  it("status per subtes: Matematika 3 pemegang aktif -> menunggu; Fisika 1 pemegang -> tidak_perlu_klaim", async () => {
    const hasil = await status.getPenerimaanSubtesSiswa(A, ["e-baru", "e-fis"]);
    assert.notEqual(hasil, "gagal");
    if (hasil === "gagal") return;
    const baru = hasil.get("e-baru")!;
    assert.equal(baru.length, 1);
    assert.equal(baru[0].status, "menunggu");
    assert.equal(baru[0].mentorMemegang, true);
    assert.equal(baru[0].subtesNama, "Matematika TKA");
    assert.equal(baru[0].enrollmentSubtesId, "es-baru-mtk");
    assert.equal(hasil.get("e-fis")![0].status, "tidak_perlu_klaim");
    assert.equal(hasil.get("e-fis")![0].mentorMemegang, false); // A bukan pemegang Fisika
  });

  it("mentor pending tidak dihitung sebagai pemegang aktif (3 aktif tetap menunggu; dan dia tidak 'memegang')", async () => {
    const hasil = await status.getPenerimaanSubtesSiswa(E_PENDING, ["e-baru"]);
    assert.notEqual(hasil, "gagal");
    if (hasil === "gagal") return;
    assert.equal(hasil.get("e-baru")![0].mentorMemegang, false);
  });

  it("BANYAK enrollment sekaligus memakai maks. 4 query (bukan per siswa)", async () => {
    const hasil = await status.getPenerimaanSubtesSiswa(A, ["e-baru", "e-lama", "e-fis", "e-campur"]);
    assert.notEqual(hasil, "gagal");
    assert.ok(logQuery.length <= 4, `query: ${logQuery.join(",")}`);
    assert.deepEqual([...logQuery].sort(), ["enrollment_subtes", "enrollments", "kelas_subtes_mentor", "user_roles"]);
  });

  it("enrollment tanpa pilihan subtes -> daftar kosong, hanya 2 query", async () => {
    db.enrollment_subtes = [];
    const hasil = await status.getPenerimaanSubtesSiswa(A, ["e-baru"]);
    assert.notEqual(hasil, "gagal");
    if (hasil !== "gagal") assert.deepEqual(hasil.get("e-baru"), []);
    assert.equal(logQuery.length, 2);
  });

  it("galat di tabel mana pun -> 'gagal'", async () => {
    for (const tabel of ["enrollments", "enrollment_subtes", "kelas_subtes_mentor", "user_roles"]) {
      tabelGagal = new Set([tabel]);
      const origError = console.error;
      console.error = () => {};
      try {
        assert.equal(await status.getPenerimaanSubtesSiswa(A, ["e-baru"]), "gagal", tabel);
      } finally {
        console.error = origError;
      }
    }
  });
});

describe("getAksesMentorEnrollment — penjaga penerimaan", () => {
  async function penerimaanDari(mentorId: string, enrollmentId: string) {
    const res = await akses.getAksesMentorEnrollment(mentorId, enrollmentId);
    assert.ok(res && res !== "gagal");
    return res.penerimaan;
  }

  it("subtes multi-mentor belum diterima -> diblokir 'menunggu_penerimaan'", async () => {
    assert.deepEqual(await penerimaanDari(A, "e-baru"), { boleh: false, alasan: "menunggu_penerimaan" });
  });

  it("mentor PENERIMA boleh", async () => {
    penerima("es-baru-mtk", A);
    assert.deepEqual(await penerimaanDari(A, "e-baru"), { boleh: true });
  });

  it("bukan penerima (sudah diterima mentor lain) -> diblokir 'diterima_mentor_lain'", async () => {
    penerima("es-baru-mtk", A);
    assert.deepEqual(await penerimaanDari(B, "e-baru"), { boleh: false, alasan: "diterima_mentor_lain" });
  });

  it("subtes 1 mentor boleh langsung (tanpa klaim)", async () => {
    assert.deepEqual(await penerimaanDari(D, "e-fis"), { boleh: true });
  });

  it("siswa LAMA (sebelum 15 Nov) boleh seperti dulu, semua pemegang", async () => {
    for (const mentor of [A, B, C]) assert.deepEqual(await penerimaanDari(mentor, "e-lama"), { boleh: true }, mentor);
  });

  it("pemilik dinonaktifkan -> siswa menunggu lagi untuk pemegang lain", async () => {
    penerima("es-baru-mtk", C);
    db.user_roles.find((r) => r.user_id === C)!.status = "pending";
    assert.deepEqual(await penerimaanDari(A, "e-baru"), { boleh: false, alasan: "menunggu_penerimaan" });
  });

  it("mentor yang tidak memegang subtes siswa sama sekali -> perilaku lama (boleh)", async () => {
    assert.deepEqual(await penerimaanDari(F, "e-baru"), { boleh: true });
  });

  it("data gagal dibaca -> DITOLAK (fail-closed, alasan data_gagal)", async () => {
    tabelGagal = new Set(["enrollment_subtes"]);
    const origError = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await penerimaanDari(A, "e-baru"), { boleh: false, alasan: "data_gagal" });
    } finally {
      console.error = origError;
    }
  });

  it("enrollment tidak ada / mentor tidak terkait tetap null (perilaku lama)", async () => {
    assert.equal(await akses.getAksesMentorEnrollment(A, "tidak-ada"), null);
  });
});

describe("POST /api/mentor/sesi — penjaga penerimaan", () => {
  it("mentor NON-penerima tidak bisa menandai sesi siswa multi-mentor: 403, sesi tidak berubah", async () => {
    const res = await tandai(A, "e-baru");
    assert.equal(res.status, 403);
    assert.match(String(res.json.error), /belum kamu terima/);
    assert.equal(ditandai("e-baru").length, 0);
  });

  it("setelah diterima, penerima boleh (200) dan mapel = subtes yang diterima", async () => {
    penerima("es-baru-mtk", A);
    const res = await tandai(A, "e-baru");
    assert.equal(res.status, 200);
    assert.equal(res.json.namaMapel, "Matematika TKA");
    assert.equal(ditandai("e-baru")[0].mentor_id, A);
  });

  it("mentor lain diblokir 403 walau siswa sudah diterima mentor lain; pesan membedakan", async () => {
    penerima("es-baru-mtk", A);
    const res = await tandai(B, "e-baru");
    assert.equal(res.status, 403);
    assert.match(String(res.json.error), /sudah diterima mentor lain/);
    assert.equal(ditandai("e-baru").length, 0);
  });

  it("subtes 1 mentor: pemegangnya langsung boleh (200)", async () => {
    assert.equal((await tandai(D, "e-fis")).status, 200);
  });

  it("siswa lama: semua pemegang boleh (200) seperti dulu", async () => {
    assert.equal((await tandai(B, "e-lama")).status, 200);
  });

  it("data gagal dibaca -> 503 'Coba lagi sebentar.' dan sesi tidak berubah (fail-closed)", async () => {
    tabelGagal = new Set(["kelas_subtes_mentor"]);
    const origError = console.error;
    console.error = () => {};
    try {
      const res = await tandai(A, "e-baru");
      assert.equal(res.status, 503);
      assert.equal(res.json.error, "Coba lagi sebentar.");
      assert.equal(ditandai("e-baru").length, 0);
    } finally {
      console.error = origError;
    }
  });

  it("mentor yang tidak terkait kelas tetap 403 dengan pesan lama", async () => {
    db.user_roles.push({ user_id: "mentor-asing", role_type: "mentor", status: "active" });
    const res = await tandai("mentor-asing", "e-baru");
    assert.equal(res.status, 403);
    assert.match(String(res.json.error), /bukan bagian dari kelas yang kamu ampu/);
  });
});

describe("label mapel (tentukanNamaMapel) untuk subtes multi-mentor", () => {
  const pasangan = [
    { mentorId: A, subtesId: "s-mtk", subtesNama: "Matematika TKA" },
    { mentorId: A, subtesId: "s-kim", subtesNama: "Kimia" },
    { mentorId: B, subtesId: "s-mtk", subtesNama: "Matematika TKA" },
  ];
  const dasar = { mentorId: A, pasanganKelas: pasangan, subtesSiswaIds: ["s-mtk", "s-kim"], subtesKelasNama: null };

  it("tanpa data penerimaan: perilaku lama (semua subtes pilihan siswa yang dipegang)", () => {
    assert.equal(mapel.tentukanNamaMapel(dasar), "Kimia, Matematika TKA");
  });

  it("Matematika multi-mentor BELUM diterima A -> label dipersempit ke Kimia", () => {
    const label = mapel.tentukanNamaMapel({
      ...dasar,
      penerimaanSubtes: [
        { subtesId: "s-mtk", status: "menunggu", mentorIdPenerima: null },
        { subtesId: "s-kim", status: "tidak_perlu_klaim", mentorIdPenerima: null },
      ],
    });
    assert.equal(label, "Kimia");
  });

  it("Matematika diterima A -> label memuat Matematika dan Kimia", () => {
    const label = mapel.tentukanNamaMapel({
      ...dasar,
      penerimaanSubtes: [
        { subtesId: "s-mtk", status: "diterima", mentorIdPenerima: A },
        { subtesId: "s-kim", status: "tidak_perlu_klaim", mentorIdPenerima: null },
      ],
    });
    assert.equal(label, "Kimia, Matematika TKA");
  });

  it("Matematika diterima mentor LAIN -> dikeluarkan dari label A", () => {
    const label = mapel.tentukanNamaMapel({
      ...dasar,
      penerimaanSubtes: [
        { subtesId: "s-mtk", status: "diterima", mentorIdPenerima: B },
        { subtesId: "s-kim", status: "tidak_perlu_klaim", mentorIdPenerima: null },
      ],
    });
    assert.equal(label, "Kimia");
  });

  it("lewat route: siswa pilih Matematika+Kimia; A belum menerima Matematika -> boleh lewat Kimia, mapel 'Kimia'", async () => {
    const res = await tandai(A, "e-campur");
    assert.equal(res.status, 200);
    assert.equal(res.json.namaMapel, "Kimia");
  });

  it("lewat route: A menerima Matematika -> mapel 'Kimia, Matematika TKA'", async () => {
    penerima("es-campur-mtk", A);
    const res = await tandai(A, "e-campur");
    assert.equal(res.status, 200);
    assert.equal(res.json.namaMapel, "Kimia, Matematika TKA");
  });
});

describe("getSesiSiswaByKelasId — penanda diblokir & daftar 'Menunggu diterima'", () => {
  it("A: siswa baru Matematika diblokir menunggu; siswa lama dan Fisika tidak; daftar Menunggu memuat subtes yang bisa diterima", async () => {
    const items = await kelasSaya.getSesiSiswaByKelasId("K1", A, "kelas");
    const byId = new Map(items.map((i) => [i.enrollmentId, i]));
    assert.equal(byId.get("e-baru")!.diblokirPenerimaan, "menunggu_penerimaan");
    assert.equal(byId.get("e-lama")!.diblokirPenerimaan, null);
    assert.equal(byId.get("e-fis")!.diblokirPenerimaan, null);
    // e-campur: Kimia 1 pemegang (boleh), Matematika menunggu
    assert.equal(byId.get("e-campur")!.diblokirPenerimaan, null);
    const daftar = kelasSaya.daftarMenungguDiterima(items);
    assert.deepEqual(
      daftar.map((d) => [d.siswaNama, d.subtesNama, d.enrollmentSubtesId]),
      [
        ["Siswa Empat", "Matematika TKA", "es-campur-mtk"],
        ["Siswa Satu", "Matematika TKA", "es-baru-mtk"],
      ],
    );
  });

  it("setelah A menerima: A tidak diblokir dan daftar berkurang; B diblokir 'diterima_mentor_lain' tanpa daftar", async () => {
    penerima("es-baru-mtk", A);
    const itemsA = await kelasSaya.getSesiSiswaByKelasId("K1", A, "kelas");
    assert.equal(itemsA.find((i) => i.enrollmentId === "e-baru")!.diblokirPenerimaan, null);
    assert.deepEqual(kelasSaya.daftarMenungguDiterima(itemsA).map((d) => d.enrollmentSubtesId), ["es-campur-mtk"]);

    const itemsB = await kelasSaya.getSesiSiswaByKelasId("K1", B, "kelas");
    assert.equal(itemsB.find((i) => i.enrollmentId === "e-baru")!.diblokirPenerimaan, "diterima_mentor_lain");
    assert.deepEqual(kelasSaya.daftarMenungguDiterima(itemsB).map((d) => d.enrollmentSubtesId), ["es-campur-mtk"]);
  });

  it("D (Fisika saja): tidak ada yang diblokir dan daftar kosong", async () => {
    const items = await kelasSaya.getSesiSiswaByKelasId("K1", D, "kelas");
    assert.ok(items.every((i) => i.diblokirPenerimaan === null));
    assert.deepEqual(kelasSaya.daftarMenungguDiterima(items), []);
  });

  it("data gagal dibaca: SEMUA siswa diblokir (data_gagal) dan daftar kosong (fail-closed)", async () => {
    tabelGagal = new Set(["user_roles"]);
    const origError = console.error;
    console.error = () => {};
    try {
      const items = await kelasSaya.getSesiSiswaByKelasId("K1", A, "kelas");
      assert.equal(items.length, 4);
      assert.ok(items.every((i) => i.diblokirPenerimaan === "data_gagal"));
      assert.deepEqual(kelasSaya.daftarMenungguDiterima(items), []);
    } finally {
      console.error = origError;
    }
  });

  it("jumlah query penerimaan tetap <= 4 untuk banyak siswa (bukan per siswa)", async () => {
    await kelasSaya.getSesiSiswaByKelasId("K1", A, "kelas");
    const penerimaanQuery = logQuery.filter((t) => t === "enrollment_subtes" || t === "kelas_subtes_mentor" || t === "user_roles");
    assert.equal(penerimaanQuery.length, 3);
  });
});
