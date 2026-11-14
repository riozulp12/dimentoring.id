/**
 * Test ketersediaan subtes pada kelas paket (lib/kelas/subtesTersedia.ts):
 * aturan KETAT — subtes tersedia HANYA bila ada pasangan kelas_subtes_mentor
 * dengan mentor aktif (kelas_mentor tidak dihitung, tanpa fallback). Subtes
 * tanpa mentor aktif = "Belum tersedia" di UI pilihan subtes. Penolakan di
 * server (payment/create) dites di tests/subtes-tersedia-create.test.ts.
 * Dijalankan terhadap Supabase TIRUAN di memori.
 *
 * Jalankan: npm test
 */
import "./helpers/envSupabaseUji";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import {
  cekSubtesDipilihTersedia,
  hitungKetersediaanSubtes,
  type SubtesPool,
} from "../lib/kelas/subtesTersedia";

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let tabelGagal: string | null;
let tabelDibaca: string[];

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
  then<A, B>(
    onfulfilled?: ((value: { data: Row[]; error: { message: string } | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    const error = tabelGagal === this.table ? { message: "gagal tiruan" } : null;
    return Promise.resolve({ data: error ? [] : this.rows, error }).then(onfulfilled, onrejected);
  }
}

const POOL: SubtesPool[] = [
  { id: "mtk", nama: "Matematika" },
  { id: "fis", nama: "Fisika" },
  { id: "kim", nama: "Kimia" },
];
const AKTIF = new Set(["m1", "m2"]);

type Modul = typeof import("@/lib/kelas/subtesTersedia");
let modul: Modul;

before(async () => {
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => FakeQuery }).from = (table: string) => {
    tabelDibaca.push(table);
    return new FakeQuery(db[table] ?? [], table);
  };
  modul = await import("@/lib/kelas/subtesTersedia");
});

beforeEach(() => {
  tabelGagal = null;
  tabelDibaca = [];
  db = { kelas_subtes_mentor: [], kelas_mentor: [], user_roles: [] };
});

const status = (hasil: ReturnType<typeof hitungKetersediaanSubtes>) =>
  Object.fromEntries(hasil.subtes.map((s) => [s.id, s.tersedia]));

describe("(a) kelas baru dengan pasangan", () => {
  it("subtes dengan mentor aktif tersedia", () => {
    const hasil = hitungKetersediaanSubtes({
      pool: POOL,
      pasangan: [
        { subtesId: "mtk", mentorId: "m1" },
        { subtesId: "fis", mentorId: "m2" },
        { subtesId: "kim", mentorId: "m1" },
      ],
      aktifIds: AKTIF,
    });
    assert.deepEqual(status(hasil), { mtk: true, fis: true, kim: true });
    assert.equal(hasil.kelasBisaDibeli, true);
    assert.deepEqual(hasil.subtesTidakTersediaIds, []);
  });

  it("subtes tanpa pasangan mentor tidak tersedia, yang lain tetap tersedia", () => {
    const hasil = hitungKetersediaanSubtes({ pool: POOL, pasangan: [{ subtesId: "mtk", mentorId: "m1" }], aktifIds: AKTIF });
    assert.deepEqual(status(hasil), { mtk: true, fis: false, kim: false });
    assert.deepEqual(hasil.subtesTidakTersediaIds, ["fis", "kim"]);
    assert.equal(hasil.kelasBisaDibeli, true);
  });

  it("mentor nonaktif tidak dihitung", () => {
    const hasil = hitungKetersediaanSubtes({
      pool: POOL,
      pasangan: [
        { subtesId: "mtk", mentorId: "m-off" },
        { subtesId: "fis", mentorId: "m1" },
        { subtesId: "kim", mentorId: "m-off" },
      ],
      aktifIds: AKTIF,
    });
    assert.deepEqual(status(hasil), { mtk: false, fis: true, kim: false });
  });

  it("subtes dengan dua mentor, satu nonaktif: tetap tersedia lewat yang aktif", () => {
    const hasil = hitungKetersediaanSubtes({
      pool: [POOL[0]],
      pasangan: [
        { subtesId: "mtk", mentorId: "m-off" },
        { subtesId: "mtk", mentorId: "m2" },
      ],
      aktifIds: AKTIF,
    });
    assert.equal(hasil.subtes[0].tersedia, true);
  });

  it("semua subtes tidak tersedia -> kelas ditandai tidak bisa dibeli", () => {
    const hasil = hitungKetersediaanSubtes({
      pool: POOL,
      pasangan: [
        { subtesId: "mtk", mentorId: "m-off" },
        { subtesId: "fis", mentorId: "m-off" },
      ],
      aktifIds: AKTIF,
    });
    assert.deepEqual(status(hasil), { mtk: false, fis: false, kim: false });
    assert.equal(hasil.kelasBisaDibeli, false);
  });

  it("kelas tanpa subtes (pool kosong) tidak dibatasi", () => {
    const hasil = hitungKetersediaanSubtes({ pool: [], pasangan: [], aktifIds: AKTIF });
    assert.equal(hasil.kelasBisaDibeli, true);
    assert.deepEqual(hasil.subtes, []);
  });
});

describe("(b) kelas lama tanpa pasangan kelas_subtes_mentor", () => {
  it("semua subtes 'Belum tersedia' dan kelas tidak bisa dibeli (tanpa fallback)", () => {
    const hasil = hitungKetersediaanSubtes({ pool: POOL, pasangan: [], aktifIds: AKTIF });
    assert.deepEqual(status(hasil), { mtk: false, fis: false, kim: false });
    assert.equal(hasil.kelasBisaDibeli, false);
    assert.deepEqual(hasil.subtesTidakTersediaIds, ["mtk", "fis", "kim"]);
  });

  it("mentor aktif di kelas_mentor TIDAK menyelamatkan: tabel itu bahkan tidak dibaca", async () => {
    db.kelas_mentor = [{ kelas_id: "K1", mentor_id: "m1" }];
    db.user_roles = [{ user_id: "m1", role_type: "mentor", status: "active" }];
    const hasil = await modul.getKetersediaanSubtes("K1", POOL);
    assert.ok(hasil);
    assert.equal(hasil.kelasBisaDibeli, false);
    assert.deepEqual(hasil.subtesTidakTersediaIds, ["mtk", "fis", "kim"]);
    assert.ok(!tabelDibaca.includes("kelas_mentor"), "kelas_mentor tidak boleh dibaca");
  });
});

describe("(c) subtes dipilih siswa tetapi tidak tersedia (cekSubtesDipilihTersedia)", () => {
  const ketersediaan = hitungKetersediaanSubtes({
    pool: POOL,
    pasangan: [{ subtesId: "mtk", mentorId: "m1" }],
    aktifIds: AKTIF,
  });

  it("pilihan yang semuanya tersedia diterima", () => {
    assert.deepEqual(cekSubtesDipilihTersedia(ketersediaan, ["mtk"]), { ok: true });
  });

  it("subtes tidak tersedia yang tetap dikirim klien ditolak, id-nya dilaporkan", () => {
    const hasil = cekSubtesDipilihTersedia(ketersediaan, ["mtk", "fis", "fis", "kim"]);
    assert.equal(hasil.ok, false);
    if (!hasil.ok) {
      assert.deepEqual(hasil.subtesIds, ["fis", "kim"]);
      assert.match(hasil.error, /belum tersedia/);
    }
  });

  it("campuran tersedia + tidak tersedia ditolak seluruhnya (tidak dibuang diam-diam)", () => {
    assert.equal(cekSubtesDipilihTersedia(ketersediaan, ["mtk", "fis"]).ok, false);
  });
});

describe("getKetersediaanSubtes (membaca tabel)", () => {
  it("membaca kelas_subtes_mentor + user_roles aktif", async () => {
    db.kelas_subtes_mentor = [
      { kelas_id: "K1", subtes_id: "mtk", mentor_id: "m1" },
      { kelas_id: "K1", subtes_id: "fis", mentor_id: "m-off" },
      { kelas_id: "K-lain", subtes_id: "kim", mentor_id: "m1" },
    ];
    db.user_roles = [
      { user_id: "m1", role_type: "mentor", status: "active" },
      { user_id: "m-off", role_type: "mentor", status: "pending" },
    ];
    const hasil = await modul.getKetersediaanSubtes("K1", POOL);
    assert.ok(hasil);
    assert.deepEqual(status(hasil), { mtk: true, fis: false, kim: false });
    assert.equal(hasil.kelasBisaDibeli, true);
    assert.ok(tabelDibaca.includes("kelas_subtes_mentor"));
    assert.ok(tabelDibaca.includes("user_roles"));
  });

  it("peran yang bukan mentor tidak dihitung", async () => {
    db.kelas_subtes_mentor = [{ kelas_id: "K1", subtes_id: "mtk", mentor_id: "u1" }];
    db.user_roles = [{ user_id: "u1", role_type: "student", status: "active" }];
    assert.equal((await modul.getKetersediaanSubtes("K1", [POOL[0]]))?.kelasBisaDibeli, false);
  });

  it("galat database: mengembalikan null (pemanggil yang memutuskan), tidak melempar", async () => {
    tabelGagal = "kelas_subtes_mentor";
    assert.equal(await modul.getKetersediaanSubtes("K1", POOL), null);
    tabelGagal = "user_roles";
    db.kelas_subtes_mentor = [{ kelas_id: "K1", subtes_id: "mtk", mentor_id: "m1" }];
    assert.equal(await modul.getKetersediaanSubtes("K1", POOL), null);
  });
});

describe("UI pilihan subtes di checkout", () => {
  const baca = (relatif: string) => readFileSync(path.join(process.cwd(), relatif), "utf8");
  const form = baca("components/siswa/CheckoutForm.tsx");
  const halaman = baca("app/(protected)/(siswa)/checkout/[kelasId]/page.tsx");

  it('subtes tidak tersedia diberi label "Belum tersedia" dan checkbox dinonaktifkan', () => {
    assert.ok(form.includes("Belum tersedia"));
    assert.ok(form.includes("tersedia?: boolean"));
    assert.match(form, /disabled=\{disabled\}/);
    assert.match(form, /const tidakTersedia = subtes\.tersedia === false;/);
  });

  it("toggleSubtes menolak subtes yang tidak tersedia", () => {
    assert.match(form, /tidakTersediaIds\.has\(subtesId\)/);
  });

  it("tombol Bayar dikunci bila kelas paket tidak punya subtes tersedia sama sekali", () => {
    assert.match(form, /isPaket && !adaSubtesTersedia/);
    assert.ok(form.includes("belum bisa didaftar"));
  });

  it("halaman checkout memakai helper yang SAMA dengan server dan meneruskan flag tersedia", () => {
    assert.ok(halaman.includes('from "@/lib/kelas/subtesTersedia"'));
    assert.ok(halaman.includes("getKetersediaanSubtes"));
    assert.ok(halaman.includes("tersedia"));
  });
});
