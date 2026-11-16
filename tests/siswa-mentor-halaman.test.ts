/**
 * Test kepemilikan siswa-mentor di SEMUA halaman (Supabase TIRUAN di memori, tidak pernah menyentuh database
 * asli): profil/detail mentor di Admin, tab Aktif/Pasif Manajemen Mentor, dashboard mentor, Siswa Binaan,
 * Kelas Saya (kartu + header detail). Semuanya memakai SATU aturan (lib/shared/siswaMentor.ts lewat
 * lib/mentor/siswaMilikMentor.ts), jadi di kelas multi-mentor siswa yang diterima A tampil di A dan TIDAK di B,
 * dan jumlahnya sama di semua halaman.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null };
let db: Db;
let tabelGagal: Set<string>;

class FakeQuery implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
  private single = false;
  constructor(
    private rows: Row[],
    private gagal: boolean,
  ) {}
  select() {
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
  order() {
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<A, B>(onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    if (this.gagal) return Promise.resolve({ data: null, error: { message: "galat tiruan" } } as Hasil).then(onfulfilled, onrejected);
    const cocok = this.rows.filter((row) => this.filters.every((f) => f(row)));
    return Promise.resolve({ data: this.single ? (cocok[0] ?? null) : cocok, error: null } as Hasil).then(onfulfilled, onrejected);
  }
}

const userOf = (id: unknown) => db.users.find((u) => u.id === id) ?? null;
const subtesOf = (id: unknown) => db.subtes.find((s) => s.id === id) ?? null;
const kelasOf = (id: unknown) => db.kelas.find((k) => k.id === id) ?? null;

function fakeFrom(table: string) {
  db[table] ??= [];
  let view: Row[] = db[table];
  if (table === "kelas") {
    view = db.kelas.map((row) => ({
      ...row,
      subtes: subtesOf(row.subtes_id),
      enrollments: db.enrollments.filter((e) => e.kelas_id === row.id).map((e) => ({ ...e, users: userOf(e.user_id) })),
    }));
  } else if (table === "enrollments") {
    view = db.enrollments.map((row) => ({ ...row, users: userOf(row.user_id), kelas: kelasOf(row.kelas_id) }));
  } else if (table === "kelas_subtes_mentor") {
    view = db.kelas_subtes_mentor.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) }));
  } else if (table === "user_roles") {
    view = db.user_roles.map((row) => ({
      ...row,
      direview_oleh: null,
      user: { ...userOf(row.user_id), mentor_profiles: { asal_ptn: "UGM", semester: 5, jurusan: "Matematika", mentor_subtes_diampu: [] } },
    }));
  }
  return new FakeQuery(view, tabelGagal.has(table));
}

type DashboardModule = typeof import("@/lib/mentor/dashboardData");
type BinaanModule = typeof import("@/lib/mentor/getSiswaBinaanData");
type KelasSayaModule = typeof import("@/lib/mentor/getKelasSayaData");
type AdminModule = typeof import("@/lib/admin/getApprovalMentorData");
type ReaderModule = typeof import("@/lib/mentor/siswaMilikMentor");
let dashboard: DashboardModule;
let binaan: BinaanModule;
let kelasSaya: KelasSayaModule;
let admin: AdminModule;
let reader: ReaderModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  dashboard = await import("@/lib/mentor/dashboardData");
  binaan = await import("@/lib/mentor/getSiswaBinaanData");
  kelasSaya = await import("@/lib/mentor/getKelasSayaData");
  admin = await import("@/lib/admin/getApprovalMentorData");
  reader = await import("@/lib/mentor/siswaMilikMentor");
});

const A = "mentor-a";
const B = "mentor-b";
const C_NONAKTIF = "mentor-c";
const D_OFFLINE = "mentor-d";
const E_KOSONG = "mentor-e";
const BARU = "2026-11-20T10:00:00+07:00";
const LAMA = "2026-10-01T10:00:00+07:00";

const enr = (id: string, kelas: string, extra: Row = {}): Row => ({
  id,
  user_id: `u-${id}`,
  kelas_id: kelas,
  status_pembayaran: "lunas",
  tanggal_daftar: BARU,
  mentor_offline_id: null,
  tanggal_keluar: null,
  ...extra,
});

beforeEach(() => {
  tabelGagal = new Set();
  const mentor = [A, B, C_NONAKTIF, D_OFFLINE, E_KOSONG];
  db = {
    users: [
      ...mentor.map((id) => ({ id, nama: `Nama ${id}`, nama_panggilan: null, email: `${id}@x.id`, no_wa: "0", avatar_url: null })),
      ...["acc-a", "tunggu", "lama", "solo", "off", "nonaktif", "acc-b"].map((s) => ({
        id: `u-e-${s}`,
        nama: `Siswa ${s}`,
        nama_panggilan: null,
        avatar_url: null,
      })),
    ],
    user_roles: [
      { id: "ur-a", user_id: A, role_type: "mentor", status: "active", created_at: "2026-01-01" },
      { id: "ur-b", user_id: B, role_type: "mentor", status: "active", created_at: "2026-01-01" },
      { id: "ur-c", user_id: C_NONAKTIF, role_type: "mentor", status: "rejected", created_at: "2026-01-01" },
      { id: "ur-d", user_id: D_OFFLINE, role_type: "mentor", status: "active", created_at: "2026-01-01" },
      { id: "ur-e", user_id: E_KOSONG, role_type: "mentor", status: "active", created_at: "2026-01-01" },
    ],
    subtes: [
      { id: "s-mtk", nama: "Matematika" },
      { id: "s-fis", nama: "Fisika" },
    ],
    kelas: [
      // Multi-mentor: kelas.mentor_id = B (kolom lama), kelas_mentor A & B, Matematika dipegang A, B, C (C nonaktif)
      { id: "K1", nama: "Kelas Multi", mentor_id: B, tingkat_kelas: "sma", jadwal: null, jumlah_sesi: 10, subtes_id: "s-mtk", tipe_kelas: "grouping", link_meet: null, program_kategori: "snbt", kapasitas: null, mode_pembelajaran: "online" },
      // Satu pemegang subtes (A) tapi B juga terdaftar di kelas_mentor
      { id: "K2", nama: "Kelas Fisika", mentor_id: A, tingkat_kelas: "sma", jadwal: null, jumlah_sesi: 10, subtes_id: "s-fis", tipe_kelas: "grouping", link_meet: null, program_kategori: "snbt", kapasitas: null, mode_pembelajaran: "online" },
      // Tatap muka: mentor ditentukan per siswa
      { id: "K3", nama: "Kelas Offline", mentor_id: null, tingkat_kelas: "sma", jadwal: null, jumlah_sesi: 8, subtes_id: "s-mtk", tipe_kelas: "private", link_meet: null, program_kategori: "snbt", kapasitas: null, mode_pembelajaran: "offline" },
    ],
    kelas_mentor: [
      { kelas_id: "K1", mentor_id: A },
      { kelas_id: "K1", mentor_id: B },
      { kelas_id: "K2", mentor_id: A },
      { kelas_id: "K2", mentor_id: B },
    ],
    kelas_subtes_mentor: [
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: A },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: B },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: C_NONAKTIF },
      { kelas_id: "K2", subtes_id: "s-fis", mentor_id: A },
    ],
    enrollments: [
      enr("e-acc-a", "K1"), // diterima A
      enr("e-acc-b", "K1"), // diterima B
      enr("e-tunggu", "K1"), // belum diterima siapa pun
      enr("e-lama", "K1", { tanggal_daftar: LAMA }), // legacy
      enr("e-nonaktif", "K1"), // penerimanya C (nonaktif) -> kembali menunggu
      enr("e-solo", "K2"), // pemilik implisit A
      enr("e-off", "K3", { mentor_offline_id: D_OFFLINE }),
      enr("e-batal", "K1", { status_pembayaran: "menunggu" }), // belum lunas
    ],
    enrollment_subtes: [
      { id: "es-acc-a", enrollment_id: "e-acc-a", subtes_id: "s-mtk", mentor_id: A },
      { id: "es-acc-b", enrollment_id: "e-acc-b", subtes_id: "s-mtk", mentor_id: B },
      { id: "es-tunggu", enrollment_id: "e-tunggu", subtes_id: "s-mtk", mentor_id: null },
      { id: "es-lama", enrollment_id: "e-lama", subtes_id: "s-mtk", mentor_id: null },
      { id: "es-nonaktif", enrollment_id: "e-nonaktif", subtes_id: "s-mtk", mentor_id: C_NONAKTIF },
      { id: "es-solo", enrollment_id: "e-solo", subtes_id: "s-fis", mentor_id: null },
      { id: "es-batal", enrollment_id: "e-batal", subtes_id: "s-mtk", mentor_id: A },
    ],
    sesi_kelas: [],
    mentor_profiles: [],
  };
});

/** Id enrollment milik satu mentor, terurut. */
const userIdsMilik = async (mentorId: string): Promise<string[]> => {
  const hasil = await reader.getKepemilikanSiswa([mentorId]);
  assert.notEqual(hasil, "gagal");
  return (hasil as { enrollmentId: string }[]).map((r) => r.enrollmentId).sort();
};

describe("pembaca kepemilikan — siswa diterima A tampil di A dan TIDAK di B", () => {
  it("A: e-acc-a, e-lama, e-solo | B: e-acc-b, e-lama — e-acc-a TIDAK ada di B", async () => {
    assert.deepEqual(await userIdsMilik(A), ["e-acc-a", "e-lama", "e-solo"]);
    assert.deepEqual(await userIdsMilik(B), ["e-acc-b", "e-lama"]);
  });

  it("siswa menunggu (e-tunggu), penerima nonaktif (e-nonaktif), dan belum lunas (e-batal): milik siapa pun tidak", async () => {
    const semua = await reader.getKepemilikanSiswa(null);
    assert.notEqual(semua, "gagal");
    const ids = new Set((semua as { enrollmentId: string }[]).map((r) => r.enrollmentId));
    for (const id of ["e-tunggu", "e-nonaktif", "e-batal"]) assert.equal(ids.has(id), false, id);
  });

  it("pemilik implisit: e-solo milik A (satu-satunya pemegang Fisika) dan bukan B walau B ada di kelas_mentor", async () => {
    assert.ok((await userIdsMilik(A)).includes("e-solo"));
    assert.ok(!(await userIdsMilik(B)).includes("e-solo"));
  });

  it("mentor tatap muka: e-off milik D lewat mentor_offline_id; A/B tidak", async () => {
    assert.deepEqual(await userIdsMilik(D_OFFLINE), ["e-off"]);
    assert.ok(!(await userIdsMilik(A)).includes("e-off"));
  });

  it("penerima dinonaktifkan: A dan B tidak otomatis memilikinya; setelah B menerima, hanya B", async () => {
    assert.ok(!(await userIdsMilik(A)).includes("e-nonaktif"));
    assert.ok(!(await userIdsMilik(B)).includes("e-nonaktif"));
    db.enrollment_subtes.find((r) => r.id === "es-nonaktif")!.mentor_id = B;
    assert.ok((await userIdsMilik(B)).includes("e-nonaktif"));
    assert.ok(!(await userIdsMilik(A)).includes("e-nonaktif"));
  });

  it("galat database → 'gagal' (fail-closed): halaman mentor menampilkan kosong, bukan siswa orang lain", async () => {
    tabelGagal.add("enrollment_subtes");
    const log = console.error;
    console.error = () => {};
    try {
      assert.equal(await reader.getKepemilikanSiswa([A]), "gagal");
      assert.equal((await dashboard.getMentorStats(A)).siswaBinaan, 0);
      assert.deepEqual((await binaan.getSiswaBinaanGrouped(A)).flatMap((g) => g.siswa), []);
    } finally {
      console.error = log;
    }
  });
});

describe("profil/detail mentor di Admin", () => {
  it("detail A: kelas + siswa milik A saja (3 siswa); detail B: 2 siswa dan TANPA siswa yang diterima A", async () => {
    const detailA = await admin.getMentorDetail("ur-a");
    const detailB = await admin.getMentorDetail("ur-b");
    assert.ok(detailA && detailB);
    assert.equal(detailA.totalSiswaBinaan, 3);
    assert.deepEqual(detailA.kelasDiampu.map((k) => [k.id, k.jumlahSiswa]), [["K1", 2], ["K2", 1]]);
    assert.equal(detailB.totalSiswaBinaan, 2);
    assert.deepEqual(detailB.kelasDiampu.map((k) => [k.id, k.jumlahSiswa]), [["K1", 2], ["K2", 0]]);
  });

  it("detail mentor tatap muka (D): kelas offline dengan 1 siswa ditugaskan", async () => {
    const detailD = await admin.getMentorDetail("ur-d");
    assert.deepEqual(detailD?.kelasDiampu.map((k) => [k.id, k.jumlahSiswa]), [["K3", 1]]);
    assert.equal(detailD?.totalSiswaBinaan, 1);
  });

  it("tab Aktif/Pasif: mentor dengan siswa milik = Aktif (A, B, D); tanpa siswa milik = Pasif (E)", async () => {
    const { aktif, pasif } = await admin.getMentorActivityLists();
    assert.deepEqual(aktif.map((m) => m.userRoleId).sort(), ["ur-a", "ur-b", "ur-d"]);
    assert.deepEqual(pasif.map((m) => m.userRoleId), ["ur-e"]);
  });

  it("mentor yang hanya terkait kelas tetapi tidak memiliki siswa baru satu pun jadi Pasif", async () => {
    // Hapus siswa yang dimiliki B (e-acc-b diterima B, e-lama legacy) → B tidak punya siswa milik.
    db.enrollments = db.enrollments.filter((e) => !["e-acc-b", "e-lama"].includes(e.id as string));
    const { pasif } = await admin.getMentorActivityLists();
    assert.ok(pasif.some((m) => m.userRoleId === "ur-b"));
  });
});

describe("jumlah siswa SAMA di profil Admin = Kelas Saya = dashboard = Siswa Binaan", () => {
  for (const [nama, mentorId, userRoleId] of [
    ["A", A, "ur-a"],
    ["B", B, "ur-b"],
    ["D (tatap muka)", D_OFFLINE, "ur-d"],
  ] as const) {
    it(`mentor ${nama}: jumlah per kelas dan total identik di keempat tempat`, async () => {
      const detail = await admin.getMentorDetail(userRoleId);
      const kartu = await kelasSaya.getMentorKelasSaya(mentorId);
      const terdaftar = await dashboard.getMentorKelasTerdaftar(mentorId);
      const grup = await binaan.getSiswaBinaanGrouped(mentorId);
      const stats = await dashboard.getMentorStats(mentorId);
      assert.ok(detail);

      const peta = (daftar: { id: string; jumlah: number }[]) => Object.fromEntries(daftar.map((d) => [d.id, d.jumlah]));
      const profil = peta(detail.kelasDiampu.map((k) => ({ id: k.id, jumlah: k.jumlahSiswa })));
      assert.deepEqual(peta(kartu.map((k) => ({ id: k.id, jumlah: k.jumlahSiswa }))), profil);
      assert.deepEqual(peta(terdaftar.map((k) => ({ id: k.id, jumlah: k.jumlahSiswa }))), profil);
      assert.deepEqual(peta(grup.map((g) => ({ id: g.kelasId, jumlah: g.siswa.length }))), profil);
      assert.equal(stats.siswaBinaan, detail.totalSiswaBinaan);
    });
  }

  it("header detail Kelas Saya (getMentorKelasDetail dengan mentor) = kartu daftar; tanpa mentor = semua siswa lunas kelas", async () => {
    assert.equal((await kelasSaya.getMentorKelasDetail("K1", A))?.jumlahSiswa, 2);
    assert.equal((await kelasSaya.getMentorKelasDetail("K1", B))?.jumlahSiswa, 2);
    assert.equal((await kelasSaya.getMentorKelasDetail("K1"))?.jumlahSiswa, 5);
  });
});

describe("dashboard & Siswa Binaan: daftar siswa", () => {
  it("B tidak melihat siswa yang diterima A, A melihatnya (kasus gejala awal)", async () => {
    const siswaB = (await binaan.getSiswaBinaanGrouped(B)).flatMap((g) => g.siswa.map((s) => s.userId));
    const siswaA = (await binaan.getSiswaBinaanGrouped(A)).flatMap((g) => g.siswa.map((s) => s.userId));
    assert.ok(!siswaB.includes("u-e-acc-a"));
    assert.ok(siswaA.includes("u-e-acc-a"));
    const progresB = (await dashboard.getMentorProgressByKelas(B)).flatMap((k) => k.siswa.map((s) => s.userId));
    assert.ok(!progresB.includes("u-e-acc-a"));
    assert.ok(!(await dashboard.getMentorProgressByKelas(B)).flatMap((k) => k.siswa).some((s) => s.nama.includes("acc-a")));
  });

  it("kelas yang A terkait lewat kelas_mentor (bukan kelas.mentor_id) kini tampil di A, dengan siswanya", async () => {
    const grupA = await binaan.getSiswaBinaanGrouped(A);
    assert.deepEqual(grupA.map((g) => g.kelasId).sort(), ["K1", "K2"]);
    assert.equal(grupA.find((g) => g.kelasId === "K1")!.siswa.length, 2);
  });

  it("detail siswa binaan: guard memakai kepemilikan — B ditolak untuk siswa yang diterima A", async () => {
    assert.equal(await binaan.getSiswaBinaanDetail(B, "u-e-acc-a", "K1"), null);
    const diA = await binaan.getSiswaBinaanDetail(A, "u-e-acc-a", "K1");
    assert.equal(diA?.userId, "u-e-acc-a");
    assert.equal(await binaan.getSiswaBinaanDetail(A, "u-e-tunggu", "K1"), null);
  });

  it("siswa yang sudah keluar tetap tidak ikut hitungan dashboard (kebijakan lama tidak berubah)", async () => {
    db.enrollments.find((e) => e.id === "e-acc-a")!.tanggal_keluar = "2026-11-25";
    assert.equal((await dashboard.getMentorStats(A)).siswaBinaan, 2);
  });
});

describe("hanya SATU tempat yang menentukan kepemilikan (tidak ada aturan ganda)", () => {
  const baca = (path: string) => readFileSync(path, "utf8");

  it("dashboard, Siswa Binaan, Kelas Saya, dan data Admin memakai pembaca kepemilikan — bukan kelas.mentor_id langsung", () => {
    for (const berkas of ["lib/mentor/dashboardData.ts", "lib/mentor/getSiswaBinaanData.ts"]) {
      const src = baca(berkas);
      assert.match(src, /getEnrollmentMilikMentor/, berkas);
      assert.doesNotMatch(src, /\.eq\("mentor_id"/, berkas);
    }
    const kelasSayaSrc = baca("lib/mentor/getKelasSayaData.ts");
    assert.match(kelasSayaSrc, /getEnrollmentMilikMentor/);
    const adminSrc = baca("lib/admin/getApprovalMentorData.ts");
    assert.match(adminSrc, /getKepemilikanSiswa/);
    assert.doesNotMatch(adminSrc, /\.eq\("mentor_id"/);
  });

  it("aturan hanya ada di lib/shared/siswaMentor.ts: pembaca & halaman tidak memanggil statusPenerimaanSubtes sendiri", () => {
    for (const berkas of [
      "lib/mentor/siswaMilikMentor.ts",
      "lib/mentor/dashboardData.ts",
      "lib/mentor/getSiswaBinaanData.ts",
      "lib/admin/getApprovalMentorData.ts",
    ]) {
      assert.doesNotMatch(baca(berkas), /statusPenerimaanSubtes|sebelumPemberlakuan/, berkas);
    }
    assert.match(baca("lib/shared/siswaMentor.ts"), /statusPenerimaanSubtes/);
  });
});
