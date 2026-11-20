/**
 * Tes statis migrasi db/add_sesi_pilihan.sql (+ rollback dan verifikasi). SQL TIDAK dijalankan di database mana pun:
 * yang diuji adalah isi berkasnya — aditif, nullable, tanpa nilai bawaan, CHECK meloloskan NULL, rollback persis,
 * verifikasi hanya membaca.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const baca = (p: string) => readFileSync(p, "utf8");
/** Buang komentar SQL (-- sampai akhir baris, dan blok yang dibuka garis-miring-bintang). */
const tanpaKomentar = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

const MIGRASI = "db/add_sesi_pilihan.sql";
const ROLLBACK = "db/rollback_add_sesi_pilihan.sql";
const VERIFIKASI = "db/verify_add_sesi_pilihan.sql";

const KOLOM_BARU: Record<string, string> = {
  "payments.sesi_tambahan": "INTEGER",
  "payments.harga_per_sesi_tambahan": "NUMERIC(12,2)",
  "payments.biaya_sesi_tambahan": "NUMERIC(12,2)",
  "payments.jumlah_sesi_dibeli": "INTEGER",
  "payment_subtes_pilihan.jumlah_sesi": "INTEGER",
  "enrollments.jumlah_sesi_total": "INTEGER",
  "enrollments.sesi_tambahan": "INTEGER",
  "enrollment_subtes.kuota_sesi": "INTEGER",
  "sesi_kelas.subtes_id": "UUID REFERENCES subtes(id)",
};

// Hanya batas BAWAH; batas atas ditegakkan aplikasi (hitungHargaSesi), bukan database.
const CHECK_BARU: Record<string, { tabel: string; kolom: string; min: number }> = {
  payments_jumlah_sesi_dibeli_valid: { tabel: "payments", kolom: "jumlah_sesi_dibeli", min: 1 },
  payments_sesi_tambahan_valid: { tabel: "payments", kolom: "sesi_tambahan", min: 0 },
  payment_subtes_pilihan_jumlah_sesi_valid: { tabel: "payment_subtes_pilihan", kolom: "jumlah_sesi", min: 1 },
  enrollments_jumlah_sesi_total_valid: { tabel: "enrollments", kolom: "jumlah_sesi_total", min: 1 },
  enrollments_sesi_tambahan_valid: { tabel: "enrollments", kolom: "sesi_tambahan", min: 0 },
  enrollment_subtes_kuota_sesi_valid: { tabel: "enrollment_subtes", kolom: "kuota_sesi", min: 1 },
};

const sqlMigrasi = tanpaKomentar(baca(MIGRASI));
const sqlRollback = tanpaKomentar(baca(ROLLBACK));
const sqlVerifikasi = tanpaKomentar(baca(VERIFIKASI));

describe("db/add_sesi_pilihan.sql — aditif dan aman untuk kode lama", () => {
  it("tidak ada DROP, UPDATE, DELETE, INSERT, TRUNCATE", () => {
    for (const kata of ["DROP", "UPDATE", "DELETE", "INSERT", "TRUNCATE"]) {
      assert.ok(!new RegExp(`\\b${kata}\\b`, "i").test(sqlMigrasi), kata);
    }
  });

  it("tidak ada ALTER COLUMN (ubah tipe / SET DEFAULT / SET NOT NULL), tidak ada DEFAULT, tidak ada NOT NULL", () => {
    assert.ok(!/ALTER\s+COLUMN/i.test(sqlMigrasi));
    assert.ok(!/\bDEFAULT\b/i.test(sqlMigrasi));
    assert.ok(!/\bNOT\s+NULL\b/i.test(sqlMigrasi));
    assert.ok(!/\bON\s+DELETE\b/i.test(sqlMigrasi));
  });

  it("tanpa BEGIN/COMMIT/ROLLBACK di dalam berkas (transaksi diatur Rio)", () => {
    assert.ok(!/^\s*BEGIN\s*;/im.test(sqlMigrasi));
    assert.ok(!/\bCOMMIT\b/i.test(sqlMigrasi));
    assert.ok(!/\bROLLBACK\b/i.test(sqlMigrasi));
  });

  it("tepat 9 ADD COLUMN, semuanya IF NOT EXISTS, tipe benar, nullable (hanya tipe, tanpa tambahan selain FK subtes)", () => {
    assert.equal((sqlMigrasi.match(/ADD\s+COLUMN/gi) ?? []).length, 9);
    const diketemukan: Record<string, string> = {};
    const re = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+([^;]+);/gi;
    for (const m of sqlMigrasi.matchAll(re)) diketemukan[`${m[1]}.${m[2]}`] = m[3].trim().replace(/\s+/g, " ");
    assert.deepEqual(diketemukan, KOLOM_BARU);
  });

  it("tipe uang sama dengan payments.jumlah di db/schema.sql (DECIMAL(12,2) = NUMERIC(12,2))", () => {
    const schema = baca("db/schema.sql");
    const badan = schema.slice(schema.indexOf("CREATE TABLE payments ("));
    assert.match(badan.slice(0, badan.indexOf(");")), /jumlah DECIMAL\(12,2\)/);
    assert.equal(KOLOM_BARU["payments.harga_per_sesi_tambahan"], "NUMERIC(12,2)");
    assert.equal(KOLOM_BARU["payments.biaya_sesi_tambahan"], "NUMERIC(12,2)");
  });

  it("FK sesi_kelas.subtes_id merujuk subtes(id) TANPA ON DELETE CASCADE", () => {
    assert.match(sqlMigrasi, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+subtes_id\s+UUID\s+REFERENCES\s+subtes\(id\)\s*;/i);
    assert.ok(!/CASCADE/i.test(sqlMigrasi));
  });

  it("6 CHECK bernama eksplisit, dipasang idempoten, hanya batas bawah (IS NULL OR kolom >= n), NULL lolos", () => {
    assert.equal(Object.keys(CHECK_BARU).length, 6);
    for (const [nama, spek] of Object.entries(CHECK_BARU)) {
      assert.ok(sqlMigrasi.includes(`'${nama}'`), `pengecekan pg_constraint ${nama}`);
      const re = new RegExp(
        `ALTER\\s+TABLE\\s+${spek.tabel}\\s+ADD\\s+CONSTRAINT\\s+${nama}\\s+CHECK\\s*\\(\\s*${spek.kolom}\\s+IS\\s+NULL\\s+OR\\s+${spek.kolom}\\s*>=\\s*${spek.min}\\s*\\)`,
        "i",
      );
      assert.match(sqlMigrasi, re, nama);
    }
    assert.equal((sqlMigrasi.match(/ADD\s+CONSTRAINT/gi) ?? []).length, 6);
  });

  it("TIDAK ada batas atas di CHECK mana pun (tanpa BETWEEN, < atau <=); alasannya tertulis", () => {
    const badanCheck = [...sqlMigrasi.matchAll(/CHECK\s*\(([^;]*?)\)\s*;/gi)].map((m) => m[1]);
    assert.equal(badanCheck.length, 6);
    for (const b of badanCheck) {
      assert.ok(!/\bBETWEEN\b/i.test(b), b);
      assert.ok(!/</.test(b), b);
      assert.match(b, /^\s*\w+\s+IS\s+NULL\s+OR\s+\w+\s*>=\s*\d+\s*$/i, b);
    }
    const mentah = baca(MIGRASI);
    assert.match(mentah, /TANPA batas atas/);
    assert.match(mentah, /ditegakkan APLIKASI lewat\s+--\s+hitungHargaSesi/);
    assert.match(mentah, /fulfill gagal SETELAH siswa membayar/);
  });

  it("nama kolom baru belum ada di tabel yang sama (tidak menimpa): CREATE TABLE di schema.sql dan migrasi lama", () => {
    const schema = baca("db/schema.sql");
    for (const tabel of ["payments", "payment_subtes_pilihan", "enrollments", "enrollment_subtes", "sesi_kelas"]) {
      const awal = schema.indexOf(`CREATE TABLE ${tabel} (`);
      assert.ok(awal >= 0, tabel);
      const badan = schema.slice(awal, schema.indexOf("\n);", awal));
      for (const kunci of Object.keys(KOLOM_BARU).filter((k) => k.startsWith(`${tabel}.`))) {
        assert.ok(!new RegExp(`^\\s+${kunci.split(".")[1]}\\s`, "m").test(badan), `${kunci} sudah ada di CREATE TABLE`);
      }
    }
    const lama = readdirSync("db").filter((f) => f.endsWith(".sql") && !/sesi_pilihan|^schema\.sql$/.test(f));
    for (const berkas of lama) {
      const isi = tanpaKomentar(baca(`db/${berkas}`));
      for (const kunci of Object.keys(KOLOM_BARU)) {
        const [tabel, kolom] = kunci.split(".");
        assert.ok(
          !new RegExp(`ALTER\\s+TABLE\\s+${tabel}\\s+ADD\\s+COLUMN\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${kolom}\\b`, "i").test(isi),
          `${kunci} sudah ditambahkan di ${berkas}`,
        );
      }
    }
  });

  it("memuat urutan jalan (migrasi dulu, baru PR3) dan cara menjalankan (BEGIN, ROLLBACK, lalu COMMIT)", () => {
    const mentah = baca(MIGRASI);
    assert.match(mentah, /URUTAN RILIS/);
    assert.match(mentah, /migrasi ini[\s\S]*BARU deploy kode PR3/);
    assert.match(mentah, /BEGIN;[\s\S]*ROLLBACK;/);
    assert.match(mentah, /COMMIT;/);
  });
});

describe("db/rollback_add_sesi_pilihan.sql — membatalkan persis", () => {
  it("menghapus tepat 6 constraint dan 9 kolom yang sama, semuanya IF EXISTS, tidak ada DROP lain", () => {
    const drops = [...sqlRollback.matchAll(/\bDROP\s+[^;]+;/gi)].map((m) => m[0]);
    assert.equal(drops.length, 15);
    for (const d of drops) assert.match(d, /IF\s+EXISTS/i);

    const kolomDihapus = new Set(
      [...sqlRollback.matchAll(/ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+IF\s+EXISTS\s+(\w+)\s*;/gi)].map((m) => `${m[1]}.${m[2]}`),
    );
    assert.deepEqual([...kolomDihapus].sort(), Object.keys(KOLOM_BARU).sort());

    const constraintDihapus = new Set(
      [...sqlRollback.matchAll(/ALTER\s+TABLE\s+(\w+)\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+(\w+)\s*;/gi)].map((m) => `${m[1]}.${m[2]}`),
    );
    assert.deepEqual(
      [...constraintDihapus].sort(),
      Object.entries(CHECK_BARU).map(([nama, s]) => `${s.tabel}.${nama}`).sort(),
    );
  });

  it("tidak ada DROP TABLE, UPDATE, DELETE, INSERT, TRUNCATE; tanpa BEGIN/COMMIT", () => {
    for (const kata of ["UPDATE", "DELETE", "INSERT", "TRUNCATE"]) assert.ok(!new RegExp(`\\b${kata}\\b`, "i").test(sqlRollback), kata);
    assert.ok(!/DROP\s+TABLE/i.test(sqlRollback));
    assert.ok(!/^\s*BEGIN\s*;/im.test(sqlRollback));
    assert.ok(!/\bCOMMIT\b/i.test(sqlRollback));
  });

  it("memuat peringatan kehilangan data dan pra-cek (SELECT) sebelum DROP", () => {
    const mentah = baca(ROLLBACK);
    assert.match(mentah, /MENGHAPUS DATA/);
    assert.match(mentah, /TARIK\/revert kode PR3/);
    assert.ok(sqlRollback.indexOf("SELECT") < sqlRollback.indexOf("DROP"));
  });
});

describe("db/verify_add_sesi_pilihan.sql — hanya membaca", () => {
  const pernyataan = sqlVerifikasi
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  it("6 kueri, semuanya SELECT/WITH; tidak ada INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE", () => {
    assert.equal(pernyataan.length, 6);
    for (const p of pernyataan) assert.match(p, /^(SELECT|WITH)\b/i);
    for (const kata of ["INSERT", "UPDATE", "DELETE", "ALTER", "DROP", "CREATE", "TRUNCATE"]) {
      assert.ok(!new RegExp(`\\b${kata}\\b`, "i").test(sqlVerifikasi), kata);
    }
  });

  it("memeriksa 9 kolom dengan tipe, nullable, dan nilai bawaan lewat information_schema", () => {
    assert.match(sqlVerifikasi, /information_schema\.columns/);
    for (const kunci of Object.keys(KOLOM_BARU)) {
      const [tabel, kolom] = kunci.split(".");
      assert.ok(sqlVerifikasi.includes(`'${tabel}'`) && sqlVerifikasi.includes(`'${kolom}'`), kunci);
    }
    assert.match(sqlVerifikasi, /column_default/);
    assert.match(sqlVerifikasi, /is_nullable/);
  });

  it("memeriksa 6 constraint, FK (aksi hapus), dan menghitung baris lama yang berubah (harus 0)", () => {
    for (const nama of Object.keys(CHECK_BARU)) assert.ok(sqlVerifikasi.includes(`'${nama}'`), nama);
    assert.match(sqlVerifikasi, /confdeltype/);
    assert.match(sqlVerifikasi, /baris_berubah/);
    const mentah = baca(VERIFIKASI);
    assert.match(mentah, /SATU PER SATU/);
    assert.match(mentah, /Harapan: semua 0/);
    assert.match(mentah, /KUERI 4: 6 CHECK[\s\S]*Harapan: 7 baris/);
    assert.match(mentah, /HANYA batas bawah, tanpa batas atas/);
  });
});

describe("db/schema.sql dan PRD mengikuti migrasi", () => {
  it("schema.sql memuat 9 kolom dan 6 constraint yang sama, juga hanya batas bawah", () => {
    const schema = tanpaKomentar(baca("db/schema.sql"));
    for (const kunci of Object.keys(KOLOM_BARU)) {
      const [tabel, kolom] = kunci.split(".");
      assert.match(schema, new RegExp(`ALTER\\s+TABLE\\s+${tabel}\\s+ADD\\s+COLUMN\\s+${kolom}\\s`, "i"), kunci);
    }
    for (const [nama, spek] of Object.entries(CHECK_BARU)) {
      assert.match(
        schema,
        new RegExp(`ADD\\s+CONSTRAINT\\s+${nama}\\s+CHECK\\s*\\(\\s*${spek.kolom}\\s+IS\\s+NULL\\s+OR\\s+${spek.kolom}\\s*>=\\s*${spek.min}\\s*\\)`, "i"),
        nama,
      );
    }
  });

  it("PRD Bagian 13 menyebut migrasi, kolom baru, dan bahwa CHECK tanpa batas atas", () => {
    const prd = baca("docs/PRD.md");
    assert.match(prd, /CHECK hanya batas BAWAH/);
    assert.ok(!/INT 1–20|INT 0–10/.test(prd));
    assert.match(prd, /db\/add_sesi_pilihan\.sql/);
    for (const kunci of Object.keys(KOLOM_BARU)) assert.ok(prd.includes(kunci.split(".")[1]), kunci);
  });
});

describe("cakupan perubahan branch", () => {
  it("tidak ada perubahan di app/, lib/, components/ (dan app/api/payment, lib/mentor, fulfillPayment)", () => {
    let berubah: string[];
    try {
      const komit = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" });
      const kerja = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
      berubah = [...komit.split(/\r?\n/), ...kerja.split(/\r?\n/).map((l) => l.slice(3))].filter(Boolean);
    } catch {
      return; // tanpa git / tanpa origin/main (mis. CI dangkal): lewati
    }
    const terlarang = berubah.filter((f) => /^(app|lib|components)\//.test(f.replace(/\\/g, "/")));
    assert.deepEqual(terlarang, []);
  });
});
