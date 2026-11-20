/**
 * Tes tampilan "Mulai dari" kelas private online: kartu kelas dan halaman detail memakai SATU komponen
 * (components/program/HargaMulaiDari.tsx) dan satu helper (lib/shared/kartuHargaMulai.ts). Saklar SESI_PILIHAN_AKTIF
 * dinyalakan/dimatikan per tes. Render di proses terpisah (pola tests/badge-kapasitas.test.ts).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, it } from "node:test";
import "./helpers/envSupabaseUji";
import { TEKS_AJAKAN_SESI, ringkasanHargaKartu } from "@/lib/shared/kartuHargaMulai";
import { hargaMulaiDari } from "@/lib/shared/hargaSesi";
import { formatRupiah } from "@/lib/shared/kelasDiskon";
import type { KelasCardPreview } from "@/lib/dashboard/getProgramData";

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
  }).replace(/<!-- -->/g, "");
}

const awal = process.env.SESI_PILIHAN_AKTIF;
after(() => {
  if (awal === undefined) delete process.env.SESI_PILIHAN_AKTIF;
  else process.env.SESI_PILIHAN_AKTIF = awal;
});
beforeEach(() => {
  process.env.SESI_PILIHAN_AKTIF = "true";
});

const item = (ekstra: Partial<KelasCardPreview> = {}): KelasCardPreview =>
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

const kartu = (i: KelasCardPreview) => render("@/components/program/KelasCardMeta", { item: i, sessionRole: null });
const detail = (harga: number, hargaSetelahDiskon: number, jumlahSesi: number) => {
  const ringkasan = ringkasanHargaKartu({ aktif: true, tipeKelas: "private", modeKelas: "online", harga, hargaSetelahDiskon, jumlahSesi });
  assert.ok(ringkasan);
  return render("@/components/program/HargaMulaiDari", { ringkasan, harga, diskonAktif: hargaSetelahDiskon < harga, varian: "detail" });
};

describe("kartu dan detail: susunan 'Mulai dari'", () => {
  it("899.000: kartu dan detail sama-sama 'Mulai dari' + Rp102.000 + kalimat ajakan; tanpa 'per 1 sesi'", () => {
    for (const h of [kartu(item()), detail(899000, 899000, 10)]) {
      assert.match(h, /Mulai dari<\/span><span[^>]*>Rp102\.000<\/span><span[^>]*>Makin banyak sesi, makin hemat<\/span>/);
      assert.ok(!h.includes("per 1 sesi") && !h.includes("paket 10 sesi Rp"));
      assert.ok(!/<s[ >]/.test(h), "tanpa diskon tidak ada baris diskon");
    }
  });
  it("1.099.000 -> Rp124.000 di kartu dan detail", () => {
    assert.ok(kartu(item({ harga: 1099000, hargaSetelahDiskon: 1099000 })).includes("Rp124.000"));
    assert.ok(detail(1099000, 1099000, 10).includes("Rp124.000"));
  });
  it("gaya: 'Mulai dari' kecil regular abu-abu; harga bold warna primary & lebih besar dari judul kartu", () => {
    const h = kartu(item());
    assert.match(h, /<span class="font-normal text-\[#7E7C7C\] text-xs">Mulai dari/);
    const harga = h.match(/<span class="([^"]*)">Rp102\.000/)![1];
    assert.ok(/font-bold/.test(harga) && /text-\[#081EEA\]/.test(harga), harga);
    assert.ok(/text-xl/.test(harga), harga);
    assert.ok(!/text-xl|text-2xl/.test(h.match(/<p class="([^"]*)">Matematika Privat/)![1]), "judul tetap text-base");
    const d = detail(899000, 899000, 10);
    assert.match(d, /font-bold[^"]*text-\[#081EEA\][^"]*text-2xl|font-bold[^"]*text-2xl/);
  });
  it("diskon: satu baris 'Paket N sesi: <coret> <setelah diskon>' di kartu dan detail; tanpa diskon tidak ada", () => {
    const k = kartu(item({ diskonPersen: 5, hargaSetelahDiskon: 854050 }));
    assert.match(k, /Paket 10 sesi: <s[^>]*>Rp899\.000<\/s> <span[^>]*>Rp854\.050<\/span>/);
    const d = detail(899000, 854050, 10);
    assert.match(d, /Paket 10 sesi: <s[^>]*>Rp899\.000<\/s> <span[^>]*>Rp854\.050<\/span>/);
    assert.ok(d.includes("Rp102.000") || d.includes("Rp9"), d);
  });
  it("kelas offline dan non-private tidak berubah; saklar mati tidak berubah", () => {
    assert.ok(!kartu(item({ modePembelajaran: "offline" })).includes("Mulai dari"));
    assert.ok(!kartu(item({ tipeKelas: "regular" })).includes("Mulai dari"));
    process.env.SESI_PILIHAN_AKTIF = "false";
    const mati = kartu(item());
    assert.ok(!mati.includes("Mulai dari") && !mati.includes(TEKS_AJAKAN_SESI));
    assert.ok(mati.includes("Rp899.000"));
  });
});

const header = (ekstra: Record<string, unknown> = {}) =>
  render("@/components/siswa/CheckoutHeaderHarga", {
    aktif: true,
    tipeKelas: "private",
    modePembelajaran: "online",
    jumlahSesi: 10,
    harga: 1099000,
    hargaAktif: 1099000,
    ...ekstra,
  });

describe("header checkout", () => {
  it("private online + saklar hidup: HargaMulaiDari, angka = hargaMulaiDari(kelas) = angka kartu", () => {
    const h = header();
    const hm = hargaMulaiDari({ hargaNormal: 1099000, hargaAktif: 1099000, jumlahSesiKelas: 10 });
    assert.ok(hm.valid);
    const angka = formatRupiah(hm.valid ? hm.harga : 0);
    assert.equal(angka, "Rp124.000");
    assert.match(h, new RegExp(`Mulai dari</span><span[^>]*>${angka.replace(".", "\.")}</span><span[^>]*>Makin banyak sesi, makin hemat</span>`));
    assert.ok(kartu(item({ harga: 1099000, hargaSetelahDiskon: 1099000 })).includes(angka));
    assert.ok(!h.includes("Rp1.099.000"), "harga normal tidak tampil di header");
  });
  it("diskon: baris 'Paket N sesi' ikut tampil seperti kartu", () => {
    assert.match(header({ hargaAktif: 1044050 }), /Paket 10 sesi: <s[^>]*>Rp1\.099\.000<\/s> <span[^>]*>Rp1\.044\.050<\/span>/);
  });
  it("non-private-online atau saklar mati: tampilan harga lama", () => {
    for (const h of [header({ modePembelajaran: "offline" }), header({ tipeKelas: "regular" }), header({ aktif: false })]) {
      assert.ok(!h.includes("Mulai dari") && !h.includes(TEKS_AJAKAN_SESI));
      assert.match(h, /^<p class="text-base text-\[#7E7C7C\] sm:text-lg">Rp1\.099\.000<\/p>$/);
    }
    assert.match(header({ aktif: false, hargaAktif: 989100 }), /<span class="font-semibold text-black">Rp989\.100<\/span>/);
  });
});

describe("header detail kelas", () => {
  const props = {
    nama: "Matematika Privat",
    modePembelajaran: "online",
    tipeKelasLabel: "Private",
    subtesNama: "Matematika TKA",
    tingkatKelasLabel: "Kelas 12",
  };
  const h = () => render("@/components/program/DetailKelasHeader", { ...props, hargaSlot: null });
  it("tidak merender jadwal (ikon kalender / WIB) dan teks 'N sesi'", () => {
    const out = h();
    assert.ok(!out.includes("<svg") && !/WIB|Senin|Selasa/.test(out));
    assert.ok(!/\d+ sesi/.test(out));
  });
  it("keempat chip tampil, dalam grid 2 kolom (2 per baris, juga di HP)", () => {
    const out = h();
    for (const label of ["Online", "Private", "Matematika TKA", "Kelas 12"]) assert.ok(out.includes(label), label);
    assert.match(out, /grid w-fit grid-cols-2/);
  });
  it("jarak judul ke chip rapat (gap-2.5) dan halaman memakai DetailKelasHeader tanpa jadwal/N sesi", () => {
    assert.match(h(), /flex flex-col gap-2\.5/);
    const src = readFileSync("app/program/kelas/[kelasId]/page.tsx", "utf8");
    assert.match(src, /<DetailKelasHeader/);
    assert.ok(!/jadwalDisplay|CalendarIcon|\} sesi</.test(src));
  });
});

describe("tes statis", () => {
  const baca = (f: string) => readFileSync(f, "utf8");
  it("kalimat ajakan persis dan maksimal 5 kata", () => {
    assert.equal(TEKS_AJAKAN_SESI, "Makin banyak sesi, makin hemat");
    assert.ok(TEKS_AJAKAN_SESI.split(/\s+/).length <= 5);
  });
  it("kartu dan detail memakai komponen HargaMulaiDari dan helper ringkasanHargaKartu yang sama; detail hanya bila saklar hidup", () => {
    const kartuSrc = baca("components/program/KelasCardMeta.tsx");
    const detailSrc = baca("app/program/kelas/[kelasId]/page.tsx");
    for (const src of [kartuSrc, detailSrc]) {
      assert.match(src, /<HargaMulaiDari/);
      assert.match(src, /ringkasanHargaKartu\(/);
      assert.match(src, /aktif: sesiPilihanAktif\(\)/);
    }
    const komponen = baca("components/program/HargaMulaiDari.tsx");
    assert.ok(!/hargaCharm|PREMIUM_|Math\.round|hargaMulaiDari\(|hitungHargaSesi\(/.test(komponen), "tanpa rumus salinan");
  });
  it("halaman checkout memakai CheckoutHeaderHarga (saklar dibaca di server); rincian bawah (CheckoutForm) tidak diubah", () => {
    const page = baca("app/(protected)/(siswa)/checkout/[kelasId]/page.tsx");
    assert.match(page, /<CheckoutHeaderHarga/);
    assert.match(page, /aktif=\{sesiPilihanAktif\(\)\}/);
    assert.match(baca("components/siswa/CheckoutHeaderHarga.tsx"), /ringkasanHargaKartu\(/);
    assert.match(baca("components/siswa/CheckoutHeaderHarga.tsx"), /<HargaMulaiDari/);
  });
  it("tidak menyentuh payment, checkout, honor", () => {
    for (const f of ["components/program/HargaMulaiDari.tsx", "lib/shared/kartuHargaMulai.ts"]) {
      assert.ok(!/lib\/payment|checkout|honor/i.test(baca(f).replace(/\/\*[\s\S]*?\*\//g, "")), f);
    }
  });
});
