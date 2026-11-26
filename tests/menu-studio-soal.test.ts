/**
 * Menu Admin "Studio Soal": satu item sidebar untuk Bank Soal, Unggah Soal, dan
 * Penugasan, plus tab bersama di ketiga halaman. URL lama tidak berubah.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { itemAktif, sidebarMenus } from "@/components/dashboard/sidebarMenuConfig";

const baca = (rel: string) => readFileSync(rel, "utf8");
const RUTE = ["/bank-soal", "/impor-soal", "/penugasan-studio-soal"];
const itemAdmin = sidebarMenus.admin.flatMap((g) => g.items);
const studio = itemAdmin.filter((i) => i.label === "Studio Soal");

describe("sidebar admin", () => {
  it("hanya satu item Studio Soal, ke Bank Soal, ikon tetap; tiga item lama hilang", () => {
    assert.equal(studio.length, 1);
    assert.deepEqual([studio[0].href, studio[0].icon], ["/bank-soal", "tryout"]);
    for (const label of ["Penugasan Studio Soal", "Unggah Soal", "Bank Soal"]) {
      assert.ok(!itemAdmin.some((i) => i.label === label), label);
    }
    assert.deepEqual(itemAdmin.filter((i) => RUTE.includes(i.href)).map((i) => i.label), ["Studio Soal"]);
  });

  it("aktif di ketiga halaman dan turunannya, tidak di halaman lain", () => {
    for (const p of [...RUTE, "/bank-soal/abc", "/bank-soal/abc/edit"]) assert.equal(itemAktif(p, studio[0]), true, p);
    for (const p of ["/dashboard/admin", "/bank-soal-lain", "/studio-soal", "/pengaturan"]) {
      assert.equal(itemAktif(p, studio[0]), false, p);
    }
  });

  it("item lain tetap aktif hanya di alamatnya sendiri; sidebar memakai aturan yang sama", () => {
    const leads = itemAdmin.find((i) => i.href === "/leads")!;
    assert.deepEqual([itemAktif("/leads", leads), itemAktif("/leads/1", leads), itemAktif("/bank-soal", leads)], [true, true, false]);
    assert.match(baca("components/dashboard/sidebar.tsx"), /active=\{itemAktif\(pathname, item\)\}/);
  });
});

// react-dom/server menolak kondisi "react-server" runner tes: render di proses terpisah.
function renderTab(aktif: string): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("./components/admin/TabStudioSoal.tsx");
    const K = typeof mod.default === "function" ? mod.default : mod.default.default;
    process.stdout.write(renderToStaticMarkup(React.createElement(K, { aktif: process.argv[1] })));
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, aktif], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

describe("tab Studio Soal", () => {
  it("urutan Bank Soal | Unggah Soal | Penugasan; hanya tab halaman ini yang ditandai", () => {
    for (const aktif of RUTE) {
      const html = renderTab(aktif);
      const tautan = [...html.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map((m) => ({
        teks: m[2],
        href: /href="([^"]*)"/.exec(m[1])?.[1],
        aktif: m[1].includes('aria-current="page"'),
      }));
      assert.deepEqual(tautan.map((t) => [t.teks, t.href]), [
        ["Bank Soal", "/bank-soal"],
        ["Unggah Soal", "/impor-soal"],
        ["Penugasan", "/penugasan-studio-soal"],
      ]);
      assert.deepEqual(tautan.filter((t) => t.aktif).map((t) => t.href), [aktif]);
    }
  });

  it("ketiga halaman lama tetap ada, memasang tab, dan guard admin tidak berubah", () => {
    for (const rute of RUTE) {
      const berkas = `app/(protected)/(admin)${rute}/page.tsx`;
      assert.ok(existsSync(berkas), berkas);
      const isi = baca(berkas);
      assert.match(isi, new RegExp(`<TabStudioSoal aktif="${rute}" />`), berkas);
      assert.match(isi, /session\.role !== "admin"/, berkas);
    }
    for (const turunan of ["[id]/page.tsx", "[id]/edit/page.tsx"]) {
      assert.ok(existsSync(`app/(protected)/(admin)/bank-soal/${turunan}`), turunan);
    }
  });
});
