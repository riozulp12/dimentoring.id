/**
 * Test tampilan ADMIN memakai kapasitas EFEKTIF (hitungKapasitasKelas — sama dengan badge kartu katalog),
 * bukan kapasitas manual mentah: halaman Pendaftar dan Kelola Kelas menampilkan "Terisi X dari Y"; kelas
 * private-online-slot juga "Slot terisi A dari B". Supabase TIRUAN di memori. Aturan kapasitas/slot
 * (lib/shared/kapasitasKelas.ts, slotTerisi.ts) tidak berubah — di sini hanya dipakai.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { hitungKapasitasKelas } from "@/lib/shared/kapasitasKelas";
import { hitungSlotTerisi } from "@/lib/shared/slotTerisi";
import {
  ringkasSlotTerisi,
  teksSlotTerisi,
  teksTerisiDetail,
  teksTerisiRingkas,
} from "@/lib/shared/ringkasanKapasitasAdmin";

const SEN = { hari: "Senin", jam_mulai: "19:00" };
const SEL = { hari: "Selasa", jam_mulai: "19:00" };
const RAB = { hari: "Rabu", jam_mulai: "19:00" };

describe("teks kapasitas Admin (murni)", () => {
  it("terbatas: '2/2' dan 'Terisi 2 dari 2' — angka dari kapasitas efektif", () => {
    const info = hitungKapasitasKelas({ kapasitasManual: 10, lunas: 2, otomatis: { kapasitas: 2, sisa: 0 } });
    assert.equal(info.kapasitas, 2);
    assert.equal(teksTerisiRingkas(info), "2/2");
    assert.equal(teksTerisiDetail(info), "Terisi 2 dari 2");
  });

  it("tanpa batas: '3/∞' dan 'Terisi 3 siswa (tanpa batas)'", () => {
    const info = hitungKapasitasKelas({ kapasitasManual: null, lunas: 3, otomatis: null });
    assert.equal(teksTerisiRingkas(info), "3/∞");
    assert.equal(teksTerisiDetail(info), "Terisi 3 siswa (tanpa batas)");
  });

  it("kelas non-slot dengan kapasitas manual: apa adanya ('1/5')", () => {
    const info = hitungKapasitasKelas({ kapasitasManual: 5, lunas: 1, otomatis: null });
    assert.equal(teksTerisiRingkas(info), "1/5");
  });

  it("ringkasSlotTerisi menjumlah terisi & kapasitas semua slot; tanpa slot = null (tanpa baris 'Slot terisi')", () => {
    const status = hitungSlotTerisi({ slots: [SEN, SEL, RAB], kapasitasPerSlot: 2, slotEfektifSiswa: [SEN, SEN, SEL] });
    assert.deepEqual(ringkasSlotTerisi(status), { terisi: 3, kapasitas: 6 });
    assert.equal(teksSlotTerisi(ringkasSlotTerisi(status)), "Slot terisi 3 dari 6");
    assert.equal(ringkasSlotTerisi([]), null);
    assert.equal(teksSlotTerisi(null), null);
  });
});

// ---------------------------------------------------------------------------
// Pembaca server (Supabase tiruan)
// ---------------------------------------------------------------------------

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

function fakeFrom(table: string) {
  db[table] ??= [];
  let view: Row[] = db[table];
  if (table === "kelas") {
    view = db.kelas.map((row) => ({
      ...row,
      subtes: subtesOf(row.subtes_id),
      kelas_subtes: db.kelas_subtes.filter((r) => r.kelas_id === row.id).map((r) => ({ ...r, subtes: subtesOf(r.subtes_id) })),
      kelas_mentor: db.kelas_mentor.filter((r) => r.kelas_id === row.id).map((r) => ({ ...r, users: userOf(r.mentor_id) })),
      kelas_subtes_mentor: db.kelas_subtes_mentor
        .filter((r) => r.kelas_id === row.id)
        .map((r) => ({ ...r, subtes: subtesOf(r.subtes_id), users: userOf(r.mentor_id) })),
      enrollments: db.enrollments.filter((r) => r.kelas_id === row.id),
    }));
  } else if (table === "kelas_subtes") {
    view = db.kelas_subtes.map((row) => ({ ...row, subtes: subtesOf(row.subtes_id) }));
  } else if (table === "enrollments") {
    view = db.enrollments.map((row) => ({ ...row, users: userOf(row.user_id), mentor_offline: null, link_meet_pengisi: null }));
  }
  return new FakeQuery(view, tabelGagal.has(table));
}

type KelolaModule = typeof import("@/lib/admin/getKelolaKelasData");
type PendaftarModule = typeof import("@/lib/admin/getPendaftarKelas");
let kelolaLib: KelolaModule;
let pendaftarLib: PendaftarModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  kelolaLib = await import("@/lib/admin/getKelolaKelasData");
  pendaftarLib = await import("@/lib/admin/getPendaftarKelas");
});

const M1 = "mentor-1";
const M2 = "mentor-2";
const enr = (id: string, kelas_id: string, status: string, extra: Row = {}): Row => ({
  id,
  kelas_id,
  user_id: `u-${id}`,
  status_pembayaran: status,
  jadwal_pilihan: null,
  jadwal_ditetapkan: null,
  jadwal_ditetapkan_at: null,
  sumber: "checkout",
  tanggal_daftar: "2026-10-01T00:00:00Z",
  ...extra,
});

beforeEach(() => {
  tabelGagal = new Set();
  db = {
    users: [
      { id: M1, nama: "Mentor Satu" },
      { id: M2, nama: "Mentor Dua" },
    ],
    user_roles: [
      { user_id: M1, role_type: "mentor", status: "active" },
      { user_id: M2, role_type: "mentor", status: "active" },
    ],
    subtes: [{ id: "s-mtk", nama: "Penalaran Matematika" }],
    kelas: [
      // 2 slot x 1 mentor = kapasitas otomatis 2; kapasitas MANUAL 10 (jauh lebih besar) -> efektif 2
      { id: "K-PRIV", nama: "Privat MTK", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: [SEN, SEL], kapasitas: 10, subtes_id: "s-mtk", jumlah_sesi: 4, program_kategori: "snbt", tingkat_kelas: "sma", harga: 100000 },
      // 3 slot x 2 mentor = 6; kapasitas kosong; satu siswa manual dengan jadwal_ditetapkan (jadwal_pilihan NULL)
      { id: "K-PRIV2", nama: "Privat Fisika", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: [SEN, SEL, RAB], kapasitas: null, subtes_id: "s-mtk", jumlah_sesi: 4, program_kategori: "snbt", tingkat_kelas: "sma", harga: 100000 },
      { id: "K-GRUP", nama: "Grup MTK", tipe_kelas: "grouping", mode_pembelajaran: "online", jadwal_pilih_siswa: false, jadwal: [SEN], kapasitas: 5, subtes_id: "s-mtk", jumlah_sesi: 4, program_kategori: "snbt", tingkat_kelas: "sma", harga: 100000 },
      { id: "K-BEBAS", nama: "Kelas Bebas", tipe_kelas: "grouping", mode_pembelajaran: "online", jadwal_pilih_siswa: false, jadwal: null, kapasitas: null, subtes_id: "s-mtk", jumlah_sesi: 4, program_kategori: "snbt", tingkat_kelas: "sma", harga: 100000 },
    ],
    kelas_subtes: [
      { kelas_id: "K-PRIV", subtes_id: "s-mtk" },
      { kelas_id: "K-PRIV2", subtes_id: "s-mtk" },
      { kelas_id: "K-GRUP", subtes_id: "s-mtk" },
      { kelas_id: "K-BEBAS", subtes_id: "s-mtk" },
    ],
    kelas_mentor: [],
    kelas_subtes_mentor: [
      { kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id: M1 },
      { kelas_id: "K-PRIV2", subtes_id: "s-mtk", mentor_id: M1 },
      { kelas_id: "K-PRIV2", subtes_id: "s-mtk", mentor_id: M2 },
    ],
    enrollments: [
      enr("e1", "K-PRIV", "lunas", { jadwal_pilihan: [SEN] }),
      enr("e2", "K-PRIV", "lunas", { jadwal_pilihan: [SEL] }),
      enr("e3", "K-PRIV", "menunggu", { jadwal_pilihan: [SEL] }), // menunggu TIDAK dihitung
      enr("e4", "K-PRIV2", "lunas", { jadwal_pilihan: [SEN] }),
      enr("e5", "K-PRIV2", "lunas", { sumber: "manual", jadwal_ditetapkan: SEL }), // siswa manual dengan jadwal
      enr("e6", "K-GRUP", "lunas"),
      enr("e7", "K-BEBAS", "lunas"),
      enr("e8", "K-BEBAS", "lunas"),
      enr("e9", "K-BEBAS", "lunas"),
    ],
  };
});

describe("Kelola Kelas — daftar kelas memakai kapasitas efektif", () => {
  it("private-online-slot dengan kapasitas manual 10: efektif 2 -> '2/2' (BUKAN '2/10'), kolom mentah tetap 10 untuk form edit", async () => {
    const list = await kelolaLib.getKelasList();
    const priv = list.find((k) => k.id === "K-PRIV");
    assert.ok(priv);
    assert.equal(priv.kapasitas, 10);
    assert.equal(priv.jumlahSiswa, 2);
    assert.equal(priv.kapasitasEfektif.kapasitas, 2);
    assert.equal(priv.kapasitasEfektif.penuh, true);
    assert.equal(teksTerisiRingkas(priv.kapasitasEfektif), "2/2");
    assert.equal(teksTerisiDetail(priv.kapasitasEfektif), "Terisi 2 dari 2");
    assert.equal(teksSlotTerisi(priv.slotTerisi), "Slot terisi 2 dari 2");
  });

  it("siswa manual dengan jadwal ikut menahan slot: 'Slot terisi 2 dari 6', kapasitas efektif 6 (kapasitas manual kosong)", async () => {
    const priv2 = (await kelolaLib.getKelasList()).find((k) => k.id === "K-PRIV2");
    assert.ok(priv2);
    assert.equal(priv2.kapasitas, null);
    assert.equal(teksTerisiRingkas(priv2.kapasitasEfektif), "2/6");
    assert.deepEqual(priv2.slotTerisi, { terisi: 2, kapasitas: 6 });
  });

  it("kelas non-slot: kapasitas manual apa adanya, tanpa baris slot; tanpa batas: '3/∞'", async () => {
    const list = await kelolaLib.getKelasList();
    const grup = list.find((k) => k.id === "K-GRUP");
    const bebas = list.find((k) => k.id === "K-BEBAS");
    assert.ok(grup && bebas);
    assert.equal(teksTerisiRingkas(grup.kapasitasEfektif), "1/5");
    assert.equal(grup.slotTerisi, null);
    assert.equal(teksTerisiRingkas(bebas.kapasitasEfektif), "3/∞");
    assert.equal(bebas.slotTerisi, null);
  });

  it("galat membaca ketersediaan: jatuh ke kapasitas manual (tanpa slot), daftar kelas tetap tampil", async () => {
    tabelGagal.add("kelas_subtes");
    const list = await kelolaLib.getKelasList();
    // Embed kelas_subtes di query utama ada di tiruan `kelas` — yang gagal hanya pembaca ketersediaan.
    const priv = list.find((k) => k.id === "K-PRIV");
    assert.ok(priv);
    assert.equal(teksTerisiRingkas(priv.kapasitasEfektif), "2/10");
    assert.equal(priv.slotTerisi, null);
  });
});

describe("halaman Pendaftar — kapasitas efektif", () => {
  it("K-PRIV: terisi 2 dari 2 + slot terisi 2 dari 2; kapasitas mentah tetap 10 (aturan pendaftaran manual)", async () => {
    const data = await pendaftarLib.getPendaftarKelas("K-PRIV");
    assert.ok(data);
    assert.equal(data.kelas.kapasitas, 10);
    assert.equal(data.kelas.terisi, 2);
    assert.equal(teksTerisiDetail(data.kelas.kapasitasEfektif), "Terisi 2 dari 2");
    assert.equal(teksSlotTerisi(data.kelas.slotTerisi), "Slot terisi 2 dari 2");
    assert.equal(data.kelas.kapasitasEfektif.penuh, true);
  });

  it("K-PRIV2 (siswa manual dengan jadwal): 'Terisi 2 dari 6', 'Slot terisi 2 dari 6'", async () => {
    const data = await pendaftarLib.getPendaftarKelas("K-PRIV2");
    assert.ok(data);
    assert.equal(teksTerisiDetail(data.kelas.kapasitasEfektif), "Terisi 2 dari 6");
    assert.equal(teksSlotTerisi(data.kelas.slotTerisi), "Slot terisi 2 dari 6");
  });

  it("kelas non-slot & tanpa batas: tanpa baris slot", async () => {
    const grup = await pendaftarLib.getPendaftarKelas("K-GRUP");
    assert.equal(teksTerisiDetail(grup!.kelas.kapasitasEfektif), "Terisi 1 dari 5");
    assert.equal(grup!.kelas.slotTerisi, null);
    const bebas = await pendaftarLib.getPendaftarKelas("K-BEBAS");
    assert.equal(teksTerisiDetail(bebas!.kelas.kapasitasEfektif), "Terisi 3 siswa (tanpa batas)");
    assert.equal(bebas!.kelas.slotTerisi, null);
  });

  it("galat membaca ketersediaan: jatuh ke kapasitas manual, halaman tetap tampil", async () => {
    tabelGagal.add("kelas_subtes");
    const data = await pendaftarLib.getPendaftarKelas("K-PRIV");
    assert.ok(data);
    assert.equal(teksTerisiDetail(data.kelas.kapasitasEfektif), "Terisi 2 dari 10");
    assert.equal(data.kelas.slotTerisi, null);
  });
});

describe("komponen Admin memakai teks kapasitas efektif (bukan kolom mentah)", () => {
  const baca = (path: string) => readFileSync(path, "utf8");

  it("KelolaKelasClient: daftar & detail memakai helper efektif, tidak lagi menampilkan kelas.kapasitas mentah", () => {
    const src = baca("components/admin/KelolaKelasClient.tsx");
    assert.match(src, /teksTerisiRingkas\(kelas\.kapasitasEfektif\)/);
    assert.match(src, /teksTerisiDetail\(detailKelas\.kapasitasEfektif\)/);
    assert.match(src, /teksSlotTerisi\(detailKelas\.slotTerisi\)/);
    assert.doesNotMatch(src, /kelas\.kapasitas \?\? "∞"/);
    assert.doesNotMatch(src, /detailKelas\.kapasitas\b/);
  });

  it("PendaftarKelasClient: header memakai kapasitas efektif + baris slot; tidak lagi 'dari {kapasitas} kursi'", () => {
    const src = baca("components/admin/PendaftarKelasClient.tsx");
    assert.match(src, /teksTerisiDetail\(kapasitasEfektif\)/);
    assert.match(src, /teksSlotTerisi\(slotTerisi\)/);
    assert.doesNotMatch(src, /dari \$\{kapasitas\} kursi/);
  });
});
