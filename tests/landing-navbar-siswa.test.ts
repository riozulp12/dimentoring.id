/**
 * Test statis landing page: (1) jumlah siswa bukti sosial berasal dari satu
 * konstanta (100+), tidak ada sisa "30+ siswa"; (2) Navbar mobile menaruh aksi
 * akun (Daftar/Login atau lonceng+avatar) di bilah atas samping hamburger,
 * bukan di dalam menu hamburger.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { JUMLAH_SISWA, JUMLAH_SISWA_LABEL } from "../lib/shared/jumlahSiswa";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("jumlah siswa landing page", () => {
  it("konstanta bernilai 100 dengan label '100+'", () => {
    assert.equal(JUMLAH_SISWA, 100);
    assert.equal(JUMLAH_SISWA_LABEL, "100+");
  });

  it("Hero dan Value memakai konstanta, bukan angka 30 tertulis", () => {
    const hero = baca("components/sections/Hero.tsx");
    const value = baca("components/sections/Value.tsx");
    assert.match(hero, /JUMLAH_SISWA_LABEL\} Siswa/);
    assert.match(hero, /Lebih dari \{JUMLAH_SISWA\} siswa telah belajar dengan kami/);
    assert.match(value, /count: JUMLAH_SISWA, label: "Siswa Hebat"/);
    assert.doesNotMatch(hero, /30\+\s*Siswa|Lebih dari 30 siswa/i);
    assert.doesNotMatch(value, /count: 30, label: "Siswa/);
  });

  it("tidak ada '30+ siswa' di metadata layout", () => {
    assert.doesNotMatch(baca("app/layout.tsx"), /30\+?\s*siswa/i);
  });
});

describe("Navbar mobile: aksi di bilah atas", () => {
  const navbar = baca("components/ui/Navbar.tsx");
  const [bilahAtas, menuHamburger] = navbar.split('id="navbar-mobile-menu"');
  // Blok aksi mobile sebelum login = dari komentar "Mobile: SATU tombol Daftar"
  // sampai blok desktop.
  const blokMobileTamu = bilahAtas.slice(
    bilahAtas.indexOf("Mobile: SATU tombol Daftar"),
    bilahAtas.indexOf("Desktop: tidak berubah"),
  );

  it("bilah atas memuat AccountMenu (mobileBar), Daftar, dan hamburger", () => {
    assert.ok(menuHamburger, "menu hamburger (#navbar-mobile-menu) harus ada");
    assert.match(bilahAtas, /<AccountMenu[\s\S]*?mobileBar/);
    assert.match(blokMobileTamu, /Daftar/);
    assert.match(bilahAtas, /aria-label=\{isMenuOpen \? "Tutup menu" : "Buka menu"\}/);
  });

  it("sebelum login: bilah atas mobile hanya SATU tombol (Daftar), tanpa Login", () => {
    assert.ok(blokMobileTamu.length > 0, "blok aksi mobile tamu tidak ditemukan");
    assert.equal((blokMobileTamu.match(/<Button/g) ?? []).length, 1);
    assert.doesNotMatch(blokMobileTamu, />\s*Login\s*</, "teks tombol Login tidak boleh ada di bilah atas mobile");
    assert.doesNotMatch(blokMobileTamu, /onClick=\{handleLoginClick\}/);
    assert.match(blokMobileTamu, /onClick=\{handleRegisterClick\}/);
    assert.match(blokMobileTamu, /min-h-10/);
  });

  it("menu hamburger: Login outline paling atas (sebelum link navigasi) dengan teks 'Sudah punya akun?', hanya untuk tamu", () => {
    assert.match(menuHamburger, /!isLoggedIn \? \(/);
    assert.match(menuHamburger, /Sudah punya akun\?/);
    assert.match(menuHamburger, /variant="secondary"/);
    assert.match(menuHamburger, /handleLoginClick\(\)/);
    assert.ok(
      menuHamburger.indexOf("Sudah punya akun?") < menuHamburger.indexOf("<NavLink"),
      "Login harus di atas link navigasi",
    );
    assert.match(menuHamburger, /Sudah punya akun\?[\s\S]*?Login[\s\S]*?<NavLink/);
    assert.match(menuHamburger, /min-h-10/);
  });

  it("menu hamburger tidak memuat AccountMenu dan tidak ada tombol Daftar", () => {
    assert.doesNotMatch(menuHamburger, /<AccountMenu/);
    assert.doesNotMatch(menuHamburger, /handleRegisterClick|Daftar/);
  });

  it("desktop tidak berubah: Login primary + Daftar secondary tetap di blok lg", () => {
    assert.match(bilahAtas, /hidden lg:flex[\s\S]*?variant="primary" size="md" onClick=\{handleLoginClick\}[\s\S]*?variant="secondary" size="md" onClick=\{handleRegisterClick\}/);
  });
});

describe("Navbar mobile: logo adaptif", () => {
  const navbar = baca("components/ui/Navbar.tsx");

  it("logo lengkap disembunyikan < 340px, varian icon (mark d) hanya tampil < 340px", () => {
    assert.match(navbar, /mark="full"[\s\S]*?max-\[339px\]:hidden/);
    assert.match(navbar, /mark="icon" className="hidden [^"]*max-\[339px\]:block"/);
  });

  it("aria-label link logo tetap", () => {
    assert.match(navbar, /aria-label="Ke landing page"/);
  });
});
