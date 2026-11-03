/**
 * Log galat AI yang aman (Generate Deskripsi Kelas): status + pesan penyedia
 * tercatat, tapi API key & isi prompt tidak pernah ikut.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ringkasGalatAi, ringkasResponsKosong } from "../lib/ai/logGalatAi";
import { generateKelasDeskripsi } from "../lib/ai/generateKelasDeskripsi";

const KUNCI_PALSU = "AIzaSyFAKE_KEY_UNTUK_TES_1234567890abcd";

class GalatApiPalsu extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

describe("ringkasGalatAi", () => {
  it("memuat jenis, status HTTP, kode Gemini, dan pesan", () => {
    const g = new GalatApiPalsu(
      503,
      '{"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}',
    );
    const r = ringkasGalatAi(g, KUNCI_PALSU);
    assert.match(r, /jenis=ApiError/);
    assert.match(r, /http=503/);
    assert.match(r, /gemini=UNAVAILABLE/);
    assert.match(r, /overloaded/);
  });

  it("tidak pernah memuat API key (persis maupun berpola AIza...)", () => {
    const lain = "AIzaSyLAIN_YANG_TIDAK_DIKENAL_0123456789";
    const g = new GalatApiPalsu(400, `API key not valid: ${KUNCI_PALSU} dan ${lain}`);
    const r = ringkasGalatAi(g, KUNCI_PALSU);
    assert.ok(!r.includes(KUNCI_PALSU));
    assert.ok(!r.includes(lain));
  });

  it("galat timeout (AbortError) tetap terbaca jenisnya", () => {
    const g = new Error("This operation was aborted");
    g.name = "AbortError";
    const r = ringkasGalatAi(g, KUNCI_PALSU);
    assert.match(r, /jenis=AbortError/);
    assert.ok(!r.includes("http="));
  });

  it("nilai aneh (bukan Error) tidak melempar", () => {
    assert.doesNotThrow(() => ringkasGalatAi(undefined));
    assert.doesNotThrow(() => ringkasGalatAi("teks"));
    assert.doesNotThrow(() => ringkasGalatAi(null));
  });
});

describe("ringkasResponsKosong", () => {
  it("mencatat alasan blokir/berhenti tanpa isi teks", () => {
    const r = ringkasResponsKosong({ promptFeedback: { blockReason: "SAFETY" }, candidates: [{ finishReason: "STOP" }] });
    assert.equal(r, "blockReason=SAFETY finishReason=STOP jumlahKandidat=1");
    assert.equal(ringkasResponsKosong({}), "blockReason=- finishReason=- jumlahKandidat=0");
  });
});

describe("generateKelasDeskripsi: jejak log saat gagal", () => {
  const input = {
    namaKelas: "RAHASIA-NAMA-KELAS-UJI",
    programKategoriLabel: "Persiapan PTN",
    tingkatKelasLabel: "Kelas 12",
    tipeKelasLabel: "Reguler",
  };
  let logs: string[];
  const asli = { error: console.error, fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY };

  beforeEach(() => {
    logs = [];
    console.error = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
  });
  afterEach(() => {
    console.error = asli.error;
    globalThis.fetch = asli.fetch;
    if (asli.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = asli.key;
  });

  it("tanpa GEMINI_API_KEY: null + log menyebut nama env", async () => {
    delete process.env.GEMINI_API_KEY;
    assert.equal(await generateKelasDeskripsi(input), null);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /GEMINI_API_KEY/);
  });

  it("Gemini membalas 503: null + log berisi http/status Gemini, tanpa key & tanpa data kelas", async () => {
    process.env.GEMINI_API_KEY = KUNCI_PALSU;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: { code: 503, message: `overloaded (${KUNCI_PALSU})`, status: "UNAVAILABLE" } }),
        { status: 503, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    assert.equal(await generateKelasDeskripsi(input), null);
    const gabung = logs.join("\n");
    assert.match(gabung, /generateKelasDeskripsi/);
    assert.match(gabung, /http=503/);
    assert.match(gabung, /gemini=UNAVAILABLE/);
    assert.ok(!gabung.includes(KUNCI_PALSU), "API key bocor ke log");
    assert.ok(!gabung.includes("RAHASIA-NAMA-KELAS-UJI"), "isi prompt bocor ke log");
  });
});
