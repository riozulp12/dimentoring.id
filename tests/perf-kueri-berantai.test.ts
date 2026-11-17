/**
 * Test memoize PER REQUEST (React cache()) pada pembaca data yang dipanggil berulang dalam satu render halaman
 * (Supabase TIRUAN di memori, tidak pernah menyentuh database asli). Yang dibuktikan:
 *   1. Dua pemanggilan dengan argumen SAMA dalam satu render hanya menjalankan kueri dasar SEKALI.
 *   2. Argumen BERBEDA tidak berbagi hasil — tidak ada kebocoran antar mentor / antar pengguna.
 *   3. Hasil di dalam render sama persis dengan hasil tanpa memoize (perilaku tidak berubah), dan galat baca
 *      kepemilikan tetap fail-closed (Set kosong), bukan data yang lolos.
 *
 * Satu "render" ditiru dengan memasang dispatcher cache React sementara (persis yang dilakukan Next.js saat
 * merender halaman). Di luar render (rute API, tes lain) cache() tidak memoize apa pun, jadi tes lama tak terpengaruh.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null };
let db: Db;
let tabelGagal: Set<string>;
let hitungan: Map<string, number>;

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
  hitungan.set(table, (hitungan.get(table) ?? 0) + 1);
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
  }
  return new FakeQuery(view, tabelGagal.has(table));
}

/** Jumlah panggilan from() ke tabel itu sejak beforeEach / hitungan terakhir direset. */
const jumlah = (tabel: string) => hitungan.get(tabel) ?? 0;
const totalKueri = () => Array.from(hitungan.values()).reduce((a, b) => a + b, 0);

// --- Meniru satu render halaman (dispatcher cache React, sama seperti yang dipasang Next.js saat render) ---
type Dispatcher = { getCacheForType: (create: () => unknown) => unknown };
type Internals = { A: Dispatcher | null };
let internals: Internals;

async function dalamSatuRender<T>(fn: () => Promise<T>): Promise<T> {
  const toko = new Map<() => unknown, unknown>();
  const sebelumnya = internals.A;
  internals.A = {
    getCacheForType(create) {
      if (!toko.has(create)) toko.set(create, create());
      return toko.get(create);
    },
  };
  try {
    return await fn();
  } finally {
    internals.A = sebelumnya;
  }
}

type DashboardModule = typeof import("@/lib/mentor/dashboardData");
type AksesModule = typeof import("@/lib/mentor/aksesMentor");
type ReaderModule = typeof import("@/lib/mentor/siswaMilikMentor");
type NamaModule = typeof import("@/lib/dashboard/getUserDisplayName");
type MenuModule = typeof import("@/lib/dashboard/getAccountMenuData");
let dashboard: DashboardModule;
let akses: AksesModule;
let reader: ReaderModule;
let nama: NamaModule;
let menu: MenuModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const react = (await import("react")) as unknown as Record<string, unknown> & { default?: Record<string, unknown> };
  const kunci = "__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE";
  internals = (react[kunci] ?? react.default?.[kunci]) as Internals;
  assert.ok(internals, "internal React (build react-server) tidak ditemukan — pastikan tes dijalankan lewat npm test");
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  dashboard = await import("@/lib/mentor/dashboardData");
  akses = await import("@/lib/mentor/aksesMentor");
  reader = await import("@/lib/mentor/siswaMilikMentor");
  nama = await import("@/lib/dashboard/getUserDisplayName");
  menu = await import("@/lib/dashboard/getAccountMenuData");
});

const A = "mentor-a";
const B = "mentor-b";
const BARU = "2026-11-20T10:00:00+07:00";

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
  hitungan = new Map();
  internals.A = null;
  db = {
    users: [
      { id: A, nama: "Mentor Aaa Pertama", nama_panggilan: "Mas A", avatar_url: "http://x/a.png" },
      { id: B, nama: "Mentor Bbb Kedua", nama_panggilan: null, avatar_url: null },
      { id: "u-e-a1", nama: "Siswa A1", nama_panggilan: null, avatar_url: null },
      { id: "u-e-a2", nama: "Siswa A2", nama_panggilan: null, avatar_url: null },
      { id: "u-e-b1", nama: "Siswa B1", nama_panggilan: null, avatar_url: null },
    ],
    user_roles: [
      { id: "ur-a", user_id: A, role_type: "mentor", status: "active", created_at: "2026-01-01" },
      { id: "ur-b", user_id: B, role_type: "mentor", status: "active", created_at: "2026-01-01" },
    ],
    subtes: [
      { id: "s-mtk", nama: "Matematika" },
      { id: "s-fis", nama: "Fisika" },
    ],
    kelas: [
      { id: "KA", nama: "Kelas Milik A", mentor_id: A, tingkat_kelas: "sma", jadwal: null, jumlah_sesi: 10, subtes_id: "s-mtk", tipe_kelas: "grouping", link_meet: null, program_kategori: "snbt", kapasitas: null, mode_pembelajaran: "online" },
      { id: "KB", nama: "Kelas Milik B", mentor_id: B, tingkat_kelas: "sma", jadwal: null, jumlah_sesi: 10, subtes_id: "s-fis", tipe_kelas: "grouping", link_meet: null, program_kategori: "snbt", kapasitas: null, mode_pembelajaran: "online" },
    ],
    kelas_mentor: [],
    kelas_subtes_mentor: [
      { kelas_id: "KA", subtes_id: "s-mtk", mentor_id: A },
      { kelas_id: "KB", subtes_id: "s-fis", mentor_id: B },
    ],
    enrollments: [
      enr("e-a1", "KA", { user_id: "u-e-a1" }),
      enr("e-a2", "KA", { user_id: "u-e-a2" }),
      enr("e-b1", "KB", { user_id: "u-e-b1" }),
    ],
    enrollment_subtes: [
      { id: "es-a1", enrollment_id: "e-a1", subtes_id: "s-mtk", mentor_id: A },
      { id: "es-a2", enrollment_id: "e-a2", subtes_id: "s-mtk", mentor_id: A },
      { id: "es-b1", enrollment_id: "e-b1", subtes_id: "s-fis", mentor_id: B },
    ],
    sesi_kelas: [],
    mentor_profiles: [],
    mentor_subtes_diampu: [],
    gamifikasi_profiles: [],
  };
});

const urut = (s: Iterable<string>) => Array.from(s).sort();

describe("memoize per request — fondasi", () => {
  it("di luar render cache() tidak memoize (rute API/tes lain tidak terpengaruh)", async () => {
    await akses.getKelasAksesMentor(A);
    const sekali = jumlah("kelas");
    await akses.getKelasAksesMentor(A);
    assert.equal(jumlah("kelas"), sekali * 2);
  });
});

describe("getKelasAksesMentor (cache per request, kunci mentorId)", () => {
  it("dua panggilan argumen sama dalam satu render = kueri dasar sekali (3 tabel, bukan 6)", async () => {
    const [x, y] = await dalamSatuRender(async () => [await akses.getKelasAksesMentor(A), await akses.getKelasAksesMentor(A)] as const);
    assert.equal(totalKueri(), 3);
    assert.equal(jumlah("kelas"), 1);
    assert.equal(jumlah("kelas_mentor"), 1);
    assert.equal(jumlah("enrollments"), 1);
    assert.deepEqual([...x.entries()], [["KA", "utama"]]);
    assert.equal(x, y);
  });

  it("panggilan barengan (Promise.all) juga berbagi satu kueri", async () => {
    await dalamSatuRender(() => Promise.all([akses.getKelasAksesMentor(A), akses.getKelasAksesMentor(A), akses.getKelasAksesMentor(A)]));
    assert.equal(totalKueri(), 3);
  });

  it("mentor berbeda TIDAK berbagi hasil", async () => {
    const [a, b] = await dalamSatuRender(() => Promise.all([akses.getKelasAksesMentor(A), akses.getKelasAksesMentor(B)]));
    assert.equal(totalKueri(), 6);
    assert.deepEqual([...a.keys()], ["KA"]);
    assert.deepEqual([...b.keys()], ["KB"]);
  });

  it("render berikutnya membaca ulang (tidak ada cache lintas-request)", async () => {
    await dalamSatuRender(() => akses.getKelasAksesMentor(A));
    db.kelas.push({ id: "KA2", nama: "Baru", mentor_id: A, tingkat_kelas: "sma", jadwal: null, jumlah_sesi: 1, subtes_id: "s-mtk" });
    const kedua = await dalamSatuRender(() => akses.getKelasAksesMentor(A));
    assert.deepEqual(urut(kedua.keys()), ["KA", "KA2"]);
  });
});

describe("getEnrollmentMilikMentor (cache per request, kunci mentorId)", () => {
  it("dua panggilan argumen sama = rantai kepemilikan jalan sekali", async () => {
    await dalamSatuRender(() => reader.getEnrollmentMilikMentor(A));
    const satuKali = totalKueri();
    assert.ok(satuKali > 1);

    hitungan = new Map();
    const [x, y] = await dalamSatuRender(async () => [await reader.getEnrollmentMilikMentor(A), await reader.getEnrollmentMilikMentor(A)] as const);
    assert.equal(totalKueri(), satuKali);
    assert.equal(x, y);
    assert.deepEqual(urut(x), ["e-a1", "e-a2"]);
  });

  it("mentor berbeda TIDAK berbagi hasil — siswa A tidak muncul di B dan sebaliknya", async () => {
    const [a, b] = await dalamSatuRender(() => Promise.all([reader.getEnrollmentMilikMentor(A), reader.getEnrollmentMilikMentor(B)]));
    assert.deepEqual(urut(a), ["e-a1", "e-a2"]);
    assert.deepEqual(urut(b), ["e-b1"]);
    assert.equal(b.has("e-a1"), false);
    assert.equal(a.has("e-b1"), false);
  });

  it("hasil di dalam render identik dengan tanpa memoize", async () => {
    const tanpa = await reader.getEnrollmentMilikMentor(A);
    const dengan = await dalamSatuRender(() => reader.getEnrollmentMilikMentor(A));
    assert.deepEqual(urut(dengan), urut(tanpa));
  });

  it("galat baca tetap fail-closed: Set kosong (bukan data yang lolos), juga di dalam render", async () => {
    tabelGagal.add("kelas_mentor");
    const [x, y] = await dalamSatuRender(async () => [await reader.getEnrollmentMilikMentor(A), await reader.getEnrollmentMilikMentor(A)] as const);
    assert.equal(x.size, 0);
    assert.equal(y.size, 0);
    // Render lain setelah database pulih → terbaca normal (galat tidak "menempel").
    tabelGagal.clear();
    assert.deepEqual(urut(await dalamSatuRender(() => reader.getEnrollmentMilikMentor(A))), ["e-a1", "e-a2"]);
  });
});

describe("dashboard mentor — tiga kartu berbagi satu pembacaan", () => {
  const tigaKartu = (id: string) =>
    Promise.all([dashboard.getMentorStats(id), dashboard.getMentorProgressByKelas(id), dashboard.getMentorKelasTerdaftar(id)]);

  it("hasil di dalam render SAMA PERSIS dengan tanpa memoize", async () => {
    const tanpa = await tigaKartu(A);
    const dengan = await dalamSatuRender(() => tigaKartu(A));
    assert.deepEqual(dengan, tanpa);
    assert.equal(dengan[0].siswaBinaan, 2);
    assert.equal(dengan[0].kelasDiampu, 1);
  });

  it("rantai kepemilikan/akses/pendaftaran dibaca SEKALI untuk ketiga kartu (sama dengan satu kartu saja)", async () => {
    // Pembanding: SATU kartu saja dalam satu render = satu rantai penuh.
    await dalamSatuRender(() => dashboard.getMentorKelasTerdaftar(A));
    const satuRantai = new Map(hitungan);

    hitungan = new Map();
    await dalamSatuRender(() => tigaKartu(A));

    for (const tabel of ["kelas", "enrollments", "kelas_mentor", "enrollment_subtes", "kelas_subtes_mentor", "user_roles"]) {
      assert.ok((satuRantai.get(tabel) ?? 0) > 0, `tabel ${tabel} harus tetap dibaca`);
      assert.equal(jumlah(tabel), satuRantai.get(tabel), `tabel ${tabel}: tiga kartu harus berbagi satu rantai`);
    }
  });

  it("total kueri turun jauh dibanding tanpa memoize", async () => {
    await tigaKartu(A);
    const tanpa = totalKueri();
    hitungan = new Map();
    await dalamSatuRender(() => tigaKartu(A));
    const dengan = totalKueri();
    assert.ok(dengan < tanpa * 0.6, `dengan=${dengan} tanpa=${tanpa}`);
  });

  it("progress sesi (sesi_kelas) dibaca sekali untuk kartu Rata-rata dan Progress Siswa Binaan", async () => {
    await dalamSatuRender(() => tigaKartu(A));
    assert.equal(jumlah("sesi_kelas"), 1);
  });

  it("mentor berbeda di render yang sama TIDAK berbagi hasil", async () => {
    const [a, b] = await dalamSatuRender(() => Promise.all([tigaKartu(A), tigaKartu(B)]));
    assert.equal(a[0].siswaBinaan, 2);
    assert.equal(b[0].siswaBinaan, 1);
    const namaSiswaA = a[1].flatMap((k) => k.siswa.map((s) => s.userId)).sort();
    const namaSiswaB = b[1].flatMap((k) => k.siswa.map((s) => s.userId)).sort();
    assert.deepEqual(namaSiswaA, ["u-e-a1", "u-e-a2"]);
    assert.deepEqual(namaSiswaB, ["u-e-b1"]);
    assert.deepEqual(a[2].map((k) => k.id), ["KA"]);
    assert.deepEqual(b[2].map((k) => k.id), ["KB"]);
  });

  it("kepemilikan gagal dibaca: dashboard tetap kosong (fail-closed), tidak menampilkan siswa", async () => {
    tabelGagal.add("kelas_mentor");
    const [stats, progres, kelas] = await dalamSatuRender(() => tigaKartu(A));
    assert.equal(stats.siswaBinaan, 0);
    assert.deepEqual(progres.flatMap((k) => k.siswa), []);
    assert.deepEqual(kelas.flatMap((k) => k.jumlahSiswa), kelas.map(() => 0));
  });
});

describe("tabel users dibaca sekali antara layout dan sapaan dashboard", () => {
  it("getAccountMenuData + getUserDisplayName untuk pengguna sama = satu kueri users", async () => {
    const [menuData, sapaan] = await dalamSatuRender(() => Promise.all([menu.getAccountMenuData(A, "mentor"), nama.getUserDisplayName(A, "Mentor")]));
    assert.equal(jumlah("users"), 1);
    assert.equal(menuData.firstName, "Mentor");
    assert.equal(menuData.fullName, "Mentor Aaa Pertama");
    assert.equal(menuData.avatarUrl, "http://x/a.png");
    assert.equal(sapaan, "Mas A");
  });

  it("hasil di dalam render sama dengan tanpa memoize", async () => {
    const tanpa = await Promise.all([menu.getAccountMenuData(B, "mentor"), nama.getUserDisplayName(B, "Mentor")]);
    assert.equal(jumlah("users"), 2);
    const dengan = await dalamSatuRender(() => Promise.all([menu.getAccountMenuData(B, "mentor"), nama.getUserDisplayName(B, "Mentor")]));
    assert.deepEqual(dengan, tanpa);
    assert.equal(dengan[1], "Mentor");
  });

  it("pengguna berbeda TIDAK berbagi hasil (nama dan avatar tidak bocor)", async () => {
    const [a, b, sapaanA, sapaanB] = await dalamSatuRender(() =>
      Promise.all([menu.getAccountMenuData(A, "mentor"), menu.getAccountMenuData(B, "mentor"), nama.getUserDisplayName(A, "Mentor"), nama.getUserDisplayName(B, "Mentor")]),
    );
    assert.equal(jumlah("users"), 2);
    assert.equal(a.fullName, "Mentor Aaa Pertama");
    assert.equal(b.fullName, "Mentor Bbb Kedua");
    assert.equal(a.avatarUrl, "http://x/a.png");
    assert.equal(b.avatarUrl, null);
    assert.equal(sapaanA, "Mas A");
    assert.equal(sapaanB, "Mentor");
  });

  it("baris users tidak ada: fallback sama seperti sebelumnya", async () => {
    const [menuData, sapaan] = await dalamSatuRender(() => Promise.all([menu.getAccountMenuData("hantu", "student"), nama.getUserDisplayName("hantu", "Kamu")]));
    assert.equal(menuData.firstName, "Pengguna");
    assert.equal(menuData.fullName, "Pengguna");
    assert.equal(menuData.avatarUrl, null);
    assert.equal(sapaan, "Kamu");
  });
});
