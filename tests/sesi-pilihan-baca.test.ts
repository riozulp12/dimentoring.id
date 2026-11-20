/**
 * Tes sesi pilihan siswa — JALUR BACA & PRESENSI: total sesi milik siswa (enrollments.jumlah_sesi_total ?? kelas.jumlah_sesi),
 * kuota per subtes (enrollment_subtes.kuota_sesi), penegakan di POST /api/mentor/sesi, progres, dan data mentor/siswa.
 * Data lama (kolom baru NULL) = perilaku lama. Supabase TIRUAN di memori.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import "./helpers/envSupabaseUji";
import {
  kandidatSubtesMentor,
  kuotaSubtes,
  tentukanSubtesPresensi,
  totalSesiEnrollment,
  type SubtesPresensi,
} from "@/lib/shared/sesiEnrollment";

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
  if (table === "enrollment_subtes") {
    return new FakeQuery(rows.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) })), gagal);
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


const M1 = "mentor-1";
const M2 = "mentor-2";
const LAMA_ISO = "2026-11-10T10:00:00+07:00";

type SesiRouteModule = typeof import("@/app/api/mentor/sesi/route");
type SessionModule = typeof import("@/lib/auth/session");
type KelasSayaModule = typeof import("@/lib/mentor/getKelasSayaData");
type ProgresModule = typeof import("@/lib/shared/progresSesiData");
let sesiRoute: SesiRouteModule;
let sessionLib: SessionModule;
let kelasSaya: KelasSayaModule;
let progres: ProgresModule;

before(async () => {
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  sesiRoute = await import("@/app/api/mentor/sesi/route");
  sessionLib = await import("@/lib/auth/session");
  kelasSaya = await import("@/lib/mentor/getKelasSayaData");
  progres = await import("@/lib/shared/progresSesiData");
});

interface OpsiEnrollment {
  kelasId?: string;
  /** enrollments.jumlah_sesi_total; undefined = kolom tidak ada (data lama). */
  total?: number;
  /** Banyak baris sesi_kelas (default = total ?? jumlah_sesi kelas). */
  baris?: number;
  subtes?: { id: string; kuota?: number | null }[];
}

function sesiRows(enrollmentId: string, jumlah: number): Row[] {
  return Array.from({ length: jumlah }, (_, i) => ({
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

function tambahEnrollment(id: string, opsi: OpsiEnrollment = {}) {
  const kelasId = opsi.kelasId ?? "K10";
  const kelas = db.kelas.find((k) => k.id === kelasId)!;
  const enrollment: Row = { id, user_id: `u-${id}`, kelas_id: kelasId, status_pembayaran: "lunas", mentor_offline_id: null, tanggal_daftar: LAMA_ISO };
  if (opsi.total !== undefined) enrollment.jumlah_sesi_total = opsi.total;
  db.enrollments.push(enrollment);
  db.users.push({ id: `u-${id}`, nama: `Siswa ${id}`, avatar_url: null });
  for (const s of opsi.subtes ?? [{ id: "s-mtk" }]) {
    const baris: Row = { id: `es-${id}-${s.id}`, enrollment_id: id, subtes_id: s.id, mentor_id: null, diterima_pada: null };
    if (s.kuota !== undefined) baris.kuota_sesi = s.kuota;
    db.enrollment_subtes.push(baris);
  }
  db.sesi_kelas.push(...sesiRows(id, opsi.baris ?? opsi.total ?? (kelas.jumlah_sesi as number)));
}

/** Tandai `n` sesi pertama sebagai sudah dilaksanakan & dikonfirmasi siswa (tanggal lama, tidak memicu batas harian). */
function tandaiLangsung(id: string, n: number, subtesId?: string) {
  const baris = db.sesi_kelas.filter((r) => r.enrollment_id === id && !r.dikonfirmasi_mentor).slice(0, n);
  assert.equal(baris.length, n);
  for (const r of baris) {
    Object.assign(r, {
      dikonfirmasi_mentor: true,
      dikonfirmasi_mentor_pada: LAMA_ISO,
      status_siswa: "dikonfirmasi",
      dikonfirmasi_siswa_pada: LAMA_ISO,
      mentor_id: M1,
      ...(subtesId ? { subtes_id: subtesId } : {}),
    });
  }
}

async function tandai(enrollmentId: string, ekstra: Record<string, unknown> = {}, mentorId = M1) {
  const token = sessionLib.createSessionToken({ userId: mentorId, role: "mentor" });
  const response = await sesiRoute.POST(
    new NextRequest("http://localhost/api/mentor/sesi", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}` },
      body: JSON.stringify({ enrollmentId, ...ekstra }),
    }),
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const ditandai = (id: string) => db.sesi_kelas.filter((r) => r.enrollment_id === id && r.dikonfirmasi_mentor);

beforeEach(() => {
  tabelGagal = new Set();
  logQuery = [];
  db = {
    subtes: [
      { id: "s-mtk", nama: "Matematika" },
      { id: "s-fis", nama: "Fisika" },
      { id: "s-kim", nama: "Kimia" },
    ],
    kelas: [
      { id: "K10", nama: "Privat 10", mentor_id: M1, subtes_id: null, jumlah_sesi: 10 },
      { id: "K8", nama: "Privat 8", mentor_id: M1, subtes_id: null, jumlah_sesi: 8 },
    ],
    kelas_mentor: [],
    kelas_subtes_mentor: ["K10", "K8"].flatMap((k) => [
      { kelas_id: k, subtes_id: "s-mtk", mentor_id: M1 },
      { kelas_id: k, subtes_id: "s-fis", mentor_id: M1 },
      { kelas_id: k, subtes_id: "s-kim", mentor_id: M2 },
    ]),
    enrollments: [],
    enrollment_subtes: [],
    user_roles: [M1, M2].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })),
    users: [{ id: M1, nama: "Mentor Satu" }, { id: M2, nama: "Mentor Dua" }],
    sesi_kelas: [],
    notifikasi: [],
  };
});

describe("helper murni sesiEnrollment", () => {
  it("totalSesiEnrollment: jumlah_sesi_total ?? kelas.jumlah_sesi; NULL = perilaku lama", () => {
    assert.equal(totalSesiEnrollment({ jumlah_sesi_total: null }, { jumlah_sesi: 10 }), 10);
    assert.equal(totalSesiEnrollment({}, { jumlah_sesi: 8 }), 8);
    assert.equal(totalSesiEnrollment(undefined, { jumlah_sesi: 8 }), 8);
    for (const n of [1, 3, 12, 20]) {
      assert.equal(totalSesiEnrollment({ jumlah_sesi_total: n }, { jumlah_sesi: 10 }), n);
      assert.equal(totalSesiEnrollment({ jumlah_sesi_total: n }, { jumlah_sesi: 8 }), n);
    }
    assert.equal(totalSesiEnrollment({}, {}), null);
  });
  it("kuotaSubtes: angka atau null (tanpa batas)", () => {
    assert.equal(kuotaSubtes({ kuota_sesi: 4 }), 4);
    assert.equal(kuotaSubtes({ kuota_sesi: null }), null);
    assert.equal(kuotaSubtes({}), null);
  });
  const sp = (subtesId: string, kuota: number | null, terpakai = 0): SubtesPresensi => ({ subtesId, nama: subtesId, kuota, terpakai });
  it("tentukanSubtesPresensi: tanpa kuota = tanpa subtes_id; satu kandidat otomatis; dua wajib eksplisit; kuota habis ditolak", () => {
    assert.deepEqual(tentukanSubtesPresensi({ subtes: [sp("a", null), sp("b", null)], kandidatIds: ["a", "b"], dipilih: undefined }), { ok: true, subtesId: null, nama: null });
    assert.deepEqual(tentukanSubtesPresensi({ subtes: [sp("a", 3), sp("b", 3)], kandidatIds: ["a"], dipilih: undefined }), { ok: true, subtesId: "a", nama: "a" });
    assert.equal(tentukanSubtesPresensi({ subtes: [sp("a", 3), sp("b", 3)], kandidatIds: ["a", "b"], dipilih: undefined }).ok, false);
    assert.equal(tentukanSubtesPresensi({ subtes: [sp("a", 3), sp("b", 3)], kandidatIds: ["a", "b"], dipilih: "c" }).ok, false);
    assert.equal(tentukanSubtesPresensi({ subtes: [sp("a", 2, 2), sp("b", 3)], kandidatIds: ["a", "b"], dipilih: "a" }).ok, false);
    assert.equal(tentukanSubtesPresensi({ subtes: [sp("a", null, 99), sp("b", 3)], kandidatIds: ["a", "b"], dipilih: "a" }).ok, true);
  });
  it("kandidatSubtesMentor: hanya subtes yang dipegang dan tidak diklaim mentor lain", () => {
    const s = [
      { subtesId: "a", mentorMemegang: true, status: "tidak_perlu_klaim", mentorIdPenerima: null },
      { subtesId: "b", mentorMemegang: true, status: "menunggu", mentorIdPenerima: null },
      { subtesId: "c", mentorMemegang: true, status: "diterima", mentorIdPenerima: M1 },
      { subtesId: "d", mentorMemegang: true, status: "diterima", mentorIdPenerima: M2 },
      { subtesId: "e", mentorMemegang: false, status: "tidak_perlu_klaim", mentorIdPenerima: null },
    ];
    assert.deepEqual(kandidatSubtesMentor(M1, s), ["a", "c"]);
  });
});

describe("data lama (kolom baru NULL) = perilaku lama", () => {
  it("presensi: 200, baris tanpa subtes_id, total = kelas.jumlah_sesi (sesi ke-10 bisa ditandai, ke-11 tidak ada)", async () => {
    tambahEnrollment("e-lama");
    tandaiLangsung("e-lama", 9);
    const res = await tandai("e-lama");
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.nomorSesi, 10);
    const baris = db.sesi_kelas.find((r) => r.enrollment_id === "e-lama" && r.nomor_sesi === 10)!;
    assert.ok(!("subtes_id" in baris));
    assert.equal((await tandai("e-lama")).status, 400);
  });
  it("progres: 9 dari 10 = 90%, 10 dari 10 = selesai", async () => {
    tambahEnrollment("e-lama");
    tandaiLangsung("e-lama", 9);
    let hasil = await progres.getProgresSesiPerPendaftaran([{ id: "e-lama", jumlahSesi: 10 }]);
    assert.deepEqual(hasil.get("e-lama"), { persen: 90, selesai: false });
    tandaiLangsung("e-lama", 1);
    hasil = await progres.getProgresSesiPerPendaftaran([{ id: "e-lama", jumlahSesi: 10 }]);
    assert.deepEqual(hasil.get("e-lama"), { persen: 100, selesai: true });
  });
  it("data mentor: totalSesi null, subtesPilihan kosong; sisa per subtes siswa tidak ada", async () => {
    tambahEnrollment("e-lama");
    const hasil = await kelasSaya.getSesiKelasMentor("K10", M1, "utama");
    assert.equal(hasil.siswa.length, 1);
    assert.equal(hasil.siswa[0].totalSesi, null);
    assert.deepEqual(hasil.siswa[0].subtesPilihan, []);
    assert.equal(hasil.siswa[0].sesiBerikutnya, 1);
    assert.equal((await progres.getSisaSesiPerSubtes(["e-lama"])).size, 0);
  });
});

describe("total sesi siswa: 1, 3, 12, 20 pada kelas 10 sesi dan 8 sesi", () => {
  for (const kelasId of ["K10", "K8"]) {
    for (const n of [1, 3, 12, 20]) {
      const dasar = kelasId === "K10" ? 10 : 8;
      it(`${kelasId} N=${n}: progres, kelas selesai tepat di N (bukan ${dasar}), batas presensi = N`, async () => {
        // baris sesi_kelas = max(N, dasar): N < dasar meniru data yang masih punya baris sebanyak paket kelas.
        tambahEnrollment("e1", { kelasId, total: n, baris: Math.max(n, dasar) });
        tandaiLangsung("e1", n - 1);
        let hasil = await progres.getProgresSesiPerPendaftaran([{ id: "e1", jumlahSesi: dasar }]);
        assert.equal(hasil.get("e1")!.selesai, false);
        assert.equal(hasil.get("e1")!.persen, n === 1 ? 0 : Math.min(99, Math.max(1, Math.round(((n - 1) / n) * 100))));
        // tanda terakhir (sesi ke-N) diterima server
        const res = await tandai("e1");
        assert.equal(res.status, 200, JSON.stringify(res.json));
        assert.equal(res.json.nomorSesi, n);
        assert.equal(ditandai("e1").length, n);
        // selesai persis di N
        tandaiLangsung("e1", 0);
        for (const r of ditandai("e1")) Object.assign(r, { status_siswa: "dikonfirmasi", dikonfirmasi_siswa_pada: LAMA_ISO, dikonfirmasi_mentor_pada: LAMA_ISO });
        hasil = await progres.getProgresSesiPerPendaftaran([{ id: "e1", jumlahSesi: dasar }]);
        assert.deepEqual(hasil.get("e1"), { persen: 100, selesai: true });
        // di atas total: ditolak walau baris sesi_kelas masih tersedia (N < dasar)
        const lagi = await tandai("e1");
        assert.equal(lagi.status, 400);
        assert.equal(ditandai("e1").length, n);
      });
    }
  }
  it("data mentor: totalSesi = N dan sesiBerikutnya null setelah N ditandai (walau baris sesi masih ada)", async () => {
    tambahEnrollment("e3", { total: 3, baris: 10 });
    tandaiLangsung("e3", 3);
    const item = (await kelasSaya.getSesiKelasMentor("K10", M1, "utama")).siswa[0];
    assert.equal(item.totalSesi, 3);
    assert.equal(item.sesiBerikutnya, null);
  });
});

describe("kuota per subtes ditegakkan di server", () => {
  const dua = { subtes: [{ id: "s-mtk", kuota: 2 }, { id: "s-fis", kuota: 1 }], total: 3 };

  it("mentor memegang dua subtes siswa: tanpa subtesId ditolak; subtes di luar pilihan ditolak; eksplisit diterima dan subtes_id terisi", async () => {
    tambahEnrollment("e2", dua);
    const tanpa = await tandai("e2");
    assert.equal(tanpa.status, 400);
    assert.match(String(tanpa.json.error), /Pilih dulu subtes/);
    assert.equal(ditandai("e2").length, 0);
    assert.equal((await tandai("e2", { subtesId: "s-kim" })).status, 400);
    assert.equal((await tandai("e2", { subtesId: 5 })).status, 400);
    assert.equal(ditandai("e2").length, 0);

    const ok = await tandai("e2", { subtesId: "s-mtk" });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    const baris = ditandai("e2")[0];
    assert.equal(baris.subtes_id, "s-mtk");
    assert.equal(baris.nama_mapel, "Matematika");
  });
  it("melebihi kuota subtes ditolak (pesan sehari-hari); subtes lain masih bisa", async () => {
    tambahEnrollment("e2", dua);
    tandaiLangsung("e2", 1, "s-fis");
    const habis = await tandai("e2", { subtesId: "s-fis" });
    assert.equal(habis.status, 400);
    assert.match(String(habis.json.error), /Jatah sesi Fisika untuk siswa ini sudah habis \(1 sesi\)/);
    assert.equal(ditandai("e2").length, 1);
    assert.equal((await tandai("e2", { subtesId: "s-mtk" })).status, 200);
  });
  it("satu subtes: subtes_id terisi otomatis tanpa input", async () => {
    tambahEnrollment("e1s", { subtes: [{ id: "s-mtk", kuota: 3 }], total: 3 });
    const res = await tandai("e1s");
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(ditandai("e1s")[0].subtes_id, "s-mtk");
  });
  it("kandidat dipersempit ke subtes yang dipegang mentor: mentor lain memegang satu subtes -> otomatis", async () => {
    db.kelas_mentor.push({ kelas_id: "K10", mentor_id: M2 });
    tambahEnrollment("e2m", { subtes: [{ id: "s-mtk", kuota: 2 }, { id: "s-kim", kuota: 2 }], total: 4 });
    const res = await tandai("e2m", {}, M2);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(ditandai("e2m")[0].subtes_id, "s-kim");
  });
  it("kuota NULL pada subtes tertentu = tanpa batas untuk subtes itu", async () => {
    tambahEnrollment("e2n", { subtes: [{ id: "s-mtk", kuota: 1 }, { id: "s-fis", kuota: null }], total: 6 });
    tandaiLangsung("e2n", 4, "s-fis");
    const res = await tandai("e2n", { subtesId: "s-fis" });
    assert.equal(res.status, 200, JSON.stringify(res.json));
  });
  it("tanda ganda di hari yang sama tidak menggandakan baris", async () => {
    tambahEnrollment("e2", dua);
    assert.equal((await tandai("e2", { subtesId: "s-mtk" })).status, 200);
    assert.equal((await tandai("e2", { subtesId: "s-mtk" })).status, 409);
    assert.equal(ditandai("e2").length, 1);
  });
  it("data mentor menampilkan pilihan subtes + sisa kuota; data siswa menampilkan sisa per subtes", async () => {
    tambahEnrollment("e2", dua);
    tandaiLangsung("e2", 1, "s-mtk");
    const item = (await kelasSaya.getSesiKelasMentor("K10", M1, "utama")).siswa[0];
    assert.deepEqual(
      item.subtesPilihan.map((s) => [s.id, s.sisa]).sort(),
      [["s-fis", 1], ["s-mtk", 1]],
    );
    const sisa = (await progres.getSisaSesiPerSubtes(["e2"])).get("e2")!;
    assert.deepEqual(sisa.map((s) => [s.nama, s.sisa]).sort(), [["Fisika", 1], ["Matematika", 1]]);
  });
});

describe("tes statis: jalur baca memakai total siswa, bukan kelas.jumlah_sesi", () => {
  const baca = (f: string) => readFileSync(f, "utf8");
  it("progres, presensi, halaman kelas siswa, dan UI mentor memakai totalSesiEnrollment / totalSesi", () => {
    assert.match(baca("lib/shared/progresSesiData.ts"), /totalSesiEnrollment\(/);
    assert.match(baca("app/api/mentor/sesi/route.ts"), /totalSesiEnrollment\(/);
    assert.match(baca("app/(protected)/(siswa)/kelas/[kelasId]/page.tsx"), /totalSesiEnrollment\(/);
    assert.match(baca("components/mentor/SesiSiswaList.tsx"), /row\.totalSesi \?\? jumlahSesi/);
  });
  it("semua jalur progres melewati getProgresSesiPerPendaftaran (dashboard siswa/mentor, Siswa Binaan, Kelas Saya, admin)", () => {
    for (const f of [
      "lib/dashboard/getSiswaDashboardData.ts",
      "lib/mentor/dashboardData.ts",
      "lib/mentor/getSiswaBinaanData.ts",
      "lib/siswa/getKelasSayaData.ts",
      "lib/admin/getManajemenSiswaData.ts",
    ]) {
      assert.match(baca(f), /getProgresSesiPerPendaftaran\(/, f);
    }
  });
  it("tidak ada hitungProgresSesi dengan kelas.jumlah_sesi di luar helper progres", () => {
    for (const f of ["lib/dashboard/getSiswaDashboardData.ts", "lib/mentor/dashboardData.ts", "lib/mentor/getSiswaBinaanData.ts", "lib/siswa/getKelasSayaData.ts", "lib/admin/getManajemenSiswaData.ts"]) {
      assert.ok(!/hitungProgresSesi\(/.test(baca(f)), f);
    }
  });
  it("tidak menyentuh payment, checkout, honor, Sales, refund, email", () => {
    for (const f of ["lib/shared/sesiEnrollment.ts", "lib/mentor/subtesPresensi.ts", "app/api/mentor/sesi/route.ts"]) {
      assert.ok(!/lib\/payment|checkout|lib\/email/.test(baca(f).replace(/\/\*[\s\S]*?\*\//g, "")), f);
    }
  });
});
