/**
 * Test Progress Kehadiran di Dashboard (Siswa & Mentor), Siswa Binaan, Kelas
 * Saya Mentor, dan Manajemen Siswa. Keputusan produk: progress = presensi saja,
 * dan HANYA sesi yang terkonfirmasi (dikonfirmasi siswa atau otomatis 24 jam)
 * yang terhitung — sesi menunggu konfirmasi, disangkal, dan dibatalkan tidak.
 * Bukan progres materi (enrollments.progres_persen).
 *
 * - Unit: lib/shared/progresSesi.ts (hitungSesiTerkonfirmasi, hitungProgresSesi,
 *   hitungRataRataProgres).
 * - Data layer: dijalankan terhadap Supabase TIRUAN di memori (tidak pernah
 *   menyentuh database asli).
 * - Regresi: nomor sesi berikutnya & batas penandaan harian mentor tidak berubah.
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
import { hitungStatusSesi, type SesiWaktuRow } from "@/lib/shared/statusSesi";

// ---------------------------------------------------------------------------
// Unit — fungsi bersama
// ---------------------------------------------------------------------------

const JAM = 60 * 60 * 1000;
const NOW = new Date("2026-10-17T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

/** Jenis sesi → baris sesi_kelas relatif terhadap `sekarang`. */
type Jenis = "dikonfirmasi" | "menunggu" | "otomatis" | "disangkal" | "disetujui" | "dibatalkan";
function baris(jenis: Jenis, sekarang: Date = NOW): SesiWaktuRow {
  const t = sekarang.getTime();
  switch (jenis) {
    case "dikonfirmasi": // siswa menjawab "Ya"
    case "disetujui": // disangkal lalu Admin "Setujui sebagai Valid" → status_siswa = dikonfirmasi
      return {
        dikonfirmasi_mentor: true,
        dikonfirmasi_mentor_pada: iso(t - 3 * JAM),
        status_siswa: "dikonfirmasi",
        dikonfirmasi_siswa_pada: iso(t - 2 * JAM),
      };
    case "menunggu": // ditandai 1 jam lalu, belum dijawab
      return { dikonfirmasi_mentor: true, dikonfirmasi_mentor_pada: iso(t - JAM), status_siswa: "belum", dikonfirmasi_siswa_pada: null };
    case "otomatis": // ditandai 25 jam lalu, tidak dijawab
      return { dikonfirmasi_mentor: true, dikonfirmasi_mentor_pada: iso(t - 25 * JAM), status_siswa: "belum", dikonfirmasi_siswa_pada: null };
    case "disangkal":
      return {
        dikonfirmasi_mentor: true,
        dikonfirmasi_mentor_pada: iso(t - 3 * JAM),
        status_siswa: "disangkal",
        dikonfirmasi_siswa_pada: iso(t - 2 * JAM),
      };
    case "dibatalkan": // Admin "Batalkan Sesi Ini" → reset ke belum terjadi
      return { dikonfirmasi_mentor: false, dikonfirmasi_mentor_pada: null, status_siswa: "belum", dikonfirmasi_siswa_pada: null };
  }
}

/** Jenis-jenis sesi pertama, sisanya belum ditandai (kosong), total `total` baris. */
function sesiRows(jenis: Jenis[], total = 10, sekarang: Date = NOW): SesiWaktuRow[] {
  return Array.from({ length: total }, (_, i) => baris(jenis[i] ?? "dibatalkan", sekarang));
}

describe("hitungProgresSesi / hitungSesiTerkonfirmasi — hanya sesi terkonfirmasi", () => {
  it("0 sesi terhitung dari 10 → 0%", () => {
    const terhitung = hitungSesiTerkonfirmasi(sesiRows([]), NOW);
    assert.deepEqual(hitungProgresSesi(terhitung, 10), { persen: 0, selesai: false });
  });

  it("3 dikonfirmasi + 1 menunggu = 3 dari 10 (30%), bukan 4", () => {
    const rows = sesiRows(["dikonfirmasi", "dikonfirmasi", "dikonfirmasi", "menunggu"]);
    const terhitung = hitungSesiTerkonfirmasi(rows, NOW);
    assert.equal(terhitung, 3);
    assert.deepEqual(hitungProgresSesi(terhitung, 10), { persen: 30, selesai: false });
  });

  it("kasus screenshot: sesi 1 otomatis, 2 & 3 terkonfirmasi, 4 menunggu → 3 dari 10 (30%)", () => {
    const rows = sesiRows(["otomatis", "dikonfirmasi", "dikonfirmasi", "menunggu"]);
    assert.equal(hitungSesiTerkonfirmasi(rows, NOW), 3);
    assert.equal(hitungProgresSesi(3, 10).persen, 30);
  });

  it("menunggu lalu dikonfirmasi siswa → angka naik jadi 4", () => {
    const rows = sesiRows(["dikonfirmasi", "dikonfirmasi", "dikonfirmasi", "menunggu"]);
    assert.equal(hitungSesiTerkonfirmasi(rows, NOW), 3);
    rows[3] = baris("dikonfirmasi"); // siswa menekan "Ya"
    assert.equal(hitungSesiTerkonfirmasi(rows, NOW), 4);
  });

  it("menunggu lalu lewat 24 jam → otomatis, ikut terhitung (tepat 24:00 sudah terhitung)", () => {
    const ditandai = Date.parse("2026-10-17T03:00:00.000Z");
    const row: SesiWaktuRow = {
      dikonfirmasi_mentor: true,
      dikonfirmasi_mentor_pada: iso(ditandai),
      status_siswa: "belum",
      dikonfirmasi_siswa_pada: null,
    };
    assert.equal(hitungSesiTerkonfirmasi([row], new Date(ditandai + 24 * JAM - 1)), 0);
    assert.equal(hitungSesiTerkonfirmasi([row], new Date(ditandai + 24 * JAM)), 1);
    assert.equal(hitungStatusSesi(row, new Date(ditandai + 24 * JAM)).status, "terkonfirmasi_otomatis");
  });

  it("disangkal tidak terhitung, dan tidak pernah jadi otomatis walau lewat 24 jam", () => {
    const rows = sesiRows(["disangkal", "disangkal", "disangkal"]);
    assert.equal(hitungSesiTerkonfirmasi(rows, NOW), 0);
    assert.equal(hitungSesiTerkonfirmasi(rows, new Date(NOW.getTime() + 30 * 24 * JAM)), 0);
    assert.deepEqual(hitungProgresSesi(0, 10), { persen: 0, selesai: false });
  });

  it("disangkal lalu disetujui Admin (jadi status_siswa = dikonfirmasi) → terhitung", () => {
    assert.equal(hitungSesiTerkonfirmasi([baris("disangkal")], NOW), 0);
    assert.equal(hitungStatusSesi(baris("disetujui"), NOW).status, "terkonfirmasi_siswa");
    assert.equal(hitungSesiTerkonfirmasi([baris("disetujui")], NOW), 1);
    assert.deepEqual(hitungProgresSesi(1, 10), { persen: 10, selesai: false });
  });

  it("dibatalkan (kembali belum terjadi) tidak terhitung", () => {
    assert.equal(hitungSesiTerkonfirmasi([baris("dibatalkan")], NOW), 0);
  });

  it("10 dari 10 terkonfirmasi → 100% dan selesai", () => {
    const terhitung = hitungSesiTerkonfirmasi(sesiRows(Array<Jenis>(10).fill("dikonfirmasi")), NOW);
    assert.deepEqual(hitungProgresSesi(terhitung, 10), { persen: 100, selesai: true });
  });

  it("semua 10 sesi sudah ditandai tapi 1 masih menunggu → 90%, belum selesai (sampai terkonfirmasi/otomatis)", () => {
    const rows = sesiRows([...Array<Jenis>(9).fill("dikonfirmasi"), "menunggu"]);
    const terhitung = hitungSesiTerkonfirmasi(rows, NOW);
    assert.equal(terhitung, 9);
    assert.deepEqual(hitungProgresSesi(terhitung, 10), { persen: 90, selesai: false });
    // Lewat 24 jam → otomatis → 100%.
    const nanti = new Date(NOW.getTime() + 24 * JAM);
    assert.deepEqual(hitungProgresSesi(hitungSesiTerkonfirmasi(rows, nanti), 10), { persen: 100, selesai: true });
  });

  it("aturan tepi lama tetap: tidak 0% bila ada yang terhitung, tidak 100% bila belum semua", () => {
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

  it("data tidak lengkap (ditandai tanpa waktu penandaan) fail-closed: tidak terhitung", () => {
    const row: SesiWaktuRow = { dikonfirmasi_mentor: true, dikonfirmasi_mentor_pada: null, status_siswa: "belum", dikonfirmasi_siswa_pada: null };
    assert.equal(hitungSesiTerkonfirmasi([row], new Date("2030-01-01T00:00:00.000Z")), 0);
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

/** Baris sesi_kelas untuk fake DB (waktu relatif terhadap SEKARANG nyata, karena loader memakai new Date()). */
function sesiDb(enrollmentId: string, jenis: Jenis[], total = 10, mentorId: string | null = MENTOR): Row[] {
  return sesiRows(jenis, total, new Date()).map((s, i) => ({
    enrollment_id: enrollmentId,
    nomor_sesi: i + 1,
    mentor_id: s.dikonfirmasi_mentor ? mentorId : null,
    nama_mapel: null,
    tanggal_dilaksanakan: null,
    ...s,
  }));
}

type SiswaDashboardModule = typeof import("@/lib/dashboard/getSiswaDashboardData");
type MentorDashboardModule = typeof import("@/lib/mentor/dashboardData");
type SiswaBinaanModule = typeof import("@/lib/mentor/getSiswaBinaanData");
type ManajemenSiswaModule = typeof import("@/lib/admin/getManajemenSiswaData");
type KelasSayaModule = typeof import("@/lib/siswa/getKelasSayaData");
type KelasDetailModule = typeof import("@/lib/siswa/getKelasDetail");
type KelasSayaMentorModule = typeof import("@/lib/mentor/getKelasSayaData");
let siswaDashboard: SiswaDashboardModule;
let mentorDashboard: MentorDashboardModule;
let siswaBinaan: SiswaBinaanModule;
let manajemenSiswa: ManajemenSiswaModule;
let kelasSaya: KelasSayaModule;
let kelasDetail: KelasDetailModule;
let kelasSayaMentor: KelasSayaMentorModule;

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
  kelasSayaMentor = await import("@/lib/mentor/getKelasSayaData");
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
      // e1: 1 dikonfirmasi + 1 otomatis = 2 terhitung; sesi ke-3 masih menunggu (TIDAK terhitung).
      ...sesiDb("e1", ["dikonfirmasi", "otomatis", "menunggu"]),
      ...sesiDb("e2", ["disangkal", "disangkal", "disangkal"]),
      ...sesiDb("e3", ["disetujui"]),
      ...sesiDb("e4", Array<Jenis>(10).fill("dikonfirmasi")),
      ...sesiDb("e5", Array<Jenis>(10).fill("dikonfirmasi")),
      ...sesiDb("e6", Array<Jenis>(5).fill("dikonfirmasi")),
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

describe("kasus screenshot: sesi 1 otomatis, 2 & 3 terkonfirmasi, sesi 4 menunggu → 3 dari 10 (30%) di semua tempat", () => {
  /** Ganti sesi pendaftaran e1 (siswa s1) dengan pola screenshot. Sesi 4 baru saja ditandai MENTOR. */
  function pasangPolaScreenshot() {
    db.sesi_kelas = db.sesi_kelas.filter((r) => r.enrollment_id !== "e1");
    const rows = sesiDb("e1", ["otomatis", "dikonfirmasi", "dikonfirmasi", "menunggu"]);
    rows[3].dikonfirmasi_mentor_pada = new Date().toISOString();
    db.sesi_kelas.push(...rows);
    return rows;
  }

  async function semuaPersenUntukS1() {
    const detail = await kelasDetail.getSesiKehadiran("e1");
    const sesiMentor = (await kelasSayaMentor.getSesiSiswaByKelasId(KELAS, MENTOR, "utama")).find((r) => r.enrollmentId === "e1");
    const progresMentor = (await mentorDashboard.getMentorProgressByKelas(MENTOR))[0].siswa.find((s) => s.userId === "s1");
    const binaan = (await siswaBinaan.getSiswaBinaanGrouped(MENTOR))[0].siswa.find((s) => s.userId === "s1");
    return {
      dashboardSiswa: (await siswaDashboard.getSiswaDashboardData("s1")).progressBelajar[0]?.persen,
      kelasSaya: (await kelasSaya.getKelasSaya("s1"))[0]?.progresPersen,
      detailKelasSiswa: hitungProgresSesi(detail.validCount, 10).persen,
      kelasSayaMentor: hitungProgresSesi(sesiMentor?.sesiValidCount ?? -1, 10).persen,
      dashboardMentor: progresMentor?.progresPersen,
      siswaBinaan: binaan?.progresPersen,
      siswaBinaanDetail: (await siswaBinaan.getSiswaBinaanDetail(MENTOR, "s1", KELAS))?.progresPersen,
      admin: (await manajemenSiswa.getSiswaKelasDiikuti("s1"))[0]?.progresPersen,
      teksSiswa: detail.validCount,
      teksMentor: sesiMentor?.sesiValidCount,
    };
  }

  it("30% dan teks '3 dari 10 sesi' di dashboard siswa/mentor, /kelas, /kelas/{id}, /kelas-saya/{id}, /siswa-binaan, admin", async () => {
    pasangPolaScreenshot();
    assert.deepEqual(await semuaPersenUntukS1(), {
      dashboardSiswa: 30,
      kelasSaya: 30,
      detailKelasSiswa: 30,
      kelasSayaMentor: 30,
      dashboardMentor: 30,
      siswaBinaan: 30,
      siswaBinaanDetail: 30,
      admin: 30,
      teksSiswa: 3,
      teksMentor: 3,
    });
  });

  it("daftar sesi tetap menampilkan SEMUA sesi yang ditandai, termasuk 'Menunggu konfirmasimu'", async () => {
    pasangPolaScreenshot();
    const detail = await kelasDetail.getSesiKehadiran("e1");
    assert.deepEqual(
      detail.riwayat.map((r) => [r.nomorSesi, r.status]),
      [
        [1, "terkonfirmasi_otomatis"],
        [2, "terkonfirmasi_siswa"],
        [3, "terkonfirmasi_siswa"],
        [4, "menunggu_siswa"],
      ],
    );
    assert.equal(detail.pending?.nomorSesi, 4);
    const sesiMentor = (await kelasSayaMentor.getSesiSiswaByKelasId(KELAS, MENTOR, "utama")).find((r) => r.enrollmentId === "e1");
    assert.equal(sesiMentor?.riwayat.length, 4);
    assert.equal(sesiMentor?.sesiMenungguSiswa, 1);
  });

  it("sesi 4 dikonfirmasi siswa ('Ya') → semua tempat naik jadi 4 dari 10 (40%)", async () => {
    const rows = pasangPolaScreenshot();
    Object.assign(rows[3], { status_siswa: "dikonfirmasi", dikonfirmasi_siswa_pada: new Date().toISOString() });
    const hasil = await semuaPersenUntukS1();
    assert.equal(hasil.teksSiswa, 4);
    for (const [tempat, nilai] of Object.entries(hasil)) {
      if (tempat.startsWith("teks")) continue;
      assert.equal(nilai, 40, tempat);
    }
  });

  it("sesi 4 disangkal → tetap 3 dari 10; disetujui Admin → 4 dari 10", async () => {
    const rows = pasangPolaScreenshot();
    Object.assign(rows[3], { status_siswa: "disangkal", dikonfirmasi_siswa_pada: new Date().toISOString() });
    assert.equal((await semuaPersenUntukS1()).teksSiswa, 3);
    rows[3].status_siswa = "dikonfirmasi"; // Admin: Setujui sebagai Valid
    assert.equal((await semuaPersenUntukS1()).teksSiswa, 4);
  });

  it("sesi 4 dibatalkan Admin (reset ke belum terjadi) → tetap 3 dari 10", async () => {
    const rows = pasangPolaScreenshot();
    Object.assign(rows[3], { dikonfirmasi_mentor: false, dikonfirmasi_mentor_pada: null, mentor_id: null, status_siswa: "belum" });
    assert.equal((await semuaPersenUntukS1()).teksSiswa, 3);
  });

  it("sesi 4 lewat 24 jam tanpa jawaban → otomatis, naik jadi 4 dari 10", async () => {
    const rows = pasangPolaScreenshot();
    rows[3].dikonfirmasi_mentor_pada = new Date(Date.now() - 25 * JAM).toISOString();
    assert.equal((await semuaPersenUntukS1()).teksSiswa, 4);
  });

  it("REGRESI: nomor sesi berikutnya & batas penandaan harian mentor tetap berdasar sesi yang SUDAH DITANDAI", async () => {
    pasangPolaScreenshot();
    const sesiMentor = (await kelasSayaMentor.getSesiSiswaByKelasId(KELAS, MENTOR, "utama")).find((r) => r.enrollmentId === "e1");
    // 4 sesi sudah ditandai (walau baru 3 terkonfirmasi) → berikutnya sesi ke-5, bukan ke-4.
    assert.equal(sesiMentor?.sesiBerikutnya, 5);
    assert.equal(sesiMentor?.sesiDitandaiSaya, 4);
    // Sesi 4 menunggu ditandai mentor ini hari ini → tombol tandai terkunci sampai besok.
    assert.equal(sesiMentor?.ditandaiHariIni, true);
  });

  it("REGRESI: semua sesi sudah ditandai tapi sebagian menunggu → tombol tandai hilang, progress < 100%", async () => {
    db.sesi_kelas = db.sesi_kelas.filter((r) => r.enrollment_id !== "e1");
    db.sesi_kelas.push(...sesiDb("e1", [...Array<Jenis>(9).fill("dikonfirmasi"), "menunggu"]));
    const sesiMentor = (await kelasSayaMentor.getSesiSiswaByKelasId(KELAS, MENTOR, "utama")).find((r) => r.enrollmentId === "e1");
    assert.equal(sesiMentor?.sesiBerikutnya, null);
    assert.equal(sesiMentor?.sesiValidCount, 9);
    assert.deepEqual(
      [(await kelasSaya.getKelasSaya("s1"))[0]?.progresPersen, (await kelasSaya.getKelasSaya("s1"))[0]?.selesai],
      [90, false],
    );
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

  it("definisi baru memakai hitungStatusSesi (dikonfirmasi siswa / otomatis); statusSesi.ts tidak berubah arah", () => {
    assert.ok(!baca("lib/shared/statusSesi.ts").includes("hitungProgresSesi"));
    const progres = kode("lib/shared/progresSesi.ts");
    assert.match(progres, /hitungStatusSesi\(row, now\)/);
    assert.match(progres, /status === "terkonfirmasi_siswa" \|\| status === "terkonfirmasi_otomatis"/);
  });

  it("nomor sesi berikutnya & batas harian TIDAK memakai definisi progress (tetap berdasar dikonfirmasi_mentor)", () => {
    const mentorData = kode("lib/mentor/getKelasSayaData.ts");
    assert.match(mentorData, /sesiList\.find\(\(s\) => !s\.dikonfirmasi_mentor\)\?\.nomor_sesi/);
    assert.match(mentorData, /s\.dikonfirmasi_mentor &&\s+s\.mentor_id === mentorId/);
    const route = kode("app/api/mentor/sesi/route.ts");
    assert.ok(!route.includes("progresSesi"), "route penandaan mentor tidak boleh memakai definisi progress");
    assert.match(route, /dikonfirmasi_mentor_pada/);
  });

  it("honor (scripts/laporan-honor-v2) tidak memakai fungsi progress", () => {
    assert.ok(!baca("scripts/laporan-honor-v2/hitung.ts").includes("progresSesi"));
    assert.ok(!baca("scripts/laporan-honor-v2.ts").includes("progresSesi"));
  });
});
