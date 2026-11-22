/**
 * Universitas di pendaftaran mentor: daftar mengikuti sumber Assessment,
 * "Lainnya" wajib nama (min 3), admin menampilkan nama / data lama aman.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
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
