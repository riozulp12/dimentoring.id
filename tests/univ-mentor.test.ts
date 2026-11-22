/**
 * Universitas di pendaftaran mentor: daftar mengikuti sumber Assessment,
 * "Lainnya" wajib nama (min 3), admin menampilkan nama / data lama aman.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { filterSearchableOptions } from "../lib/shared/searchableSelectFilter";
import {
  UNIVERSITAS_LAINNYA_TULIS_SENDIRI,
  buildOpsiUniversitas,
  formatAsalPtnAdmin,
  isNamaUniversitasLainnyaValid,
  resolveAsalPtn,
} from "../lib/shared/universitasMentor";

const baca = (p: string) => readFileSync(p, "utf8");

describe("opsi universitas form mentor", () => {
  const assessment = ["Universitas Indonesia", "Politeknik Negeri Bali", "UIN Sunan Kalijaga", "Universitas Indonesia"];

  it("memuat semua PTN Assessment, unik, alfabet, Lainnya paling bawah", () => {
    const opsi = buildOpsiUniversitas(assessment);
    for (const nama of assessment) assert.ok(opsi.includes(nama));
    assert.equal(opsi.filter((n) => n === "Universitas Indonesia").length, 1);
    assert.equal(opsi.at(-1), "Lainnya");
    const tanpaLainnya = opsi.slice(0, -1);
    assert.deepEqual(tanpaLainnya, [...tanpaLainnya].sort((a, b) => a.localeCompare(b, "id")));
  });

  it("Lainnya dari data sumber tidak dobel", () => {
    const opsi = buildOpsiUniversitas(["lainnya", "Universitas A", "Lainnya"]);
    assert.equal(opsi.filter((n) => n.toLowerCase() === "lainnya").length, 1);
    assert.equal(opsi.at(-1), "Lainnya");
  });

  it("halaman & klien memakai sumber bersama, bukan daftar hardcoded", () => {
    const page = baca("app/(auth)/lengkapi-profil/page.tsx");
    assert.match(page, /getDaftarUniversitas/);
    assert.match(baca("lib/landing/getDaftarUniversitas.ts"), /getPtnJurusanOptions/);
    assert.doesNotMatch(baca("app/(auth)/lengkapi-profil/LengkapiProfilClient.tsx"), /PTN_OPTIONS|"Universitas Indonesia"/);
  });
});

describe("Lainnya wajib nama universitas", () => {
  it("tanpa nama / <3 karakter / mengetik 'Lainnya' ditolak", () => {
    for (const nama of ["", "  ", "ab", " a ", "Lainnya", "lainnya", undefined]) {
      assert.equal(isNamaUniversitasLainnyaValid(nama), false);
      assert.equal(resolveAsalPtn("Lainnya", nama), null);
    }
  });

  it("dengan nama lolos dan yang disimpan adalah nama (trim)", () => {
    assert.equal(resolveAsalPtn("Lainnya", "  Universitas Contoh  "), "Universitas Contoh");
  });

  it("pilihan biasa disimpan apa adanya, nama Lainnya diabaikan", () => {
    assert.equal(resolveAsalPtn("Universitas Indonesia", "x"), "Universitas Indonesia");
    assert.equal(resolveAsalPtn("", "Universitas Contoh"), null);
  });

  it("route lengkapi-profil memvalidasi nama Lainnya di server", () => {
    const route = baca("app/api/auth/lengkapi-profil/route.ts");
    assert.match(route, /resolveAsalPtn\(ptnPilihan, body\.ptnLainnya\)/);
    assert.match(route, /Nama universitas wajib diisi/);
  });
});

describe("tampilan admin approval-mentor", () => {
  it("nama yang diketik tampil apa adanya", () => {
    assert.equal(formatAsalPtnAdmin("Universitas Contoh"), "Universitas Contoh");
  });

  it('data lama "Lainnya" tanpa nama tampil aman', () => {
    assert.equal(formatAsalPtnAdmin("Lainnya"), "Lainnya (nama belum diisi)");
    assert.equal(formatAsalPtnAdmin(null), "-");
    assert.equal(formatAsalPtnAdmin(""), "-");
  });

  it("ketiga tampilan admin memakai formatAsalPtnAdmin", () => {
    for (const p of [
      "components/admin/ApprovalMentorClient.tsx",
      "components/admin/ApprovalMentorList.tsx",
      "app/(protected)/(admin)/approval-mentor/[mentorId]/page.tsx",
    ]) {
      assert.match(baca(p), /formatAsalPtnAdmin\(/, p);
    }
  });
});

describe('opsi cadangan "Lainnya (tulis sendiri)" di pencarian', () => {
  const opsi = buildOpsiUniversitas(["Universitas Indonesia", "Institut Teknologi Bandung"]).map((n) => ({ label: n, value: n }));
  const fallback = { label: UNIVERSITAS_LAINNYA_TULIS_SENDIRI, value: "Lainnya" };

  it("pencarian tanpa hasil memunculkan opsi cadangan", () => {
    const r = filterSearchableOptions(opsi, "Universitas Antah Berantah", fallback);
    assert.equal(r.filtered.length, 0);
    assert.equal(r.showFallback, true);
    assert.equal(fallback.label, "Lainnya (tulis sendiri)");
  });

  it("pencarian dengan hasil / kosong tidak memunculkannya", () => {
    assert.equal(filterSearchableOptions(opsi, "bandung", fallback).showFallback, false);
    assert.equal(filterSearchableOptions(opsi, "   ", fallback).showFallback, false);
    assert.equal(filterSearchableOptions(opsi, "", fallback).showFallback, false);
  });

  it("tanpa fallbackOption (Assessment dkk.) perilaku lama tetap", () => {
    assert.equal(filterSearchableOptions(opsi, "zzz").showFallback, false);
  });

  it("memilih opsi mengisi kolom nama dari teks pencarian (wiring)", () => {
    const comp = baca("components/ui/SearchableSelect.tsx");
    assert.match(comp, /onFallbackSelect\?\.\(typed\)/);
    assert.match(comp, /const typed = query\.trim\(\)/);
    const wizard = baca("app/(auth)/lengkapi-profil/LengkapiProfilClient.tsx");
    assert.match(wizard, /onFallbackSelect=\{\(typed\) => updateForm\(\{ ptn: UNIVERSITAS_LAINNYA, ptnLainnya: typed \}\)\}/);
    assert.match(wizard, /fallbackOption=\{\{ label: UNIVERSITAS_LAINNYA_TULIS_SENDIRI/);
  });
});
