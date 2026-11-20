/**
 * Tes pratinjau harga kartu siswa di form Kelola Kelas (kelas private online):
 * label/teks bantu field harga, teks pratinjau (fungsi murni), dan pemakaian rumus hargaSesi.ts.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { teksPratinjauHargaKartu } from "@/lib/shared/pratinjauHargaKelas";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const privateOnline = { tipeKelas: "private", modeKelas: "online" } as const;

describe("teksPratinjauHargaKartu", () => {
  it("899.000 / 10 sesi -> Mulai dari Rp102.000 dan paket 10 sesi Rp899.000", () => {
    assert.equal(
      teksPratinjauHargaKartu({ ...privateOnline, harga: "899000", diskonPersen: "", jumlahSesi: "10" }),
      "Di kartu siswa: Mulai dari Rp102.000 (1 sesi) · Paket 10 sesi Rp899.000",
    );
  });

  it("1.099.000 -> Mulai dari Rp124.000", () => {
    const t = teksPratinjauHargaKartu({ ...privateOnline, harga: "1099000", diskonPersen: "", jumlahSesi: "10" });
    assert.ok(t?.includes("Mulai dari Rp124.000 (1 sesi)"), String(t));
    assert.ok(t?.includes("Paket 10 sesi Rp1.099.000"), String(t));
  });

  it("491.400 -> Mulai dari Rp56.000", () => {
    const t = teksPratinjauHargaKartu({ ...privateOnline, harga: "491400", diskonPersen: "", jumlahSesi: "10" });
    assert.ok(t?.includes("Mulai dari Rp56.000 (1 sesi)"), String(t));
    assert.ok(t?.includes("Paket 10 sesi Rp491.400"), String(t));
  });

  it("kelas 8 sesi: paket memakai jumlah sesi form", () => {
    assert.equal(
      teksPratinjauHargaKartu({ ...privateOnline, harga: "719200", diskonPersen: "", jumlahSesi: "8" }),
      "Di kartu siswa: Mulai dari Rp102.000 (1 sesi) · Paket 8 sesi Rp719.200",
    );
  });

  it("diskon kelas dipakai: paket = harga setelah diskon", () => {
    const t = teksPratinjauHargaKartu({ ...privateOnline, harga: "1000000", diskonPersen: "10", jumlahSesi: "10" });
    assert.ok(t?.includes("Paket 10 sesi Rp900.000"), String(t));
  });

  it("kelas offline / tipe bukan private tidak menampilkan pratinjau", () => {
    const f = { harga: "899000", diskonPersen: "", jumlahSesi: "10" };
    assert.equal(teksPratinjauHargaKartu({ tipeKelas: "private", modeKelas: "offline", ...f }), null);
    assert.equal(teksPratinjauHargaKartu({ tipeKelas: "regular", modeKelas: "online", ...f }), null);
    assert.equal(teksPratinjauHargaKartu({ tipeKelas: "", modeKelas: "online", ...f }), null);
  });

  it("harga / jumlah sesi kosong atau tidak valid tidak menampilkan apa pun", () => {
    assert.equal(teksPratinjauHargaKartu({ ...privateOnline, harga: "", diskonPersen: "", jumlahSesi: "10" }), null);
    assert.equal(teksPratinjauHargaKartu({ ...privateOnline, harga: "0", diskonPersen: "", jumlahSesi: "10" }), null);
    assert.equal(teksPratinjauHargaKartu({ ...privateOnline, harga: "899000", diskonPersen: "", jumlahSesi: "" }), null);
    assert.equal(teksPratinjauHargaKartu({ ...privateOnline, harga: "899000", diskonPersen: "", jumlahSesi: "0" }), null);
    assert.equal(teksPratinjauHargaKartu({ ...privateOnline, harga: "899000", diskonPersen: "101", jumlahSesi: "10" }), null);
    assert.equal(teksPratinjauHargaKartu({ ...privateOnline, harga: "899000", diskonPersen: "100", jumlahSesi: "10" }), null);
  });
});

describe("KelolaKelasForm — label, teks bantu, dan sumber rumus", () => {
  const form = baca("components/admin/KelolaKelasForm.tsx");

  it("label & teks bantu harga baru tampil; label lama hilang", () => {
    assert.ok(form.includes("Harga paket penuh (Rp)"));
    assert.ok(form.includes("Harga paket penuh yang tampil ke siswa, misalnya 899.000, bukan 900.000."));
    assert.ok(!form.includes(">Harga (Rp)<"));
  });

  it("pratinjau memakai teksPratinjauHargaKartu; pesan pagar margin tetap ada", () => {
    assert.ok(form.includes("teksPratinjauHargaKartu("));
    assert.ok(form.includes("pesanMarginDiskon"));
  });

  it("pratinjau memakai hargaSesi.ts, tanpa rumus salinan", () => {
    const helper = baca("lib/shared/pratinjauHargaKelas.ts");
    assert.ok(/from "\.\/hargaSesi"/.test(helper));
    assert.ok(helper.includes("hargaMulaiDari(") && helper.includes("hitungHargaSesi("));
    assert.ok(!/hargaCharm|PREMIUM_|Math\.round|Math\.floor/.test(helper));
    assert.ok(!/hargaCharm|PREMIUM_|TIER_PREMIUM/.test(form));
  });
});
