/**
 * Test kapasitas kelas OPSIONAL: validasi Kelola Kelas, migrasi aditif, jalur pendaftaran manual,
 * dan SATU aturan "Kelas Penuh" untuk katalog/detail (lib/shared/kapasitasKelas.ts). Supabase TIRUAN
 * di memori (tidak pernah menyentuh database asli).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { penuhMenurutKapasitasManual, hitungKapasitasKelas } from "@/lib/shared/kapasitasKelas";
import { resolveKelasDaftarAction } from "@/lib/shared/kelasDaftarTarget";

describe("validateKelasInput — kapasitas OPSIONAL", () => {
  const body = { nama: "Kelas X1", programKategori: "tka", tingkatKelas: "kelas_12", tipeKelas: "grouping", jumlahSesi: 10, harga: 100000 };
  let validate: typeof import("@/lib/admin/validateKelasInput");

  before(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    validate = await import("@/lib/admin/validateKelasInput");
  });

  it("kosong (tidak dikirim, undefined, null, '', spasi) diterima tanpa error dan menjadi null", async () => {
    for (const kapasitas of [undefined, null, "", "   "]) {
      const hasil = await validate.validateKelasInput({ ...body, kapasitas });
      assert.equal(hasil.ok, true, JSON.stringify(kapasitas));
      assert.equal(hasil.ok && hasil.data.kapasitas, null, JSON.stringify(kapasitas));
    }
    const tanpaField = await validate.validateKelasInput(body);
    assert.equal(tanpaField.ok && tanpaField.data.kapasitas, null);
  });

  it("terisi: angka bulat > 0 diterima apa adanya (angka maupun string)", async () => {
    const a = await validate.validateKelasInput({ ...body, kapasitas: 30 });
    const b = await validate.validateKelasInput({ ...body, kapasitas: "12" });
    assert.equal(a.ok && a.data.kapasitas, 30);
    assert.equal(b.ok && b.data.kapasitas, 12);
  });

  it("terisi tapi tidak valid (0, negatif, desimal, bukan angka) tetap ditolak dengan pesan jelas", async () => {
    for (const kapasitas of [0, "0", -3, "-3", 2.5, "abc"]) {
      const hasil = await validate.validateKelasInput({ ...body, kapasitas });
      assert.equal(hasil.ok, false, String(kapasitas));
      assert.match(hasil.ok ? "" : hasil.error, /Kapasitas harus angka bulat lebih dari 0/);
    }
  });
});

describe("migrasi db/add_kapasitas_opsional.sql — aditif dan belum dijalankan", () => {
  it("hanya satu baris aktif: DROP NOT NULL pada kelas.kapasitas (tanpa DROP kolom/tabel, tanpa UPDATE data)", () => {
    const aktif = readFileSync("db/add_kapasitas_opsional.sql", "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("--"));
    assert.deepEqual(aktif, ["ALTER TABLE kelas ALTER COLUMN kapasitas DROP NOT NULL;"]);
  });

  it("memuat petunjuk BEGIN/ROLLBACK/COMMIT, verifikasi, rollback, dan urutan rilis (migrasi dulu)", () => {
    const sql = readFileSync("db/add_kapasitas_opsional.sql", "utf8");
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /ROLLBACK;/);
    assert.match(sql, /COMMIT;/);
    assert.match(sql, /VERIFIKASI/);
    assert.match(sql, /SET NOT NULL/);
    assert.match(sql, /SEBELUM deploy kode/);
  });
});

describe("pendaftaran manual Admin: kapasitas kosong tidak dianggap penuh", () => {
  it("penuhMenurutKapasitasManual: null/undefined = tidak pernah penuh; angka = lunas >= kapasitas", () => {
    assert.equal(penuhMenurutKapasitasManual(null, 100), false);
    assert.equal(penuhMenurutKapasitasManual(undefined, 100), false);
    assert.equal(penuhMenurutKapasitasManual(5, 4), false);
    assert.equal(penuhMenurutKapasitasManual(5, 5), true);
    assert.equal(penuhMenurutKapasitasManual(5, 6), true);
  });

  it("route enrollment-manual dan halaman Pendaftar memakai helper itu (bukan perbandingan langsung dengan null)", () => {
    const route = readFileSync("app/api/admin/enrollment-manual/route.ts", "utf8");
    assert.match(route, /penuhMenurutKapasitasManual\(kelas\.kapasitas as number \| null, terisi \?\? 0\)/);
    assert.ok(!/>= \(kelas\.kapasitas as number\)/.test(route));
    assert.match(readFileSync("components/admin/PendaftarKelasClient.tsx", "utf8"), /penuhMenurutKapasitasManual\(kapasitas, terisi\)/);
  });

  it("fungsi SQL daftar_siswa_manual: v_lunas >= NULL bernilai NULL (bukan true) — dicatat di migrasi", () => {
    assert.match(readFileSync("db/add_kapasitas_opsional.sql", "utf8"), /v_lunas >= v_kelas\.kapasitas/);
  });
});

describe("form Kelola Kelas: kolom Kapasitas opsional", () => {
  const form = readFileSync("components/admin/KelolaKelasForm.tsx", "utf8");

  it("label & petunjuk menjelaskan arti kosong; input tidak lagi 'required'", () => {
    assert.match(form, /Kapasitas \(opsional\)/);
    assert.match(
      form,
      /Kosongkan untuk mengikuti jumlah jadwal dan mentor \(kelas private online\) atau tanpa batas \(kelas lain\)\./,
    );
    const mulai = form.indexOf("Kapasitas (opsional)");
    const potongan = form.slice(mulai, form.indexOf("Harga paket penuh (Rp)", mulai));
    assert.ok(!/\brequired\b/.test(potongan), "input Kapasitas masih required");
  });

  it("payload mengirim null saat kosong (bukan 0/NaN) dan prefill kelas lama tetap angka", () => {
    assert.equal((form.match(/kapasitas\.trim\(\) === "" \? null : Number\(kapasitas\)/g) ?? []).length, 2);
    assert.match(form, /initialKelas && initialKelas\.kapasitas !== null \? String\(initialKelas\.kapasitas\) : ""/);
  });
});

// ---------------------------------------------------------------------------
// SATU aturan "Kelas Penuh" untuk katalog (kartu) dan tombol daftar
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null };
let db: Record<string, Row[]>;
let tabelGagal: Set<string>;

class FakeQuery implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
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
  then<A, B>(onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    if (this.gagal) return Promise.resolve({ data: null, error: { message: "galat tiruan" } } as Hasil).then(onfulfilled, onrejected);
    return Promise.resolve({ data: this.rows.filter((row) => this.filters.every((f) => f(row))), error: null } as Hasil).then(onfulfilled, onrejected);
  }
}

describe("katalog: kartu memakai hitungKapasitasKelas (satu aturan) dan tombol daftar mengikutinya", () => {
  let program: typeof import("@/lib/dashboard/getProgramData");

  before(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    const { supabaseServer } = await import("@/lib/supabase/server");
    (supabaseServer as unknown as { from: (t: string) => FakeQuery }).from = (table: string) => {
      db[table] ??= [];
      return new FakeQuery(db[table], tabelGagal.has(table));
    };
    program = await import("@/lib/dashboard/getProgramData");
  });

  const baris = (id: string, kapasitas: number | null, ekstra: Row = {}) =>
    ({
      id,
      nama: id,
      tipe_kelas: "grouping",
      mode_pembelajaran: "online",
      harga: 100000,
      diskon_persen: 0,
      kapasitas,
      deskripsi: null,
      program_kategori: "tka",
      tingkat_kelas: "kelas_12",
      link_lynkid: null,
      jadwal: null,
      jadwal_pilih_siswa: false,
      subtes_id: null,
      subtes: null,
      mentor: null,
      ...ekstra,
    }) as unknown as Parameters<typeof program.toCardPreviewList>[0][number];
  const lunas = (kelasId: string, n: number): Row[] => Array.from({ length: n }, () => ({ kelas_id: kelasId, status_pembayaran: "lunas", jadwal_pilihan: null, jadwal_ditetapkan: null }));

  beforeEach(() => {
    tabelGagal = new Set();
    db = { enrollments: [...lunas("BEBAS", 40), ...lunas("MANUAL10", 10), ...lunas("MANUAL10B", 6)], kelas_subtes: [], kelas_subtes_mentor: [], user_roles: [] };
  });

  it("kapasitas kosong -> tanpa batas: bukan penuh, tanpa badge", async () => {
    const [kartu] = await program.toCardPreviewList([baris("BEBAS", null)]);
    assert.deepEqual(kartu.kapasitasInfo, { terbatas: false, kapasitas: null, terisi: 40, sisa: null, penuh: false, hampirHabis: false });
  });

  it("kapasitas manual: lunas >= kapasitas -> penuh; sisa dari angka nyata", async () => {
    const [penuh, sisa] = await program.toCardPreviewList([baris("MANUAL10", 10), baris("MANUAL10B", 10)]);
    assert.equal(penuh.kapasitasInfo.penuh, true);
    assert.equal(penuh.kapasitasInfo.sisa, 0);
    assert.equal(sisa.kapasitasInfo.penuh, false);
    assert.equal(sisa.kapasitasInfo.sisa, 4);
    assert.equal(sisa.kapasitasInfo.kapasitas, 10);
  });

  it("tombol daftar 'Kelas Penuh' HANYA bila kapasitasInfo.penuh; tanpa batas tidak pernah penuh", async () => {
    const [bebas, penuh] = await program.toCardPreviewList([baris("BEBAS", null), baris("MANUAL10", 10)]);
    const aksi = (penuh: boolean) =>
      resolveKelasDaftarAction({ kelasId: "X", penuh, linkPendaftaran: null, sessionRole: "student", isCheckoutInternalReady: true });
    assert.equal(aksi(bebas.kapasitasInfo.penuh).kind, "internal");
    const tutup = aksi(penuh.kapasitasInfo.penuh);
    assert.equal(tutup.kind, "disabled");
    assert.equal(tutup.kind === "disabled" && tutup.label, "Kelas Penuh");
  });

  it("galat baca enrollments: jatuh ke aturan manual dengan 0 siswa (tidak melempar, tidak 'penuh' palsu)", async () => {
    tabelGagal = new Set(["enrollments"]);
    const asli = console.error;
    console.error = () => {};
    try {
      const [kartu] = await program.toCardPreviewList([baris("MANUAL10", 10)]);
      assert.equal(kartu.kapasitasInfo.penuh, false);
      assert.equal(kartu.kapasitasInfo.sisa, 10);
    } finally {
      console.error = asli;
    }
  });

  it("hanya SATU definisi aturan penuh: tidak ada lagi getSisaSlotByKelasId / sisaSlot di kelasDaftarTarget; kapasitas lama dihitung di kapasitasKelas", () => {
    const getProgram = readFileSync("lib/dashboard/getProgramData.ts", "utf8");
    assert.ok(!/getSisaSlotByKelasId/.test(getProgram));
    assert.ok(!/row\.kapasitas - \(count/.test(getProgram));
    assert.ok(!/sisaSlot/.test(readFileSync("lib/shared/kelasDaftarTarget.ts", "utf8")));
    assert.equal(hitungKapasitasKelas({ kapasitasManual: 10, lunas: 10, otomatis: null }).penuh, true);
  });
});
