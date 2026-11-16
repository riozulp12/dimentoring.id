/**
 * Test kartu/baris Dashboard Mentor & Siswa yang bisa diklik: helper URL (lib/shared/dashboardLinks.ts),
 * komponen BarisKlik (link sungguhan vs bukan link), dan pemeriksaan sumber bahwa komponen dashboard
 * memakai helper (tidak menyebar string URL) dan tidak memasukkan nama siswa / enrollmentId ke URL.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  HREF_KELAS_SAYA_MENTOR,
  HREF_KELAS_SISWA,
  HREF_REFERRAL_SISWA,
  HREF_SISWA_BINAAN,
  hrefEvent,
  hrefKelasMentor,
  hrefKelasSiswa,
} from "@/lib/shared/dashboardLinks";

const ID = "3f2b8c1e-9a47-4d6b-8e21-5c7a0d9b1f34";
const baca = (path: string) => readFileSync(path, "utf8");

/** Render sungguhan di proses terpisah (react-dom/server menolak kondisi "react-server" runner tes) — pola sama dengan tests/badge-kapasitas.test.ts. */
function renderBaris(props: { href: string | null | undefined }, isi: string): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("./components/dashboard/BarisKlik.tsx");
    const { href, isi } = JSON.parse(process.argv[1]);
    process.stdout.write(renderToStaticMarkup(React.createElement(typeof mod.default === "function" ? mod.default : mod.default.default, { href: href ?? undefined }, isi)));
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify({ href: props.href ?? null, isi })], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

describe("helper URL tujuan dashboard", () => {
  it("menghasilkan tujuan yang benar untuk id yang valid", () => {
    assert.equal(hrefKelasMentor(ID), `/kelas-saya/${ID}`);
    assert.equal(hrefKelasSiswa(ID), `/kelas/${ID}`);
    assert.equal(hrefEvent(ID), `/beasiswa-event/${ID}`);
  });

  it("tujuan daftar (kartu angka) menunjuk halaman yang sudah ada", () => {
    assert.equal(HREF_KELAS_SAYA_MENTOR, "/kelas-saya");
    assert.equal(HREF_SISWA_BINAAN, "/siswa-binaan");
    assert.equal(HREF_KELAS_SISWA, "/kelas");
    assert.equal(HREF_REFERRAL_SISWA, "/referral");
  });

  it("id kosong / bukan UUID -> null (tidak jadi link), termasuk upaya menyisipkan path", () => {
    for (const buruk of [null, undefined, "", "abc", "../admin", `${ID}/../x`, `${ID}?x=1`, "Budi Santoso", "javascript:alert(1)"]) {
      assert.equal(hrefKelasMentor(buruk), null, String(buruk));
      assert.equal(hrefKelasSiswa(buruk), null, String(buruk));
      assert.equal(hrefEvent(buruk), null, String(buruk));
    }
  });

  it("URL hanya memuat id kelas/konten — tidak ada nama siswa, userId, atau enrollmentId", () => {
    const url = hrefKelasMentor(ID)!;
    assert.equal(url, `/kelas-saya/${ID}`);
    assert.ok(!/siswa|enrollment|user/i.test(url));
  });
});

describe("BarisKlik", () => {
  it("dengan tujuan: dirender sebagai <a href> sungguhan (bisa tab baru & fokus keyboard)", () => {
    const html = renderBaris({ href: `/kelas-saya/${ID}` }, "Matematika");
    assert.match(html, /^<a /);
    assert.ok(html.includes(`href="/kelas-saya/${ID}"`));
    assert.ok(html.includes("cursor-pointer"));
    assert.ok(html.includes("hover:bg-"));
    assert.ok(html.includes("focus-visible:outline"));
    assert.ok(!html.includes("onclick"));
  });

  it("tanpa tujuan (null/undefined/kosong): BUKAN link", () => {
    for (const href of [null, undefined, ""]) {
      const html = renderBaris({ href }, "Tanpa tujuan");
      assert.ok(!html.includes("<a "), String(href));
      assert.ok(!html.includes("href="), String(href));
      assert.ok(!html.includes("cursor-pointer"), String(href));
      assert.ok(html.includes("Tanpa tujuan"));
    }
  });
});

describe("komponen dashboard memakai helper, bukan string URL tersebar", () => {
  const mentor = baca("components/dashboard/MentorDashboardOverview.tsx");
  const siswa = baca("components/dashboard/DashboardOverview.tsx");

  it("dashboard mentor: tiga section + dua kartu angka memakai helper", () => {
    assert.ok(mentor.includes("hrefKelasMentor(kelas.kelasId)"), "Progress Siswa Binaan -> halaman kelas");
    assert.ok(mentor.includes("hrefKelasMentor(k.id)"), "Kelas Terdaftar");
    assert.ok(mentor.includes("hrefEvent(b.id)"), "Info Beasiswa & Event");
    assert.ok(mentor.includes("href={HREF_KELAS_SAYA_MENTOR}"));
    assert.ok(mentor.includes("href={HREF_SISWA_BINAAN}"));
  });

  it("dashboard mentor: baris siswa menuju halaman KELAS, tidak membawa userId/nama siswa", () => {
    assert.ok(!/href=\{[^}]*\bs\.(userId|nama)/.test(mentor));
    assert.ok(!/href=\{`[^`]*\$\{[^}]*(userId|enrollment|nama)/i.test(mentor));
  });

  it("dashboard siswa: kelas, progres, event, dan kartu angka memakai helper", () => {
    assert.ok(siswa.includes("hrefKelasSiswa(item.kelasId)"), "Progress Belajar");
    assert.ok(siswa.includes("hrefKelasSiswa(k.kelasId)"), "Kelas Terdaftar");
    assert.ok(siswa.includes("hrefEvent(b.kontenId)"), "Info Beasiswa & Event");
    assert.ok(siswa.includes("href={HREF_KELAS_SISWA}"));
    assert.ok(siswa.includes("href={HREF_REFERRAL_SISWA}"));
  });

  it("tidak ada router.push / onClick untuk navigasi, dan tidak ada URL tertulis langsung di baris", () => {
    for (const sumber of [mentor, siswa]) {
      assert.ok(!sumber.includes("router.push"));
      assert.ok(!/onClick\s*=/.test(sumber));
      assert.ok(!/href=["`']\/(kelas-saya|kelas|beasiswa-event)\//.test(sumber));
    }
  });

  it("data siswa membawa id kelas & id konten (untuk helper)", () => {
    const data = baca("lib/dashboard/getSiswaDashboardData.ts");
    assert.ok(data.includes("kelas_id, status_pembayaran"));
    assert.ok(data.includes("kelasId: r.kelas_id"));
    assert.ok(data.includes("kontenId: item.id"));
  });
});
