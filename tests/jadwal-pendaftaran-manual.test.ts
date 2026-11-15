/**
 * Test Admin memilih JADWAL saat mendaftarkan siswa manual (PRD 7.5.8 + 7.5.10).
 * app/api/admin/enrollment-manual dijalankan terhadap Supabase TIRUAN di memori (tidak pernah menyentuh
 * database asli). Yang diuji:
 *  - jadwal valid disimpan ke enrollments.jadwal_ditetapkan (langkah kedua, setelah RPC daftar_siswa_manual);
 *  - slot yang tidak ada di kelas.jadwal / kelas tanpa pilihan jadwal / format salah ditolak SEBELUM mendaftar;
 *  - slot penuh TETAP diterima (respons membawa slotPenuh);
 *  - tanpa jadwal = perilaku lama; langkah kedua gagal = siswa terdaftar + pesan jelas;
 *  - siswa manual dengan jadwal ikut menahan slot di hitungSlotTerisi / hitungKetersediaanKelas;
 *  - route "Tetapkan jadwal" memakai fungsi validasi yang SAMA;
 *  - opsi dropdown form (getPendaftarKelas.opsiJadwal) mengikuti kondisi "Tetapkan jadwal".
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { slotEfektif } from "@/lib/shared/slotTerisi";
import { validateJadwalDitetapkan } from "@/lib/shared/jadwalPilihan";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null; count?: number };

let db: Db;
let rpcCalls: string[];
/** Tabel+operasi yang dipaksa galat, mis. "enrollments:update". */
let gagal: Set<string>;
let tidakAdaBaris: Set<string>;
let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${++idCounter}`;

const userOf = (id: unknown) => db.users.find((u) => u.id === id) ?? null;
const subtesOf = (id: unknown) => db.subtes.find((s) => s.id === id) ?? null;

class FakeQuery implements PromiseLike<Hasil> {
  private mutation: Row | null = null;
  private head = false;
  private single = false;
  private filters: Array<(row: Row) => boolean> = [];

  constructor(
    private table: string,
    private rows: Row[],
  ) {}

  select(_columns?: string, options?: { head?: boolean }) {
    if (options?.head) this.head = true;
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
  gt(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === "string" && Date.parse(row[column] as string) > Date.parse(value));
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
    this.single = true;
    return this;
  }
  then<A, B>(onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private run(): Hasil {
    if (this.mutation && gagal.has(`${this.table}:update`)) return { data: null, error: { message: "galat tiruan" } };
    if (!this.mutation && gagal.has(`${this.table}:select`)) return { data: null, error: { message: "galat tiruan" } };
    const cocok = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.mutation) {
      // Baris asli (bukan tampilan ber-embed) dimutasi lewat id.
      const asli = db[this.table];
      if (!tidakAdaBaris.has(`${this.table}:update`)) {
        for (const row of cocok) Object.assign(asli.find((r) => r.id === row.id) ?? row, this.mutation);
      } else {
        cocok.length = 0;
      }
    }
    return {
      data: this.head ? null : this.single ? (cocok[0] ?? null) : cocok,
      error: null,
      count: cocok.length,
    };
  }
}

function fakeFrom(table: string) {
  db[table] ??= [];
  const rows = db[table];
  let view: Row[] = rows;
  if (table === "enrollments") {
    view = rows.map((row) => ({
      ...row,
      users: userOf(row.user_id),
      mentor_offline: userOf(row.mentor_offline_id),
      link_meet_pengisi: userOf(row.link_meet_oleh),
    }));
  } else if (table === "kelas_subtes" || table === "kelas") {
    view = rows.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) }));
  } else if (table === "kelas_subtes_mentor" || table === "kelas_mentor") {
    view = rows.map((row) => ({ ...row, users: userOf(row.mentor_id), subtes: subtesOf(row.subtes_id) }));
  }
  const query = new FakeQuery(table, view);
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      if (gagal.has(`${table}:insert`)) return Promise.resolve({ data: null, error: { message: "galat tiruan" } });
      rows.push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

/** Tiruan fungsi DB daftar_siswa_manual (yang relevan: duplikat, kapasitas manual, buat enrollment lunas). */
function fakeRpc(name: string, p: Row) {
  rpcCalls.push(name);
  if (name !== "daftar_siswa_manual") throw new Error(`rpc tiruan tidak dikenal: ${name}`);
  if (p.p_request_id) {
    const log = db.enrollment_manual_log.find((l) => l.request_id === p.p_request_id);
    if (log) return Promise.resolve({ data: { status: "sudah_diproses", enrollment_id: log.enrollment_id }, error: null });
  }
  const kelas = db.kelas.find((k) => k.id === p.p_kelas_id);
  if (!kelas) return Promise.resolve({ data: { status: "kelas_tidak_ada" }, error: null });
  if (db.enrollments.some((e) => e.user_id === p.p_siswa_id && e.kelas_id === p.p_kelas_id)) {
    return Promise.resolve({ data: { status: "duplikat" }, error: null });
  }
  const terisi = db.enrollments.filter((e) => e.kelas_id === p.p_kelas_id && e.status_pembayaran === "lunas").length;
  if (typeof kelas.kapasitas === "number" && terisi >= kelas.kapasitas) {
    return Promise.resolve({ data: { status: "penuh" }, error: null });
  }
  // Seperti fungsi SQL asli: jadwal_ditetapkan TIDAK diisi di sini (selalu NULL).
  const enrollment = {
    id: newId("enr"),
    user_id: p.p_siswa_id,
    kelas_id: p.p_kelas_id,
    status_pembayaran: "lunas",
    sumber: "manual",
    jadwal_pilihan: null,
    jadwal_ditetapkan: null,
    jadwal_ditetapkan_at: null,
    tanggal_daftar: "2026-11-01T00:00:00Z",
  };
  db.enrollments.push(enrollment);
  db.enrollment_manual_log.push({ id: newId("log"), enrollment_id: enrollment.id, kelas_id: p.p_kelas_id, siswa_id: p.p_siswa_id, request_id: p.p_request_id });
  return Promise.resolve({ data: { status: "dibuat", enrollment_id: enrollment.id, jumlah_sesi: kelas.jumlah_sesi }, error: null });
}

const ADMIN = "admin-1";
const SISWA = "siswa-1";
const SISWA_2 = "siswa-2";
const SISWA_3 = "siswa-3";
const MENTOR_A = "mentor-a";
const SEN = { hari: "Senin", jam_mulai: "19:00" };
const SEL = { hari: "Selasa", jam_mulai: "19:00" };
const RAB = { hari: "Rabu", jam_mulai: "19:00" };
const ALASAN = "Sudah transfer ke BCA tanggal 12 Oktober";

type RouteModule = typeof import("@/app/api/admin/enrollment-manual/route");
type TetapkanModule = typeof import("@/app/api/kelola-kelas/[kelasId]/pendaftar/[enrollmentId]/jadwal/route");
type SessionModule = typeof import("@/lib/auth/session");
type ReaderModule = typeof import("@/lib/jadwal/slotTerisi");
type PendaftarModule = typeof import("@/lib/admin/getPendaftarKelas");
let route: RouteModule;
let tetapkanRoute: TetapkanModule;
let sessionLib: SessionModule;
let reader: ReaderModule;
let pendaftarLib: PendaftarModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  delete process.env.RESEND_API_KEY;
  const { supabaseServer } = await import("@/lib/supabase/server");
  Object.assign(supabaseServer as unknown as Record<string, unknown>, { from: fakeFrom, rpc: fakeRpc });
  route = await import("@/app/api/admin/enrollment-manual/route");
  tetapkanRoute = await import("@/app/api/kelola-kelas/[kelasId]/pendaftar/[enrollmentId]/jadwal/route");
  sessionLib = await import("@/lib/auth/session");
  reader = await import("@/lib/jadwal/slotTerisi");
  pendaftarLib = await import("@/lib/admin/getPendaftarKelas");
});

beforeEach(() => {
  idCounter = 0;
  rpcCalls = [];
  gagal = new Set();
  tidakAdaBaris = new Set();
  db = {
    users: [
      { id: ADMIN, nama: "Admin", email: "admin@x.id" },
      { id: SISWA, nama: "Siswa Satu", email: "s1@x.id" },
      { id: SISWA_2, nama: "Siswa Dua", email: "s2@x.id" },
      { id: SISWA_3, nama: "Siswa Tiga", email: "s3@x.id" },
      { id: MENTOR_A, nama: "Mentor A", email: "ma@x.id" },
    ],
    user_roles: [
      { user_id: ADMIN, role_type: "admin", status: "active" },
      { user_id: SISWA, role_type: "student", status: "active" },
      { user_id: SISWA_2, role_type: "student", status: "active" },
      { user_id: SISWA_3, role_type: "student", status: "active" },
      { user_id: MENTOR_A, role_type: "mentor", status: "active" },
    ],
    subtes: [{ id: "s-mtk", nama: "Penalaran Matematika", mapel_dasar: "matematika" }],
    kelas: [
      // Private online + saklar + 1 subtes + 1 mentor aktif => kapasitas SATU slot = 1 (memakai aturan slot)
      { id: "K-PRIV", nama: "Privat MTK", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: [SEN, SEL], kapasitas: null, jumlah_sesi: 4, subtes_id: "s-mtk" },
      // Saklar mati: kelas tidak memakai pilihan jadwal
      { id: "K-MATI", nama: "Privat Saklar Mati", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: false, jadwal: [SEN, SEL], kapasitas: null, jumlah_sesi: 4, subtes_id: "s-mtk" },
      // Grup: saklar menyala tetapi bukan aturan slot (tidak ada penanda penuh)
      { id: "K-GRUP", nama: "Grup MTK", tipe_kelas: "grouping", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: [SEN, SEL], kapasitas: 5, jumlah_sesi: 4, subtes_id: "s-mtk" },
      // Saklar menyala tapi tanpa slot
      { id: "K-KOSONG", nama: "Privat Tanpa Slot", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: null, kapasitas: null, jumlah_sesi: 4, subtes_id: "s-mtk" },
    ],
    kelas_subtes: [
      { kelas_id: "K-PRIV", subtes_id: "s-mtk" },
      { kelas_id: "K-MATI", subtes_id: "s-mtk" },
      { kelas_id: "K-GRUP", subtes_id: "s-mtk" },
      { kelas_id: "K-KOSONG", subtes_id: "s-mtk" },
    ],
    kelas_mentor: [{ kelas_id: "K-PRIV", mentor_id: MENTOR_A }],
    kelas_subtes_mentor: [
      { kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id: MENTOR_A },
      { kelas_id: "K-GRUP", subtes_id: "s-mtk", mentor_id: MENTOR_A },
    ],
    enrollments: [],
    enrollment_subtes: [],
    enrollment_manual_log: [],
    notifikasi: [],
    payments: [],
  };
});

function request(url: string, body: unknown, userId = ADMIN, role: "admin" | "student" = "admin") {
  const token = sessionLib.createSessionToken({ userId, role });
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify(body),
  });
}

async function daftar(body: Record<string, unknown>) {
  const res = await route.POST(
    request("http://localhost/api/admin/enrollment-manual", { metodePembayaran: "transfer", alasan: ALASAN, ...body }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function tetapkan(kelasId: string, enrollmentId: string, slot: unknown) {
  const res = await tetapkanRoute.POST(request("http://localhost/api/x", { slot }), {
    params: Promise.resolve({ kelasId, enrollmentId }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const enrollmentSiswa = (userId: string, kelasId: string) => db.enrollments.find((e) => e.user_id === userId && e.kelas_id === kelasId);
const notifJadwal = () => db.notifikasi.filter((n) => n.judul === "Jadwal kelas kamu sudah ditetapkan");

/** Siswa LUNAS (checkout) yang sudah menempati slot. */
function lunasDiSlot(userId: string, kelasId: string, slot: Row) {
  db.enrollments.push({
    id: newId("enr-lama"),
    user_id: userId,
    kelas_id: kelasId,
    status_pembayaran: "lunas",
    sumber: "checkout",
    jadwal_pilihan: [slot],
    jadwal_ditetapkan: null,
    tanggal_daftar: "2026-10-01T00:00:00Z",
  });
}

describe("pendaftaran manual + jadwal", () => {
  it("jadwal valid: enrollment dibuat lalu jadwal_ditetapkan terisi (salinan dari kelas.jadwal) + notifikasi jadwal", async () => {
    const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: SEL });
    assert.equal(status, 201);
    assert.equal(json.success, true);
    assert.deepEqual(json.jadwalDitetapkan, SEL);
    assert.equal(json.slotPenuh, false);
    assert.equal(json.jadwalGagal, undefined);
    const e = enrollmentSiswa(SISWA, "K-PRIV");
    assert.ok(e);
    assert.deepEqual(e.jadwal_ditetapkan, SEL);
    assert.equal(typeof e.jadwal_ditetapkan_at, "string");
    assert.equal(e.status_pembayaran, "lunas");
    assert.equal(notifJadwal().length, 1);
    assert.equal(notifJadwal()[0].user_id, SISWA);
  });

  it("objek jadwal dari client tidak disimpan mentah (kolom ekstra dibuang)", async () => {
    const { status } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: { ...SEN, sisipan: "x" } });
    assert.equal(status, 201);
    assert.deepEqual(enrollmentSiswa(SISWA, "K-PRIV")?.jadwal_ditetapkan, SEN);
  });

  it("slot yang TIDAK ada di kelas.jadwal ditolak 400 — siswa tidak didaftarkan, RPC tidak dipanggil", async () => {
    const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: RAB });
    assert.equal(status, 400);
    assert.equal(json.success, false);
    assert.equal(json.error, "Jadwal yang dipilih tidak ada di kelas ini.");
    assert.equal(enrollmentSiswa(SISWA, "K-PRIV"), undefined);
    assert.deepEqual(rpcCalls, []);
  });

  it("kelas yang tidak memakai pilihan jadwal (saklar mati) menolak jadwal 409 — tanpa mendaftarkan", async () => {
    const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-MATI", jadwal: SEN });
    assert.equal(status, 409);
    assert.equal(json.error, "Kelas ini tidak memakai pilihan jadwal oleh siswa.");
    assert.equal(enrollmentSiswa(SISWA, "K-MATI"), undefined);
    assert.deepEqual(rpcCalls, []);
  });

  it("format jadwal salah (bukan {hari, jam_mulai}) ditolak 400", async () => {
    for (const jadwal of ["Senin 19:00", { hari: "Senin" }, 5, []]) {
      const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal });
      assert.equal(status, 400, JSON.stringify(jadwal));
      assert.equal(json.error, "Jadwal tidak valid.");
    }
    assert.deepEqual(rpcCalls, []);
  });

  it("slot PENUH tetap diterima (Admin boleh menimpa) dan respons membawa slotPenuh = true", async () => {
    lunasDiSlot(SISWA_2, "K-PRIV", SEN); // 1 mentor => kapasitas slot 1 => Senin penuh
    const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: SEN });
    assert.equal(status, 201);
    assert.equal(json.success, true);
    assert.equal(json.slotPenuh, true);
    assert.deepEqual(enrollmentSiswa(SISWA, "K-PRIV")?.jadwal_ditetapkan, SEN);
  });

  it("slot lain yang masih kosong: slotPenuh = false walau slot lain penuh", async () => {
    lunasDiSlot(SISWA_2, "K-PRIV", SEN);
    const { json } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: SEL });
    assert.equal(json.slotPenuh, false);
  });

  it("kelas non-slot (grup) menerima jadwal tanpa penanda penuh", async () => {
    const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-GRUP", jadwal: SEN });
    assert.equal(status, 201);
    assert.equal(json.slotPenuh, false);
    assert.deepEqual(enrollmentSiswa(SISWA, "K-GRUP")?.jadwal_ditetapkan, SEN);
  });

  it("TANPA jadwal = perilaku lama: tidak ada pembaruan jadwal, tidak ada notifikasi jadwal, respons tanpa kunci jadwal", async () => {
    for (const [i, jadwal] of [undefined, null, ""].entries()) {
      const siswaId = [SISWA, SISWA_2, SISWA_3][i];
      const { status, json } = await daftar({ siswaId, kelasId: "K-PRIV", ...(jadwal === undefined ? {} : { jadwal }) });
      assert.equal(status, 201);
      assert.deepEqual(Object.keys(json).sort(), ["enrollmentId", "jumlahSesi", "success"]);
      assert.equal(enrollmentSiswa(siswaId, "K-PRIV")?.jadwal_ditetapkan, null);
    }
    assert.equal(notifJadwal().length, 0);
  });

  it("langkah kedua GAGAL (galat DB): siswa tetap terdaftar + pesan jelas + tanpa notifikasi jadwal", async () => {
    gagal.add("enrollments:update");
    const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: SEN });
    assert.equal(status, 201);
    assert.equal(json.success, true);
    assert.equal(json.jadwalGagal, true);
    assert.equal(json.pesan, "Siswa terdaftar, tetapi jadwal gagal ditetapkan. Tetapkan lewat halaman Pendaftar.");
    assert.equal(json.jadwalDitetapkan, undefined);
    const e = enrollmentSiswa(SISWA, "K-PRIV");
    assert.ok(e, "siswa tidak boleh dihapus");
    assert.equal(e.status_pembayaran, "lunas");
    assert.equal(e.jadwal_ditetapkan, null);
    assert.equal(notifJadwal().length, 0);
    // notifikasi pendaftaran biasa tetap terkirim
    assert.equal(db.notifikasi.filter((n) => n.judul === "Kamu sudah terdaftar di kelas baru").length, 1);
  });

  it("langkah kedua GAGAL (tidak ada baris yang diperbarui): sama — terdaftar + pesan jelas", async () => {
    tidakAdaBaris.add("enrollments:update");
    const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: SEN });
    assert.equal(status, 201);
    assert.equal(json.jadwalGagal, true);
    assert.equal(json.pesan, "Siswa terdaftar, tetapi jadwal gagal ditetapkan. Tetapkan lewat halaman Pendaftar.");
    assert.ok(enrollmentSiswa(SISWA, "K-PRIV"));
  });

  it("galat membaca ketersediaan slot TIDAK menggagalkan pendaftaran (peringatan hanya info tambahan)", async () => {
    gagal.add("kelas_subtes:select");
    const { status, json } = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: SEN });
    assert.equal(status, 201);
    assert.equal(json.slotPenuh, false);
    assert.deepEqual(enrollmentSiswa(SISWA, "K-PRIV")?.jadwal_ditetapkan, SEN);
  });
});

describe("siswa manual dengan jadwal menahan slot", () => {
  it("slotEfektif memakai jadwal_ditetapkan siswa manual (jadwal_pilihan-nya NULL)", () => {
    assert.deepEqual(slotEfektif({ jadwalDitetapkan: SEN, jadwalPilihan: null }), SEN);
  });

  it("hitungKetersediaanKelas: setelah daftar manual di Senin, Senin terisi 1 dari 1 (penuh) dan badge kelas berubah", async () => {
    const sebelum = (await reader.hitungKetersediaanKelas([reader.normalisasiKelas(db.kelas[0])]))?.get("K-PRIV");
    assert.ok(sebelum);
    assert.equal(sebelum.kapasitas.terisi, 0);
    assert.equal(sebelum.kapasitas.kapasitas, 2); // 2 slot x 1 mentor
    assert.deepEqual(sebelum.slot.map((s) => [s.slot.hari, s.terisi, s.penuh]), [["Senin", 0, false], ["Selasa", 0, false]]);

    await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: SEN });

    const sesudah = (await reader.hitungKetersediaanKelas([reader.normalisasiKelas(db.kelas[0])]))?.get("K-PRIV");
    assert.ok(sesudah);
    assert.equal(sesudah.kapasitas.terisi, 1);
    assert.equal(sesudah.kapasitas.sisa, 1);
    assert.deepEqual(sesudah.slot.map((s) => [s.slot.hari, s.terisi, s.penuh]), [["Senin", 1, true], ["Selasa", 0, false]]);
  });

  it("siswa manual TANPA jadwal tidak menahan slot mana pun (tetap dihitung di kapasitas kelas)", async () => {
    await daftar({ siswaId: SISWA, kelasId: "K-PRIV" });
    const hasil = (await reader.hitungKetersediaanKelas([reader.normalisasiKelas(db.kelas[0])]))?.get("K-PRIV");
    assert.ok(hasil);
    assert.ok(hasil.slot.every((s) => s.terisi === 0));
    assert.equal(hasil.kapasitas.terisi, 1);
  });

  it("pendaftaran manual kedua di slot yang sama sudah ditandai penuh", async () => {
    const pertama = await daftar({ siswaId: SISWA, kelasId: "K-PRIV", jadwal: SEN });
    assert.equal(pertama.json.slotPenuh, false);
    const kedua = await daftar({ siswaId: SISWA_2, kelasId: "K-PRIV", jadwal: SEN });
    assert.equal(kedua.status, 201);
    assert.equal(kedua.json.slotPenuh, true);
  });
});

describe("route Tetapkan jadwal memakai validasi yang sama", () => {
  it("slot di luar kelas.jadwal -> pesan & status sama dengan pendaftaran manual", async () => {
    await daftar({ siswaId: SISWA, kelasId: "K-PRIV" });
    const e = enrollmentSiswa(SISWA, "K-PRIV");
    assert.ok(e);
    const hasilTetapkan = await tetapkan("K-PRIV", e.id as string, RAB);
    const hasilManual = await daftar({ siswaId: SISWA_2, kelasId: "K-PRIV", jadwal: RAB });
    assert.equal(hasilTetapkan.status, 400);
    assert.equal(hasilTetapkan.status, hasilManual.status);
    assert.equal(hasilTetapkan.json.error, hasilManual.json.error);
  });

  it("kelas saklar mati -> 409 sama; slot valid tetap menetapkan lewat route lama", async () => {
    const hasilMati = await tetapkan("K-MATI", "apa-saja", SEN);
    assert.equal(hasilMati.status, 409);
    assert.equal(hasilMati.json.error, "Kelas ini tidak memakai pilihan jadwal oleh siswa.");

    await daftar({ siswaId: SISWA, kelasId: "K-PRIV" });
    const e = enrollmentSiswa(SISWA, "K-PRIV");
    assert.ok(e);
    const ok = await tetapkan("K-PRIV", e.id as string, SEL);
    assert.equal(ok.status, 200);
    assert.deepEqual(e.jadwal_ditetapkan, SEL);
  });

  it("validateJadwalDitetapkan: slot ada -> salinan; tidak ada -> 400; saklar mati/offline -> 409; kapasitas tidak diperiksa", () => {
    const kelas = { jadwalPilihSiswa: true, modePembelajaran: "online", jadwal: [SEN, SEL] };
    assert.deepEqual(validateJadwalDitetapkan({ ...SEN }, kelas), { ok: true, slot: SEN });
    assert.deepEqual(validateJadwalDitetapkan(RAB, kelas), { ok: false, status: 400, error: "Jadwal yang dipilih tidak ada di kelas ini." });
    assert.equal(validateJadwalDitetapkan(SEN, { ...kelas, jadwalPilihSiswa: false }).ok, false);
    assert.equal(validateJadwalDitetapkan(SEN, { ...kelas, modePembelajaran: "offline" }).ok, false);
    assert.equal(validateJadwalDitetapkan(SEN, { ...kelas, jadwal: null }).ok, false);
  });
});

describe("opsi dropdown jadwal di form (getPendaftarKelas.opsiJadwal)", () => {
  it("kelas private + saklar: semua slot kelas, slot penuh ditandai tetapi tetap ada di daftar", async () => {
    lunasDiSlot(SISWA_2, "K-PRIV", SEN);
    const data = await pendaftarLib.getPendaftarKelas("K-PRIV");
    assert.ok(data);
    assert.deepEqual(data.kelas.opsiJadwal.map((o) => [o.hari, o.penuh]), [["Senin", true], ["Selasa", false]]);
  });

  it("kelas grup bersaklar: opsi ada tanpa penanda penuh; saklar mati / tanpa slot: tidak ada opsi", async () => {
    const grup = await pendaftarLib.getPendaftarKelas("K-GRUP");
    assert.deepEqual(grup?.kelas.opsiJadwal.map((o) => [o.hari, o.penuh]), [["Senin", false], ["Selasa", false]]);
    assert.deepEqual((await pendaftarLib.getPendaftarKelas("K-MATI"))?.kelas.opsiJadwal, []);
    assert.deepEqual((await pendaftarLib.getPendaftarKelas("K-KOSONG"))?.kelas.opsiJadwal, []);
  });

  it("slot ganda di kelas.jadwal ditampilkan sekali", async () => {
    db.kelas[0].jadwal = [SEN, SEN, SEL];
    const data = await pendaftarLib.getPendaftarKelas("K-PRIV");
    assert.equal(data?.kelas.opsiJadwal.length, 2);
  });

  it("galat membaca ketersediaan: semua slot ditampilkan terbuka (server tetap penjaga)", async () => {
    lunasDiSlot(SISWA_2, "K-PRIV", SEN);
    gagal.add("kelas_subtes:select");
    const data = await pendaftarLib.getPendaftarKelas("K-PRIV");
    assert.ok(data);
    assert.ok(data.kelas.opsiJadwal.every((o) => o.penuh === false));
  });
});
