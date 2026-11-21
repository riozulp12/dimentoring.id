/**
 * Kebijakan Privasi v2: menyebut Pixel Meta di bagian 2, 3, 6, 7; versi v2;
 * "Berlaku sejak" masih placeholder (diisi saat Pixel benar-benar dinyalakan).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { KEBIJAKAN_PRIVASI_TANGGAL_BERLAKU, KEBIJAKAN_PRIVASI_VERSI } from "../lib/shared/kebijakan";

const halaman = readFileSync("app/kebijakan/page.tsx", "utf8");

describe("kebijakan privasi v2 (Meta Pixel)", () => {
  it('halaman memuat "Meta", "_fbp"; versi v2', () => {
    assert.match(halaman, /Meta/);
    assert.match(halaman, /_fbp/);
    assert.equal(KEBIJAKAN_PRIVASI_VERSI, "v2");
  });

  it("Pixel Meta disebut di bagian 2, 3, 6, dan 7", () => {
    const potong = (dari: string, sampai: string) =>
      halaman.slice(halaman.indexOf(dari), halaman.indexOf(sampai));
    assert.match(potong("2. Data yang kami kumpulkan", "3. Untuk apa"), /Pixel Meta/);
    assert.match(potong("3. Untuk apa", "4. Dasar"), /Facebook dan Instagram/);
    assert.match(potong("6. Dengan siapa", "7. Cookie"), /Meta Platforms/);
    assert.match(potong("7. Cookie", "8. Penyimpanan"), /_fbp[\s\S]*90 hari/);
  });

  it('"Berlaku sejak" masih placeholder, tidak ada tanggal karangan', () => {
    assert.equal(KEBIJAKAN_PRIVASI_TANGGAL_BERLAKU, "[ISI TANGGAL PIXEL DINYALAKAN]");
  });

  it("tidak mengklaim hal yang tak dilakukan kode: tidak ada nama/email/WA ke Pixel", () => {
    const kode = readFileSync("lib/analytics/metaPixel.ts", "utf8") + readFileSync("components/analytics/MetaPixel.tsx", "utf8");
    // Hanya baris pemanggilan fbq (komentar boleh menyebut kata itu).
    const panggilan = kode.split("\n").filter((b) => /fbq\(/.test(b)).join("\n");
    assert.ok(panggilan.length > 0);
    assert.doesNotMatch(panggilan, /\bem\b|\bph\b|\bfn\b|email|telepon|whatsapp|userId|user_id|nama/i);
  });
});
