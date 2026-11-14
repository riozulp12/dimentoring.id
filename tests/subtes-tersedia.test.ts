/**
 * Test ketersediaan subtes pada kelas paket (lib/kelas/subtesTersedia.ts):
 * subtes tanpa mentor aktif = "Belum tersedia" di UI pilihan subtes, dan
 * helper server siap dipanggil payment/create (belum dipanggil — ditinjau
 * manual). Dijalankan terhadap Supabase TIRUAN di memori.
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
const AKTIF = new Set(["m1", "m2", "umum-aktif"]);

type Modul = typeof import("@/lib/kelas/subtesTersedia");
let modul: Modul;

before(async () => {
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => FakeQuery }).from = (table: string) => new FakeQuery(db[table] ?? [], table);
  modul = await import("@/lib/kelas/subtesTersedia");
});

beforeEach(() => {
  tabelGagal = null;
  db = { kelas_subtes_mentor: [], kelas_mentor: [], user_roles: [] };
});

const status = (hasil: ReturnType<typeof hitungKetersediaanSubtes>) =>
  Object.fromEntries(hasil.subtes.map((s) => [s.id, s.tersedia]));

describe("hitungKetersediaanSubtes (aturan murni)", () => {
  it("subtes dengan mentor aktif tersedia", () => {
    const hasil = hitungKetersediaanSubtes({
      pool: POOL,
      pasangan: [
        { subtesId: "mtk", mentorId: "m1" },
        { subtesId: "fis", mentorId: "m2" },
        { subtesId: "kim", mentorId: "m1" },
      ],
      mentorKelasIds: [],
      aktifIds: AKTIF,
    });
    assert.deepEqual(status(hasil), { mtk: true, fis: true, kim: true });
    assert.equal(hasil.kelasBisaDibeli, true);
    assert.deepEqual(hasil.subtesTidakTersediaIds, []);
  });

  it("subtes tanpa pasangan mentor -> tidak tersedia, yang lain tetap tersedia", () => {
    const hasil = hitungKetersediaanSubtes({
      pool: POOL,
      pasangan: [{ subtesId: "mtk", mentorId: "m1" }],
      mentorKelasIds: ["m1"],
      aktifIds: AKTIF,
    });
    assert.deepEqual(status(hasil), { mtk: true, fis: false, kim: false });
    assert.deepEqual(hasil.subtesTidakTersediaIds, ["fis", "kim"]);
    assert.equal(hasil.kelasBisaDibeli, true);
  });

  it("kelas_mentor aktif TIDAK menyelamatkan subtes tanpa pasangan bila kelas sudah punya pasangan", () => {
    const hasil = hitungKetersediaanSubtes({
      pool: POOL,
      pasangan: [{ subtesId: "mtk", mentorId: "m1" }],
      mentorKelasIds: ["umum-aktif"],
      aktifIds: AKTIF,
    });
    assert.equal(status(hasil).fis, false);
  });

  it("mentor nonaktif tidak dihitung", () => {
    const hasil = hitungKetersediaanSubtes({
      pool: POOL,
      pasangan: [
        { subtesId: "mtk", mentorId: "m-off" },
        { subtesId: "fis", mentorId: "m1" },
        { subtesId: "kim", mentorId: "m-off" },
      ],
      mentorKelasIds: [],
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
      mentorKelasIds: [],
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
      mentorKelasIds: [],
      aktifIds: AKTIF,
    });
    assert.deepEqual(status(hasil), { mtk: false, fis: false, kim: false });
    assert.equal(hasil.kelasBisaDibeli, false);
  });

  it("kelas lama tanpa pasangan sama sekali: tersedia bila ada mentor aktif di kelas_mentor", () => {
    const ada = hitungKetersediaanSubtes({ pool: POOL, pasangan: [], mentorKelasIds: ["umum-aktif"], aktifIds: AKTIF });
    assert.deepEqual(status(ada), { mtk: true, fis: true, kim: true });
    const nonaktif = hitungKetersediaanSubtes({ pool: POOL, pasangan: [], mentorKelasIds: ["m-off"], aktifIds: AKTIF });
    assert.equal(nonaktif.kelasBisaDibeli, false);
    const kosong = hitungKetersediaanSubtes({ pool: POOL, pasangan: [], mentorKelasIds: [], aktifIds: AKTIF });
    assert.equal(kosong.kelasBisaDibeli, false);
  });

  it("kelas tanpa subtes (pool kosong) tidak dibatasi", () => {
    const hasil = hitungKetersediaanSubtes({ pool: [], pasangan: [], mentorKelasIds: [], aktifIds: AKTIF });
    assert.equal(hasil.kelasBisaDibeli, true);
    assert.deepEqual(hasil.subtes, []);
  });
});

describe("cekSubtesDipilihTersedia (untuk payment/create)", () => {
  const ketersediaan = hitungKetersediaanSubtes({
    pool: POOL,
    pasangan: [{ subtesId: "mtk", mentorId: "m1" }],
    mentorKelasIds: [],
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
});

describe("getKetersediaanSubtes (membaca tabel)", () => {
  it("membaca kelas_subtes_mentor + kelas_mentor + user_roles aktif", async () => {
    db.kelas_subtes_mentor = [
      { kelas_id: "K1", subtes_id: "mtk", mentor_id: "m1" },
      { kelas_id: "K1", subtes_id: "fis", mentor_id: "m-off" },
      { kelas_id: "K-lain", subtes_id: "kim", mentor_id: "m1" },
    ];
    db.kelas_mentor = [{ kelas_id: "K1", mentor_id: "m1" }];
    db.user_roles = [
      { user_id: "m1", role_type: "mentor", status: "active" },
      { user_id: "m-off", role_type: "mentor", status: "pending" },
    ];
    const hasil = await modul.getKetersediaanSubtes("K1", POOL);
    assert.ok(hasil);
    assert.deepEqual(status(hasil), { mtk: true, fis: false, kim: false });
    assert.equal(hasil.kelasBisaDibeli, true);
  });

  it("peran mentor yang bukan mentor (role lain) tidak dihitung", async () => {
    db.kelas_subtes_mentor = [{ kelas_id: "K1", subtes_id: "mtk", mentor_id: "u1" }];
    db.user_roles = [{ user_id: "u1", role_type: "student", status: "active" }];
    const hasil = await modul.getKetersediaanSubtes("K1", [POOL[0]]);
    assert.equal(hasil?.kelasBisaDibeli, false);
  });

  it("kelas tanpa baris mentor sama sekali: semua subtes tidak tersedia", async () => {
    const hasil = await modul.getKetersediaanSubtes("K1", POOL);
    assert.equal(hasil?.kelasBisaDibeli, false);
    assert.deepEqual(hasil?.subtesTidakTersediaIds, ["mtk", "fis", "kim"]);
  });

  it("galat database: mengembalikan null (pemanggil yang memutuskan), tidak melempar", async () => {
    tabelGagal = "kelas_subtes_mentor";
    assert.equal(await modul.getKetersediaanSubtes("K1", POOL), null);
    tabelGagal = "user_roles";
    db.kelas_mentor = [{ kelas_id: "K1", mentor_id: "m1" }];
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

  it("halaman checkout memakai helper dan meneruskan flag tersedia", () => {
    assert.ok(halaman.includes('from "@/lib/kelas/subtesTersedia"'));
    assert.ok(halaman.includes("getKetersediaanSubtes"));
    assert.ok(halaman.includes("tersedia"));
  });
});
