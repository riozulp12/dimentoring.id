/**
 * Test halaman "Kelas Saya" (Siswa) — definisi Progress Kehadiran
 * (lib/shared/progresSesi.ts) + data layer-nya, dijalankan terhadap Supabase
 * TIRUAN di memori (tidak pernah menyentuh database asli).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { hitungProgresSesi, hitungSesiTerkonfirmasi } from "@/lib/shared/progresSesi";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

/** Query builder tiruan — cuma method yang dipakai data layer yang diuji.
 * update/delete baru dijalankan saat query di-await, ke baris yang lolos filter. */
class FakeQuery implements PromiseLike<{ data: Row[]; error: null; count: number }> {
  private mutation: { type: "update"; values: Row } | { type: "delete" } | null = null;

  constructor(
    private rows: Row[],
    private table: string,
  ) {}

  update(values: Row) {
    this.mutation = { type: "update", values };
    return this;
  }
  delete() {
    this.mutation = { type: "delete" };
    return this;
  }
  insert(values: Row | Row[]) {
    (db[this.table] ??= []).push(...(Array.isArray(values) ? values : [values]));
    return this;
  }

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
  or() {
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    const dir = options?.ascending === false ? -1 : 1;
    this.rows = [...this.rows].sort((a, b) => {
      const x = a[column] as string | null;
      const y = b[column] as string | null;
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return x < y ? -dir : dir;
    });
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
    if (this.mutation?.type === "update") {
      for (const row of this.rows) Object.assign(row, this.mutation.values);
    } else if (this.mutation?.type === "delete") {
      db[this.table] = (db[this.table] ?? []).filter((row) => !this.rows.includes(row));
    }
    return Promise.resolve({ data: this.rows, error: null, count: this.rows.length }).then(onfulfilled, onrejected);
  }
}

let db: Db;

/** Tiruan `supabaseServer.from` — embed `kelas:kelas_id(...)` di enrollments. */
function fakeFrom(table: string) {
  const rows = db[table] ?? [];
  if (table === "enrollments") {
    return new FakeQuery(
      rows.map((row) => ({ ...row, kelas: db.kelas.find((k) => k.id === row.kelas_id) ?? null })),
      table,
    );
  }
  return new FakeQuery(rows, table);
}

function kelas(id: string, extra: Row = {}): Row {
  return {
    id,
    nama: `Kelas ${id}`,
    tipe_kelas: "grouping",
    mode_pembelajaran: "online",
    harga: 100000,
    diskon_persen: 0,
    kapasitas: 10,
    deskripsi: null,
    program_kategori: "snbt",
    tingkat_kelas: "kelas_12",
    link_lynkid: null,
    jadwal: null,
    jadwal_pilih_siswa: false,
    jumlah_sesi: 10,
    tampil_di_katalog: true,
    subtes_id: null,
    subtes: null,
    mentor: null,
    created_at: `2026-01-0${id.length}`,
    ...extra,
  };
}

/** n sesi pertama ditandai mentor dengan status siswa tertentu, sisanya belum ditandai. */
function sesi(enrollmentId: string, statusSiswa: string[], total = 10): Row[] {
  return Array.from({ length: total }, (_, i) => ({
    enrollment_id: enrollmentId,
    nomor_sesi: i + 1,
    dikonfirmasi_mentor: i < statusSiswa.length,
    status_siswa: statusSiswa[i] ?? "belum",
  }));
}

const SISWA = "siswa-1";
const SISWA_BARU = "siswa-baru";

type KelasSayaModule = typeof import("@/lib/siswa/getKelasSayaData");
type KelasDetailModule = typeof import("@/lib/siswa/getKelasDetail");
type ProgramModule = typeof import("@/lib/dashboard/getProgramData");
type InfoModule = typeof import("@/lib/dashboard/getInfoBeasiswaEvent");
type CheckoutModule = typeof import("@/lib/payment/getKelasForCheckout");
type ValidateModule = typeof import("@/lib/admin/validateKelasInput");
type KelolaKelasRouteModule = typeof import("@/app/api/kelola-kelas/[kelasId]/route");
type SessionModule = typeof import("@/lib/auth/session");

let kelasSayaData: KelasSayaModule;
let kelasDetail: KelasDetailModule;
let programData: ProgramModule;
let infoData: InfoModule;
let checkoutData: CheckoutModule;
let validateKelas: ValidateModule;
let kelolaKelasRoute: KelolaKelasRouteModule;
let sessionLib: SessionModule;

before(async () => {
  // Nilai dummy — client aslinya tidak pernah dipakai, `from` diganti tiruan.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;

  kelasSayaData = await import("@/lib/siswa/getKelasSayaData");
  kelasDetail = await import("@/lib/siswa/getKelasDetail");
  programData = await import("@/lib/dashboard/getProgramData");
  infoData = await import("@/lib/dashboard/getInfoBeasiswaEvent");
  checkoutData = await import("@/lib/payment/getKelasForCheckout");
  validateKelas = await import("@/lib/admin/validateKelasInput");
  kelolaKelasRoute = await import("@/app/api/kelola-kelas/[kelasId]/route");
  sessionLib = await import("@/lib/auth/session");
});

beforeEach(() => {
  db = {
    kelas: [
      kelas("A"),
      kelas("B"),
      kelas("C"),
      kelas("D"),
      // Belum diikuti siapa pun — kandidat rekomendasi/katalog.
      kelas("MTK", { subtes_id: "subtes-mtk", kapasitas: 5 }),
      kelas("X1", { kapasitas: 30, program_kategori: "tka" }),
      kelas("X2", { kapasitas: 20 }),
      kelas("X3", { kapasitas: 8 }),
      kelas("X4", { kapasitas: 7 }),
      kelas("X5", { kapasitas: 6 }),
      kelas("X6", { kapasitas: 4 }),
      kelas("X7", { kapasitas: 3 }),
      // TERSEMBUNYI dari katalog. H: belum diikuti siapa pun — kapasitas
      // terbesar + subtes mapel tersulit, jadi PASTI lolos ke urutan teratas
      // kalau filternya bocor. HL: kelas legacy yang sudah diikuti SISWA.
      kelas("H", { tampil_di_katalog: false, kapasitas: 99, subtes_id: "subtes-mtk" }),
      kelas("HL", { tampil_di_katalog: false, kapasitas: 1, harga: 0 }),
    ],
    enrollments: [
      { id: "e-A", user_id: SISWA, kelas_id: "A", status_pembayaran: "lunas", progres_persen: 77, jadwal_ditetapkan: null },
      { id: "e-B", user_id: SISWA, kelas_id: "B", status_pembayaran: "lunas", progres_persen: 0, jadwal_ditetapkan: null },
      { id: "e-C", user_id: SISWA, kelas_id: "C", status_pembayaran: "lunas", progres_persen: 50, jadwal_ditetapkan: null },
      { id: "e-D", user_id: SISWA, kelas_id: "D", status_pembayaran: "menunggu", progres_persen: 0, jadwal_ditetapkan: null },
      { id: "e-HL", user_id: SISWA, kelas_id: "HL", status_pembayaran: "lunas", progres_persen: 0, jadwal_ditetapkan: null },
    ],
    sesi_kelas: [
      // A: 4 terhitung (3 dikonfirmasi siswa + 1 masih menunggu respons siswa) + 1 disangkal.
      ...sesi("e-A", ["dikonfirmasi", "dikonfirmasi", "dikonfirmasi", "disangkal", "belum"]),
      // B: 10 dari 10.
      ...sesi("e-B", Array<string>(10).fill("dikonfirmasi")),
      // C: lunas tapi TIDAK punya baris sesi_kelas sama sekali.
      // HL (tersembunyi): 2 dari 10.
      ...sesi("e-HL", ["dikonfirmasi", "dikonfirmasi"]),
    ],
    kelas_mentor: [],
    kelas_subtes: [],
    kelas_subtes_mentor: [],
    user_mapel_tersulit: [],
    kode_promo: [],
    kode_promo_kelas: [],
    konten_info: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `info-${i}`,
        tipe: i % 2 === 0 ? "beasiswa" : "event",
        judul: `Info ${i}`,
        deskripsi: null,
        deadline: `2026-12-${String(20 - i).padStart(2, "0")}`,
        status: "aktif",
      })),
      { id: "info-tutup", tipe: "beasiswa", judul: "Sudah Ditutup", deskripsi: null, deadline: "2026-11-01", status: "ditutup" },
    ],
  };
});

describe("hitungProgresSesi (helper bersama)", () => {
  it("membulatkan sesi terkonfirmasi / jumlah_sesi x 100", () => {
    assert.deepEqual(hitungProgresSesi(4, 10), { persen: 40, selesai: false });
    assert.deepEqual(hitungProgresSesi(1, 3), { persen: 33, selesai: false });
    assert.deepEqual(hitungProgresSesi(2, 3), { persen: 67, selesai: false });
  });

  it('"Selesai" = 100% DAN jumlah_sesi > 0', () => {
    assert.deepEqual(hitungProgresSesi(10, 10), { persen: 100, selesai: true });
    assert.deepEqual(hitungProgresSesi(0, 0), { persen: 0, selesai: false });
    assert.deepEqual(hitungProgresSesi(3, 0), { persen: 0, selesai: false });
  });

  it("tidak pernah melewati 100%", () => {
    assert.equal(hitungProgresSesi(12, 10).persen, 100);
  });

  it("sesi disangkal & sesi yang belum ditandai mentor tidak dihitung", () => {
    const rows = [
      { dikonfirmasi_mentor: true, status_siswa: "dikonfirmasi" },
      { dikonfirmasi_mentor: true, status_siswa: "belum" },
      { dikonfirmasi_mentor: true, status_siswa: "disangkal" },
      { dikonfirmasi_mentor: false, status_siswa: "belum" },
    ];
    assert.equal(hitungSesiTerkonfirmasi(rows), 2);
  });
});

describe("getKelasSaya", () => {
  it("4/10 → 40% (Sedang Berjalan), 10/10 → 100% (Selesai)", async () => {
    const items = await kelasSayaData.getKelasSaya(SISWA);
    const a = items.find((k) => k.id === "A");
    const b = items.find((k) => k.id === "B");
    assert.deepEqual([a?.progresPersen, a?.selesai], [40, false]);
    assert.deepEqual([b?.progresPersen, b?.selesai], [100, true]);
  });

  it("enrollment tanpa baris sesi_kelas tampil 0% (tanpa fallback ke progres_persen)", async () => {
    const c = (await kelasSayaData.getKelasSaya(SISWA)).find((k) => k.id === "C");
    assert.deepEqual([c?.progresPersen, c?.selesai], [0, false]);
  });

  it("enrollment 'menunggu' tidak tampil", async () => {
    const ids = (await kelasSayaData.getKelasSaya(SISWA)).map((k) => k.id).sort();
    assert.deepEqual(ids, ["A", "B", "C", "HL"]);
  });

  it("progres materi (enrollments.progres_persen) & materi baru tidak mengubah persentase", async () => {
    const sebelum = await kelasSayaData.getKelasSaya(SISWA);
    for (const enrollment of db.enrollments) enrollment.progres_persen = 13;
    db.materi = [{ id: "m-baru", kelas_id: "A", status: "published" }];
    assert.deepEqual(await kelasSayaData.getKelasSaya(SISWA), sebelum);
  });

  it('angkanya identik dengan "Progress Kehadiran" di detail kelas', async () => {
    const items = await kelasSayaData.getKelasSaya(SISWA);
    for (const [kelasId, enrollmentId] of [["A", "e-A"], ["B", "e-B"], ["C", "e-C"]]) {
      const { validCount } = await kelasDetail.getSesiKehadiran(enrollmentId);
      assert.equal(items.find((k) => k.id === kelasId)?.progresPersen, hitungProgresSesi(validCount, 10).persen);
    }
  });

  it("siswa tanpa kelas → array kosong", async () => {
    assert.deepEqual(await kelasSayaData.getKelasSaya(SISWA_BARU), []);
  });
});

describe("getRekomendasiKelas", () => {
  it("tanpa mapel tersulit: fallback ke kelas katalog yang belum diikuti, maks 6, urut slot tersisa", async () => {
    const items = await kelasSayaData.getRekomendasiKelas(SISWA, "kelas_12");
    assert.deepEqual(
      items.map((k) => k.id),
      ["X1", "X2", "X3", "X4", "X5", "MTK"],
    );
  });

  it("tingkat kelas belum diisi: tetap fallback", async () => {
    assert.equal((await kelasSayaData.getRekomendasiKelas(SISWA, null)).length, 6);
  });

  it("mapel tersulit cocok: diprioritaskan (bukan fallback)", async () => {
    db.user_mapel_tersulit = [{ user_id: SISWA, subtes_id: "subtes-mtk" }];
    const items = await kelasSayaData.getRekomendasiKelas(SISWA, "kelas_12");
    assert.deepEqual(items.map((k) => k.id), ["MTK"]);
  });

  it("mapel tersulit terisi tapi tidak ada kelas cocok: fallback", async () => {
    db.user_mapel_tersulit = [{ user_id: SISWA, subtes_id: "subtes-lain" }];
    assert.equal((await kelasSayaData.getRekomendasiKelas(SISWA, "kelas_12")).length, 6);
  });

  it("tidak pernah menawarkan kelas yang sudah punya enrollment (termasuk 'menunggu')", async () => {
    db.kelas = db.kelas.filter((k) => ["A", "B", "C", "D", "H", "HL", "X1"].includes(k.id as string));
    const items = await kelasSayaData.getRekomendasiKelas(SISWA, "kelas_12");
    assert.deepEqual(items.map((k) => k.id), ["X1"]);
  });

  it("kosong kalau benar-benar tidak ada kelas yang bisa ditawarkan", async () => {
    db.kelas = db.kelas.filter((k) => ["A", "B", "C", "D", "H", "HL"].includes(k.id as string));
    assert.deepEqual(await kelasSayaData.getRekomendasiKelas(SISWA, "kelas_12"), []);
  });
});

describe("katalog (empty state siswa tanpa kelas)", () => {
  it("getKelasKatalog = gabungan seluruh kategori /program (filter katalog yang sama)", async () => {
    const katalog = (await programData.getKelasKatalog()).map((k) => k.id).sort();
    const perKategori = (
      await Promise.all([programData.getKelasByKategori("snbt"), programData.getKelasByKategori("tka")])
    )
      .flat()
      .map((k) => k.id)
      .sort();
    assert.equal(katalog.length, db.kelas.filter((k) => k.tampil_di_katalog).length);
    assert.deepEqual(katalog, perKategori);
  });
});

describe("Event dan Beasiswa", () => {
  it("cuma status aktif, urut deadline terdekat, maks 6 — tidak tergantung siswa punya kelas", async () => {
    const items = await infoData.getInfoBeasiswaEvent(6);
    assert.equal(items.length, 6);
    assert.ok(items.every((item) => item.judul !== "Sudah Ditutup"));
    assert.deepEqual(
      items.map((item) => item.deadline),
      [...items.map((item) => item.deadline)].sort(),
    );
  });
});

describe("kelas tersembunyi (tampil_di_katalog = false)", () => {
  it("tidak muncul di katalog /program maupun empty state Kelas Saya", async () => {
    const katalog = (await programData.getKelasKatalog()).map((k) => k.id);
    const perKategori = (await programData.getKelasByKategori("snbt")).map((k) => k.id);
    const preview = (await programData.getProgramPreviewSections()).flatMap((section) => section.items.map((k) => k.id));
    for (const ids of [katalog, perKategori, preview]) {
      assert.ok(!ids.includes("H") && !ids.includes("HL"), `kelas tersembunyi bocor: ${ids.join(",")}`);
    }
    assert.ok(katalog.includes("X1"));
  });

  it("tidak muncul di rekomendasi — baik jalur mapel tersulit maupun fallback", async () => {
    assert.ok(!(await kelasSayaData.getRekomendasiKelas(SISWA_BARU, "kelas_12")).some((k) => k.id === "H"));
    db.user_mapel_tersulit = [{ user_id: SISWA_BARU, subtes_id: "subtes-mtk" }];
    const items = await kelasSayaData.getRekomendasiKelas(SISWA_BARU, "kelas_12");
    assert.deepEqual(items.map((k) => k.id), ["MTK"]);
  });

  it("tidak bisa di-checkout (getKelasForCheckout → null), kelas biasa tetap bisa", async () => {
    assert.equal(await checkoutData.getKelasForCheckout("H"), null);
    assert.equal(await checkoutData.getKelasForCheckout("HL"), null);
    assert.equal((await checkoutData.getKelasForCheckout("X1"))?.id, "X1");
  });

  it("siswa yang terdaftar TETAP melihatnya di Kelas Saya, lengkap dengan progress", async () => {
    const hl = (await kelasSayaData.getKelasSaya(SISWA)).find((k) => k.id === "HL");
    assert.deepEqual([hl?.progresPersen, hl?.selesai], [20, false]);
  });

  it("detail kelas siswa tetap bisa memuat kelas tersembunyi (penolakan non-terdaftar ada di halaman)", async () => {
    const detail = await kelasDetail.getKelasDetail("HL");
    assert.equal(detail?.tampilDiKatalog, false);
    assert.equal((await kelasDetail.getKelasDetail("X1"))?.tampilDiKatalog, true);
    assert.equal((await kelasDetail.getEnrollmentStatus(SISWA, "HL")).statusPembayaran, "lunas");
    assert.equal((await kelasDetail.getEnrollmentStatus(SISWA_BARU, "HL")).statusPembayaran, null);
  });

  it("halaman detail publik bisa membedakannya (dipakai notFound di /program/kelas/[id])", async () => {
    assert.equal((await programData.getKelasDetailPublic("H"))?.tampilDiKatalog, false);
    assert.equal((await programData.getKelasDetailPublic("X1"))?.tampilDiKatalog, true);
  });
});

describe('Kelola Kelas — saklar "Tampilkan di katalog"', () => {
  const body = {
    nama: "Kelas X1",
    programKategori: "tka",
    tingkatKelas: "kelas_12",
    tipeKelas: "grouping",
    jumlahSesi: 10,
    kapasitas: 30,
    harga: 100000,
  };

  it("validasi server: default menyala, false tersimpan, non-boolean ditolak", async () => {
    const tanpa = await validateKelas.validateKelasInput(body);
    const mati = await validateKelas.validateKelasInput({ ...body, tampilDiKatalog: false });
    const nyala = await validateKelas.validateKelasInput({ ...body, tampilDiKatalog: true });
    const ngawur = await validateKelas.validateKelasInput({
      ...body,
      tampilDiKatalog: "false" as unknown as boolean,
    });
    assert.equal(tanpa.ok && tanpa.data.tampil_di_katalog, true);
    assert.equal(mati.ok && mati.data.tampil_di_katalog, false);
    assert.equal(nyala.ok && nyala.data.tampil_di_katalog, true);
    assert.equal(ngawur.ok, false);
  });

  async function patchKelas(kelasId: string, tampilDiKatalog: boolean, role: "admin" | "student" = "admin") {
    const { NextRequest } = await import("next/server");
    const token = sessionLib.createSessionToken({ userId: "user-test", role });
    const request = new NextRequest(`http://localhost/api/kelola-kelas/${kelasId}`, {
      method: "PATCH",
      headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, tampilDiKatalog }),
    });
    return kelolaKelasRoute.PATCH(request, { params: Promise.resolve({ kelasId }) });
  }

  it("PATCH Admin menyimpan nilai saklar, dan katalog langsung mengikutinya", async () => {
    const x1 = db.kelas.find((k) => k.id === "X1")!;

    assert.equal((await patchKelas("X1", false)).status, 200);
    assert.equal(x1.tampil_di_katalog, false);
    assert.ok(!(await programData.getKelasKatalog()).some((k) => k.id === "X1"));
    assert.equal(await checkoutData.getKelasForCheckout("X1"), null);

    assert.equal((await patchKelas("X1", true)).status, 200);
    assert.equal(x1.tampil_di_katalog, true);
    assert.ok((await programData.getKelasKatalog()).some((k) => k.id === "X1"));
  });

  it("selain Admin tidak bisa mengubah saklar", async () => {
    assert.equal((await patchKelas("X1", false, "student")).status, 403);
    assert.equal(db.kelas.find((k) => k.id === "X1")?.tampil_di_katalog, true);
  });
});
