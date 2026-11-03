/**
 * Test statis halaman gabungan "Kebijakan Privasi & Refund" (/kebijakan) dan
 * persetujuan di Checkout: dua bagian (id privasi & refund), redirect alamat
 * lama, tautan internal, footer, kotak centang Checkout yang mengunci tombol
 * bayar, teks Refund yang kritis, dan Mayar/webhook/harga tidak tersentuh.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import nextConfig from "../next.config";
import {
  HREF_KEBIJAKAN,
  HREF_KEBIJAKAN_PRIVASI,
  HREF_KEBIJAKAN_REFUND,
  KEBIJAKAN_REFUND,
  KEBIJAKAN_PRIVASI_TANGGAL_BERLAKU,
  KEBIJAKAN_PRIVASI_VERSI,
  KEBIJAKAN_REFUND_TANGGAL_BERLAKU,
  KEBIJAKAN_REFUND_VERSI,
  RINGKASAN_REFUND_CHECKOUT,
} from "../lib/shared/kebijakan";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function semuaFile(dir: string, hasil: string[] = []): string[] {
  for (const nama of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${nama}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) semuaFile(rel, hasil);
    else if (/\.(ts|tsx)$/.test(nama)) hasil.push(rel);
  }
  return hasil;
}

const TEKS_REFUND = KEBIJAKAN_REFUND.flatMap((p) => [p.judul, ...(p.paragraf ?? []), ...(p.butir ?? []), ...(p.penutup ?? [])]).join("\n");

describe("halaman /kebijakan", () => {
  const halaman = baca("app/kebijakan/page.tsx");

  it("ada di app/kebijakan, alamat lama tidak lagi punya halaman sendiri", () => {
    assert.equal(HREF_KEBIJAKAN, "/kebijakan");
    assert.throws(() => statSync(path.join(ROOT, "app/kebijakan-privasi/page.tsx")));
    assert.throws(() => statSync(path.join(ROOT, "app/kebijakan-refund/page.tsx")));
  });

  it('metadata title "Kebijakan Privasi & Refund | dimentoring.id"', () => {
    assert.match(halaman, /title: "Kebijakan Privasi & Refund \| dimentoring\.id"/);
  });

  it("memuat dua bagian dengan id privasi dan refund, dan daftar isi dengan tautan anchor", () => {
    assert.match(halaman, /<section\s+id="privasi"/);
    assert.match(halaman, /<section\s+id="refund"/);
    assert.match(halaman, /href="#privasi"/);
    assert.match(halaman, /href="#refund"/);
    assert.match(halaman, /Daftar isi/);
  });

  it('tiap bagian punya "Berlaku sejak" dan "Versi" sendiri (dua kali di halaman)', () => {
    assert.equal(halaman.match(/Berlaku sejak:/g)?.length, 2);
    assert.equal(halaman.match(/Versi:/g)?.length, 2);
    assert.match(halaman, /KEBIJAKAN_PRIVASI_VERSI/);
    assert.match(halaman, /KEBIJAKAN_REFUND_VERSI/);
  });

  it("tanggal & versi dipisah per bagian: Privasi 23 Oktober 2026 (v1), Refund 5 November 2026 (v1)", () => {
    assert.equal(KEBIJAKAN_PRIVASI_TANGGAL_BERLAKU, "23 Oktober 2026");
    assert.equal(KEBIJAKAN_PRIVASI_VERSI, "v1");
    assert.equal(KEBIJAKAN_REFUND_TANGGAL_BERLAKU, "5 November 2026");
    assert.equal(KEBIJAKAN_REFUND_VERSI, "v1");
    assert.notEqual(KEBIJAKAN_PRIVASI_TANGGAL_BERLAKU, KEBIJAKAN_REFUND_TANGGAL_BERLAKU);
    // Tiap bagian di halaman memakai konstanta bagiannya sendiri (bukan tertukar).
    assert.match(halaman, /Berlaku sejak: \{KEBIJAKAN_PRIVASI_TANGGAL_BERLAKU\} · Versi: \{KEBIJAKAN_PRIVASI_VERSI\}/);
    assert.match(halaman, /Berlaku sejak: \{KEBIJAKAN_REFUND_TANGGAL_BERLAKU\} · Versi: \{KEBIJAKAN_REFUND_VERSI\}/);
    // Dokumen sumber ikut sama.
    assert.match(baca("docs/legal/kebijakan-privasi-v1.md"), /^Berlaku sejak: 23 Oktober 2026\s*$/m);
    assert.match(baca("docs/legal/kebijakan-privasi-v1.md"), /^Versi: v1\s*$/m);
    assert.match(baca("docs/legal/kebijakan-refund-v1.md"), /^Berlaku sejak: 5 November 2026\s*$/m);
    assert.match(baca("docs/legal/kebijakan-refund-v1.md"), /^Versi: v1\s*$/m);
  });

  it("bagian Privasi: isi sama dengan sebelumnya (10 bagian bernomor), tanpa penanda draf", () => {
    for (let i = 1; i <= 10; i++) assert.match(halaman, new RegExp(`<h3 className=\\{h3Class\\}>${i}\\. `));
    assert.ok(halaman.includes("Data yang dikirim ke layanan kecerdasan buatan tidak memuat nama"));
    for (const berkas of ["app/kebijakan/page.tsx", "lib/shared/kebijakan.ts", "docs/legal/kebijakan-privasi-v1.md", "docs/legal/kebijakan-refund-v1.md"]) {
      assert.ok(!/\[PERIKSA-KODE\]|\[TANGGAL BERLAKU\]/.test(baca(berkas)), `${berkas} masih memuat penanda draf`);
    }
  });

  it("bagian Refund: 7 poin, dirender dari lib/shared/kebijakan.ts", () => {
    assert.equal(KEBIJAKAN_REFUND.length, 7);
    KEBIJAKAN_REFUND.forEach((p, i) => assert.ok(p.judul.startsWith(`${i + 1}. `)));
    assert.match(halaman, /KEBIJAKAN_REFUND\.map/);
  });

  it("teks Refund yang kritis: poin 5 (24 jam), poin 6 (2 hari), biaya transaksi, contoh hitungan, pengajuan", () => {
    const poin5 = KEBIJAKAN_REFUND[4];
    assert.equal(poin5.judul, "5. Yang tidak dikembalikan");
    assert.ok((poin5.butir ?? []).join(" ").includes("paling lambat 24 jam sebelum sesi dimulai"));
    const poin6 = KEBIJAKAN_REFUND[5];
    assert.ok((poin6.paragraf ?? []).join(" ").includes("paling lambat 2 hari sebelum sesi dimulai"));
    assert.ok(TEKS_REFUND.includes("Rp2.775 per transaksi"));
    assert.ok(TEKS_REFUND.includes("Sisa 7 sesi × Rp100.000 = Rp700.000, dikurangi Rp2.775 = Rp697.225 dikembalikan."));
    assert.ok(TEKS_REFUND.includes("paling lambat 14 hari kerja setelah disetujui"));
    assert.ok(TEKS_REFUND.includes("info.dimentoring@gmail.com"));
  });

  it("dokumen sumber docs/legal/kebijakan-refund-v1.md memuat kalimat kritis yang sama", () => {
    const dok = baca("docs/legal/kebijakan-refund-v1.md");
    assert.ok(dok.includes("paling lambat 24 jam sebelum sesi dimulai"));
    assert.ok(dok.includes("paling lambat 2 hari sebelum sesi dimulai"));
  });
});

describe("redirect alamat lama", () => {
  it("/kebijakan-privasi → /kebijakan#privasi dan /kebijakan-refund → /kebijakan#refund, permanen (308)", async () => {
    assert.equal(typeof nextConfig.redirects, "function");
    const aturan = await nextConfig.redirects!();
    assert.deepEqual(
      aturan.map((r) => [r.source, r.destination, "permanent" in r ? r.permanent : undefined]),
      [
        ["/kebijakan-privasi", "/kebijakan#privasi", true],
        ["/kebijakan-refund", "/kebijakan#refund", true],
      ],
    );
  });

  it("konstanta tautan menunjuk ke bagian yang benar", () => {
    assert.equal(HREF_KEBIJAKAN_PRIVASI, "/kebijakan#privasi");
    assert.equal(HREF_KEBIJAKAN_REFUND, "/kebijakan#refund");
  });
});

describe("tautan internal", () => {
  it("tidak ada tautan tersisa ke /kebijakan-privasi atau /kebijakan-refund di kode (selain redirect & komentar)", () => {
    const sisa: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of semuaFile(dir)) {
        const kode = baca(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        if (/\/kebijakan-(privasi|refund)/.test(kode)) sisa.push(file);
      }
    }
    assert.deepEqual(sisa, []);
  });

  it("form daftar, Lead Capture, dan Pengaturan memakai /kebijakan#privasi", () => {
    for (const file of ["app/(auth)/daftar/page.tsx", "app/assessment/hasil/[id]/LeadCaptureCard.tsx", "components/pengaturan/PengaturanClient.tsx"]) {
      assert.match(baca(file), /href=\{HREF_KEBIJAKAN_PRIVASI\}/, file);
    }
  });

  it('footer memuat tautan "Kebijakan Privasi & Refund" ke /kebijakan', () => {
    const footer = baca("components/sections/Footer.tsx");
    assert.match(footer, /href=\{HREF_KEBIJAKAN\}/);
    assert.match(footer, /Kebijakan Privasi &amp; Refund/);
  });
});

describe("Checkout — ringkasan refund dan persetujuan", () => {
  const form = baca("components/siswa/CheckoutForm.tsx");

  it("menampilkan ringkasan 3 baris sebelum tombol bayar; tautan Refund dibuka di tab baru", () => {
    assert.deepEqual([...RINGKASAN_REFUND_CHECKOUT], [
      "Batal sebelum sesi pertama: dana kembali penuh (dikurangi biaya transaksi).",
      "Setelah kelas berjalan: dana kembali untuk sesi yang belum terpakai.",
    ]);
    assert.match(form, /RINGKASAN_REFUND_CHECKOUT\.map/);
    assert.match(form, /Selengkapnya di/);
    assert.match(form, /href=\{HREF_KEBIJAKAN_REFUND\}\s+target="_blank"\s+rel="noopener noreferrer"/);
    assert.ok(form.indexOf("RINGKASAN_REFUND_CHECKOUT.map") < form.indexOf("Bayar Sekarang"));
  });

  it("kotak centang wajib dengan teks persetujuan dan dua tautan tab baru", () => {
    assert.match(form, /type="checkbox"\s+checked=\{setujuKebijakan\}/);
    assert.match(form, /Saya sudah membaca dan setuju dengan/);
    assert.match(form, /href=\{HREF_KEBIJAKAN_PRIVASI\}\s+target="_blank"\s+rel="noopener noreferrer"/);
    assert.match(form, /dimentoring\.id\./);
  });

  it("tombol bayar nonaktif sampai dicentang, dan handleBayar menolak bila belum dicentang", () => {
    assert.match(form, /disabled=\{\s*isPaying \|\|\s*!setujuKebijakan \|\|/);
    assert.match(form, /if \(!setujuKebijakan\) \{\s+setKebijakanError\(/);
    assert.match(form, /Centang kotak di atas dulu supaya tombol bayar aktif\./);
  });

  it("alur pembayaran tidak berubah: tetap POST /api/payment/create dengan isi yang sama", () => {
    assert.match(form, /fetch\("\/api\/payment\/create"/);
    for (const kunci of ["kelasId", "kodePromo: appliedPromo?.kode", "subtesIds:", "mentorOfflineId:", "lokasiSiswaLat:", "lokasiSiswaLng:", "jadwalPilihan:"]) {
      assert.ok(form.includes(kunci), kunci);
    }
    assert.ok(!/setujuKebijakan[^\n]*JSON\.stringify/.test(form));
    assert.ok(!form.includes("NEXT_PUBLIC_CHECKOUT_INTERNAL_READY"));
  });
});

describe("Mayar, webhook, dan harga tidak tersentuh", () => {
  it("kode pembayaran tidak mengimpor atau menyebut modul kebijakan", () => {
    const berkas = [...semuaFile("lib/payment"), ...semuaFile("app/api/payment")];
    assert.ok(berkas.length > 0);
    for (const file of berkas) {
      assert.ok(!/kebijakan/i.test(baca(file)), `${file} menyebut kebijakan`);
    }
  });

  it("flag NEXT_PUBLIC_CHECKOUT_INTERNAL_READY masih dibaca di tempat aslinya, bukan di file kebijakan", () => {
    const pembaca = ["lib/shared/checkoutGuard.ts"].filter((f) => baca(f).includes("NEXT_PUBLIC_CHECKOUT_INTERNAL_READY"));
    assert.ok(pembaca.length >= 1);
    assert.ok(!baca("lib/shared/kebijakan.ts").includes("CHECKOUT_INTERNAL_READY"));
  });
});
