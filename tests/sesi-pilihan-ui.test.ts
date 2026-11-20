/**
 * Tes sesi pilihan siswa — UI + kartu (commit B): kartu "Mulai dari", pemilih sesi di Checkout, logika tampilan murni.
 * Komponen dirender ke HTML statis (react-dom/server); saklar SESI_PILIHAN_AKTIF dinyalakan/dimatikan per tes.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, it } from "node:test";
import "./helpers/envSupabaseUji";
import { execFileSync } from "node:child_process";
import { ringkasanHargaKartu } from "@/lib/shared/kartuHargaMulai";
import { batasSesi, bagiRataSesi, pilihanSesiSiap, rincianCheckoutUi } from "@/lib/shared/checkoutSesiUi";
import type { KelasCardPreview } from "@/lib/dashboard/getProgramData";

const baca = (rel: string) => readFileSync(rel, "utf8");

// react-dom/server menolak kondisi "react-server" runner tes: render di proses terpisah (pola tests/badge-kapasitas.test.ts).
function render(modul: string, props: unknown): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import(${JSON.stringify(modul)});
    const Komponen = typeof mod.default === "function" ? mod.default : mod.default.default;
    process.stdout.write(renderToStaticMarkup(React.createElement(Komponen, JSON.parse(process.argv[1]))));
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify(props)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}
const awal = process.env.SESI_PILIHAN_AKTIF;
after(() => {
  if (awal === undefined) delete process.env.SESI_PILIHAN_AKTIF;
  else process.env.SESI_PILIHAN_AKTIF = awal;
});
beforeEach(() => {
  delete process.env.SESI_PILIHAN_AKTIF;
});

const kartu = (ekstra: Partial<KelasCardPreview> = {}): KelasCardPreview =>
  ({
    id: "k1",
    nama: "Matematika Privat",
    tipeKelas: "private",
    tipeKelasLabel: "Private",
    modePembelajaran: "online",
    modePembelajaranLabel: "Online",
    harga: 899000,
    diskonPersen: 0,
    hargaSetelahDiskon: 899000,
    jumlahSesi: 10,
    mentorNama: null,
    diskonAktif: null,
    kapasitasInfo: { penuh: false } as KelasCardPreview["kapasitasInfo"],
    deskripsi: null,
    programKategori: "tka",
    tingkatKelas: "12",
    subtesNama: null,
    linkLynkid: null,
    ...ekstra,
  }) as KelasCardPreview;

const html = (item: KelasCardPreview) => render("@/components/program/KelasCardMeta", { item, sessionRole: null });

describe("ringkasanHargaKartu (murni)", () => {
  const dasar = { aktif: true, tipeKelas: "private", modeKelas: "online" } as const;
  it("899.000/10 -> 102.000; 1.099.000/10 -> 124.000; 719.200/8 -> 102.000", () => {
    assert.deepEqual(ringkasanHargaKartu({ ...dasar, harga: 899000, hargaSetelahDiskon: 899000, jumlahSesi: 10 }), {
      mulaiDari: "Rp102.000",
      jumlahSesi: 10,
      hargaPaket: "Rp899.000",
    });
    assert.equal(ringkasanHargaKartu({ ...dasar, harga: 1099000, hargaSetelahDiskon: 1099000, jumlahSesi: 10 })?.mulaiDari, "Rp124.000");
    assert.deepEqual(ringkasanHargaKartu({ ...dasar, harga: 719200, hargaSetelahDiskon: 719200, jumlahSesi: 8 }), {
      mulaiDari: "Rp102.000",
      jumlahSesi: 8,
      hargaPaket: "Rp719.200",
    });
  });
  it("saklar mati / offline / bukan private / sesi kosong -> null", () => {
    const k = { harga: 899000, hargaSetelahDiskon: 899000, jumlahSesi: 10 };
    assert.equal(ringkasanHargaKartu({ ...dasar, ...k, aktif: false }), null);
    assert.equal(ringkasanHargaKartu({ ...dasar, ...k, modeKelas: "offline" }), null);
    assert.equal(ringkasanHargaKartu({ ...dasar, ...k, tipeKelas: "regular" }), null);
    assert.equal(ringkasanHargaKartu({ ...dasar, ...k, jumlahSesi: null }), null);
  });
});

describe("KelasCardMeta (kartu kelas)", () => {
  it("saklar mati: tidak ada 'Mulai dari'; harga lama persis", () => {
    const h = html(kartu());
    assert.ok(!h.includes("Mulai dari"));
    assert.ok(h.includes("Rp899.000"));
  });
  it("saklar hidup: private online tampil 'Mulai dari Rp102.000' + 'per 1 sesi · paket 10 sesi Rp899.000'", () => {
    process.env.SESI_PILIHAN_AKTIF = "true";
    const h = html(kartu());
    assert.ok(h.includes("Mulai dari Rp102.000"), h);
    assert.ok(/per 1 sesi · paket 10 sesi\s*(<!-- -->)?\s*(<!-- -->)?\s*Rp899\.000/.test(h.replace(/<!-- -->/g, "")), h);
  });
  it("saklar hidup + diskon: paket penuh tetap menampilkan harga coret dan harga setelah diskon", () => {
    process.env.SESI_PILIHAN_AKTIF = "true";
    const h = html(kartu({ diskonPersen: 5, hargaSetelahDiskon: 854050 }));
    assert.ok(h.includes("<s"), h);
    assert.ok(h.includes("Rp899.000") && h.includes("Rp854.050"), h);
  });
  it("saklar hidup: kelas offline dan non-private tidak berubah", () => {
    process.env.SESI_PILIHAN_AKTIF = "true";
    assert.ok(!html(kartu({ modePembelajaran: "offline" })).includes("Mulai dari"));
    assert.ok(!html(kartu({ tipeKelas: "regular" })).includes("Mulai dari"));
  });
});

describe("logika tampilan checkout (murni)", () => {
  it("batas sesi: min = jumlah subtes, maks = 2 x paket", () => {
    assert.deepEqual(batasSesi(10, 1), { min: 1, maks: 20 });
    assert.deepEqual(batasSesi(8, 3), { min: 3, maks: 16 });
  });
  it("bagi rata: menjumlah N, tiap subtes >= 1", () => {
    assert.deepEqual(bagiRataSesi(["a", "b", "c"], 10), { a: 4, b: 3, c: 3 });
    assert.deepEqual(bagiRataSesi(["a"], 7), { a: 7 });
  });
  it("rincian: paket penuh, tambahan (12), dan kecil (1) dari fungsi hargaSesi", () => {
    const d = { hargaNormal: 899000, hargaAktif: 899000, jumlahSesiKelas: 10, jumlahSubtes: 1 };
    const penuh = rincianCheckoutUi({ ...d, sesiTotal: 10 });
    assert.ok(penuh.valid && penuh.totalSebelumPromo === 899000 && penuh.promoBerlaku);
    const tambah = rincianCheckoutUi({ ...d, sesiTotal: 12 });
    assert.ok(tambah.valid && tambah.hargaDasar === 899000 && tambah.biayaSesiTambahan === 179000 && tambah.promoBerlaku);
    const kecil = rincianCheckoutUi({ ...d, sesiTotal: 1 });
    assert.ok(kecil.valid && kecil.totalSebelumPromo === 102000 && !kecil.promoBerlaku);
    assert.equal(rincianCheckoutUi({ ...d, sesiTotal: 21 }).valid, false);
  });
  it("pilihanSesiSiap: sebaran harus menjumlah N; kosong subtes lolos (diperiksa di tempat lain)", () => {
    const rincian = rincianCheckoutUi({ hargaNormal: 719200, hargaAktif: 719200, jumlahSesiKelas: 8, sesiTotal: 8, jumlahSubtes: 2 });
    assert.equal(pilihanSesiSiap({ rincian, subtesIds: ["a", "b"], sebaran: { a: 4, b: 4 } }).siap, true);
    assert.equal(pilihanSesiSiap({ rincian, subtesIds: ["a", "b"], sebaran: { a: 5, b: 4 } }).siap, false);
    assert.equal(pilihanSesiSiap({ rincian, subtesIds: ["a", "b"], sebaran: { a: 8, b: 0 } }).siap, false);
    assert.equal(pilihanSesiSiap({ rincian, subtesIds: [], sebaran: {} }).siap, true);
  });
});

describe("CheckoutForm", () => {
  const props = {
    kelasId: "k1",
    harga: 899000,
    hargaAsli: 899000,
    subtesOptions: [{ id: "a", nama: "Matematika" }],
    modePembelajaran: "online" as const,
    jadwalOptions: [],
  };
  const renderForm = (ekstra: Record<string, unknown> = {}) => render("@/components/siswa/CheckoutForm", { ...props, ...ekstra });

  it("tanpa prop sesiPilihan (saklar mati): tidak ada pemilih sesi; ringkasan lama", () => {
    const h = renderForm();
    assert.ok(!h.includes("Jumlah Sesi") && !h.includes("Penambahan jumlah sesi"));
    assert.ok(h.includes("Subtotal"));
  });
  it("dengan sesiPilihan: stepper bawaan = paket kelas, teks diskon, rincian paket, tombol Bayar nonaktif tanpa persetujuan", () => {
    const h = renderForm({ sesiPilihan: { hargaNormal: 899000, jumlahSesiKelas: 10 } });
    assert.ok(h.includes("Jumlah Sesi"));
    assert.ok(h.includes("10 sesi"));
    assert.ok(h.includes("Penambahan jumlah sesi tidak termasuk diskon."));
    assert.ok(h.includes("Paket 10 sesi") && h.includes("Rp899.000"));
    assert.ok(h.includes('aria-label="Kurangi sesi"') && h.includes('aria-label="Tambah sesi"'));
  });
});

describe("tes statis", () => {
  it("tidak ada impor lib/shared/sesiTambahan.ts di berkas commit B", () => {
    for (const f of ["lib/shared/checkoutSesiUi.ts", "lib/shared/kartuHargaMulai.ts", "components/siswa/CheckoutForm.tsx", "components/program/KelasCardMeta.tsx"]) {
      assert.ok(!/shared\/sesiTambahan/.test(baca(f)), f);
    }
  });
  it("halaman checkout membaca saklar di server dan meneruskan lewat prop; klien tidak membaca env", () => {
    const page = baca("app/(protected)/(siswa)/checkout/[kelasId]/page.tsx");
    assert.match(page, /sesiPilihanAktif\(\)/);
    assert.ok(!/process\.env/.test(baca("components/siswa/CheckoutForm.tsx")));
  });
  it("tidak ada rumus harga salinan di UI", () => {
    for (const f of ["lib/shared/checkoutSesiUi.ts", "lib/shared/kartuHargaMulai.ts", "components/siswa/CheckoutForm.tsx", "components/program/KelasCardMeta.tsx"]) {
      assert.ok(!/hargaCharm|PREMIUM_|TIER_PREMIUM|hargaPerSesi \*/.test(baca(f)), f);
    }
  });
});
