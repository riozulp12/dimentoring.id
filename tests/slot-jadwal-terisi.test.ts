/**
 * Test slot jadwal TERISI + kapasitas kelas (logika murni, pembaca server, UI checkout).
 * Keputusan Rio (Opsi 0): kapasitas SATU slot = mentor aktif pemegang subtes; slot efektif =
 * jadwal_ditetapkan, selain itu Pilihan 1; terisi bila siswa LUNAS >= kapasitas; pembayaran menunggu
 * TIDAK menahan slot; hanya kelas private + online + saklar + 1 subtes. Supabase TIRUAN di memori.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import {
  cariStatusSlot,
  hitungSlotTerisi,
  kelasMemakaiSlot,
  opsiJadwalCheckout,
  ringkasSlot,
  semuaSlotPenuh,
  slotEfektif,
} from "@/lib/shared/slotTerisi";
import { BATAS_HAMPIR_HABIS, hitungKapasitasKelas, teksBadgeKapasitas } from "@/lib/shared/kapasitasKelas";

const SEN = { hari: "Senin", jam_mulai: "19:00" };
const SEL = { hari: "Selasa", jam_mulai: "19:00" };
const RAB = { hari: "Rabu", jam_mulai: "19:00" };

describe("slotEfektif", () => {
  it("jadwal_ditetapkan menang atas pilihan", () => {
    assert.deepEqual(slotEfektif({ jadwalDitetapkan: SEL, jadwalPilihan: [SEN, RAB] }), SEL);
  });
  it("tanpa jadwal_ditetapkan -> Pilihan 1 (index 0), bukan Pilihan 2", () => {
    assert.deepEqual(slotEfektif({ jadwalDitetapkan: null, jadwalPilihan: [RAB, SEN] }), RAB);
  });
  it("tidak ada keduanya / data rusak -> null", () => {
    assert.equal(slotEfektif({ jadwalDitetapkan: null, jadwalPilihan: null }), null);
    assert.equal(slotEfektif({ jadwalDitetapkan: "x", jadwalPilihan: [] }), null);
    assert.equal(slotEfektif({ jadwalDitetapkan: {}, jadwalPilihan: [{ hari: "" }] }), null);
  });
});

describe("kelasMemakaiSlot — hanya private + online + saklar + 1 subtes", () => {
  const dasar = { tipeKelas: "private", modePembelajaran: "online", jadwalPilihSiswa: true, jumlahSubtes: 1, jumlahSlot: 3 };
  it("kelas yang memenuhi semua syarat -> ya", () => {
    assert.equal(kelasMemakaiSlot(dasar), true);
  });
  it("semi_private, grouping, offline, saklar mati, multi-subtes, 0 subtes, tanpa slot -> tidak", () => {
    assert.equal(kelasMemakaiSlot({ ...dasar, tipeKelas: "semi_private" }), false);
    assert.equal(kelasMemakaiSlot({ ...dasar, tipeKelas: "grouping" }), false);
    assert.equal(kelasMemakaiSlot({ ...dasar, tipeKelas: null }), false);
    assert.equal(kelasMemakaiSlot({ ...dasar, modePembelajaran: "offline" }), false);
    assert.equal(kelasMemakaiSlot({ ...dasar, jadwalPilihSiswa: false }), false);
    assert.equal(kelasMemakaiSlot({ ...dasar, jadwalPilihSiswa: null }), false);
    assert.equal(kelasMemakaiSlot({ ...dasar, jumlahSubtes: 2 }), false);
    assert.equal(kelasMemakaiSlot({ ...dasar, jumlahSubtes: 0 }), false);
    assert.equal(kelasMemakaiSlot({ ...dasar, jumlahSlot: 0 }), false);
  });
});

describe("hitungSlotTerisi", () => {
  it("1 mentor: satu siswa mengisi slot sampai penuh; slot lain tetap kosong", () => {
    const status = hitungSlotTerisi({ slots: [SEN, SEL, RAB], kapasitasPerSlot: 1, slotEfektifSiswa: [SEN] });
    assert.deepEqual(status.map((s) => [s.slot.hari, s.terisi, s.kapasitas, s.penuh]), [
      ["Senin", 1, 1, true],
      ["Selasa", 0, 1, false],
      ["Rabu", 0, 1, false],
    ]);
  });

  it("3 mentor: slot baru penuh pada siswa ke-3", () => {
    const dua = hitungSlotTerisi({ slots: [SEN], kapasitasPerSlot: 3, slotEfektifSiswa: [SEN, SEN] });
    assert.equal(dua[0].penuh, false);
    const tiga = hitungSlotTerisi({ slots: [SEN], kapasitasPerSlot: 3, slotEfektifSiswa: [SEN, SEN, SEN] });
    assert.equal(tiga[0].penuh, true);
  });

  it("mentor nonaktif mengurangi kapasitas (3 -> 2 mentor aktif: dua siswa sudah penuh)", () => {
    assert.equal(hitungSlotTerisi({ slots: [SEN], kapasitasPerSlot: 3, slotEfektifSiswa: [SEN, SEN] })[0].penuh, false);
    assert.equal(hitungSlotTerisi({ slots: [SEN], kapasitasPerSlot: 2, slotEfektifSiswa: [SEN, SEN] })[0].penuh, true);
  });

  it("0 mentor aktif -> semua slot penuh", () => {
    const status = hitungSlotTerisi({ slots: [SEN, SEL], kapasitasPerSlot: 0, slotEfektifSiswa: [] });
    assert.ok(status.every((s) => s.penuh && s.kapasitas === 0));
    assert.equal(semuaSlotPenuh(status), true);
  });

  it("siswa tanpa slot atau dengan slot yang sudah dihapus dari kelas tidak mengisi slot mana pun", () => {
    const status = hitungSlotTerisi({ slots: [SEN], kapasitasPerSlot: 1, slotEfektifSiswa: [null, { hari: "Kamis", jam_mulai: "10:00" }] });
    assert.equal(status[0].terisi, 0);
  });

  it("slot ganda di kelas.jadwal dihitung satu", () => {
    assert.equal(hitungSlotTerisi({ slots: [SEN, SEN], kapasitasPerSlot: 1, slotEfektifSiswa: [] }).length, 1);
  });

  it("ringkasSlot: kapasitas = slot × mentor, sisa = kursi kosong (tidak negatif walau terisi melebihi)", () => {
    const status = hitungSlotTerisi({ slots: [SEN, SEL, RAB], kapasitasPerSlot: 3, slotEfektifSiswa: [SEN, SEN, SEN, SEN, SEL] });
    assert.deepEqual(ringkasSlot(status), { kapasitas: 9, sisa: 0 + 2 + 3 });
  });

  it("cariStatusSlot, opsiJadwalCheckout, semuaSlotPenuh", () => {
    const status = hitungSlotTerisi({ slots: [SEN, SEL], kapasitasPerSlot: 1, slotEfektifSiswa: [SEN] });
    assert.equal(cariStatusSlot(status, SEN)?.penuh, true);
    assert.equal(cariStatusSlot(status, RAB), undefined);
    assert.deepEqual(opsiJadwalCheckout([SEN, SEL], status).map((o) => [o.hari, o.penuh]), [["Senin", true], ["Selasa", false]]);
    assert.equal(semuaSlotPenuh(status), false);
  });

  it("opsiJadwalCheckout tanpa status (galat baca) -> semua slot terbuka; semuaSlotPenuh(null) = false", () => {
    assert.ok(opsiJadwalCheckout([SEN, SEL], null).every((o) => o.penuh === false));
    assert.equal(semuaSlotPenuh(null), false);
    assert.equal(semuaSlotPenuh([]), false);
  });
});

describe("hitungKapasitasKelas", () => {
  const otomatis = { kapasitas: 9, sisa: 6 };

  it("BATAS_HAMPIR_HABIS = 5", () => {
    assert.equal(BATAS_HAMPIR_HABIS, 5);
  });

  it("kelas lain: kapasitas kosong/null/undefined = TIDAK TERBATAS (tanpa badge, tidak pernah penuh)", () => {
    for (const kapasitasManual of [null, undefined]) {
      assert.deepEqual(hitungKapasitasKelas({ kapasitasManual, lunas: 40, otomatis: null }), {
        terbatas: false,
        kapasitas: null,
        terisi: 40,
        sisa: null,
        penuh: false,
        hampirHabis: false,
      });
    }
  });

  it("kelas lain dengan kapasitas manual: aturan lama (lunas >= kapasitas = penuh)", () => {
    assert.equal(hitungKapasitasKelas({ kapasitasManual: 10, lunas: 9, otomatis: null }).penuh, false);
    assert.equal(hitungKapasitasKelas({ kapasitasManual: 10, lunas: 10, otomatis: null }).penuh, true);
    assert.equal(hitungKapasitasKelas({ kapasitasManual: 10, lunas: 12, otomatis: null }).sisa, 0);
  });

  it("hampirHabis TEPAT di sisa 5, tidak di sisa 6", () => {
    assert.equal(hitungKapasitasKelas({ kapasitasManual: 20, lunas: 15, otomatis: null }).hampirHabis, true); // sisa 5
    assert.equal(hitungKapasitasKelas({ kapasitasManual: 20, lunas: 14, otomatis: null }).hampirHabis, false); // sisa 6
    assert.equal(hitungKapasitasKelas({ kapasitasManual: 20, lunas: 19, otomatis: null }).hampirHabis, true); // sisa 1
  });

  it("sisa 0 = penuh dan BUKAN hampir habis", () => {
    const info = hitungKapasitasKelas({ kapasitasManual: 20, lunas: 20, otomatis: null });
    assert.equal(info.penuh, true);
    assert.equal(info.hampirHabis, false);
  });

  it("private otomatis: kosong = slot × mentor; sisa = kursi slot kosong", () => {
    assert.deepEqual(hitungKapasitasKelas({ kapasitasManual: null, lunas: 3, otomatis }), {
      terbatas: true,
      kapasitas: 9,
      terisi: 3,
      sisa: 6,
      penuh: false,
      hampirHabis: false,
    });
  });

  it("private otomatis: sisa 5 hampir habis, sisa 0 penuh", () => {
    assert.equal(hitungKapasitasKelas({ kapasitasManual: null, lunas: 4, otomatis: { kapasitas: 9, sisa: 5 } }).hampirHabis, true);
    assert.equal(hitungKapasitasKelas({ kapasitasManual: null, lunas: 4, otomatis: { kapasitas: 9, sisa: 6 } }).hampirHabis, false);
    const penuh = hitungKapasitasKelas({ kapasitasManual: null, lunas: 9, otomatis: { kapasitas: 9, sisa: 0 } });
    assert.equal(penuh.penuh, true);
    assert.equal(penuh.hampirHabis, false);
  });

  it("kapasitas manual LEBIH KECIL dari slot × mentor menang", () => {
    const info = hitungKapasitasKelas({ kapasitasManual: 4, lunas: 1, otomatis });
    assert.equal(info.kapasitas, 4);
    assert.equal(info.sisa, 3); // min(6, 4 - 1)
    assert.equal(hitungKapasitasKelas({ kapasitasManual: 4, lunas: 4, otomatis }).penuh, true);
  });

  it("kapasitas manual LEBIH BESAR dari slot × mentor: otomatis yang menang", () => {
    const info = hitungKapasitasKelas({ kapasitasManual: 50, lunas: 3, otomatis });
    assert.equal(info.kapasitas, 9);
    assert.equal(info.sisa, 6);
  });

  it("private otomatis tanpa mentor aktif (kapasitas 0) -> penuh", () => {
    assert.equal(hitungKapasitasKelas({ kapasitasManual: null, lunas: 0, otomatis: { kapasitas: 0, sisa: 0 } }).penuh, true);
  });

  it("teksBadgeKapasitas: hanya Penuh / Hampir habis · sisa N, angka dari hasil; tanpa batas = tanpa badge", () => {
    assert.equal(teksBadgeKapasitas(hitungKapasitasKelas({ kapasitasManual: null, lunas: 99, otomatis: null })), null);
    assert.equal(teksBadgeKapasitas(hitungKapasitasKelas({ kapasitasManual: 20, lunas: 14, otomatis: null })), null);
    assert.equal(teksBadgeKapasitas(hitungKapasitasKelas({ kapasitasManual: 20, lunas: 15, otomatis: null })), "Hampir habis · sisa 5");
    assert.equal(teksBadgeKapasitas(hitungKapasitasKelas({ kapasitasManual: 20, lunas: 20, otomatis: null })), "Penuh");
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
let logQuery: string[];

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

function fakeFrom(table: string) {
  db[table] ??= [];
  logQuery.push(table);
  return new FakeQuery(db[table], tabelGagal.has(table));
}

type ReaderModule = typeof import("@/lib/jadwal/slotTerisi");
let reader: ReaderModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  reader = await import("@/lib/jadwal/slotTerisi");
});

const M1 = "mentor-1";
const M2 = "mentor-2";
const M3 = "mentor-3";
const M_PENDING = "mentor-pending";
const lunas = (kelas_id: string, slot: Row | null, ditetapkan: Row | null = null): Row => ({
  kelas_id,
  status_pembayaran: "lunas",
  jadwal_pilihan: slot ? [slot] : null,
  jadwal_ditetapkan: ditetapkan,
});

beforeEach(() => {
  tabelGagal = new Set();
  logQuery = [];
  db = {
    kelas: [
      // Kelas private online, saklar menyala, 1 subtes (kelas_subtes), 3 slot, 3 mentor aktif + 1 pending
      { id: "K-PRIV", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: [SEN, SEL, RAB], kapasitas: null, subtes_id: null },
      // Kelas private dengan 1 mentor
      { id: "K-SATU", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: [SEN, SEL], kapasitas: null, subtes_id: "s-fis" },
      { id: "K-SEMI", tipe_kelas: "semi_private", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: [SEN], kapasitas: 4, subtes_id: "s-mtk" },
      { id: "K-OFF", tipe_kelas: "private", mode_pembelajaran: "offline", jadwal_pilih_siswa: true, jadwal: [SEN], kapasitas: 2, subtes_id: "s-mtk" },
      { id: "K-MULTI", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: true, jadwal: [SEN], kapasitas: null, subtes_id: null },
      { id: "K-MATI", tipe_kelas: "private", mode_pembelajaran: "online", jadwal_pilih_siswa: false, jadwal: [SEN], kapasitas: 3, subtes_id: "s-mtk" },
      { id: "K-BEBAS", tipe_kelas: "grouping", mode_pembelajaran: "online", jadwal_pilih_siswa: false, jadwal: null, kapasitas: null, subtes_id: "s-mtk" },
    ],
    kelas_subtes: [
      { kelas_id: "K-PRIV", subtes_id: "s-mtk" },
      { kelas_id: "K-MULTI", subtes_id: "s-mtk" },
      { kelas_id: "K-MULTI", subtes_id: "s-fis" },
    ],
    kelas_subtes_mentor: [
      { kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id: M1 },
      { kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id: M2 },
      { kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id: M3 },
      { kelas_id: "K-PRIV", subtes_id: "s-mtk", mentor_id: M_PENDING },
      { kelas_id: "K-SATU", subtes_id: "s-fis", mentor_id: M1 },
      { kelas_id: "K-MULTI", subtes_id: "s-mtk", mentor_id: M1 },
    ],
    // kelas_mentor SENGAJA berisi banyak mentor: TIDAK boleh dihitung (tanpa fallback)
    kelas_mentor: [M1, M2, M3].map((mentor_id) => ({ kelas_id: "K-SATU", mentor_id })),
    user_roles: [M1, M2, M3].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })).concat([{ user_id: M_PENDING, role_type: "mentor", status: "pending" }]),
    enrollments: [],
    payments: [{ item_id: "K-PRIV", status: "menunggu", jadwal_pilihan: [SEN] }],
  };
});

describe("hitungKetersediaanKelas / getKetersediaanKelas", () => {
  it("3 mentor aktif (pending tidak dihitung): kapasitas otomatis = 3 slot × 3 = 9; belum ada siswa", async () => {
    const hasil = await reader.getKetersediaanKelas("K-PRIV");
    assert.ok(hasil);
    assert.equal(hasil.memakaiSlot, true);
    assert.deepEqual(hasil.slot.map((s) => [s.slot.hari, s.terisi, s.kapasitas, s.penuh]), [
      ["Senin", 0, 3, false],
      ["Selasa", 0, 3, false],
      ["Rabu", 0, 3, false],
    ]);
    assert.equal(hasil.kapasitas.kapasitas, 9);
    assert.equal(hasil.kapasitas.sisa, 9);
  });

  it("slot penuh setelah 3 siswa LUNAS memilih Senin; kapasitas kelas belum penuh", async () => {
    db.enrollments = [lunas("K-PRIV", SEN), lunas("K-PRIV", SEN), lunas("K-PRIV", SEN)];
    const hasil = await reader.getKetersediaanKelas("K-PRIV");
    assert.ok(hasil);
    assert.equal(cariStatusSlot(hasil.slot, SEN)?.penuh, true);
    assert.equal(cariStatusSlot(hasil.slot, SEL)?.penuh, false);
    assert.equal(hasil.kapasitas.penuh, false);
    assert.equal(hasil.kapasitas.sisa, 6);
  });

  it("slot efektif memakai jadwal_ditetapkan: siswa memilih Senin tapi ditetapkan Selasa -> mengisi Selasa", async () => {
    db.enrollments = [lunas("K-PRIV", SEN, SEL), lunas("K-PRIV", SEN, SEL), lunas("K-PRIV", RAB, SEL)];
    const hasil = await reader.getKetersediaanKelas("K-PRIV");
    assert.ok(hasil);
    assert.equal(cariStatusSlot(hasil.slot, SEL)?.terisi, 3);
    assert.equal(cariStatusSlot(hasil.slot, SEL)?.penuh, true);
    assert.equal(cariStatusSlot(hasil.slot, SEN)?.terisi, 0);
  });

  it("pembayaran MENUNGGU tidak menahan slot (payments tidak dibaca sama sekali)", async () => {
    db.enrollments = [];
    const hasil = await reader.getKetersediaanKelas("K-PRIV");
    assert.ok(hasil);
    assert.equal(cariStatusSlot(hasil.slot, SEN)?.terisi, 0);
    assert.ok(!logQuery.includes("payments"));
  });

  it("enrollment 'menunggu'/'batal' tidak dihitung (hanya lunas)", async () => {
    db.enrollments = [{ kelas_id: "K-PRIV", status_pembayaran: "menunggu", jadwal_pilihan: [SEN], jadwal_ditetapkan: null }];
    const hasil = await reader.getKetersediaanKelas("K-PRIV");
    assert.equal(cariStatusSlot(hasil!.slot, SEN)?.terisi, 0);
  });

  it("mentor nonaktif mengurangi kapasitas: M3 dinonaktifkan -> 2 siswa sudah memenuhi Senin", async () => {
    db.user_roles.find((r) => r.user_id === M3)!.status = "rejected";
    db.enrollments = [lunas("K-PRIV", SEN), lunas("K-PRIV", SEN)];
    const hasil = await reader.getKetersediaanKelas("K-PRIV");
    assert.ok(hasil);
    assert.equal(cariStatusSlot(hasil.slot, SEN)?.kapasitas, 2);
    assert.equal(cariStatusSlot(hasil.slot, SEN)?.penuh, true);
    assert.equal(hasil.kapasitas.kapasitas, 6);
  });

  it("1 mentor (subtes fallback kelas.subtes_id, tanpa kelas_subtes): kapasitas 1 per slot; kelas_mentor TIDAK dihitung", async () => {
    db.enrollments = [lunas("K-SATU", SEN)];
    const hasil = await reader.getKetersediaanKelas("K-SATU");
    assert.ok(hasil);
    assert.equal(hasil.memakaiSlot, true);
    assert.deepEqual(hasil.slot.map((s) => [s.slot.hari, s.kapasitas, s.penuh]), [["Senin", 1, true], ["Selasa", 1, false]]);
    assert.equal(hasil.kapasitas.kapasitas, 2);
    assert.equal(hasil.kapasitas.sisa, 1);
  });

  it("semua mentor nonaktif -> semua slot penuh dan kelas penuh", async () => {
    db.user_roles.forEach((r) => (r.status = "pending"));
    const hasil = await reader.getKetersediaanKelas("K-PRIV");
    assert.ok(hasil);
    assert.equal(semuaSlotPenuh(hasil.slot), true);
    assert.equal(hasil.kapasitas.penuh, true);
  });

  it("kapasitas manual lebih kecil dari slot × mentor menang (4 < 9)", async () => {
    db.kelas.find((k) => k.id === "K-PRIV")!.kapasitas = 4;
    db.enrollments = [lunas("K-PRIV", SEN)];
    const hasil = await reader.getKetersediaanKelas("K-PRIV");
    assert.equal(hasil!.kapasitas.kapasitas, 4);
    assert.equal(hasil!.kapasitas.sisa, 3);
  });

  it("kelas semi_private, offline, saklar mati, multi-subtes TIDAK memakai slot; kapasitas = aturan lama", async () => {
    db.enrollments = [lunas("K-SEMI", SEN), lunas("K-SEMI", SEN), lunas("K-OFF", SEN), lunas("K-MATI", SEN)];
    const peta = await reader.hitungKetersediaanKelas(db.kelas.map(reader.normalisasiKelas));
    assert.ok(peta);
    for (const id of ["K-SEMI", "K-OFF", "K-MATI", "K-MULTI", "K-BEBAS"]) {
      assert.equal(peta.get(id)!.memakaiSlot, false, id);
      assert.deepEqual(peta.get(id)!.slot, [], id);
    }
    assert.equal(peta.get("K-SEMI")!.kapasitas.sisa, 2); // 4 - 2
    assert.equal(peta.get("K-OFF")!.kapasitas.sisa, 1); // 2 - 1
    assert.equal(peta.get("K-MATI")!.kapasitas.sisa, 2); // 3 - 1
    assert.equal(peta.get("K-MULTI")!.kapasitas.terbatas, false);
    assert.equal(peta.get("K-BEBAS")!.kapasitas.terbatas, false);
  });

  it("banyak kelas sekaligus: jumlah query tetap (maks. 5), bukan per kelas", async () => {
    await reader.hitungKetersediaanKelas(db.kelas.map(reader.normalisasiKelas));
    assert.ok(logQuery.length <= 5, logQuery.join(","));
  });

  it("tanpa kandidat slot: hanya 1 query (enrollments)", async () => {
    await reader.hitungKetersediaanKelas([reader.normalisasiKelas(db.kelas.find((k) => k.id === "K-BEBAS")!)]);
    assert.deepEqual(logQuery, ["enrollments"]);
  });

  it("galat database di tabel mana pun -> null", async () => {
    for (const tabel of ["enrollments", "kelas_subtes", "kelas_subtes_mentor", "user_roles", "kelas"]) {
      tabelGagal = new Set([tabel]);
      const asli = console.error;
      console.error = () => {};
      try {
        assert.equal(await reader.getKetersediaanKelas("K-PRIV"), null, tabel);
      } finally {
        console.error = asli;
      }
    }
  });

  it("kelas tidak ada -> null", async () => {
    assert.equal(await reader.getKetersediaanKelas("tidak-ada"), null);
  });

  it("kolom kapasitas tidak ada/kosong pada baris kelas -> tidak terbatas (kelas lama tanpa kolom tidak error)", async () => {
    const baris = { id: "K-BEBAS", tipe_kelas: "grouping", mode_pembelajaran: "online", jadwal_pilih_siswa: false, jadwal: null, subtes_id: null };
    const hasil = (await reader.hitungKetersediaanKelas([reader.normalisasiKelas(baris)]))!;
    assert.equal(hasil.get("K-BEBAS")!.kapasitas.terbatas, false);
  });
});

describe("UI checkout menonaktifkan slot penuh (sumber)", () => {
  const form = readFileSync("components/siswa/CheckoutForm.tsx", "utf8");
  const halaman = readFileSync("app/(protected)/(siswa)/checkout/[kelasId]/page.tsx", "utf8");

  it("halaman memakai pembaca server + opsiJadwalCheckout + semuaSlotPenuh, galat baca = semua slot terbuka", () => {
    assert.match(halaman, /getKetersediaanKelas\(kelasId\)/);
    assert.match(halaman, /opsiJadwalCheckout\(/);
    assert.match(halaman, /semuaSlotPenuh\(statusSlot\)/);
    assert.match(halaman, /ketersediaan\?\.memakaiSlot \? ketersediaan\.slot : null/);
  });

  it("dropdown Pilihan 1 dan 2: label '(Penuh)' dan opsi disabled", () => {
    assert.equal((form.match(/\$\{formatSlot\(slot\)\} \(Penuh\)/g) ?? []).length, 2);
    assert.equal((form.match(/disabled: slot\.penuh/g) ?? []).length, 2);
  });

  it("semua jadwal penuh: pesan + tombol Bayar nonaktif", () => {
    assert.match(form, /Semua jadwal kelas ini sudah terisi/);
    assert.match(form, /isPaying \|\|\s*!setujuKebijakan \|\|\s*semuaJadwalPenuh \|\|/);
  });

  it("slot penuh tidak ikut terkirim sebagai pilihan", () => {
    assert.match(form, /!slot!\.penuh/);
  });

  it("SelectField mendukung opsi disabled (tidak bisa diklik)", () => {
    const select = readFileSync("components/ui/SelectField.tsx", "utf8");
    assert.match(select, /disabled\?: boolean/);
    assert.match(select, /onClick=\{\(\) => !option\.disabled && selectOption\(option\.value\)\}/);
  });
});
