/**
 * Test Progress Kehadiran di Dashboard (Siswa & Mentor), Siswa Binaan, dan
 * Manajemen Siswa. Keputusan produk: progress = presensi saja (sesi terhitung /
 * jumlah_sesi paket), bukan progres materi (enrollments.progres_persen).
 *
 * - Unit: lib/shared/progresSesi.ts (hitungProgresSesi, hitungRataRataProgres).
 * - Data layer: dijalankan terhadap Supabase TIRUAN di memori (tidak pernah
 *   menyentuh database asli).
 * - Statis: rumus progress hanya ada di SATU fungsi bersama.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import path from "node:path";
import {
  hitungProgresSesi,
  hitungRataRataProgres,
  hitungSesiTerkonfirmasi,
} from "@/lib/shared/progresSesi";

// ---------------------------------------------------------------------------
// Unit — fungsi bersama
// ---------------------------------------------------------------------------

/** n sesi dengan status siswa tertentu (sudah ditandai mentor), sisanya belum ditandai. */
function sesiRows(statusSiswa: string[], total = 10) {
  return Array.from({ length: total }, (_, i) => ({
    dikonfirmasi_mentor: i < statusSiswa.length,
    status_siswa: statusSiswa[i] ?? "belum",
  }));
}

describe("hitungProgresSesi", () => {
  it("0 sesi terhitung dari 10 → 0%", () => {
    assert.deepEqual(hitungProgresSesi(hitungSesiTerkonfirmasi(sesiRows([])), 10), { persen: 0, selesai: false });
  });

  it("2 dari 10 → 20% (bukan 0%)", () => {
    const terhitung = hitungSesiTerkonfirmasi(sesiRows(["dikonfirmasi", "belum"]));
    assert.equal(terhitung, 2);
    assert.deepEqual(hitungProgresSesi(terhitung, 10), { persen: 20, selesai: false });
  });

  it("semua sesi disangkal → 0%", () => {
    const terhitung = hitungSesiTerkonfirmasi(sesiRows(["disangkal", "disangkal", "disangkal"]));
    assert.equal(terhitung, 0);
    assert.deepEqual(hitungProgresSesi(terhitung, 10), { persen: 0, selesai: false });
  });

  it("sesi disangkal lalu disetujui Admin (jadi dikonfirmasi) → ikut terhitung", () => {
    assert.equal(hitungSesiTerkonfirmasi(sesiRows(["disangkal"])), 0);
    // Admin "Setujui sebagai Valid" → status_siswa = 'dikonfirmasi'.
    const terhitung = hitungSesiTerkonfirmasi(sesiRows(["dikonfirmasi"]));
    assert.equal(terhitung, 1);
    assert.deepEqual(hitungProgresSesi(terhitung, 10), { persen: 10, selesai: false });
  });

  it("10 dari 10 → 100% dan selesai", () => {
    const terhitung = hitungSesiTerkonfirmasi(sesiRows(Array<string>(10).fill("dikonfirmasi")));
    assert.deepEqual(hitungProgresSesi(terhitung, 10), { persen: 100, selesai: true });
  });

  it("tidak pernah 0% kalau ada sesi terhitung, dan tidak 100% kalau belum semua", () => {
    assert.equal(hitungProgresSesi(1, 300).persen, 1); // 0,33% dibulatkan ke 0 → ditahan di 1
    assert.deepEqual(hitungProgresSesi(199, 200), { persen: 99, selesai: false }); // 99,5% → bukan 100
    assert.deepEqual(hitungProgresSesi(200, 200), { persen: 100, selesai: true });
  });

  it("batas: tidak lebih dari 100%, jumlah sesi 0/negatif atau angka tak sah → 0%", () => {
    assert.equal(hitungProgresSesi(12, 10).persen, 100);
    assert.deepEqual(hitungProgresSesi(3, 0), { persen: 0, selesai: false });
    assert.deepEqual(hitungProgresSesi(3, -5), { persen: 0, selesai: false });
    assert.deepEqual(hitungProgresSesi(Number.NaN, 10), { persen: 0, selesai: false });
    assert.deepEqual(hitungProgresSesi(-2, 10), { persen: 0, selesai: false });
  });

  it("pembulatan konsisten (1/3 → 33, 2/3 → 67)", () => {
    assert.equal(hitungProgresSesi(1, 3).persen, 33);
    assert.equal(hitungProgresSesi(2, 3).persen, 67);
  });
});

describe("hitungRataRataProgres", () => {
  it("daftar kosong → null (tampil '-')", () => {
    assert.equal(hitungRataRataProgres([]), null);
  });

  it("rata-rata dibulatkan; semua 0 → 0", () => {
    assert.equal(hitungRataRataProgres([20, 0, 10, 100, 0]), 26);
    assert.equal(hitungRataRataProgres([0, 0]), 0);
  });

  it("rata-rata > 0 tidak tampil 0%, dan 100% hanya kalau semuanya 100%", () => {
    assert.equal(hitungRataRataProgres([1, ...Array<number>(99).fill(0)]), 1); // 0,01% → ditahan di 1
    assert.equal(hitungRataRataProgres([100, 100]), 100);
    assert.equal(hitungRataRataProgres([99, ...Array<number>(99).fill(100)]), 99); // 99,99% → bukan 100
  });
});

// ---------------------------------------------------------------------------
// Data layer — Supabase tiruan
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
let db: Db;

class FakeQuery implements PromiseLike<{ data: Row[]; error: null; count: number }> {
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
  limit(n: number) {
    this.rows = this.rows.slice(0, n);
    return this;
  }
  maybeSingle() {
    return Promise.resolve({ data: this.rows[0] ?? null, error: null });
  }
  then<A, B>(
    onfulfilled?: ((value: { data: Row[]; error: null; count: number }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    return Promise.resolve({ data: this.rows, error: null, count: this.rows.length }).then(onfulfilled, onrejected);
  }
}

/** Method query yang tidak relevan untuk tes ini (not/gte/or/…) → diteruskan apa adanya. */
function lenient(query: FakeQuery): FakeQuery {
  return new Proxy(query, {
    get(target, prop, receiver) {
      if (prop in target) {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(receiver) : value;
      }
      return () => receiver;
    },
  });
}

function fakeFrom(table: string) {
  const rows = db[table] ?? [];
  if (table === "kelas") {
    return lenient(
      new FakeQuery(
        rows.map((k) => ({
          ...k,
          subtes: null,
          enrollments: (db.enrollments ?? [])
            .filter((e) => e.kelas_id === k.id)
            .map((e) => ({ ...e, users: db.users.find((u) => u.id === e.user_id) ?? null })),
        })),
      ),
    );
  }
  if (table === "enrollments") {
    return lenient(
      new FakeQuery(
        rows.map((e) => ({
          ...e,
          kelas: db.kelas.find((k) => k.id === e.kelas_id) ?? null,
          users: db.users.find((u) => u.id === e.user_id) ?? null,
        })),
      ),
    );
  }
  return lenient(new FakeQuery(rows));
}

const MENTOR = "mentor-1";
const KELAS = "kelas-uji";

function enrollment(id: string, userId: string, extra: Row = {}): Row {
  // progres_persen SENGAJA dibuat "menyesatkan" (materi) — tidak boleh dipakai.
  return {
    id,
    user_id: userId,
    kelas_id: KELAS,
    status_pembayaran: "lunas",
    progres_persen: 77,
    tanggal_keluar: null,
    sumber: "manual",
    ...extra,
  };
}

function sesiDb(enrollmentId: string, statusSiswa: string[], total = 10): Row[] {
  return sesiRows(statusSiswa, total).map((s, i) => ({ enrollment_id: enrollmentId, nomor_sesi: i + 1, ...s }));
}

type SiswaDashboardModule = typeof import("@/lib/dashboard/getSiswaDashboardData");
type MentorDashboardModule = typeof import("@/lib/mentor/dashboardData");
type SiswaBinaanModule = typeof import("@/lib/mentor/getSiswaBinaanData");
type ManajemenSiswaModule = typeof import("@/lib/admin/getManajemenSiswaData");
type KelasSayaModule = typeof import("@/lib/siswa/getKelasSayaData");
type KelasDetailModule = typeof import("@/lib/siswa/getKelasDetail");
let siswaDashboard: SiswaDashboardModule;
let mentorDashboard: MentorDashboardModule;
let siswaBinaan: SiswaBinaanModule;
let manajemenSiswa: ManajemenSiswaModule;
let kelasSaya: KelasSayaModule;
let kelasDetail: KelasDetailModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;

  siswaDashboard = await import("@/lib/dashboard/getSiswaDashboardData");
  mentorDashboard = await import("@/lib/mentor/dashboardData");
  siswaBinaan = await import("@/lib/mentor/getSiswaBinaanData");
  manajemenSiswa = await import("@/lib/admin/getManajemenSiswaData");
  kelasSaya = await import("@/lib/siswa/getKelasSayaData");
  kelasDetail = await import("@/lib/siswa/getKelasDetail");
});

beforeEach(() => {
  db = {
    users: [
      { id: "s1", nama: "Siswa Satu", nama_panggilan: "Satu", avatar_url: null },
      { id: "s2", nama: "Siswa Dua", nama_panggilan: null, avatar_url: null },
      { id: "s3", nama: "Siswa Tiga", nama_panggilan: null, avatar_url: null },
      { id: "s4", nama: "Siswa Empat", nama_panggilan: null, avatar_url: null },
      { id: "s5", nama: "Siswa Keluar", nama_panggilan: null, avatar_url: null },
      { id: "s6", nama: "Siswa Belum Bayar", nama_panggilan: null, avatar_url: null },
      { id: "s7", nama: "Siswa Tanpa Sesi", nama_panggilan: null, avatar_url: null },
    ],
    kelas: [
      {
        id: KELAS,
        nama: "[UJI] Presensi E2E",
        mentor_id: MENTOR,
        jumlah_sesi: 10,
        tingkat_kelas: "kelas_12",
        jadwal: null,
        jadwal_pilih_siswa: false,
        program_kategori: "konsultasi",
        mode_pembelajaran: "online",
        subtes_id: null,
        mentor: { nama: "Mentor Uji" },
      },
    ],
    enrollments: [
      enrollment("e1", "s1"), // 2 dari 10 → 20%
      enrollment("e2", "s2"), // semua disangkal → 0%
      enrollment("e3", "s3"), // disangkal lalu disetujui → 1 sesi → 10%
      enrollment("e4", "s4"), // 10 dari 10 → 100%
      enrollment("e5", "s5", { tanggal_keluar: "2026-10-30T00:00:00.000Z" }), // keluar, 10 dari 10
      enrollment("e6", "s6", { status_pembayaran: "menunggu" }), // belum bayar
      enrollment("e7", "s7"), // belum ada baris sesi sama sekali → 0%
    ],
    sesi_kelas: [
      ...sesiDb("e1", ["dikonfirmasi", "belum"]),
      ...sesiDb("e2", ["disangkal", "disangkal", "disangkal"]),
      ...sesiDb("e3", ["dikonfirmasi"]),
      ...sesiDb("e4", Array<string>(10).fill("dikonfirmasi")),
      ...sesiDb("e5", Array<string>(10).fill("dikonfirmasi")),
      ...sesiDb("e6", ["dikonfirmasi", "dikonfirmasi", "dikonfirmasi", "dikonfirmasi", "dikonfirmasi"]),
    ],
  };
});

describe("Dashboard Siswa — Progress Belajar", () => {
  it("2 dari 10 sesi → 20% (bukan progres materi 77%)", async () => {
    const data = await siswaDashboard.getSiswaDashboardData("s1");
    assert.deepEqual(data.progressBelajar, [{ subtes: "[UJI] Presensi E2E", persen: 20 }]);
  });

  it("angkanya sama dengan Kelas Saya (/kelas) dan Progress Kehadiran di detail kelas", async () => {
    for (const [siswa, enrollmentId] of [["s1", "e1"], ["s2", "e2"], ["s3", "e3"], ["s4", "e4"], ["s7", "e7"]]) {
      const dashboard = (await siswaDashboard.getSiswaDashboardData(siswa)).progressBelajar[0]?.persen;
      const halamanKelas = (await kelasSaya.getKelasSaya(siswa))[0]?.progresPersen;
      const { validCount } = await kelasDetail.getSesiKehadiran(enrollmentId);
      assert.equal(dashboard, halamanKelas, `siswa ${siswa}`);
      assert.equal(dashboard, hitungProgresSesi(validCount, 10).persen, `siswa ${siswa}`);
    }
  });

  it("pendaftaran yang belum lunas tidak muncul di Progress Belajar", async () => {
    const data = await siswaDashboard.getSiswaDashboardData("s6");
    assert.deepEqual(data.progressBelajar, []);
  });

  it("enrollments.progres_persen (materi) tidak mempengaruhi angka", async () => {
    for (const e of db.enrollments) e.progres_persen = 0;
    assert.equal((await siswaDashboard.getSiswaDashboardData("s1")).progressBelajar[0]?.persen, 20);
    for (const e of db.enrollments) e.progres_persen = 100;
    assert.equal((await siswaDashboard.getSiswaDashboardData("s1")).progressBelajar[0]?.persen, 20);
  });
});

describe("Dashboard Mentor", () => {
  it("rata-rata hanya dari siswa aktif: (20 + 0 + 10 + 100 + 0) / 5 = 26% — yang keluar & belum bayar tidak ikut", async () => {
    const stats = await mentorDashboard.getMentorStats(MENTOR);
    assert.equal(stats.rataRataProgress, 26);
    assert.equal(stats.siswaBinaan, 5); // s1, s2, s3, s4, s7 (bukan s5 keluar / s6 belum bayar)
    assert.equal(stats.kelasDiampu, 1);
  });

  it("siswa yang keluar tidak mengubah rata-rata (meski 100%)", async () => {
    const sebelum = (await mentorDashboard.getMentorStats(MENTOR)).rataRataProgress;
    db.enrollments.find((e) => e.id === "e4")!.tanggal_keluar = "2026-10-31T00:00:00.000Z";
    const sesudah = (await mentorDashboard.getMentorStats(MENTOR)).rataRataProgress;
    assert.equal(sebelum, 26);
    assert.equal(sesudah, 8); // (20 + 0 + 10 + 0) / 4 = 7,5 → 8
  });

  it("daftar Progress Siswa Binaan: per siswa sama dengan halaman kelas, tanpa siswa keluar", async () => {
    const [kelas] = await mentorDashboard.getMentorProgressByKelas(MENTOR);
    const persen = Object.fromEntries(kelas.siswa.map((s) => [s.userId, s.progresPersen]));
    assert.deepEqual(persen, { s1: 20, s2: 0, s3: 10, s4: 100, s7: 0 });
    const halamanKelas = await kelasSaya.getKelasSaya("s1");
    assert.equal(persen.s1, halamanKelas[0]?.progresPersen);
  });

  it("belum ada siswa aktif → rata-rata null (ditampilkan '-' seperti sebelumnya)", async () => {
    db.enrollments = [];
    const stats = await mentorDashboard.getMentorStats(MENTOR);
    assert.equal(stats.rataRataProgress, null);
    assert.equal(stats.siswaBinaan, 0);
  });

  it("semua siswa sudah keluar → null, bukan 0%", async () => {
    for (const e of db.enrollments) e.tanggal_keluar = "2026-10-30T00:00:00.000Z";
    assert.equal((await mentorDashboard.getMentorStats(MENTOR)).rataRataProgress, null);
  });

  it("kelas tanpa pendaftar: Kelas Terdaftar menghitung siswa aktif saja", async () => {
    const [kelas] = await mentorDashboard.getMentorKelasTerdaftar(MENTOR);
    assert.equal(kelas.jumlahSiswa, 5);
  });
});

describe("Siswa Binaan Mentor & Manajemen Siswa Admin", () => {
  it("daftar /siswa-binaan: progress presensi, tanpa siswa keluar", async () => {
    const [grup] = await siswaBinaan.getSiswaBinaanGrouped(MENTOR);
    const persen = Object.fromEntries(grup.siswa.map((s) => [s.userId, s.progresPersen]));
    assert.deepEqual(persen, { s1: 20, s2: 0, s3: 10, s4: 100, s7: 0 });
  });

  it("detail siswa binaan: 2 dari 10 = 20%", async () => {
    const detail = await siswaBinaan.getSiswaBinaanDetail(MENTOR, "s1", KELAS);
    assert.equal(detail?.progresPersen, 20);
  });

  it("Manajemen Siswa Admin: Kelas Diikuti memakai progress presensi", async () => {
    const [item] = await manajemenSiswa.getSiswaKelasDiikuti("s1");
    assert.equal(item.progresPersen, 20);
  });
});

// ---------------------------------------------------------------------------
// Statis — rumus hanya di satu fungsi bersama
// ---------------------------------------------------------------------------

const baca = (relatif: string) => readFileSync(path.join(process.cwd(), relatif), "utf8");
/** Kode saja — komentar boleh menyebut progres_persen untuk menjelaskan kenapa tidak dipakai. */
const kode = (relatif: string) => baca(relatif).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("rumus progress hanya ada di satu fungsi bersama", () => {
  const FILE_DATA = [
    "lib/dashboard/getSiswaDashboardData.ts",
    "lib/mentor/dashboardData.ts",
    "lib/mentor/getSiswaBinaanData.ts",
    "lib/admin/getManajemenSiswaData.ts",
    "lib/siswa/getKelasSayaData.ts",
  ];

  it("tidak ada lagi yang membaca enrollments.progres_persen untuk angka progress", () => {
    for (const file of FILE_DATA) {
      assert.ok(!kode(file).includes("progres_persen"), `${file} masih membaca progres_persen`);
    }
  });

  it("semua file data memakai fungsi bersama (progresSesiData / progresSesi)", () => {
    for (const file of FILE_DATA) {
      assert.match(baca(file), /lib\/shared\/progresSesi(Data)?"/, `${file} tidak memakai fungsi bersama`);
    }
  });

  it("tidak ada rumus persen sendiri (Math.round(... * 100)) di file data & komponen progress", () => {
    for (const file of [
      ...FILE_DATA,
      "components/siswa/SesiKehadiranSection.tsx",
      "components/dashboard/MentorDashboardOverview.tsx",
      "components/dashboard/DashboardOverview.tsx",
      "components/mentor/SiswaBinaanList.tsx",
    ]) {
      assert.ok(!/\*\s*100/.test(kode(file)), `${file} punya rumus persen sendiri`);
    }
  });

  it("bar progress di detail kelas memakai hitungProgresSesi", () => {
    assert.match(baca("components/siswa/SesiKehadiranSection.tsx"), /hitungProgresSesi\(validCount, jumlahSesi\)/);
  });

  it("rumus progres MATERI tidak disentuh (toggle-selesai tetap menulis progres_persen)", () => {
    assert.match(baca("app/api/materi/[materiId]/toggle-selesai/route.ts"), /progres_persen: progresPersen/);
  });

  it("aturan lain tidak berubah: statusSesi.ts dan hariWib.ts tidak menyebut progres", () => {
    assert.ok(!baca("lib/shared/statusSesi.ts").includes("hitungProgresSesi"));
    assert.match(baca("lib/shared/progresSesi.ts"), /return row\.dikonfirmasi_mentor && row\.status_siswa !== "disangkal";/);
  });
});
