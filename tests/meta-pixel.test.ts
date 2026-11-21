/**
 * Meta Pixel: ID dari env (kosong = mati), halaman privat tidak dilacak,
 * Lead hanya membawa kategori umum, wiring di layout/detail/kebijakan.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import {
  isPathTrackable,
  parseMetaPixelId,
  trackLead,
  trackPageView,
} from "../lib/analytics/metaPixel";

type G = { window?: { fbq?: (...a: unknown[]) => void } };
const g = globalThis as unknown as G;
afterEach(() => {
  delete g.window;
});

describe("parseMetaPixelId", () => {
  it("kosong / undefined / bukan angka = null (Pixel mati)", () => {
    for (const v of [undefined, "", "  ", "abc", "123 456", "12'); alert(1);//"]) {
      assert.equal(parseMetaPixelId(v), null, JSON.stringify(v));
    }
  });
  it("ID angka valid dipakai (di-trim)", () => {
    assert.equal(parseMetaPixelId(" 1234567890123456 "), "1234567890123456");
  });
});

describe("isPathTrackable", () => {
  it("halaman publik dilacak", () => {
    for (const p of ["/", "/beasiswa-event", "/beasiswa-event/abc", "/program/x", "/tryout", "/kebijakan", "/assessment", "/leaderboard", "/kelas/abc"]) {
      assert.equal(isPathTrackable(p), true, p);
    }
  });
  it("halaman privat/auth/API tidak dilacak", () => {
    for (const p of ["/dashboard/siswa", "/profil", "/checkout/abc", "/payment-status/1", "/siswa-binaan/uuid", "/approval-mentor/uuid", "/login", "/daftar", "/reset-password", "/api/x", "/r/KODE"]) {
      assert.equal(isPathTrackable(p), false, p);
    }
  });
});

describe("track*", () => {
  it("PageView hanya untuk path publik; tanpa parameter", () => {
    const calls: unknown[][] = [];
    g.window = { fbq: (...a) => calls.push(a) };
    trackPageView("/beasiswa-event");
    trackPageView("/dashboard/siswa");
    assert.deepEqual(calls, [["track", "PageView"]]);
  });
  it("Lead hanya membawa content_category; tanpa fbq tidak error", () => {
    const calls: unknown[][] = [];
    g.window = { fbq: (...a) => calls.push(a) };
    trackLead({ kategori: "beasiswa" });
    trackLead();
    assert.deepEqual(calls, [["track", "Lead", { content_category: "beasiswa" }], ["track", "Lead"]]);
    delete g.window;
    assert.doesNotThrow(() => trackLead());
    assert.doesNotThrow(() => trackPageView("/"));
  });
});

describe("wiring statis", () => {
  const baca = (p: string) => readFileSync(p, "utf8");
  it("root layout memasang <MetaPixel />; komponen pakai next/script & env, tanpa ID hardcode / data user", () => {
    assert.match(baca("app/layout.tsx"), /<MetaPixel \/>/);
    const c = baca("components/analytics/MetaPixel.tsx");
    assert.match(c, /next\/script/);
    assert.match(c, /getMetaPixelId/);
    assert.doesNotMatch(c, /\b\d{15,16}\b/);
    assert.doesNotMatch(c, /email|nama|telepon|userId|user_id/i);
  });
  it("detail beasiswa-event: tombol daftar memakai DaftarLeadLink (Lead)", () => {
    assert.match(baca("app/beasiswa-event/[id]/page.tsx"), /<DaftarLeadLink/);
    assert.match(baca("components/beasiswa-event/DaftarLeadLink.tsx"), /trackLead/);
  });
  it("kebijakan menyebut Meta Pixel", () => {
    assert.match(baca("app/kebijakan/page.tsx"), /Meta Pixel/);
  });
});
