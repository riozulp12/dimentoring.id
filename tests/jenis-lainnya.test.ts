/**
 * Jenis "Lainnya" di Info Beasiswa & Event: validasi API, label/badge, urutan jenis lama,
 * filter siswa, query siswa, dan migrasi aditif.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { validateKontenInfoInput } from "../lib/admin/validateKontenInfoInput";
import { filterKontenInfo } from "../lib/shared/kontenInfoFilter";
import { KONTEN_INFO_TIPE_BADGE_CLASS, KONTEN_INFO_TIPE_LABEL } from "../lib/shared/kontenInfoLabels";

const baca = (p: string) => readFileSync(p, "utf8");
const body = (tipe: string | undefined) => ({ tipe, judul: "Judul", status: "aktif" });

describe("validasi tipe", () => {
  it('"lainnya" lolos', () => {
    assert.equal(validateKontenInfoInput(body("lainnya")).ok, true);
  });
  it('"xyz", string kosong, dan undefined ditolak', () => {
    for (const t of ["xyz", "", undefined, "Lainnya", "LAINNYA"]) {
      const r = validateKontenInfoInput(body(t));
      assert.equal(r.ok, false, JSON.stringify(t));
      if (!r.ok) assert.equal(r.error, "Tipe tidak valid.");
    }
  });
  it("semua jenis lama tetap lolos", () => {
    for (const t of ["beasiswa", "internship", "event", "webinar", "workshop"]) {
      assert.equal(validateKontenInfoInput(body(t)).ok, true, t);
    }
  });
});

describe("label & badge", () => {
  it('Lainnya ada (label "Lainnya", badge abu-abu); jenis lama tidak berubah & urutan sama, Lainnya paling akhir', () => {
    assert.deepEqual(Object.keys(KONTEN_INFO_TIPE_LABEL), ["beasiswa", "internship", "webinar", "workshop", "event", "lainnya"]);
    assert.equal(KONTEN_INFO_TIPE_LABEL.lainnya, "Lainnya");
    assert.match(KONTEN_INFO_TIPE_BADGE_CLASS.lainnya, /gray/);
    assert.deepEqual(Object.keys(KONTEN_INFO_TIPE_BADGE_CLASS), Object.keys(KONTEN_INFO_TIPE_LABEL));
    assert.equal(KONTEN_INFO_TIPE_LABEL.beasiswa, "Beasiswa");
    assert.equal(KONTEN_INFO_TIPE_BADGE_CLASS.event, "bg-amber-50 text-amber-700");
  });
});

describe("filter siswa", () => {
  const data = [
    { judul: "A", tipe: "beasiswa", status: "aktif" },
    { judul: "B", tipe: "lainnya", status: "aktif" },
    { judul: "C", tipe: "event", status: "ditutup" },
    { judul: "D", tipe: "lainnya", status: "ditutup" },
  ];
  it("jenis lainnya hanya mengembalikan baris lainnya", () => {
    const r = filterKontenInfo(data, { search: "", tipe: "lainnya", status: "semua" });
    assert.deepEqual(r.map((x) => x.judul), ["B", "D"]);
  });
  it("jenis lain tidak ikut membawa lainnya; semua = semuanya", () => {
    assert.deepEqual(filterKontenInfo(data, { search: "", tipe: "event", status: "semua" }).map((x) => x.judul), ["C"]);
    assert.equal(filterKontenInfo(data, { search: "", tipe: "semua", status: "semua" }).length, 4);
    assert.deepEqual(filterKontenInfo(data, { search: "", tipe: "lainnya", status: "aktif" }).map((x) => x.judul), ["B"]);
  });
});

describe("wiring statis", () => {
  it("query siswa (daftar, /program, saran) memuat lainnya", () => {
    const q = baca("lib/dashboard/getInfoBeasiswaEvent.ts");
    assert.match(q, /const SEMUA_TIPE_KONTEN = \[[^\]]*"lainnya"/);
    assert.equal((q.match(/\.in\("tipe", SEMUA_TIPE_KONTEN\)/g) ?? []).length, 2);
  });
  it("migrasi aditif: ADD VALUE IF NOT EXISTS, tanpa DROP/DELETE data; rollback menghapus baris lainnya", () => {
    const m = baca("db/add_jenis_lainnya.sql");
    assert.match(m, /ALTER TYPE konten_info_tipe ADD VALUE IF NOT EXISTS 'lainnya'/);
    assert.doesNotMatch(m.replace(/--.*$/gm, ""), /DROP |DELETE |UPDATE /i);
    assert.match(m, /ROLLBACK;\s*-- ganti ke COMMIT setelah verifikasi/);
    assert.match(baca("db/rollback_add_jenis_lainnya.sql").replace(/--.*$/gm, ""), /DELETE FROM konten_info WHERE tipe = 'lainnya'/);
    assert.match(baca("db/schema.sql"), /konten_info_tipe AS ENUM \([^)]*'lainnya'\)/);
  });
});
