/**
 * Test nama mentor di sisi SISWA: diambil dari kelas_subtes_mentor + kelas_mentor
 * (mentor aktif saja), fallback ke kelas.mentor_id (kolom lama) bila kedua tabel
 * tidak punya baris. Banyak mentor: maks. 3 nama lalu "+N lainnya". Dijalankan
 * terhadap Supabase TIRUAN di memori.
 *
 * Jalankan: npm test
 */
import "./helpers/envSupabaseUji";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import { MAKS_NAMA_MENTOR_TAMPIL, formatNamaMentor, tentukanMentorKelas, type MentorRef } from "../lib/shared/namaMentor";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

let db: Db;
let tabelDibaca: string[];
let tabelGagal: string | null;

class FakeQuery implements PromiseLike<{ data: Row[]; error: { message: string } | null }> {
  constructor(
    private rows: Row[],
    private table: string,
  ) {}
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
    onfulfilled?: ((value: { data: Row[]; error: { message: string } | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    const error = tabelGagal === this.table ? { message: "gagal tiruan" } : null;
    return Promise.resolve({ data: error ? [] : this.rows, error }).then(onfulfilled, onrejected);
  }
}

function fakeFrom(table: string) {
  tabelDibaca.push(table);
  const rows = db[table] ?? [];
  if (table === "enrollments") {
    return new FakeQuery(
      rows.map((row) => ({ ...row, kelas: db.kelas.find((k) => k.id === row.kelas_id) ?? null })),
      table,
    );
  }
  return new FakeQuery(rows, table);
}

const aktif = (id: string) => ({ user_id: id, role_type: "mentor", status: "active" });
const nonaktif = (id: string, status = "pending") => ({ user_id: id, role_type: "mentor", status });

function kelas(id: string, extra: Row = {}): Row {
  return {
    id,
    nama: `Kelas ${id}`,
    jadwal: null,
    jadwal_pilih_siswa: false,
    link_meet: null,
    deskripsi: null,
    mode_pembelajaran: "online",
    jumlah_sesi: 10,
    tampil_di_katalog: true,
    program_kategori: "snbt",
    tingkat_kelas: "kelas_12",
    mentor_id: null,
    subtes: null,
    ...extra,
  };
}

type NamaMentorModule = typeof import("@/lib/kelas/namaMentor");
type KelasDetailModule = typeof import("@/lib/siswa/getKelasDetail");
type KelasSayaModule = typeof import("@/lib/siswa/getKelasSayaData");
let namaMentor: NamaMentorModule;
let kelasDetail: KelasDetailModule;
let kelasSaya: KelasSayaModule;

before(async () => {
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  namaMentor = await import("@/lib/kelas/namaMentor");
  kelasDetail = await import("@/lib/siswa/getKelasDetail");
  kelasSaya = await import("@/lib/siswa/getKelasSayaData");
});

beforeEach(() => {
  tabelDibaca = [];
  tabelGagal = null;
  db = {
    users: [
      { id: "m-ani", nama: "Ani" },
      { id: "m-budi", nama: "Budi" },
      { id: "m-citra", nama: "Citra" },
      { id: "m-dewi", nama: "Dewi" },
      { id: "m-eka", nama: "Eka" },
      { id: "m-lama", nama: "Mentor Lama" },
      { id: "m-off", nama: "Mentor Nonaktif" },
    ],
    user_roles: [
      aktif("m-ani"),
      aktif("m-budi"),
      aktif("m-citra"),
      aktif("m-dewi"),
      aktif("m-eka"),
      aktif("m-lama"),
      nonaktif("m-off"),
    ],
    kelas_subtes_mentor: [],
    kelas_mentor: [],
    kelas: [],
    enrollments: [],
    sesi_kelas: [],
    kelas_subtes: [],
  };
});

const ref = (id: string, nama: string): MentorRef => ({ id, nama });
const AKTIF = new Set(["a", "b", "c", "d", "e", "lama"]);

describe("tentukanMentorKelas (aturan murni)", () => {
  it("satu mentor", () => {
    const hasil = tentukanMentorKelas({ pasangan: [ref("a", "Ani")], umum: [], lama: null, aktifIds: AKTIF });
    assert.deepEqual(hasil.map((m) => m.nama), ["Ani"]);
  });

  it("banyak mentor: gabungan pasangan + umum, unik per mentor, urut abjad", () => {
    const hasil = tentukanMentorKelas({
      pasangan: [ref("c", "Citra"), ref("a", "Ani")],
      umum: [ref("a", "Ani"), ref("b", "Budi")],
      lama: null,
      aktifIds: AKTIF,
    });
    assert.deepEqual(hasil.map((m) => m.nama), ["Ani", "Budi", "Citra"]);
  });

  it("nol mentor di kedua tabel: fallback ke kelas.mentor_id", () => {
    const hasil = tentukanMentorKelas({ pasangan: [], umum: [], lama: ref("lama", "Mentor Lama"), aktifIds: AKTIF });
    assert.deepEqual(hasil.map((m) => m.nama), ["Mentor Lama"]);
  });

  it("nol mentor dan tanpa kelas.mentor_id: kosong", () => {
    assert.deepEqual(tentukanMentorKelas({ pasangan: [], umum: [], lama: null, aktifIds: AKTIF }), []);
  });

  it("mentor nonaktif tidak tampil, yang aktif tetap tampil", () => {
    const hasil = tentukanMentorKelas({
      pasangan: [ref("a", "Ani")],
      umum: [ref("off", "Mentor Nonaktif")],
      lama: null,
      aktifIds: AKTIF,
    });
    assert.deepEqual(hasil.map((m) => m.nama), ["Ani"]);
  });

  it("semua mentor di tabel nonaktif: kosong, TIDAK jatuh ke kelas.mentor_id", () => {
    const hasil = tentukanMentorKelas({
      pasangan: [ref("off", "Mentor Nonaktif")],
      umum: [],
      lama: ref("lama", "Mentor Lama"),
      aktifIds: AKTIF,
    });
    assert.deepEqual(hasil, []);
  });

  it("fallback kelas.mentor_id yang nonaktif juga tidak tampil", () => {
    assert.deepEqual(tentukanMentorKelas({ pasangan: [], umum: [], lama: ref("off", "X"), aktifIds: AKTIF }), []);
  });

  it("nama kosong dilewati", () => {
    assert.deepEqual(tentukanMentorKelas({ pasangan: [ref("a", "  ")], umum: [], lama: null, aktifIds: AKTIF }), []);
  });
});

describe("formatNamaMentor", () => {
  it("1 sampai 3 nama dipisah koma", () => {
    assert.equal(formatNamaMentor(["Ani"]), "Ani");
    assert.equal(formatNamaMentor(["Ani", "Budi"]), "Ani, Budi");
    assert.equal(formatNamaMentor(["Ani", "Budi", "Citra"]), "Ani, Budi, Citra");
  });

  it('lebih dari 3: tampil 3 lalu "+N lainnya"', () => {
    assert.equal(formatNamaMentor(["Ani", "Budi", "Citra", "Dewi"]), "Ani, Budi, Citra +1 lainnya");
    assert.equal(formatNamaMentor(["Ani", "Budi", "Citra", "Dewi", "Eka"]), "Ani, Budi, Citra +2 lainnya");
    assert.equal(MAKS_NAMA_MENTOR_TAMPIL, 3);
  });

  it("tanpa nama: null", () => {
    assert.equal(formatNamaMentor([]), null);
  });
});

describe("getNamaMentorKelas (membaca tabel baru)", () => {
  it("satu mentor dari kelas_subtes_mentor; kedua tabel baru dibaca", async () => {
    db.kelas_subtes_mentor = [{ kelas_id: "K1", subtes_id: "s1", mentor_id: "m-ani" }];
    const hasil = await namaMentor.getNamaMentorKelas([{ id: "K1", mentorIdLama: null }]);
    assert.equal(hasil.get("K1"), "Ani");
    assert.ok(tabelDibaca.includes("kelas_subtes_mentor"));
    assert.ok(tabelDibaca.includes("kelas_mentor"));
  });

  it("banyak mentor: gabungan kedua tabel, unik, urut abjad", async () => {
    db.kelas_subtes_mentor = [
      { kelas_id: "K2", subtes_id: "s1", mentor_id: "m-citra" },
      { kelas_id: "K2", subtes_id: "s2", mentor_id: "m-ani" },
    ];
    db.kelas_mentor = [
      { kelas_id: "K2", mentor_id: "m-ani" },
      { kelas_id: "K2", mentor_id: "m-budi" },
    ];
    const hasil = await namaMentor.getNamaMentorKelas([{ id: "K2", mentorIdLama: "m-ani" }]);
    assert.equal(hasil.get("K2"), "Ani, Budi, Citra");
  });

  it("lebih dari 3 mentor: tiga nama lalu +N lainnya", async () => {
    db.kelas_mentor = ["m-ani", "m-budi", "m-citra", "m-dewi", "m-eka"].map((mentor_id) => ({ kelas_id: "K3", mentor_id }));
    const hasil = await namaMentor.getNamaMentorKelas([{ id: "K3", mentorIdLama: null }]);
    assert.equal(hasil.get("K3"), "Ani, Budi, Citra +2 lainnya");
  });

  it("nol mentor di kedua tabel: fallback ke kelas.mentor_id", async () => {
    const hasil = await namaMentor.getNamaMentorKelas([{ id: "K4", mentorIdLama: "m-lama" }]);
    assert.equal(hasil.get("K4"), "Mentor Lama");
  });

  it("nol mentor dan tanpa kelas.mentor_id: null", async () => {
    const hasil = await namaMentor.getNamaMentorKelas([{ id: "K5", mentorIdLama: null }]);
    assert.equal(hasil.get("K5"), null);
  });

  it("mentor nonaktif tidak tampil (dan tidak jatuh ke kelas.mentor_id)", async () => {
    db.kelas_mentor = [
      { kelas_id: "K6", mentor_id: "m-ani" },
      { kelas_id: "K6", mentor_id: "m-off" },
    ];
    db.kelas_subtes_mentor = [{ kelas_id: "K7", subtes_id: "s1", mentor_id: "m-off" }];
    const hasil = await namaMentor.getNamaMentorKelas([
      { id: "K6", mentorIdLama: "m-off" },
      { id: "K7", mentorIdLama: "m-lama" },
    ]);
    assert.equal(hasil.get("K6"), "Ani");
    assert.equal(hasil.get("K7"), null);
  });

  it("peran mentor berstatus selain active (rejected/pending) tidak dihitung", async () => {
    db.user_roles = [aktif("m-ani"), nonaktif("m-budi", "rejected")];
    db.kelas_mentor = [
      { kelas_id: "K8", mentor_id: "m-ani" },
      { kelas_id: "K8", mentor_id: "m-budi" },
    ];
    assert.equal((await namaMentor.getNamaMentorKelas([{ id: "K8", mentorIdLama: null }])).get("K8"), "Ani");
  });

  it("banyak kelas sekaligus tidak tercampur", async () => {
    db.kelas_mentor = [
      { kelas_id: "KA", mentor_id: "m-ani" },
      { kelas_id: "KB", mentor_id: "m-budi" },
    ];
    const hasil = await namaMentor.getNamaMentorKelas([
      { id: "KA", mentorIdLama: null },
      { id: "KB", mentorIdLama: null },
      { id: "KC", mentorIdLama: "m-lama" },
    ]);
    assert.equal(hasil.get("KA"), "Ani");
    assert.equal(hasil.get("KB"), "Budi");
    assert.equal(hasil.get("KC"), "Mentor Lama");
  });

  it("daftar kosong: tidak ada query", async () => {
    const hasil = await namaMentor.getNamaMentorKelas([]);
    assert.equal(hasil.size, 0);
    assert.deepEqual(tabelDibaca, []);
  });

  it("galat database: tidak melempar, hasilnya tanpa nama", async () => {
    db.kelas_mentor = [{ kelas_id: "K9", mentor_id: "m-ani" }];
    tabelGagal = "kelas_mentor";
    const hasil = await namaMentor.getNamaMentorKelas([{ id: "K9", mentorIdLama: "m-lama" }]);
    assert.equal(hasil.get("K9"), null);
  });
});

describe("pemanggil sisi siswa memakai helper", () => {
  it("getKelasDetail: nama mentor dari tabel baru (kelas.mentor_id lama diabaikan bila ada baris baru)", async () => {
    db.kelas = [kelas("K1", { mentor_id: "m-lama" })];
    db.kelas_mentor = [
      { kelas_id: "K1", mentor_id: "m-ani" },
      { kelas_id: "K1", mentor_id: "m-budi" },
    ];
    const detail = await kelasDetail.getKelasDetail("K1");
    assert.equal(detail?.mentorNama, "Ani, Budi");
  });

  it("getKelasDetail: fallback ke kelas.mentor_id bila tabel baru kosong, null bila tidak ada", async () => {
    db.kelas = [kelas("K1", { mentor_id: "m-lama" }), kelas("K2")];
    assert.equal((await kelasDetail.getKelasDetail("K1"))?.mentorNama, "Mentor Lama");
    assert.equal((await kelasDetail.getKelasDetail("K2"))?.mentorNama, null);
  });

  it("getKelasSaya: nama mentor tiap kelas dari tabel baru", async () => {
    db.kelas = [kelas("A"), kelas("B", { mentor_id: "m-lama" }), kelas("C")];
    db.kelas_subtes_mentor = [{ kelas_id: "A", subtes_id: "s1", mentor_id: "m-citra" }];
    db.kelas_mentor = [{ kelas_id: "C", mentor_id: "m-off" }];
    db.enrollments = ["A", "B", "C"].map((kelas_id) => ({
      id: `e-${kelas_id}`,
      user_id: "siswa-1",
      kelas_id,
      status_pembayaran: "lunas",
      jadwal_ditetapkan: null,
    }));
    const items = await kelasSaya.getKelasSaya("siswa-1");
    const nama = (id: string) => items.find((k) => k.id === id)?.mentorNama;
    assert.equal(nama("A"), "Citra");
    assert.equal(nama("B"), "Mentor Lama");
    assert.equal(nama("C"), null);
  });
});

describe("tidak lagi membaca kelas.mentor_id langsung untuk nama", () => {
  const baca = (relatif: string) => readFileSync(path.join(process.cwd(), relatif), "utf8");

  it("getKelasDetail & getKelasSayaData tidak lagi join kelas.mentor_id untuk nama", () => {
    for (const berkas of ["lib/siswa/getKelasDetail.ts", "lib/siswa/getKelasSayaData.ts"]) {
      const sumber = baca(berkas);
      assert.ok(!sumber.includes("mentor:mentor_id(nama), subtes:subtes_id(nama)"), berkas); // join mentor milik KELAS (sesi_kelas.mentor_id di getKelasDetail tidak termasuk)
      assert.ok(sumber.includes("getNamaMentorKelas"), berkas);
    }
  });
});
