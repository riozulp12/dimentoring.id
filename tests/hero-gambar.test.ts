/**
 * Test gambar hero landing page: komponen Hero DIRENDER sungguhan (proses terpisah — react-dom/server menolak
 * kondisi "react-server" runner tes; pola sama dengan tests/badge-kapasitas.test.ts) dan markup <img>-nya
 * diperiksa: alt deskriptif tidak kosong, priority (preload, bukan lazy), memakai dua WebP yang sudah
 * dioptimasi (bukan PNG berat), rasio 854x985. Berkas WebP yang dirujuk harus ada, ukurannya di bawah batas,
 * dan sumber PNG 6 MB tidak boleh ada di public/.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";

const BATAS_1X = 250 * 1024;
const BATAS_2X = 600 * 1024;

function renderHero(): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("./components/sections/Hero.tsx");
    const Hero = typeof mod.default === "function" ? mod.default : mod.default.default;
    const ctxMod = await import("next/dist/shared/lib/app-router-context.shared-runtime");
    const { AppRouterContext } = ctxMod.default ?? ctxMod;
    // Hero memakai useRouter (tombol CTA): beri router tiruan supaya bisa dirender di luar aplikasi.
    const routerTiruan = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };
    process.stdout.write(
      renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: routerTiruan }, React.createElement(Hero))),
    );
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

/** <img> ilustrasi hero = satu-satunya <img> dengan src ke hero-*.webp. */
function imgHero(html: string): string {
  const semua = html.match(/<img\b[^>]*>/g) ?? [];
  const hero = semua.filter((tag) => /hero-(854|1708)\.webp/.test(tag));
  assert.equal(hero.length, 1, "tepat satu gambar ilustrasi hero");
  return hero[0];
}

describe("Hero — gambar ilustrasi (next/image)", () => {
  const html = renderHero();
  const img = imgHero(html);

  it("alt deskriptif Bahasa Indonesia, tidak kosong", () => {
    const alt = img.match(/\balt="([^"]*)"/)?.[1] ?? "";
    assert.ok(alt.length > 20, `alt: "${alt}"`);
    assert.match(alt, /Maskot Dimentoring menaiki tangga dari Kelas 10, Kelas 11, Kelas 12, hingga Mahasiswa/);
  });

  it("priority: gambar LCP tidak lazy, fetchpriority=high, di-preload, dan prop priority ada di sumber", () => {
    assert.ok(!/loading="lazy"/.test(img), img);
    assert.match(img, /fetchPriority="high"|fetchpriority="high"/);
    assert.match(html, /<link[^>]*rel="preload"[^>]*as="image"|<link[^>]*as="image"[^>]*rel="preload"/);
    assert.match(readFileSync("components/sections/Hero.tsx", "utf8"), /^\s+priority$/m);
  });

  it("memakai dua WebP optimasi (1x 854 dan 2x 1708) — bukan PNG, bukan /_next/image", () => {
    assert.ok(img.includes("/images/hero-854.webp"));
    assert.ok(img.includes("/images/hero-1708.webp"), "srcset 2x memuat berkas 1708");
    assert.ok(!/\.png/.test(img) && !img.includes("/_next/image"));
    assert.ok(!/new-hero/.test(html));
  });

  it("rasio asli 854x985, sizes untuk desktop & HP, dan lebar HP dibatasi", () => {
    assert.match(img, /width="854"/);
    assert.match(img, /height="985"/);
    assert.match(img, /sizes="\(min-width: 1024px\) calc\(\(100vw - 224px\) \/ 2\), \(min-width: 768px\) 620px, \(min-width: 640px\) 480px, 230px"/);
    assert.ok(img.includes("max-w-[230px]"), "HP: gambar dibatasi 230px lebar (~265px tinggi)");
    assert.ok(img.includes("h-auto") && img.includes("w-full"));
  });

  it("gambar ada SETELAH teks/CTA di DOM (di HP tidak mendorong headline & tombol keluar layar)", () => {
    // Posisi tag <img> (bukan <link rel=preload> yang ada di awal markup).
    const posisiImg = html.indexOf(img);
    assert.ok(posisiImg > 0);
    assert.ok(html.indexOf("Cek Peluang Masuk PTN mu") < posisiImg);
    assert.ok(html.indexOf("<h1") < posisiImg);
  });

  it("copy headline & CTA tidak berubah", () => {
    assert.ok(html.includes("Cek Peluang Masuk PTN mu"));
    assert.ok(html.includes("Lihat Program"));
    assert.ok(html.includes("#BertumbuhBersama"));
  });
});

describe("berkas gambar hero", () => {
  it("hero-854.webp ada dan <= 250 KB; hero-1708.webp ada dan <= 600 KB", () => {
    assert.ok(existsSync("public/images/hero-854.webp"));
    assert.ok(existsSync("public/images/hero-1708.webp"));
    assert.ok(statSync("public/images/hero-854.webp").size <= BATAS_1X);
    assert.ok(statSync("public/images/hero-1708.webp").size <= BATAS_2X);
  });

  it("keduanya WebP sungguhan (RIFF....WEBP) dengan kanal alpha (VP8X/VP8L/ALPH)", () => {
    for (const berkas of ["public/images/hero-854.webp", "public/images/hero-1708.webp"]) {
      const kepala = readFileSync(berkas).subarray(0, 32);
      assert.equal(kepala.subarray(0, 4).toString("ascii"), "RIFF", berkas);
      assert.equal(kepala.subarray(8, 12).toString("ascii"), "WEBP", berkas);
      assert.equal(kepala.subarray(12, 16).toString("ascii"), "VP8X", `${berkas}: header VP8X (mendukung alpha)`);
      assert.ok((kepala[20] & 0x10) !== 0, `${berkas}: flag alpha menyala`);
    }
  });

  it("sumber PNG berat tidak ada di public/ (tidak ikut ter-deploy)", () => {
    const besar = readdirSync("public/images").filter((nama) => /^new-hero/i.test(nama));
    assert.deepEqual(besar, []);
    assert.ok(!existsSync("public/images/new-hero.png"));
  });

  it("sumber mentah di design/hero/ di-ignore git", () => {
    assert.match(readFileSync(".gitignore", "utf8"), /^\/design\/hero\/$/m);
  });
});
