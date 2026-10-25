/**
 * Test penugasan mentor ke subtes Studio Soal (PR 3a, revisi K2):
 *   - fungsi murni lib/shared/studio-soal/penugasan.ts & studioMentor.ts
 *   - app/api/admin/studio-soal/penugasan (PATCH) terhadap Supabase TIRUAN di
 *     memori (tidak pernah menyentuh database asli). Fungsi DB
 *     studio_soal_atur_penugasan ditiru di `fakeRpc` mengikuti
 *     db/add_studio_soal_penugasan.sql.
 *   - data layer Admin & mentor.
 * Aturan database (penulis tidak meninjau soalnya sendiri, publikasi Admin
 * hanya bila 0 mentor eligible lain, cabut tidak mengubah soal, idempotent,
 * log) diuji di db/test_studio_soal_penugasan_DRYRUN.sql.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import {
  MIN_MENTOR_PEER_REVIEW,
  URUTAN_SUBTES_SNBT,
  parsePermintaanPenugasan,
  peringatanUntuk,
  ringkasPenugasan,
  terapkanAksi,
  terjemahkanHasilRpc,
  urutkanSubtes,
} from "@/lib/shared/studio-soal/penugasan";
import { cuplikRedaksi, susunStudioSoalMentor, type SoalRingkas } from "@/lib/shared/studio-soal/studioMentor";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

// UUID tetap supaya lolos validasi bentuk.
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = u(1);
const ADMIN_NONAKTIF = u(2);
const M1 = u(11);
const M2 = u(12);
const M_PENDING = u(13);
const M_LAMA = u(14); // mentor rejected yang masih punya penugasan
const SISWA = u(21);
const PU = u(101);
const PK = u(102);
const LBI = u(103);
const MTK = u(109); // TKA — bukan SNBT

// ---------------------------------------------------------------------------
// Fungsi murni
// ---------------------------------------------------------------------------

describe("parsePermintaanPenugasan", () => {
  it("menerima body yang benar", () => {
    assert.deepEqual(parsePermintaanPenugasan({ mentorId: M1, subtesId: PU, aksi: "tugaskan" }), {
      ok: true,
      mentorId: M1,
      subtesId: PU,
      aksi: "tugaskan",
    });
    assert.equal(parsePermintaanPenugasan({ mentorId: M1.toUpperCase(), subtesId: PU, aksi: "cabut" }).ok, true);
  });

  it("menolak id bukan UUID, aksi lain, dan body bukan objek", () => {
    for (const body of [
      null,
      [],
      "x",
      { mentorId: "m1", subtesId: PU, aksi: "tugaskan" },
      { mentorId: M1, subtesId: "PU'); --", aksi: "tugaskan" },
      { mentorId: M1, subtesId: PU, aksi: "hapus" },
      { mentorId: M1, subtesId: PU },
    ]) {
      assert.equal(parsePermintaanPenugasan(body).ok, false, JSON.stringify(body));
    }
  });
});

describe("terjemahkanHasilRpc", () => {
  it("sukses berubah vs sukses tanpa perubahan (idempotent)", () => {
    assert.deepEqual(
      [terjemahkanHasilRpc("ditugaskan").berubah, terjemahkanHasilRpc("dicabut").berubah],
      [true, true],
    );
    for (const s of ["sudah_ditugaskan", "tidak_ditugaskan"]) {
      const h = terjemahkanHasilRpc(s);
      assert.equal(h.success, true, s);
      assert.equal(h.berubah, false, s);
      assert.equal(h.httpStatus, 200, s);
    }
    assert.match(terjemahkanHasilRpc("dicabut").pesan, /Soal yang sudah ditulis tetap ada/);
  });

  it("gagal dipetakan ke status HTTP; status tak dikenal = 500", () => {
    assert.equal(terjemahkanHasilRpc("bukan_admin").httpStatus, 403);
    assert.equal(terjemahkanHasilRpc("subtes_tidak_valid").httpStatus, 400);
    assert.equal(terjemahkanHasilRpc("bukan_mentor_aktif").httpStatus, 400);
    assert.equal(terjemahkanHasilRpc(undefined).httpStatus, 500);
    assert.equal(terjemahkanHasilRpc("aneh").success, false);
  });
});

describe("terapkanAksi (state klien)", () => {
  it("tugaskan dua kali tidak membuat duplikat; cabut yang tidak ada tidak mengubah", () => {
    const a = terapkanAksi([], M1, PU, "tugaskan");
    const b = terapkanAksi(a, M1, PU, "tugaskan");
    assert.equal(b.length, 1);
    assert.equal(b, a);
    assert.equal(terapkanAksi(b, M2, PU, "cabut"), b);
    assert.deepEqual(terapkanAksi(b, M1, PU, "cabut"), []);
  });

  it("satu mentor banyak subtes, satu subtes banyak mentor", () => {
    let d = terapkanAksi([], M1, PU, "tugaskan");
    d = terapkanAksi(d, M1, PK, "tugaskan");
    d = terapkanAksi(d, M2, PU, "tugaskan");
    assert.equal(d.length, 3);
  });
});

describe("peringatan < 2 mentor per subtes", () => {
  it("peringatanUntuk: 0 = kosong, 1 = satu, ≥2 = tanpa peringatan", () => {
    assert.equal(MIN_MENTOR_PEER_REVIEW, 2);
    assert.deepEqual([0, 1, 2, 5].map(peringatanUntuk), ["kosong", "satu", null, null]);
  });

  it("ringkasPenugasan hanya menghitung mentor aktif, tanpa hitung ganda, dan urut resmi", () => {
    const subtes = [
      { id: LBI, nama: "Literasi dalam Bahasa Indonesia" },
      { id: PK, nama: "Pengetahuan Kuantitatif" },
      { id: PU, nama: "Penalaran Umum" },
    ];
    const penugasan = [
      { mentorId: M1, subtesId: PU },
      { mentorId: M2, subtesId: PU },
      { mentorId: M1, subtesId: PU }, // duplikat data tidak dihitung dua kali
      { mentorId: M1, subtesId: PK },
      { mentorId: M_LAMA, subtesId: PK }, // nonaktif: tidak dihitung
    ];
    const r = ringkasPenugasan(subtes, penugasan, [M1, M2]);
    assert.deepEqual(
      r.map((x) => [x.nama, x.jumlahMentor, x.peringatan]),
      [
        ["Penalaran Umum", 2, null],
        ["Pengetahuan Kuantitatif", 1, "satu"],
        ["Literasi dalam Bahasa Indonesia", 0, "kosong"],
      ],
    );
  });

  it("urutkanSubtes mengikuti 7 subtes SNBT, nama lain di belakang", () => {
    const acak = [...URUTAN_SUBTES_SNBT].reverse().map((nama) => ({ nama }));
    assert.deepEqual(urutkanSubtes([{ nama: "Zzz" }, ...acak]).map((s) => s.nama), [...URUTAN_SUBTES_SNBT, "Zzz"]);
    assert.equal(URUTAN_SUBTES_SNBT.length, 7);
  });
});

describe("susunStudioSoalMentor", () => {
  const soal = (id: string, subtesId: string, status: string, updatedAt: string): SoalRingkas => ({
    id,
    subtesId,
    tipe: "pilihan_ganda",
    status,
    versi: 1,
    redaksi: `Soal ${id}`,
    updatedAt,
  });

  it("tanpa penugasan & tanpa soal → keadaan kosong", () => {
    assert.deepEqual(susunStudioSoalMentor([], [], new Map()), { ditugaskan: [], tidakDitugaskan: [] });
  });

  it("subtes ditugaskan tanpa soal tetap tampil (daftar kosong)", () => {
    const v = susunStudioSoalMentor([{ id: PU, nama: "Penalaran Umum" }], [], new Map());
    assert.deepEqual(v.ditugaskan, [{ subtesId: PU, nama: "Penalaran Umum", soal: [] }]);
  });

  it("soal di subtes yang sudah dicabut tetap tampil terpisah; versi lama disembunyikan", () => {
    const v = susunStudioSoalMentor(
      [{ id: PU, nama: "Penalaran Umum" }],
      [
        soal("a", PU, "draf", "2026-10-20T00:00:00Z"),
        soal("b", PU, "terpublikasi", "2026-10-22T00:00:00Z"),
        soal("c", PU, "digantikan", "2026-10-01T00:00:00Z"),
        soal("d", PK, "diajukan", "2026-10-21T00:00:00Z"),
      ],
      new Map([[PK, "Pengetahuan Kuantitatif"]]),
    );
    assert.deepEqual(v.ditugaskan[0].soal.map((s) => s.id), ["b", "a"]);
    assert.deepEqual(v.tidakDitugaskan.map((k) => [k.nama, k.soal.map((s) => [s.id, s.status])]), [
      ["Pengetahuan Kuantitatif", [["d", "diajukan"]]],
    ]);
  });

  it("cuplikRedaksi merapikan spasi dan memotong panjang", () => {
    assert.equal(cuplikRedaksi("  a \n b  "), "a b");
    assert.equal(cuplikRedaksi(""), "(redaksi kosong)");
    const hasil = cuplikRedaksi("x".repeat(200), 10);
    assert.equal([...hasil].length, 10);
    assert.ok(hasil.endsWith("…"));
  });
});

// ---------------------------------------------------------------------------
// API route + data layer terhadap Supabase tiruan
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
let db: Db;
let rpcCalls: Row[];
let tulisLangsung: string[];
let rpcGagal = false;

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: null }> {
  constructor(private rows: Row[]) {}
  select() {
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
  order() {
    return this;
  }
  maybeSingle() {
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  then<A, B>(
    onfulfilled?: ((value: { data: Row[] | null; error: null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

const userOf = (id: unknown) => db.users.find((x) => x.id === id) ?? null;
const subtesOf = (id: unknown) => db.subtes.find((x) => x.id === id) ?? null;

function fakeFrom(table: string) {
  db[table] ??= [];
  const rows = db[table];
  let view = rows;
  if (table === "user_roles") view = rows.map((r) => ({ ...r, users: userOf(r.user_id) }));
  if (table === "studio_soal_penugasan") view = rows.map((r) => ({ ...r, subtes: subtesOf(r.subtes_id) }));
  if (table === "mentor_profiles") {
    view = rows.map((r) => ({
      ...r,
      mentor_subtes_diampu: db.mentor_subtes_diampu.filter((d) => d.mentor_profile_id === r.id),
    }));
  }
  const tolak = (op: string) => () => {
    tulisLangsung.push(`${op} ${table}`);
    return Promise.resolve({ data: null, error: null });
  };
  return Object.assign(new FakeQuery(view), { insert: tolak("insert"), update: tolak("update"), upsert: tolak("upsert"), delete: tolak("delete") });
}

const aktif = (userId: unknown, role: string) =>
  db.user_roles.some((r) => r.user_id === userId && r.role_type === role && r.status === "active");
const SNBT = new Set(["tps", "literasi"]);

/** Tiruan studio_soal_atur_penugasan — logika sama dengan db/add_studio_soal_penugasan.sql. */
function fakeRpc(name: string, p: Row) {
  rpcCalls.push({ name, ...p });
  if (rpcGagal) return Promise.resolve({ data: null, error: { message: "boom" } });
  if (name !== "studio_soal_atur_penugasan") throw new Error(`rpc tiruan tidak dikenal: ${name}`);
  const hasil = (status: string) => {
    const jumlah = new Set(
      db.studio_soal_penugasan.filter((r) => r.subtes_id === p.p_subtes_id && aktif(r.mentor_id, "mentor")).map((r) => r.mentor_id),
    ).size;
    return Promise.resolve({ data: { status, jumlah_mentor_eligible: jumlah }, error: null });
  };
  if (!["tugaskan", "cabut"].includes(p.p_aksi as string)) return hasil("input_tidak_valid");
  if (!aktif(p.p_admin_id, "admin")) return hasil("bukan_admin");
  if (!SNBT.has(subtesOf(p.p_subtes_id)?.kategori as string)) return hasil("subtes_tidak_valid");
  const idx = db.studio_soal_penugasan.findIndex((r) => r.mentor_id === p.p_mentor_id && r.subtes_id === p.p_subtes_id);
  const log = () =>
    db.studio_soal_penugasan_log.push({ admin_id: p.p_admin_id, mentor_id: p.p_mentor_id, subtes_id: p.p_subtes_id, aksi: p.p_aksi });
  if (p.p_aksi === "tugaskan") {
    if (!aktif(p.p_mentor_id, "mentor")) return hasil("bukan_mentor_aktif");
    if (idx !== -1) return hasil("sudah_ditugaskan");
    db.studio_soal_penugasan.push({ mentor_id: p.p_mentor_id, subtes_id: p.p_subtes_id, ditugaskan_oleh: p.p_admin_id });
    log();
    return hasil("ditugaskan");
  }
  if (idx === -1) return hasil("tidak_ditugaskan");
  db.studio_soal_penugasan.splice(idx, 1);
  log();
  return hasil("dicabut");
}

type RouteModule = typeof import("@/app/api/admin/studio-soal/penugasan/route");
type SessionModule = typeof import("@/lib/auth/session");
type AdminDataModule = typeof import("@/lib/admin/getPenugasanStudioSoalData");
type MentorDataModule = typeof import("@/lib/mentor/getStudioSoalData");
let route: RouteModule;
let sessionLib: SessionModule;
let adminData: AdminDataModule;
let mentorData: MentorDataModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  Object.assign(supabaseServer as unknown as Record<string, unknown>, { from: fakeFrom, rpc: fakeRpc });
  route = await import("@/app/api/admin/studio-soal/penugasan/route");
  sessionLib = await import("@/lib/auth/session");
  adminData = await import("@/lib/admin/getPenugasanStudioSoalData");
  mentorData = await import("@/lib/mentor/getStudioSoalData");
});

const SOAL_M2 = [
  { id: "soal-draf", subtes_id: PU, penulis_id: M2, tipe: "isian", status: "draf", versi: 1, redaksi: "Draf m2", updated_at: "2026-10-20T00:00:00Z" },
  { id: "soal-ajukan", subtes_id: PU, penulis_id: M2, tipe: "pilihan_ganda", status: "diajukan", versi: 1, redaksi: "Diajukan m2", updated_at: "2026-10-21T00:00:00Z" },
];

beforeEach(() => {
  rpcCalls = [];
  tulisLangsung = [];
  rpcGagal = false;
  db = {
    users: [
      { id: ADMIN, nama: "Admin" },
      { id: ADMIN_NONAKTIF, nama: "Admin Lama" },
      { id: M1, nama: "Mentor Satu" },
      { id: M2, nama: "Mentor Dua" },
      { id: M_PENDING, nama: "Mentor Pending" },
      { id: M_LAMA, nama: "Mentor Lama" },
      { id: SISWA, nama: "Siswa" },
    ],
    user_roles: [
      { user_id: ADMIN, role_type: "admin", status: "active" },
      { user_id: ADMIN_NONAKTIF, role_type: "admin", status: "rejected" },
      { user_id: M1, role_type: "mentor", status: "active" },
      { user_id: M2, role_type: "mentor", status: "active" },
      { user_id: M_PENDING, role_type: "mentor", status: "pending" },
      { user_id: M_LAMA, role_type: "mentor", status: "rejected" },
      { user_id: SISWA, role_type: "student", status: "active" },
    ],
    subtes: [
      { id: PU, nama: "Penalaran Umum", kategori: "tps" },
      { id: PK, nama: "Pengetahuan Kuantitatif", kategori: "tps" },
      { id: LBI, nama: "Literasi dalam Bahasa Indonesia", kategori: "literasi" },
      { id: MTK, nama: "Matematika", kategori: "tka_wajib" },
    ],
    mentor_profiles: [
      { id: "mp1", user_id: M1, asal_ptn: "UI" },
      { id: "mp2", user_id: M2, asal_ptn: "UGM" },
    ],
    mentor_subtes_diampu: [
      { mentor_profile_id: "mp1", subtes_id: PU },
      { mentor_profile_id: "mp1", subtes_id: MTK },
    ],
    studio_soal_penugasan: [{ mentor_id: M_LAMA, subtes_id: PK, ditugaskan_oleh: ADMIN }],
    studio_soal_penugasan_log: [],
    soal_bank: SOAL_M2.map((s) => ({ ...s })),
  };
});

function patch(body: unknown, userId: string | null = ADMIN, role: "admin" | "mentor" | "student" = "admin", raw?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers.cookie = `${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken({ userId, role })}`;
  return route
    .PATCH(new NextRequest("http://localhost/api/admin/studio-soal/penugasan", { method: "PATCH", headers, body: raw ?? JSON.stringify(body) }))
    .then(async (res) => ({ status: res.status, json: (await res.json()) as Record<string, unknown> }));
}

describe("API PATCH /api/admin/studio-soal/penugasan — akses", () => {
  const body = { mentorId: M1, subtesId: PU, aksi: "tugaskan" };

  it("tanpa login → 401", async () => {
    const res = await patch(body, null);
    assert.equal(res.status, 401);
    assert.equal(rpcCalls.length, 0);
  });

  it("mentor (bukan Admin) ditolak 403, termasuk menugaskan dirinya sendiri", async () => {
    for (const b of [body, { mentorId: M1, subtesId: PU, aksi: "tugaskan" }]) {
      const res = await patch(b, M1, "mentor");
      assert.equal(res.status, 403);
      assert.equal(res.json.success, false);
    }
    assert.equal(rpcCalls.length, 0);
    assert.equal(db.studio_soal_penugasan.filter((r) => r.mentor_id === M1).length, 0);
  });

  it("siswa ditolak 403", async () => {
    assert.equal((await patch(body, SISWA, "student")).status, 403);
    assert.equal(rpcCalls.length, 0);
  });

  it("cookie admin tapi role admin di DB tidak aktif → 403 (peran dibaca dari database)", async () => {
    assert.equal((await patch(body, ADMIN_NONAKTIF, "admin")).status, 403);
    assert.equal(rpcCalls.length, 0);
  });

  it("body tidak valid → 400 tanpa memanggil RPC", async () => {
    assert.equal((await patch({ mentorId: "x", subtesId: PU, aksi: "tugaskan" })).status, 400);
    assert.equal((await patch({ mentorId: M1, subtesId: PU, aksi: "hapus" })).status, 400);
    assert.equal((await patch(null, ADMIN, "admin", "{bukan json")).status, 400);
    assert.equal(rpcCalls.length, 0);
  });
});

describe("API PATCH /api/admin/studio-soal/penugasan — aturan", () => {
  it("tugaskan: RPC dipanggil dengan adminId dari session, bukan dari body", async () => {
    const res = await patch({ mentorId: M1, subtesId: PU, aksi: "tugaskan", adminId: M2 });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { success: true, berubah: true, pesan: "Mentor ditugaskan.", jumlahMentorEligible: 1 });
    assert.equal(rpcCalls[0].p_admin_id, ADMIN);
    assert.deepEqual(db.studio_soal_penugasan_log, [{ admin_id: ADMIN, mentor_id: M1, subtes_id: PU, aksi: "tugaskan" }]);
  });

  it("penugasan ganda yang sama idempotent: tanpa duplikat, tanpa log kedua", async () => {
    await patch({ mentorId: M1, subtesId: PU, aksi: "tugaskan" });
    const kedua = await patch({ mentorId: M1, subtesId: PU, aksi: "tugaskan" });
    assert.equal(kedua.status, 200);
    assert.equal(kedua.json.berubah, false);
    assert.equal(db.studio_soal_penugasan.filter((r) => r.mentor_id === M1 && r.subtes_id === PU).length, 1);
    assert.equal(db.studio_soal_penugasan_log.length, 1);
  });

  it("mencabut penugasan tidak menghapus atau mengubah soal yang ada", async () => {
    await patch({ mentorId: M2, subtesId: PU, aksi: "tugaskan" });
    const sebelum = structuredClone(db.soal_bank);
    const res = await patch({ mentorId: M2, subtesId: PU, aksi: "cabut" });
    assert.equal(res.status, 200);
    assert.equal(res.json.berubah, true);
    assert.match(res.json.pesan as string, /tetap ada/);
    assert.deepEqual(db.soal_bank, sebelum);
    assert.deepEqual(tulisLangsung, []); // semua tulisan lewat RPC
    assert.deepEqual(db.studio_soal_penugasan_log.map((l) => l.aksi), ["tugaskan", "cabut"]);

    const lagi = await patch({ mentorId: M2, subtesId: PU, aksi: "cabut" });
    assert.equal(lagi.json.berubah, false);
    assert.equal(db.studio_soal_penugasan_log.length, 2);
  });

  it("penolakan dari database diteruskan: mentor pending, subtes TKA", async () => {
    const pending = await patch({ mentorId: M_PENDING, subtesId: PU, aksi: "tugaskan" });
    assert.equal(pending.status, 400);
    assert.match(pending.json.error as string, /bukan mentor aktif/);
    const tka = await patch({ mentorId: M1, subtesId: MTK, aksi: "tugaskan" });
    assert.equal(tka.status, 400);
    assert.match(tka.json.error as string, /SNBT/);
    assert.equal(db.studio_soal_penugasan_log.length, 0);
  });

  it("mencabut mentor nonaktif tetap boleh", async () => {
    const res = await patch({ mentorId: M_LAMA, subtesId: PK, aksi: "cabut" });
    assert.equal(res.status, 200);
    assert.equal(res.json.berubah, true);
  });

  it("RPC error → 500 dengan pesan umum", async () => {
    rpcGagal = true;
    const res = await patch({ mentorId: M1, subtesId: PU, aksi: "tugaskan" });
    assert.equal(res.status, 500);
    assert.doesNotMatch(res.json.error as string, /boom/);
  });
});

describe("data layer", () => {
  it("Admin: semua mentor aktif + mentor nonaktif yang masih ditugaskan; profil = petunjuk SNBT saja", async () => {
    const data = await adminData.getPenugasanStudioSoalData();
    assert.notEqual(data, "gagal");
    if (data === "gagal") return;
    assert.deepEqual(data.subtes.map((s) => s.nama), [
      "Penalaran Umum",
      "Pengetahuan Kuantitatif",
      "Literasi dalam Bahasa Indonesia",
    ]);
    assert.deepEqual(data.mentor.map((m) => [m.nama, m.aktif]), [
      ["Mentor Dua", true],
      ["Mentor Satu", true],
      ["Mentor Lama", false],
    ]);
    const m1 = data.mentor.find((m) => m.id === M1);
    assert.deepEqual(m1?.subtesProfil, [PU]); // MTK (TKA) tidak ikut
    assert.deepEqual(data.penugasan, [{ mentorId: M_LAMA, subtesId: PK }]);
    // Profil mengajar TIDAK dianggap penugasan.
    assert.equal(data.penugasan.some((p) => p.mentorId === M1), false);
  });

  it("Mentor tanpa penugasan → keadaan kosong (walau punya profil mengajar PU)", async () => {
    const v = await mentorData.getStudioSoalMentor(M1);
    assert.deepEqual(v, { ditugaskan: [], tidakDitugaskan: [] });
  });

  it("Mentor hanya melihat miliknya; soal di subtes yang dicabut tetap tampil", async () => {
    await patch({ mentorId: M1, subtesId: PU, aksi: "tugaskan" });
    const v1 = await mentorData.getStudioSoalMentor(M1);
    assert.notEqual(v1, "gagal");
    if (v1 === "gagal") return;
    assert.deepEqual(v1.ditugaskan.map((k) => [k.nama, k.soal.length]), [["Penalaran Umum", 0]]); // soal m2 tidak terlihat

    const v2 = await mentorData.getStudioSoalMentor(M2);
    if (v2 === "gagal") return assert.fail("gagal");
    assert.deepEqual(v2.ditugaskan, []);
    assert.deepEqual(v2.tidakDitugaskan.map((k) => [k.nama, k.soal.map((s) => s.status)]), [
      ["Penalaran Umum", ["diajukan", "draf"]],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Pemeriksaan statis
// ---------------------------------------------------------------------------

describe("statis", () => {
  const FILE_BARU = [
    "app/api/admin/studio-soal/penugasan/route.ts",
    "lib/admin/getPenugasanStudioSoalData.ts",
    "lib/mentor/getStudioSoalData.ts",
    "components/admin/PenugasanStudioSoalClient.tsx",
    "components/mentor/StudioSoalMentor.tsx",
    "app/(protected)/(admin)/penugasan-studio-soal/page.tsx",
    "app/(protected)/(mentor)/studio-soal/page.tsx",
  ];

  it("fitur ini tidak menulis ke mentor_subtes_diampu, soal_bank, atau tabel penugasan secara langsung", () => {
    // Hanya kode server (komponen klien tidak punya akses database; Set.delete di sana bukan query).
    for (const f of FILE_BARU.filter((x) => !x.startsWith("components/"))) {
      const isi = baca(f);
      assert.doesNotMatch(isi, /\.(insert|update|upsert|delete)\(/, f);
    }
  });

  it("komponen klien tidak mengimpor supabase server", () => {
    for (const f of ["components/admin/PenugasanStudioSoalClient.tsx"]) {
      assert.doesNotMatch(baca(f), /from "@\/lib\/supabase\/server"/, f);
      assert.match(baca(f), /^"use client";/, f);
    }
  });

  it("migrasi: idempotent, RLS tanpa policy, fungsi izin membaca penugasan", () => {
    const sql = baca("db/add_studio_soal_penugasan.sql");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS studio_soal_penugasan \(/);
    assert.match(sql, /PRIMARY KEY \(mentor_id, subtes_id\)/);
    assert.match(sql, /ON CONFLICT \(mentor_id, subtes_id\) DO NOTHING/);
    assert.match(sql, /ALTER TABLE studio_soal_penugasan ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /ALTER TABLE studio_soal_penugasan_log ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /CREATE POLICY/i);
    assert.doesNotMatch(sql, /\b(DELETE FROM|UPDATE) (soal_bank|soal_stimulus|paket_soal|mentor_subtes_diampu)\b/);
    // Dua fungsi izin didefinisikan ulang dan tidak membaca profil mengajar.
    const fungsi = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION studio_soal_mentor_eligible"), sql.indexOf("4. RPC PENUGASAN"));
    assert.equal((fungsi.match(/CREATE OR REPLACE FUNCTION studio_soal_(mentor_eligible|hitung_peninjau_eligible)\(/g) ?? []).length, 2);
    assert.doesNotMatch(fungsi.replace(/^--.*$/gm, ""), /mentor_subtes_diampu/);
  });

  it("add_studio_soal.sql dijalankan ulang tidak mengembalikan fungsi izin lama", () => {
    const sql = baca("db/add_studio_soal.sql");
    const i = sql.indexOf("to_regclass('public.studio_soal_penugasan') IS NOT NULL");
    assert.ok(i > 0);
    assert.ok(i < sql.indexOf("CREATE OR REPLACE FUNCTION studio_soal_mentor_eligible"));
    assert.equal((sql.match(/^CREATE OR REPLACE FUNCTION studio_soal_mentor_eligible/gm) ?? []).length, 1);
  });

  it("dry-run SQL memuat penanda versi dan skenario aturan lama", () => {
    const t = baca("db/test_studio_soal_penugasan_DRYRUN.sql");
    assert.match(t, /DRY-RUN GAGAL \[v1\]/);
    for (const s of ["tinjau_sendiri", "masih_ada_peninjau", "terpublikasi", "sudah_ditugaskan", "tidak_ditugaskan", "bukan_admin"]) {
      assert.ok(t.includes(`'${s}'`), s);
    }
  });
});
