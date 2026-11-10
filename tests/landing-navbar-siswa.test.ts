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

  it("bilah atas memuat AccountMenu (mobileBar), Daftar/Login, dan hamburger", () => {
    assert.ok(menuHamburger, "menu hamburger (#navbar-mobile-menu) harus ada");
    assert.match(bilahAtas, /<AccountMenu[\s\S]*?mobileBar/);
    assert.match(bilahAtas, /Daftar/);
    assert.match(bilahAtas, /Login/);
    assert.match(bilahAtas, /aria-label=\{isMenuOpen \? "Tutup menu" : "Buka menu"\}/);
  });

  it("menu hamburger hanya berisi link navigasi (tanpa AccountMenu/Daftar/Login)", () => {
    assert.doesNotMatch(menuHamburger, /<AccountMenu/);
    assert.doesNotMatch(menuHamburger, /<Button/);
  });
});
