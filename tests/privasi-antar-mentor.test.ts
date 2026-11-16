/**
 * Test PRIVASI ANTAR MENTOR (keputusan Rio): di kelas multi-mentor, siswa yang sudah diterima mentor A tidak
 * boleh terlihat oleh mentor lain (B). Yang diperiksa adalah DATA yang dikembalikan server ke halaman
 * (getSesiKelasMentor), bukan render: nama, foto, jadwal, link Meet, dan riwayat sesi siswa milik mentor lain
 * tidak boleh ada di payload — dan tidak boleh ikut DIBACA dari database. Daftar "Menunggu diterima" tetap
 * untuk semua kandidat sampai ada yang menerima. Supabase TIRUAN di memori.
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
/** Setiap filter `.in(kolom, nilai)` per tabel + kolom yang dipilih — untuk membuktikan siswa mentor lain tidak dibaca. */
let logIn: { table: string; column: string; values: unknown[]; columns: string }[];

class FakeQuery implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
  private single = false;
  private columns = "";
  constructor(
    private table: string,
    private rows: Row[],
    private gagal: boolean,
  ) {}
  select(columns?: string) {
    this.columns = columns ?? "";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    logIn.push({ table: this.table, column, values, columns: this.columns });
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

function fakeFrom(table: string) {
  db[table] ??= [];
  let view: Row[] = db[table];
  if (table === "enrollments") view = db.enrollments.map((row) => ({ ...row, users: userOf(row.user_id) }));
  else if (table === "kelas_subtes_mentor") view = db.kelas_subtes_mentor.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) }));
  const query = new FakeQuery(table, view, tabelGagal.has(table));
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      db[table].push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

type KelasSayaModule = typeof import("@/lib/mentor/getKelasSayaData");
type TerimaModule = typeof import("@/lib/mentor/terimaSiswa");
type NotifyModule = typeof import("@/lib/notifikasi/notify");
let kelasSaya: KelasSayaModule;
let terima: TerimaModule;
let notify: NotifyModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  kelasSaya = await import("@/lib/mentor/getKelasSayaData");
  terima = await import("@/lib/mentor/terimaSiswa");
  notify = await import("@/lib/notifikasi/notify");
});

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const D = "mentor-d"; // satu-satunya pemegang Fisika
const F = "mentor-f"; // hanya terdaftar di kelas_mentor, BUKAN pemegang subtes
const P = "mentor-pending"; // pemegang Matematika tetapi belum aktif
const G = "mentor-g"; // mentor tatap muka lain
const BARU = "2026-11-20T10:00:00+07:00";
const LAMA = "2026-10-01T10:00:00+07:00";
const LINK_RAHASIA = "https://meet.google.com/rahasia-milik-a";

const enr = (id: string, kelas: string, userId: string, extra: Row = {}): Row => ({
  id,
  user_id: userId,
  kelas_id: kelas,
  status_pembayaran: "lunas",
  tanggal_daftar: BARU,
  mentor_offline_id: null,
  link_meet: null,
  link_meet_oleh: null,
  jadwal_pilihan: null,
  ...extra,
});
const es = (id: string, enrollmentId: string, subtes: string, mentorId: string | null = null): Row => ({
  id,
  enrollment_id: enrollmentId,
  subtes_id: subtes,
  mentor_id: mentorId,
  diterima_pada: null,
});

beforeEach(() => {
  tabelGagal = new Set();
  logIn = [];
  db = {
    users: [
      ...[A, B, C, D, F, P, G].map((id) => ({ id, nama: `Mentor ${id.slice(7).toUpperCase()}`, avatar_url: null })),
      { id: "u-acc", nama: "Rahasia Satu", avatar_url: "https://img/rahasia-satu.png" },
      { id: "u-wait", nama: "Menunggu Dua", avatar_url: "https://img/menunggu-dua.png" },
      { id: "u-lama", nama: "Siswa Lama", avatar_url: null },
      { id: "u-fis", nama: "Siswa Fisika", avatar_url: null },
      { id: "u-off-f", nama: "Siswa Tatap Muka F", avatar_url: null },
      { id: "u-off-g", nama: "Siswa Tatap Muka G", avatar_url: null },
    ],
    subtes: [
      { id: "s-mtk", nama: "Matematika" },
      { id: "s-fis", nama: "Fisika" },
    ],
    kelas: [
      { id: "K1", nama: "Kelas Multi", tipe_kelas: "private", mode_pembelajaran: "online" },
      { id: "K3", nama: "Kelas Tatap Muka", tipe_kelas: "private", mode_pembelajaran: "offline" },
    ],
    kelas_mentor: [A, B, C, D, F, P].map((mentor_id) => ({ kelas_id: "K1", mentor_id })),
    kelas_subtes_mentor: [
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: A },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: B },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: C },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: P },
      { kelas_id: "K1", subtes_id: "s-fis", mentor_id: D },
    ],
    enrollments: [
      // Sudah diterima A, lengkap dengan link Meet, jadwal pilihan, dan sesi — data yang tidak boleh bocor ke B/C
      enr("e-acc", "K1", "u-acc", { link_meet: LINK_RAHASIA, link_meet_oleh: A, jadwal_pilihan: [{ hari: "Senin", jam_mulai: "19:00" }] }),
      // Menunggu: belum diterima siapa pun
      enr("e-wait", "K1", "u-wait", {
        jadwal_pilihan: [
          { hari: "Selasa", jam_mulai: "16:00" },
          { hari: "Rabu", jam_mulai: "17:00" },
        ],
      }),
      enr("e-lama", "K1", "u-lama", { tanggal_daftar: LAMA }), // legacy
      enr("e-fis", "K1", "u-fis"), // pemilik implisit D
      enr("e-off-f", "K3", "u-off-f", { mentor_offline_id: F }),
      enr("e-off-g", "K3", "u-off-g", { mentor_offline_id: G }),
    ],
    enrollment_subtes: [
      es("es-acc", "e-acc", "s-mtk", A),
      es("es-wait", "e-wait", "s-mtk", null),
      es("es-lama", "e-lama", "s-mtk", null),
      es("es-fis", "e-fis", "s-fis", null),
    ],
    user_roles: [A, B, C, D, F, G].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })).concat([{ user_id: P, role_type: "mentor", status: "pending" }]),
    sesi_kelas: [
      {
        enrollment_id: "e-acc",
        nomor_sesi: 1,
        tanggal_dilaksanakan: "2026-11-21",
        dikonfirmasi_mentor: true,
        dikonfirmasi_mentor_pada: "2026-11-21T10:00:00Z",
        status_siswa: "dikonfirmasi",
        dikonfirmasi_siswa_pada: "2026-11-21T11:00:00Z",
        mentor_id: A,
        nama_mapel: "Matematika",
        mentor: { nama: "Mentor A" },
      },
    ],
    notifikasi: [],
  };
});

const payload = (hasil: unknown) => JSON.stringify(hasil);
const idsAbsensi = (items: { enrollmentId: string }[]) => items.map((i) => i.enrollmentId).sort();

describe("siswa diterima A tidak ada di data yang dikirim ke mentor B/C", () => {
  it("A melihat siswanya (lengkap); B dan C TIDAK — di Absensi maupun di daftar Menunggu", async () => {
    const a = await kelasSaya.getSesiKelasMentor("K1", A, "kelas", { tipeKelas: "private" });
    assert.ok(a.siswa.some((i) => i.enrollmentId === "e-acc"));

    for (const lain of [B, C]) {
      const hasil = await kelasSaya.getSesiKelasMentor("K1", lain, "kelas", { tipeKelas: "private" });
      assert.equal(hasil.siswa.some((i) => i.enrollmentId === "e-acc"), false, lain);
      assert.equal(hasil.menunggu.some((m) => m.enrollmentId === "e-acc"), false, lain);
    }
  });

  it("DATA payload B tidak memuat nama, id, foto, jadwal pilihan, link Meet, maupun riwayat sesi siswa A", async () => {
    const hasil = await kelasSaya.getSesiKelasMentor("K1", B, "kelas", { tipeKelas: "private" });
    const teks = payload(hasil);
    for (const rahasia of ["Rahasia Satu", "u-acc", "e-acc", "rahasia-satu.png", "rahasia-milik-a", LINK_RAHASIA, "Senin", "19:00", "es-acc"]) {
      assert.equal(teks.includes(rahasia), false, `payload B memuat "${rahasia}"`);
    }
    // Riwayat sesi yang ditandai mentor A (label "Mentor A — Matematika") juga tidak ikut.
    assert.equal(teks.includes("Mentor A"), false);
  });

  it("siswa mentor lain tidak pernah DIBACA detailnya dari database (nama/foto/link/sesi), bukan sekadar disembunyikan", async () => {
    await kelasSaya.getSesiKelasMentor("K1", B, "kelas", { tipeKelas: "private" });
    // Query yang mengambil detail siswa (kolom users / link_meet / sesi) hanya boleh memuat id milik B atau yang menunggu.
    const dibaca = new Set<string>();
    for (const q of logIn) {
      if (q.table === "enrollments" && /users:|link_meet|jadwal_pilihan/.test(q.columns)) q.values.forEach((v) => dibaca.add(String(v)));
      if (q.table === "sesi_kelas") q.values.forEach((v) => dibaca.add(String(v)));
    }
    assert.equal(dibaca.has("e-acc"), false);
    assert.equal(dibaca.has("e-fis"), false); // milik D
  });

  it("B yang menerima siswa ini (penerima berganti) melihatnya; A tidak lagi", async () => {
    db.enrollment_subtes.find((r) => r.id === "es-acc")!.mentor_id = B;
    const a = await kelasSaya.getSesiKelasMentor("K1", A, "kelas", { tipeKelas: "private" });
    const b = await kelasSaya.getSesiKelasMentor("K1", B, "kelas", { tipeKelas: "private" });
    assert.equal(a.siswa.some((i) => i.enrollmentId === "e-acc"), false);
    assert.equal(b.siswa.some((i) => i.enrollmentId === "e-acc"), true);
  });

  it("link Meet siswa A hanya ada di payload A", async () => {
    const a = await kelasSaya.getSesiKelasMentor("K1", A, "kelas", { tipeKelas: "private" });
    assert.equal(a.siswa.find((i) => i.enrollmentId === "e-acc")!.linkMeetSiswa?.link, LINK_RAHASIA);
    assert.equal(payload(await kelasSaya.getSesiKelasMentor("K1", C, "kelas", { tipeKelas: "private" })).includes(LINK_RAHASIA), false);
  });

  it("pembungkus lama getSesiSiswaByKelasId ikut tersaring (tidak ada jalur lain yang membocorkan)", async () => {
    const items = await kelasSaya.getSesiSiswaByKelasId("K1", B, "kelas", { tipeKelas: "private" });
    assert.equal(payload(items).includes("Rahasia Satu"), false);
  });

  it("galat membaca data penerimaan: kosong (fail-closed), tidak membocorkan siapa pun", async () => {
    tabelGagal.add("enrollment_subtes");
    const log = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await kelasSaya.getSesiKelasMentor("K1", B, "kelas", { tipeKelas: "private" }), { siswa: [], menunggu: [] });
    } finally {
      console.error = log;
    }
  });
});

describe("'Menunggu diterima': terlihat oleh semua kandidat, hilang dari B setelah A menerima", () => {
  it("A, B, C (pemegang aktif Matematika) melihat siswa menunggu dengan info seminimal: nama, subtes, jadwal pilihan", async () => {
    for (const kandidat of [A, B, C]) {
      const { menunggu, siswa } = await kelasSaya.getSesiKelasMentor("K1", kandidat, "kelas", { tipeKelas: "private" });
      assert.equal(siswa.some((i) => i.enrollmentId === "e-wait"), false, "menunggu bukan milik siapa pun → tidak di Absensi");
      assert.deepEqual(menunggu, [
        {
          enrollmentSubtesId: "es-wait",
          enrollmentId: "e-wait",
          siswaNama: "Menunggu Dua",
          subtesNama: "Matematika",
          jadwalPilihan: ["Selasa, 16:00 WIB", "Rabu, 17:00 WIB"],
        },
      ]);
    }
  });

  it("info menunggu SEMINIMAL: tidak ada foto, id pengguna, link Meet, atau progres", async () => {
    const { menunggu } = await kelasSaya.getSesiKelasMentor("K1", B, "kelas", { tipeKelas: "private" });
    assert.deepEqual(Object.keys(menunggu[0]).sort(), ["enrollmentId", "enrollmentSubtesId", "jadwalPilihan", "siswaNama", "subtesNama"]);
    assert.equal(payload(menunggu).includes("menunggu-dua.png"), false);
    assert.equal(payload(menunggu).includes("u-wait"), false);
  });

  it("bukan kandidat tidak melihatnya: F (hanya kelas_mentor), D (pemegang Fisika), P (pemegang belum aktif)", async () => {
    for (const bukan of [F, D, P]) {
      const { menunggu } = await kelasSaya.getSesiKelasMentor("K1", bukan, "kelas", { tipeKelas: "private" });
      assert.equal(menunggu.some((m) => m.enrollmentId === "e-wait"), false, bukan);
    }
  });

  it("A menerima → hilang dari daftar Menunggu B dan C, masuk Absensi A saja", async () => {
    db.enrollment_subtes.find((r) => r.id === "es-wait")!.mentor_id = A;
    const a = await kelasSaya.getSesiKelasMentor("K1", A, "kelas", { tipeKelas: "private" });
    assert.equal(a.siswa.some((i) => i.enrollmentId === "e-wait"), true);
    assert.deepEqual(a.menunggu, []);
    for (const lain of [B, C]) {
      const hasil = await kelasSaya.getSesiKelasMentor("K1", lain, "kelas", { tipeKelas: "private" });
      assert.deepEqual(hasil.menunggu, [], lain);
      assert.equal(payload(hasil).includes("Menunggu Dua"), false, lain);
    }
  });

  it("jalur klik 'Terima siswa' TIDAK berubah: B yang keduluan tetap ditolak 'sudah_diterima_mentor_lain'", async () => {
    db.enrollment_subtes.find((r) => r.id === "es-wait")!.mentor_id = A;
    assert.deepEqual(await terima.terimaSiswaSubtes({ mentorId: B, enrollmentSubtesId: "es-wait" }), {
      ok: false,
      alasan: "sudah_diterima_mentor_lain",
    });
  });
});

describe("tidak berubah: legacy, pemilik implisit, mentor tatap muka", () => {
  it("siswa legacy (sebelum 2026-11-15T00:00:00+07:00): semua mentor kelas tetap melihatnya, tanpa klaim", async () => {
    for (const mentor of [A, B, C, D, F]) {
      const { siswa, menunggu } = await kelasSaya.getSesiKelasMentor("K1", mentor, "kelas", { tipeKelas: "private" });
      assert.equal(siswa.some((i) => i.enrollmentId === "e-lama"), true, mentor);
      assert.equal(menunggu.some((m) => m.enrollmentId === "e-lama"), false, mentor);
    }
  });

  it("pemilik implisit D (satu-satunya pemegang Fisika) melihat siswa Fisika; mentor lain tidak", async () => {
    const d = await kelasSaya.getSesiKelasMentor("K1", D, "kelas", { tipeKelas: "private" });
    assert.ok(d.siswa.some((i) => i.enrollmentId === "e-fis"));
    for (const lain of [A, B, C, F]) {
      const hasil = await kelasSaya.getSesiKelasMentor("K1", lain, "kelas", { tipeKelas: "private" });
      assert.equal(hasil.siswa.some((i) => i.enrollmentId === "e-fis"), false, lain);
    }
  });

  it("mentor tatap muka: F hanya siswa yang ditugaskan ke F, G hanya miliknya", async () => {
    const f = await kelasSaya.getSesiKelasMentor("K3", F, "offline", { tipeKelas: "private" });
    const g = await kelasSaya.getSesiKelasMentor("K3", G, "offline", { tipeKelas: "private" });
    assert.deepEqual(idsAbsensi(f.siswa), ["e-off-f"]);
    assert.deepEqual(idsAbsensi(g.siswa), ["e-off-g"]);
    assert.equal(payload(f).includes("Siswa Tatap Muka G"), false);
  });

  it("A: Absensi = siswa yang ia terima + siswa legacy saja", async () => {
    const a = await kelasSaya.getSesiKelasMentor("K1", A, "kelas", { tipeKelas: "private" });
    assert.deepEqual(idsAbsensi(a.siswa), ["e-acc", "e-lama"]);
  });
});

describe("notifikasi penerimaan: tanpa nama siswa maupun nama mentor penerima", () => {
  it("lonceng 'sudah diterima mentor lain' ke mentor yang kalah, dan konfirmasi ke penerima — tanpa nama", async () => {
    db.enrollment_subtes.find((r) => r.id === "es-wait")!.mentor_id = A;
    await notify.notifyPenerimaanSiswa("es-wait", A);

    const kalah = db.notifikasi.filter((n) => n.judul === "Siswa sudah diterima mentor lain");
    const penerima = db.notifikasi.filter((n) => n.judul === "Siswa baru kamu terima");
    assert.deepEqual(kalah.map((n) => n.user_id).sort(), [B, C]); // pemegang aktif lain (P belum aktif, F/D bukan pemegang)
    assert.equal(penerima.length, 1);
    assert.equal(penerima[0].user_id, A);

    const semuaTeks = db.notifikasi.map((n) => `${n.judul} ${n.pesan}`).join(" | ");
    for (const nama of ["Menunggu Dua", "Rahasia Satu", "Mentor A", "Mentor B", "Mentor C", "u-wait"]) {
      assert.equal(semuaTeks.includes(nama), false, `notifikasi menyebut "${nama}"`);
    }
    assert.match(String(kalah[0].pesan), /sudah diterima mentor lain\.$/);
    assert.match(String(kalah[0].pesan), /Matematika/); // hanya subtes & kelas
  });
});

describe("penyaringan terjadi di SERVER, bukan di komponen klien", () => {
  const baca = (path: string) => readFileSync(path, "utf8");

  it("halaman detail Kelas Saya memakai getSesiKelasMentor dan tidak menyaring/mengirim ulang siswa di klien", () => {
    const page = baca("app/(protected)/(mentor)/kelas-saya/[kelasId]/page.tsx");
    assert.match(page, /getSesiKelasMentor/);
    assert.doesNotMatch(page, /getSesiSiswaByKelasId/);
  });

  it("komponen klien tidak lagi memuat label 'Siswa diterima mentor lain' dan tidak menerima siswa mentor lain", () => {
    const daftar = baca("components/mentor/SesiSiswaList.tsx");
    assert.doesNotMatch(daftar, /Siswa diterima mentor lain/);
    const menunggu = baca("components/mentor/MenungguDiterimaList.tsx");
    assert.match(menunggu, /Siswa sudah diterima mentor lain/); // pesan 409 klik Terima (halaman basi) tetap
  });
});
