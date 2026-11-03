/**
 * Test notifikasi Mentor "siswa baru": email (Resend) + WhatsApp (Fonnte).
 * Resend dan Fonnte TIRUAN, Supabase TIRUAN di memori, dan fetch global
 * diblokir — tes ini tidak pernah memanggil layanan sungguhan.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import "./helpers/envSupabaseUji";
import { NextRequest } from "next/server";
import { bersihkanGalat, samarkanEmail, samarkanNomor } from "@/lib/notifikasi/logAman";
import { batasHarianWa, waNotifAktif } from "@/lib/notifikasi/wa/config";
import { buatPesanWaSiswaBaru } from "@/lib/notifikasi/wa/pesan";
import { buatPenyediaFonnte } from "@/lib/notifikasi/wa/fonnte";
import { kirimNotifWa, type DepsNotifWa, type InputNotifWa } from "@/lib/notifikasi/wa/kirimNotifWa";
import type { BarisLogWa, LogWaStore, PenyediaWa, StatusLogWa } from "@/lib/notifikasi/wa/types";
import {
  buatHtmlSiswaBaru,
  buatPengirim,
  buatSubjekSiswaBaru,
  buatTeksSiswaBaru,
  escapeHtml,
  kirimEmailMentorSiswaBaru,
  type KirimEmailMentorSiswaBaruInput,
} from "@/lib/email/kirimEmailMentorSiswaBaru";
import {
  kabariMentorSiswaBaru,
  kunciKejadianSiswaBaru,
  resetPenjagaEmailUntukTes,
  type DepsSiswaBaru,
  type KejadianSiswaBaru,
} from "@/lib/notifikasi/siswaBaru";
import { jalankanSetelahRespons } from "@/lib/notifikasi/setelahRespons";
import { getPenyediaWa } from "@/lib/notifikasi/wa";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const TOKEN = "TOKEN-RAHASIA-FONNTE-123";
const API_KEY = "re_KUNCI_RAHASIA_456";
const NO_SISWA = "6281999000111";
const EMAIL_SISWA = "siswa.rahasia@contoh.id";

// ---------------------------------------------------------------------------
// Alat bantu tes
// ---------------------------------------------------------------------------

function tangkapLog() {
  const baris: string[] = [];
  const asli = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const tangkap = (...args: unknown[]) => {
    baris.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  console.log = console.info = console.warn = console.error = tangkap;
  return {
    baris,
    pulihkan() {
      Object.assign(console, asli);
    },
  };
}

async function denganLog<T>(fn: () => Promise<T>): Promise<{ hasil: T; log: string[] }> {
  const t = tangkapLog();
  try {
    return { hasil: await fn(), log: t.baris };
  } finally {
    t.pulihkan();
  }
}

function logStoreTiruan(awal: { terpakai?: number; tabelAda?: boolean } = {}) {
  const baris = new Map<string, { status: StatusLogWa; error?: string | null; ref?: string | null; user_id: string }>();
  const store: LogWaStore & { baris: typeof baris; klaimDipanggil: number } = {
    baris,
    klaimDipanggil: 0,
    async klaim(b: BarisLogWa) {
      store.klaimDipanggil++;
      if (awal.tabelAda === false) return "tabel_tidak_ada";
      if (baris.has(b.kunci_kejadian)) return "duplikat";
      baris.set(b.kunci_kejadian, { status: b.status, error: b.error, user_id: b.user_id });
      return "dibuat";
    },
    async perbarui(kunci, p) {
      const ada = baris.get(kunci);
      if (ada) baris.set(kunci, { ...ada, status: p.status, ref: p.provider_ref, error: p.error });
    },
    async hitungSejak() {
      if (awal.tabelAda === false) return null;
      const dariLog = Array.from(baris.values()).filter((b) => b.status === "pending" || b.status === "terkirim").length;
      return (awal.terpakai ?? 0) + dariLog;
    },
  };
  return store;
}

function penyediaTiruan(hasil: { ok: true; ref: string | null } | { ok: false; error: string } = { ok: true, ref: "msg-1" }) {
  const panggilan: Array<{ target: string; pesan: string }> = [];
  let sedangJalan = 0;
  let puncak = 0;
  const penyedia: PenyediaWa & { panggilan: typeof panggilan; puncakBersamaan: () => number } = {
    nama: "tiruan",
    panggilan,
    puncakBersamaan: () => puncak,
    async kirim(target, pesan) {
      sedangJalan++;
      puncak = Math.max(puncak, sedangJalan);
      panggilan.push({ target, pesan });
      await new Promise((r) => setTimeout(r, 1));
      sedangJalan--;
      return hasil;
    },
  };
  return penyedia;
}

const ENV_NYALA = { WA_NOTIF_ENABLED: "true", FONNTE_TOKEN: TOKEN } as const;

function inputWa(ganti: Partial<InputNotifWa> = {}): InputNotifWa {
  return {
    kunciKejadian: "siswa_baru:pay-1:mentor-1",
    jenis: "siswa_baru",
    userId: "mentor-1",
    noWa: "081234567890",
    setuju: true,
    pesan: buatPesanWaSiswaBaru("Rina", "Intensif UTBK"),
    ...ganti,
  };
}

function depsWa(ganti: Partial<DepsNotifWa> & { penyedia?: PenyediaWa | null } = {}): DepsNotifWa {
  const { penyedia, ...sisa } = ganti;
  return {
    env: ENV_NYALA,
    ambilPenyedia: () => (penyedia === undefined ? penyediaTiruan() : penyedia),
    store: logStoreTiruan(),
    ...sisa,
  };
}

// ---------------------------------------------------------------------------
// Supabase tiruan generik (dipakai integrasi notify + route Pengaturan)
// ---------------------------------------------------------------------------

interface Panggilan {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  cols?: string;
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
}
type Handler = (p: Panggilan) => { data?: unknown; error?: { code?: string; message?: string } | null; count?: number };

let handler: Handler = () => ({ data: [], error: null });
let semuaPanggilan: Panggilan[] = [];

function fakeFrom(table: string) {
  const p: Panggilan = { table, op: "select", filters: [] };
  const jalankan = () => {
    semuaPanggilan.push(p);
    return handler(p);
  };
  const b: Record<string, unknown> = {
    select(cols?: string) {
      p.cols = cols;
      return b;
    },
    insert(payload: unknown) {
      p.op = "insert";
      p.payload = payload;
      return b;
    },
    update(payload: unknown) {
      p.op = "update";
      p.payload = payload;
      return b;
    },
    upsert(payload: unknown) {
      p.op = "upsert";
      p.payload = payload;
      return b;
    },
    eq(c: string, v: unknown) {
      p.filters.push([c, "eq", v]);
      return b;
    },
    in(c: string, v: unknown) {
      p.filters.push([c, "in", v]);
      return b;
    },
    maybeSingle: () => Promise.resolve(jalankan()),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(jalankan()).then(res, rej),
  };
  return b;
}

let fetchDipanggil = 0;
const fetchAsli = globalThis.fetch;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  // Blokir jaringan: kalau ada kode yang mencoba memanggil layanan sungguhan, tes gagal.
  globalThis.fetch = (async () => {
    fetchDipanggil++;
    throw new Error("jaringan diblokir di tes");
  }) as typeof fetch;
  const { supabaseServer } = await import("@/lib/supabase/server");
  Object.assign(supabaseServer as unknown as Record<string, unknown>, { from: fakeFrom });
});

after(() => {
  globalThis.fetch = fetchAsli;
});

beforeEach(() => {
  handler = () => ({ data: [], error: null });
  semuaPanggilan = [];
  fetchDipanggil = 0;
  resetPenjagaEmailUntukTes();
});

// ---------------------------------------------------------------------------
// Log aman
// ---------------------------------------------------------------------------

describe("log aman: penyamaran", () => {
  it("email dan nomor disamarkan", () => {
    assert.equal(samarkanEmail("rio.zulfa@gmail.com"), "r***@gmail.com");
    assert.equal(samarkanNomor("6281234567890"), "6281****890");
    assert.equal(samarkanNomor("123"), "***");
  });

  it("bersihkanGalat membuang rahasia, email, dan nomor, lalu memotong", () => {
    const teks = bersihkanGalat(`token ${TOKEN} salah untuk a@b.com / 6281234567890 ${"x".repeat(500)}`, [TOKEN]);
    assert.ok(!teks.includes(TOKEN));
    assert.ok(!teks.includes("a@b.com"));
    assert.ok(!teks.includes("6281234567890"));
    assert.ok(teks.length <= 160);
  });
});

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function inputEmail(ganti: Partial<KirimEmailMentorSiswaBaruInput> = {}): KirimEmailMentorSiswaBaruInput {
  return {
    email: "rina.mentor@contoh.id",
    namaMentor: "Rina",
    namaSiswa: "Budi Santoso",
    kelasId: "kelas-1",
    kelasNama: "Intensif UTBK",
    jadwalDisplay: "Senin 16.00",
    ...ganti,
  };
}

function resendTiruan(perilaku: "ok" | "ditolak" | "lempar" = "ok") {
  const terkirim: Array<Record<string, unknown>> = [];
  return {
    terkirim,
    buatKlien: () => ({
      emails: {
        async send(payload: Record<string, unknown>) {
          terkirim.push(payload);
          if (perilaku === "lempar") throw new Error(`koneksi putus ${API_KEY} rina.mentor@contoh.id`);
          if (perilaku === "ditolak") return { data: null, error: { name: "validation_error", message: `kunci ${API_KEY} ditolak` } };
          return { data: { id: "email-1" }, error: null };
        },
      },
    }),
  };
}

describe("email: isi, pengirim, dan keamanan", () => {
  it("subjek 'Ada siswa baru di kelas [nama kelas]'; isi memuat nama siswa, kelas, jadwal, tautan, dan kalimat penerimaan di web", async () => {
    const r = resendTiruan();
    const { hasil } = await denganLog(() => kirimEmailMentorSiswaBaru(inputEmail(), { env: { RESEND_API_KEY: API_KEY }, buatKlien: r.buatKlien }));
    assert.deepEqual(hasil, { success: true });
    const kirim = r.terkirim[0];
    assert.equal(kirim.subject, "Ada siswa baru di kelas Intensif UTBK");
    for (const bagian of ["html", "text"] as const) {
      const isi = String(kirim[bagian]);
      assert.ok(isi.includes("Budi Santoso"), bagian);
      assert.ok(isi.includes("Intensif UTBK"), bagian);
      assert.ok(isi.includes("Senin 16.00"), bagian);
      assert.ok(isi.includes("https://dimentoring.id/kelas-saya/kelas-1"), bagian);
      assert.match(isi, /Penerimaan siswa dilakukan di web/);
    }
    assert.deepEqual(kirim.to, ["rina.mentor@contoh.id"]);
  });

  it("jadwal kosong: baris Jadwal tidak ditampilkan", () => {
    const isi = { namaMentor: "Rina", namaSiswa: "Budi", kelasNama: "Kelas A", jadwalDisplay: null, tautan: "https://dimentoring.id/kelas-saya/k" };
    assert.ok(!buatHtmlSiswaBaru(isi).includes("Jadwal"));
    assert.ok(!buatTeksSiswaBaru(isi).includes("Jadwal"));
  });

  it("email TIDAK memuat nomor WA / email siswa (tidak pernah masuk ke masukan)", async () => {
    const r = resendTiruan();
    await denganLog(() => kirimEmailMentorSiswaBaru(inputEmail(), { env: { RESEND_API_KEY: API_KEY }, buatKlien: r.buatKlien }));
    const semua = JSON.stringify(r.terkirim);
    assert.ok(!semua.includes(NO_SISWA));
    assert.ok(!semua.includes(EMAIL_SISWA));
    // bentuk masukan email dikunci: tidak ada field kontak siswa
    assert.deepEqual(Object.keys(inputEmail()).sort(), ["email", "jadwalDisplay", "kelasId", "kelasNama", "namaMentor", "namaSiswa"]);
  });

  it("nama dari pengguna di-escape (tidak ada HTML mentah)", () => {
    const html = buatHtmlSiswaBaru({
      namaMentor: "Rina",
      namaSiswa: '<script>alert("x")</script>',
      kelasNama: "A & B",
      jadwalDisplay: null,
      tautan: "https://dimentoring.id/kelas-saya/k",
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("A &amp; B"));
    assert.equal(escapeHtml(`<>"'&`), "&lt;&gt;&quot;&#39;&amp;");
  });

  it("subjek satu baris walau nama kelas memuat baris baru", () => {
    assert.ok(!/[\r\n]/.test(buatSubjekSiswaBaru("Kelas\r\nBcc: x@y.com")));
  });

  it("pengirim bawaan memakai domain dimentoring.id; bisa diatur env; nilai tak valid jatuh ke bawaan", () => {
    assert.deepEqual(buatPengirim({}), { from: "Dimentoring <notifikasi@dimentoring.id>", replyTo: undefined });
    assert.deepEqual(
      buatPengirim({ EMAIL_FROM_ADDRESS: "info@dimentoring.id", EMAIL_FROM_NAME: "Tim Dimentoring", EMAIL_REPLY_TO: "halo@dimentoring.id" }),
      { from: "Tim Dimentoring <info@dimentoring.id>", replyTo: "halo@dimentoring.id" },
    );
    assert.equal(buatPengirim({ EMAIL_FROM_ADDRESS: "bukan email" }).from, "Dimentoring <notifikasi@dimentoring.id>");
    assert.equal(buatPengirim({ EMAIL_REPLY_TO: "bukan email" }).replyTo, undefined);
  });

  it("tautan memakai APP_BASE_URL bila diatur", async () => {
    const r = resendTiruan();
    await denganLog(() =>
      kirimEmailMentorSiswaBaru(inputEmail(), { env: { RESEND_API_KEY: API_KEY, APP_BASE_URL: "https://staging.dimentoring.id/" }, buatKlien: r.buatKlien }),
    );
    assert.ok(String(r.terkirim[0].text).includes("https://staging.dimentoring.id/kelas-saya/kelas-1"));
  });

  it("RESEND_API_KEY kosong: satu peringatan, lanjut tanpa error, Resend tidak dipanggil", async () => {
    const r = resendTiruan();
    const { hasil, log } = await denganLog(() => kirimEmailMentorSiswaBaru(inputEmail(), { env: {}, buatKlien: r.buatKlien }));
    assert.deepEqual(hasil, { success: false, error: "belum_dikonfigurasi" });
    assert.equal(r.terkirim.length, 0);
    assert.equal(log.length, 1);
    assert.match(log[0], /RESEND_API_KEY belum diset/);
  });

  it("Resend gagal / menolak: tidak melempar, log tanpa isi pesan, tanpa kunci, dan email disamarkan", async () => {
    for (const perilaku of ["lempar", "ditolak"] as const) {
      const r = resendTiruan(perilaku);
      const { hasil, log } = await denganLog(() => kirimEmailMentorSiswaBaru(inputEmail(), { env: { RESEND_API_KEY: API_KEY }, buatKlien: r.buatKlien }));
      assert.equal(hasil.success, false, perilaku);
      const gabung = log.join("\n");
      assert.ok(!gabung.includes(API_KEY), perilaku);
      assert.ok(!gabung.includes("rina.mentor@contoh.id"), perilaku);
      assert.ok(!gabung.includes("Budi Santoso"), perilaku);
      assert.ok(gabung.includes("r***@contoh.id"), perilaku);
    }
  });
});

// ---------------------------------------------------------------------------
// WhatsApp: bendera, pesan, adaptor Fonnte
// ---------------------------------------------------------------------------

describe("WhatsApp: bendera dan pesan", () => {
  it('hanya persis "true" yang menyalakan', () => {
    assert.equal(waNotifAktif({ WA_NOTIF_ENABLED: "true" }), true);
    for (const nilai of [undefined, "", "TRUE", "True", "1", "yes", " true", "true ", "false"]) {
      assert.equal(waNotifAktif({ WA_NOTIF_ENABLED: nilai }), false, String(nilai));
    }
  });

  it("batas harian bawaan 50, bisa diatur, nilai tak valid kembali ke 50", () => {
    assert.equal(batasHarianWa({}), 50);
    assert.equal(batasHarianWa({ WA_NOTIF_BATAS_HARIAN: "10" }), 10);
    for (const nilai of ["0", "-5", "abc", "1.5", ""]) assert.equal(batasHarianWa({ WA_NOTIF_BATAS_HARIAN: nilai }), 50, nilai);
  });

  it("teks persis sesuai spesifikasi, hanya nama mentor dan nama kelas", () => {
    assert.equal(
      buatPesanWaSiswaBaru("Rina", "Intensif UTBK"),
      "Halo Kak Rina, ada siswa baru di kelas Intensif UTBK. Buka dimentoring.id/kelas-saya untuk melihat dan menerimanya. Terima kasih, tim Dimentoring.",
    );
  });

  it("nama dengan baris baru dijadikan satu baris; pesan memuat tepat satu tautan", () => {
    const pesan = buatPesanWaSiswaBaru("Rina\n\nKlik http://jahat.test", "Kelas\r\nA");
    assert.ok(!/[\r\n]/.test(pesan));
    assert.equal((pesan.match(/dimentoring\.id\//g) ?? []).length, 1);
  });

  it("getPenyediaWa: tanpa token = null; dengan token = fonnte", () => {
    assert.equal(getPenyediaWa({}), null);
    assert.equal(getPenyediaWa({ FONNTE_TOKEN: "  " }), null);
    assert.equal(getPenyediaWa({ FONNTE_TOKEN: TOKEN })?.nama, "fonnte");
  });
});

describe("adaptor Fonnte (fetch tiruan)", () => {
  function fetchTiruan(respons: () => Response | Promise<Response>) {
    const permintaan: Array<{ url: string; init: RequestInit }> = [];
    return {
      permintaan,
      fetchFn: async (url: string, init: RequestInit) => {
        permintaan.push({ url, init });
        return respons();
      },
    };
  }
  const json = (badan: unknown, status = 200) => new Response(JSON.stringify(badan), { status, headers: { "Content-Type": "application/json" } });

  it("POST https://api.fonnte.com/send, token di header Authorization (tanpa Bearer), target dan message string", async () => {
    const f = fetchTiruan(() => json({ status: true, id: ["80367170"], process: "pending", requestid: 1, target: ["6281234567890"] }));
    const hasil = await buatPenyediaFonnte({ token: TOKEN, fetchFn: f.fetchFn }).kirim("6281234567890", "Halo");
    assert.deepEqual(hasil, { ok: true, ref: "80367170" });
    const { url, init } = f.permintaan[0];
    assert.equal(url, "https://api.fonnte.com/send");
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>).Authorization, TOKEN);
    const badan = new URLSearchParams(String(init.body));
    assert.equal(badan.get("target"), "6281234567890");
    assert.equal(badan.get("message"), "Halo");
    assert.ok(!String(init.body).includes(TOKEN), "token tidak boleh ada di badan permintaan");
  });

  it("status false (HTTP tetap 200) = gagal; alasan dibersihkan dari token", async () => {
    const f = fetchTiruan(() => json({ status: false, reason: `token invalid ${TOKEN}`, requestid: 2 }));
    const hasil = await buatPenyediaFonnte({ token: TOKEN, fetchFn: f.fetchFn }).kirim("6281234567890", "Halo");
    assert.equal(hasil.ok, false);
    assert.ok(!JSON.stringify(hasil).includes(TOKEN));
  });

  it("menerima 'Status' berhuruf kapital; jaringan putus dan respons bukan JSON = gagal tanpa melempar", async () => {
    const kapital = fetchTiruan(() => json({ Status: true, requestid: 9 }));
    assert.deepEqual(await buatPenyediaFonnte({ token: TOKEN, fetchFn: kapital.fetchFn }).kirim("628123456789", "x"), { ok: true, ref: "9" });

    const putus = await buatPenyediaFonnte({ token: TOKEN, fetchFn: async () => { throw new Error(`putus ${TOKEN}`); } }).kirim("628123456789", "x");
    assert.equal(putus.ok, false);
    assert.ok(!JSON.stringify(putus).includes(TOKEN));

    const bukanJson = await buatPenyediaFonnte({ token: TOKEN, fetchFn: async () => new Response("<html>", { status: 502 }) }).kirim("628123456789", "x");
    assert.equal(bukanJson.ok, false);
  });
});

// ---------------------------------------------------------------------------
// WhatsApp: pengaman pengiriman
// ---------------------------------------------------------------------------

describe("kirimNotifWa: pengaman", () => {
  it("bendera mati = NOL panggilan ke penyedia dan ke penyimpan catatan", async () => {
    for (const nilai of [undefined, "", "TRUE", "1", "false"]) {
      const penyedia = penyediaTiruan();
      let ambil = 0;
      const store = logStoreTiruan();
      const hasil = await kirimNotifWa(inputWa(), {
        env: { WA_NOTIF_ENABLED: nilai, FONNTE_TOKEN: TOKEN },
        ambilPenyedia: () => (ambil++, penyedia),
        store,
      });
      assert.equal(hasil, "mati", String(nilai));
      assert.equal(penyedia.panggilan.length, 0);
      assert.equal(ambil, 0);
      assert.equal(store.klaimDipanggil, 0);
    }
    assert.equal(fetchDipanggil, 0);
  });

  it("tanpa persetujuan = dilewati, penyedia tidak dipanggil", async () => {
    const penyedia = penyediaTiruan();
    assert.equal(await kirimNotifWa(inputWa({ setuju: false }), depsWa({ penyedia })), "tanpa_persetujuan");
    assert.equal(penyedia.panggilan.length, 0);
  });

  it("nomor tidak valid / kosong = dilewati dan dicatat 'dilewati', penyedia tidak dipanggil", async () => {
    for (const noWa of ["12345", "abc", "", null, undefined, "+1555123456"]) {
      const penyedia = penyediaTiruan();
      const store = logStoreTiruan();
      const { hasil } = await denganLog(() => kirimNotifWa(inputWa({ noWa }), depsWa({ penyedia, store })));
      assert.equal(hasil, "nomor_tidak_valid", String(noWa));
      assert.equal(penyedia.panggilan.length, 0);
      assert.equal(store.baris.get("siswa_baru:pay-1:mentor-1")?.status, "dilewati");
    }
  });

  it("nomor 08… dinormalisasi jadi 628… sebelum dikirim", async () => {
    const penyedia = penyediaTiruan();
    assert.equal(await kirimNotifWa(inputWa({ noWa: "0812-3456-7890" }), depsWa({ penyedia })), "terkirim");
    assert.equal(penyedia.panggilan[0].target, "6281234567890");
  });

  it("kiriman ganda untuk kejadian yang sama = SATU WhatsApp", async () => {
    const penyedia = penyediaTiruan();
    const store = logStoreTiruan();
    const deps = depsWa({ penyedia, store });
    const hasil = [await kirimNotifWa(inputWa(), deps), await kirimNotifWa(inputWa(), deps), await kirimNotifWa(inputWa(), deps)];
    assert.deepEqual(hasil, ["terkirim", "duplikat", "duplikat"]);
    assert.equal(penyedia.panggilan.length, 1);
    assert.equal(store.baris.get("siswa_baru:pay-1:mentor-1")?.status, "terkirim");
    assert.equal(store.baris.get("siswa_baru:pay-1:mentor-1")?.ref, "msg-1");
  });

  it("kiriman serentak (balapan) untuk kunci yang sama tetap satu", async () => {
    const penyedia = penyediaTiruan();
    const deps = depsWa({ penyedia });
    await Promise.all([kirimNotifWa(inputWa(), deps), kirimNotifWa(inputWa(), deps)]);
    assert.equal(penyedia.panggilan.length, 1);
  });

  it("batas harian: sudah 50 terpakai = dilewati dan dicatat; di bawah batas tetap kirim", async () => {
    const penuh = penyediaTiruan();
    const storePenuh = logStoreTiruan({ terpakai: 50 });
    const { hasil, log } = await denganLog(() => kirimNotifWa(inputWa(), depsWa({ penyedia: penuh, store: storePenuh })));
    assert.equal(hasil, "batas_harian");
    assert.equal(penuh.panggilan.length, 0);
    assert.equal(storePenuh.baris.get("siswa_baru:pay-1:mentor-1")?.status, "dilewati");
    assert.ok(log.some((l) => /batas harian/.test(l)));

    const longgar = penyediaTiruan();
    assert.equal(await kirimNotifWa(inputWa(), depsWa({ penyedia: longgar, store: logStoreTiruan({ terpakai: 49 }) })), "terkirim");

    const diatur = penyediaTiruan();
    const hasilDiatur = await denganLog(() =>
      kirimNotifWa(inputWa(), depsWa({ penyedia: diatur, store: logStoreTiruan({ terpakai: 3 }), env: { ...ENV_NYALA, WA_NOTIF_BATAS_HARIAN: "3" } })),
    );
    assert.equal(hasilDiatur.hasil, "batas_harian");
  });

  it("tabel belum ada (migrasi belum dijalankan) = dilewati dengan satu baris log, bukan galat", async () => {
    const penyedia = penyediaTiruan();
    const { hasil } = await denganLog(() => kirimNotifWa(inputWa(), depsWa({ penyedia, store: logStoreTiruan({ tabelAda: false }) })));
    assert.equal(hasil, "tabel_belum_ada");
    assert.equal(penyedia.panggilan.length, 0);
  });

  it("FONNTE_TOKEN kosong = dilewati tanpa galat dan tanpa mencatat klaim", async () => {
    const store = logStoreTiruan();
    const { hasil } = await denganLog(() => kirimNotifWa(inputWa(), depsWa({ penyedia: null, store })));
    assert.equal(hasil, "penyedia_belum_diatur");
    assert.equal(store.klaimDipanggil, 0);
  });

  it("penyedia gagal / melempar: hasil 'gagal', tidak melempar, catatan 'gagal', token & nomor & isi pesan tidak ada di log", async () => {
    const gagal = penyediaTiruan({ ok: false, error: `token invalid ${TOKEN}` });
    const store = logStoreTiruan();
    const a = await denganLog(() => kirimNotifWa(inputWa(), depsWa({ penyedia: gagal, store })));
    assert.equal(a.hasil, "gagal");

    const melempar: PenyediaWa = { nama: "x", kirim: async () => { throw new Error(`boom ${TOKEN} 6281234567890`); } };
    const b = await denganLog(() => kirimNotifWa(inputWa({ kunciKejadian: "k2" }), depsWa({ penyedia: melempar, store })));
    assert.equal(b.hasil, "gagal");

    for (const log of [...a.log, ...b.log]) {
      assert.ok(!log.includes(TOKEN), "token bocor ke log");
      assert.ok(!log.includes("6281234567890"), "nomor utuh bocor ke log");
      assert.ok(!log.includes("Halo Kak"), "isi pesan bocor ke log");
    }
    for (const baris of store.baris.values()) assert.ok(!(baris.error ?? "").includes(TOKEN));
    assert.equal(store.baris.get("siswa_baru:pay-1:mentor-1")?.status, "gagal");
  });
});

// ---------------------------------------------------------------------------
// Orkestrasi email + WhatsApp
// ---------------------------------------------------------------------------

function kejadian(ganti: Partial<KejadianSiswaBaru> = {}): KejadianSiswaBaru {
  return {
    kejadianId: "pay-1",
    kelasId: "kelas-1",
    kelasNama: "Intensif UTBK",
    jadwalDisplay: "Senin 16.00",
    siswaNama: "Budi Santoso",
    mentors: [
      { id: "m1", nama: "Rina", email: "rina@contoh.id" },
      { id: "m2", nama: "Dewi", email: "dewi@contoh.id" },
    ],
    ...ganti,
  };
}

function depsKabari(ganti: Partial<DepsSiswaBaru> = {}) {
  const emailTerkirim: Array<Record<string, unknown>> = [];
  const penyedia = penyediaTiruan();
  const store = logStoreTiruan();
  const tidur: number[] = [];
  const deps: DepsSiswaBaru = {
    env: ENV_NYALA,
    kirimEmail: async (input) => {
      emailTerkirim.push({ ...input });
      return { success: true };
    },
    ambilBolehEmail: async () => new Map(),
    ambilPenerimaWa: async (ids) => new Map(ids.map((id) => [id, { noWa: id === "m1" ? "081234567890" : "081298765432", setuju: true }])),
    ambilPenyediaWa: () => penyedia,
    logWa: store,
    tidur: async (ms) => void tidur.push(ms),
    ...ganti,
  };
  return { deps, emailTerkirim, penyedia, store, tidur };
}

describe("kabariMentorSiswaBaru: email + WhatsApp", () => {
  it("siswa baru masuk kelas mentor: tiap mentor dapat satu email dan satu WhatsApp", async () => {
    const t = depsKabari();
    const ringkasan = await kabariMentorSiswaBaru(kejadian(), t.deps);
    assert.equal(t.emailTerkirim.length, 2);
    assert.equal(t.penyedia.panggilan.length, 2);
    assert.deepEqual(ringkasan.email, { terkirim: 2 });
    assert.deepEqual(ringkasan.wa, { terkirim: 2 });
    assert.equal(t.emailTerkirim[0].namaSiswa, "Budi Santoso");
  });

  it("kejadian yang sama diproses dua kali (webhook/recheck berulang) = SATU email dan SATU WhatsApp per mentor", async () => {
    const t = depsKabari();
    await kabariMentorSiswaBaru(kejadian(), t.deps);
    const kedua = await kabariMentorSiswaBaru(kejadian(), t.deps);
    assert.equal(t.emailTerkirim.length, 2);
    assert.equal(t.penyedia.panggilan.length, 2);
    assert.deepEqual(kedua.email, { duplikat: 2 });
    assert.deepEqual(kedua.wa, { duplikat: 2 });
  });

  it("mentor ganda dalam daftar (kelas dengan beberapa subtes) hanya diproses sekali", async () => {
    const t = depsKabari();
    const m = { id: "m1", nama: "Rina", email: "rina@contoh.id" };
    await kabariMentorSiswaBaru(kejadian({ mentors: [m, m, m] }), t.deps);
    assert.equal(t.emailTerkirim.length, 1);
    assert.equal(t.penyedia.panggilan.length, 1);
  });

  it("kejadian berbeda untuk mentor yang sama = pesan terpisah", async () => {
    const t = depsKabari();
    await kabariMentorSiswaBaru(kejadian({ kejadianId: "pay-1" }), t.deps);
    await kabariMentorSiswaBaru(kejadian({ kejadianId: "pay-2" }), t.deps);
    assert.equal(t.emailTerkirim.length, 4);
    assert.equal(t.penyedia.panggilan.length, 4);
    assert.notEqual(kunciKejadianSiswaBaru("pay-1", "m1"), kunciKejadianSiswaBaru("pay-2", "m1"));
  });

  it("bendera WhatsApp mati: nol panggilan penyedia, nol baca persetujuan, nol catatan; email tetap jalan", async () => {
    let baca = 0;
    const t = depsKabari({ env: { WA_NOTIF_ENABLED: "false", FONNTE_TOKEN: TOKEN }, ambilPenerimaWa: async () => (baca++, new Map()) });
    const ringkasan = await kabariMentorSiswaBaru(kejadian(), t.deps);
    assert.equal(t.penyedia.panggilan.length, 0);
    assert.equal(baca, 0);
    assert.equal(t.store.klaimDipanggil, 0);
    assert.deepEqual(ringkasan.wa, { mati: 1 });
    assert.equal(t.emailTerkirim.length, 2);
    assert.equal(fetchDipanggil, 0);
  });

  it("hanya mentor yang setuju DAN bernomor valid yang menerima WhatsApp", async () => {
    const t = depsKabari({
      ambilPenerimaWa: async () =>
        new Map([
          ["m1", { noWa: "081234567890", setuju: true }],
          ["m2", { noWa: "081298765432", setuju: false }],
          ["m3", { noWa: "bukan-nomor", setuju: true }],
          ["m4", { noWa: null, setuju: true }],
        ]),
    });
    const mentors = [
      { id: "m1", nama: "Rina", email: "a@x.id" },
      { id: "m2", nama: "Dewi", email: "b@x.id" },
      { id: "m3", nama: "Sari", email: "c@x.id" },
      { id: "m4", nama: "Tono", email: "d@x.id" },
      { id: "m5", nama: "Tanpa Data", email: "e@x.id" },
    ];
    const { log } = await denganLog(() => kabariMentorSiswaBaru(kejadian({ mentors }), t.deps));
    assert.equal(t.penyedia.panggilan.length, 1);
    assert.equal(t.penyedia.panggilan[0].target, "6281234567890");
    assert.ok(log.every((l) => !l.includes("bukan-nomor")));
  });

  it("kolom persetujuan belum ada (peta kosong) = tidak ada WhatsApp, tidak ada galat", async () => {
    const t = depsKabari({ ambilPenerimaWa: async () => new Map() });
    await kabariMentorSiswaBaru(kejadian(), t.deps);
    assert.equal(t.penyedia.panggilan.length, 0);
    assert.equal(t.emailTerkirim.length, 2);
  });

  it("mentor yang mematikan 'Notifikasi Email' tidak dikirimi email", async () => {
    const t = depsKabari({ ambilBolehEmail: async () => new Map([["m1", false]]) });
    const ringkasan = await kabariMentorSiswaBaru(kejadian(), t.deps);
    assert.deepEqual(ringkasan.email, { dimatikan_penerima: 1, terkirim: 1 });
    assert.deepEqual(t.emailTerkirim.map((e) => e.email), ["dewi@contoh.id"]);
  });

  it("email gagal / melempar TIDAK menggagalkan apa pun dan WhatsApp tetap jalan", async () => {
    const t = depsKabari({
      kirimEmail: async () => {
        throw new Error("Resend mati");
      },
    });
    const { hasil, log } = await denganLog(() => kabariMentorSiswaBaru(kejadian(), t.deps));
    assert.deepEqual(hasil.email, { gagal: 2 });
    assert.equal(t.penyedia.panggilan.length, 2);
    assert.ok(log.every((l) => !l.includes("rina@contoh.id") && !l.includes("dewi@contoh.id")));
  });

  it("WhatsApp gagal / penyimpan catatan melempar TIDAK melempar ke pemanggil", async () => {
    const store = logStoreTiruan();
    store.klaim = async () => {
      throw new Error("db mati");
    };
    const t = depsKabari({ logWa: store });
    await denganLog(async () => {
      const ringkasan = await kabariMentorSiswaBaru(kejadian(), t.deps);
      assert.deepEqual(ringkasan.wa, { gagal: 2 });
    });
    assert.equal(t.emailTerkirim.length, 2);
  });

  it("beberapa mentor dikirim BERURUTAN (tidak serentak) dengan jeda di antaranya", async () => {
    const t = depsKabari();
    await kabariMentorSiswaBaru(kejadian(), t.deps);
    assert.equal(t.penyedia.puncakBersamaan(), 1);
    // 2 mentor: 1 jeda email + 1 jeda WA, tidak ada jeda setelah pesan terakhir
    assert.equal(t.tidur.length, 2);
  });

  it("isi WhatsApp tidak memuat nama, nomor, atau email siswa; email tidak memuat kontak siswa", async () => {
    const t = depsKabari();
    await kabariMentorSiswaBaru(kejadian({ siswaNama: "Budi Santoso" }), t.deps);
    for (const { pesan } of t.penyedia.panggilan) {
      assert.ok(!pesan.includes("Budi"));
      assert.ok(!pesan.includes(NO_SISWA));
      assert.ok(!pesan.includes(EMAIL_SISWA));
      assert.match(pesan, /ada siswa baru di kelas Intensif UTBK/);
    }
    for (const e of t.emailTerkirim) {
      assert.ok(!JSON.stringify(e).includes(NO_SISWA));
      assert.ok(!JSON.stringify(e).includes(EMAIL_SISWA));
    }
  });

  it("nama siswa tidak tersedia -> 'Seorang siswa'", async () => {
    const t = depsKabari();
    await kabariMentorSiswaBaru(kejadian({ siswaNama: null }), t.deps);
    assert.equal(t.emailTerkirim[0].namaSiswa, "Seorang siswa");
  });

  it("token tidak pernah muncul di log selama alur penuh yang gagal", async () => {
    const t = depsKabari({ ambilPenyediaWa: () => penyediaTiruan({ ok: false, error: `token invalid ${TOKEN}` }) });
    const { log } = await denganLog(() => kabariMentorSiswaBaru(kejadian(), t.deps));
    assert.ok(log.every((l) => !l.includes(TOKEN)));
  });
});

// ---------------------------------------------------------------------------
// Setelah respons + integrasi notify (alur pendaftaran tidak boleh gagal)
// ---------------------------------------------------------------------------

describe("jalankanSetelahRespons", () => {
  it("galat di dalam tugas ditelan (hanya dicatat), tidak sampai ke pemanggil", async () => {
    const { log } = await denganLog(() =>
      jalankanSetelahRespons("uji", async () => {
        throw new Error("rahasia@contoh.id gagal");
      }),
    );
    assert.ok(log.every((l) => !l.includes("rahasia@contoh.id")));
  });

  it("di luar request tugas dijalankan dan ditunggu", async () => {
    let jalan = false;
    await jalankanSetelahRespons("uji", async () => {
      jalan = true;
    });
    assert.equal(jalan, true);
  });
});

describe("integrasi notify: pendaftaran tidak pernah gagal karena email/WhatsApp", () => {
  const ENV_ASLI = { ...process.env };
  after(() => {
    process.env = { ...ENV_ASLI };
  });

  function isiDb(opsi: { kolomWaAda: boolean }) {
    handler = (p) => {
      if (p.table === "kelas_mentor") {
        return { data: [{ users: { id: "m1", nama: "Rina", email: "rina@contoh.id" } }], error: null };
      }
      if (p.table === "notifikasi") return { data: null, error: null };
      if (p.table === "users" && p.op === "select") {
        if ((p.cols ?? "").includes("notif_wa_setuju")) {
          return opsi.kolomWaAda
            ? { data: [{ id: "m1", no_wa: "081234567890", notif_wa_setuju: true }], error: null }
            : { data: null, error: { code: "42703", message: "column users.notif_wa_setuju does not exist" } };
        }
        if ((p.cols ?? "") === "nama") return { data: { nama: "Budi Santoso" }, error: null };
        if ((p.cols ?? "").includes("notif_email")) return { data: [{ id: "m1", notif_email: true }], error: null };
      }
      if (p.table === "notifikasi_wa_log") return { data: null, error: { code: "42P01", message: 'relation "notifikasi_wa_log" does not exist' } };
      return { data: [], error: null };
    };
  }

  it("tanpa kunci Resend, bendera WA mati: selesai normal, bell tetap dibuat, tidak ada panggilan jaringan", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.WA_NOTIF_ENABLED;
    isiDb({ kolomWaAda: true });
    const { notifyMentorsSiswaBaruDaftar } = await import("@/lib/notifikasi/notify");
    const { log } = await denganLog(() =>
      notifyMentorsSiswaBaruDaftar("kelas-1", "Intensif UTBK", "Senin 16.00", [], { kejadianId: "pay-9", siswaUserId: "siswa-1" }),
    );
    assert.ok(semuaPanggilan.some((p) => p.table === "notifikasi" && p.op === "insert"), "notifikasi bell tidak dibuat");
    assert.ok(log.some((l) => /RESEND_API_KEY belum diset/.test(l)));
    assert.equal(fetchDipanggil, 0);
  });

  it("bendera WA nyala tapi migrasi belum dijalankan: dilewati, tidak melempar, tidak memanggil Fonnte", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.WA_NOTIF_ENABLED = "true";
    process.env.FONNTE_TOKEN = TOKEN;
    isiDb({ kolomWaAda: false });
    const { notifyMentorsSiswaBaruDaftar } = await import("@/lib/notifikasi/notify");
    const { log } = await denganLog(() =>
      notifyMentorsSiswaBaruDaftar("kelas-1", "Intensif UTBK", null, [], { kejadianId: "pay-10", siswaUserId: "siswa-1" }),
    );
    assert.equal(fetchDipanggil, 0);
    assert.ok(log.every((l) => !l.includes(TOKEN)));
    assert.ok(semuaPanggilan.some((p) => p.table === "notifikasi" && p.op === "insert"));
  });

  it("data siswa yang dibaca untuk kanal luar web hanya kolom nama (tidak pernah no_wa/email siswa)", () => {
    const notify = baca("lib/notifikasi/notify.ts");
    assert.match(notify, /\.from\("users"\)\.select\("nama"\)\.eq\("id", siswa\.siswaUserId\)/);
    assert.ok(!/siswaEmail|siswaNoWa|siswa_no_wa|siswa\.no_wa|siswa\.email/.test(baca("lib/notifikasi/siswaBaru.ts")));
    assert.ok(!/siswaEmail|siswaNoWa|siswa\.no_wa|siswa\.email/.test(notify));
  });

  it("kedua pemanggil (webhook pasca-lunas dan pendaftaran manual) meneruskan id kejadian", () => {
    const fulfill = baca("lib/payment/fulfillPayment.ts");
    assert.match(fulfill, /kejadianId: payment\.id/);
    assert.match(fulfill, /notifyMentorsSiswaBaruDaftar\([^)]*siswa\)/);
    assert.match(fulfill, /notifyMentorOfflineSiswaBaruDaftar\([^)]*siswa\)/);
    const manual = baca("app/api/admin/enrollment-manual/route.ts");
    assert.match(manual, /kejadianId: hasil\.enrollment_id/);
  });

  it("notify.ts tidak lagi memanggil Resend langsung dan tidak menunggu email di jalur webhook", () => {
    const notify = baca("lib/notifikasi/notify.ts");
    assert.ok(!notify.includes("kirimEmailMentorSiswaBaru"));
    assert.match(notify, /jalankanSetelahRespons\("notifikasi-siswa-baru"/);
  });
});

// ---------------------------------------------------------------------------
// Pengaturan: saklar WhatsApp khusus Mentor
// ---------------------------------------------------------------------------

describe("PATCH /api/pengaturan/notif-wa", () => {
  type Rute = typeof import("@/app/api/pengaturan/notif-wa/route");
  let rute: Rute;
  let buatToken: (p: { userId: string; role: "student" | "mentor" | "admin" }) => string;
  let namaCookie: string;

  before(async () => {
    rute = await import("@/app/api/pengaturan/notif-wa/route");
    const sesi = await import("@/lib/auth/session");
    buatToken = sesi.createSessionToken;
    namaCookie = sesi.SESSION_COOKIE_NAME;
  });

  function permintaan(role: "student" | "mentor" | "admin" | null, badan: unknown, userId = "mentor-1") {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (role) headers.cookie = `${namaCookie}=${buatToken({ userId, role })}`;
    return new NextRequest("http://localhost/api/pengaturan/notif-wa", {
      method: "PATCH",
      headers,
      body: typeof badan === "string" ? badan : JSON.stringify(badan),
    });
  }

  function dbUsers(opsi: { noWa?: string | null; kolomAda?: boolean } = {}) {
    handler = (p) => {
      if (p.table !== "users") return { data: [], error: null };
      if (p.op === "select") return { data: { no_wa: opsi.noWa === undefined ? "081234567890" : opsi.noWa }, error: null };
      if (p.op === "update") {
        return opsi.kolomAda === false
          ? { data: null, error: { code: "42703", message: "column users.notif_wa_setuju does not exist" } }
          : { data: null, error: null };
      }
      return { data: [], error: null };
    };
  }

  it("tanpa login = 401; Siswa dan Admin = 403 (hanya Mentor)", async () => {
    dbUsers();
    assert.equal((await rute.PATCH(permintaan(null, { setuju: true }))).status, 401);
    assert.equal((await rute.PATCH(permintaan("student", { setuju: true }))).status, 403);
    assert.equal((await rute.PATCH(permintaan("admin", { setuju: true }))).status, 403);
    assert.ok(!semuaPanggilan.some((p) => p.op === "update"), "tidak boleh ada update untuk non-mentor");
  });

  it("Mentor menyalakan: simpan notif_wa_setuju=true + waktu, hanya untuk akunnya sendiri (id dari sesi, bukan body)", async () => {
    dbUsers();
    const respons = await rute.PATCH(permintaan("mentor", { setuju: true, userId: "korban", user_id: "korban", id: "korban" }));
    assert.equal(respons.status, 200);
    const update = semuaPanggilan.find((p) => p.op === "update");
    assert.ok(update);
    const payload = update.payload as Record<string, unknown>;
    assert.equal(payload.notif_wa_setuju, true);
    assert.equal(typeof payload.notif_wa_setuju_at, "string");
    assert.deepEqual(update.filters, [["id", "eq", "mentor-1"]]);
  });

  it("Mentor mematikan: notif_wa_setuju=false; boleh walau nomor kosong", async () => {
    dbUsers({ noWa: null });
    const respons = await rute.PATCH(permintaan("mentor", { setuju: false }));
    assert.equal(respons.status, 200);
    const payload = semuaPanggilan.find((p) => p.op === "update")?.payload as Record<string, unknown>;
    assert.equal(payload.notif_wa_setuju, false);
  });

  it("menyalakan dengan nomor kosong / tidak valid = 400 dan tidak menyimpan", async () => {
    for (const noWa of [null, "", "12345", "abc"]) {
      semuaPanggilan = [];
      dbUsers({ noWa });
      const respons = await rute.PATCH(permintaan("mentor", { setuju: true }));
      assert.equal(respons.status, 400, String(noWa));
      assert.ok(!semuaPanggilan.some((p) => p.op === "update"), String(noWa));
    }
  });

  it("kolom belum ada (migrasi belum dijalankan) = pesan ramah 503, bukan galat mentah", async () => {
    dbUsers({ kolomAda: false });
    const respons = await rute.PATCH(permintaan("mentor", { setuju: true }));
    assert.equal(respons.status, 503);
    const json = await respons.json();
    assert.equal(json.success, false);
    assert.match(json.error, /belum aktif/);
    assert.ok(!JSON.stringify(json).includes("notif_wa_setuju"), "nama kolom tidak boleh bocor ke pengguna");
  });

  it("badan tidak valid = 400 (bukan boolean, bukan JSON)", async () => {
    dbUsers();
    for (const badan of [{ setuju: "true" }, { setuju: 1 }, {}, "bukan json{"]) {
      assert.equal((await rute.PATCH(permintaan("mentor", badan))).status, 400, JSON.stringify(badan));
    }
  });

  it("respons tidak memuat token / nomor", async () => {
    process.env.FONNTE_TOKEN = TOKEN;
    dbUsers();
    const respons = await rute.PATCH(permintaan("mentor", { setuju: true }));
    const teks = JSON.stringify(await respons.json());
    assert.ok(!teks.includes(TOKEN));
    assert.ok(!teks.includes("6281234567890"));
    delete process.env.FONNTE_TOKEN;
  });
});

describe("Pengaturan: saklar hanya tampil untuk Mentor", () => {
  const klien = baca("components/pengaturan/PengaturanClient.tsx");
  const halaman = baca("app/(protected)/pengaturan/page.tsx");

  it('kartu hanya dirender kalau role === "mentor" dan memakai komponen Toggle yang ada', () => {
    assert.match(klien, /role === "mentor" && notifWaMentor \?/);
    assert.match(klien, /label="Kabari saya lewat WhatsApp saat ada siswa baru"/);
    assert.match(klien, /import Toggle from "@\/components\/ui\/Toggle"/);
  });

  it("teks persetujuan dan keterangan kontak sesuai spesifikasi; nomor pengirim tidak ditulis di kode", () => {
    assert.ok(klien.includes("Saya setuju menerima pesan WhatsApp otomatis dari Dimentoring tentang siswa baru. Saya bisa mematikannya kapan saja."));
    assert.ok(klien.includes("Simpan nomor Dimentoring di kontak HP-mu dan balas satu pesan supaya pesan tidak dianggap spam."));
    assert.ok(!/\b(?:\+?62|0)8\d{8,11}\b/.test(klien.replace(/0822-2598-2026/g, "")), "ada nomor telepon tertulis di UI");
  });

  it("saklar nonaktif bila nomor kosong/tidak valid atau fitur belum tersedia (tetap bisa dimatikan)", () => {
    assert.match(klien, /waMentorPending \|\| !waMentorTersedia \|\| \(!waMentorSetuju && !waMentorNomor\)/);
    assert.match(klien, /Nomor WhatsApp kamu belum terisi atau belum valid/);
  });

  it("halaman hanya membaca data persetujuan untuk Mentor, terpisah dari data umum (tidak merusak halaman bila kolom belum ada)", () => {
    assert.match(halaman, /session\.role === "mentor" \? await getNotifWaMentor\(session\.userId\) : null/);
    assert.ok(!baca("lib/pengaturan/getPengaturanData.ts").includes("notif_wa_setuju"));
  });
});

// ---------------------------------------------------------------------------
// Migrasi SQL dan .env.example
// ---------------------------------------------------------------------------

describe("db/add_notifikasi_wa.sql", () => {
  const sql = baca("db/add_notifikasi_wa.sql");
  const tanpaKomentar = sql
    .split("\n")
    .map((baris) => baris.replace(/--.*$/, ""))
    .join("\n");

  it("aditif: tanpa DROP / DELETE / TRUNCATE / RENAME / ALTER ... TYPE", () => {
    assert.ok(!/\b(DROP|TRUNCATE|RENAME)\b/i.test(tanpaKomentar));
    // "ON DELETE CASCADE" di FK tabel baru boleh; perintah DELETE FROM tidak.
    assert.ok(!/\bDELETE\s+FROM\b/i.test(tanpaKomentar));
    assert.ok(!/ALTER\s+COLUMN/i.test(tanpaKomentar));
    assert.ok(!/\bUPDATE\b/i.test(tanpaKomentar));
  });

  it("idempoten: semua CREATE/ADD memakai IF NOT EXISTS (atau pengecekan pg_constraint)", () => {
    assert.match(tanpaKomentar, /ADD COLUMN IF NOT EXISTS notif_wa_setuju BOOLEAN NOT NULL DEFAULT false/);
    assert.match(tanpaKomentar, /ADD COLUMN IF NOT EXISTS notif_wa_setuju_at TIMESTAMPTZ/);
    assert.match(tanpaKomentar, /CREATE TABLE IF NOT EXISTS notifikasi_wa_log/);
    assert.ok(!/CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/i.test(tanpaKomentar));
    assert.match(tanpaKomentar, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'notifikasi_wa_log_status_valid'\)/);
  });

  it("tabel log: kunci_kejadian UNIQUE, status 4 nilai, RLS aktif tanpa policy", () => {
    assert.match(tanpaKomentar, /kunci_kejadian TEXT NOT NULL UNIQUE/);
    assert.match(tanpaKomentar, /status IN \('pending', 'terkirim', 'gagal', 'dilewati'\)/);
    assert.match(tanpaKomentar, /ALTER TABLE notifikasi_wa_log ENABLE ROW LEVEL SECURITY/);
    assert.ok(!/CREATE\s+POLICY/i.test(tanpaKomentar));
    for (const kolom of ["id UUID", "user_id UUID", "jenis TEXT", "provider_ref TEXT", "error TEXT", "created_at TIMESTAMPTZ"]) {
      assert.ok(tanpaKomentar.includes(kolom), kolom);
    }
  });

  it("memuat blok query verifikasi (SELECT) dan petunjuk dry-run", () => {
    assert.match(sql, /QUERY VERIFIKASI/);
    assert.match(sql, /-- SELECT [\s\S]*information_schema\.columns/);
    assert.match(sql, /DRY-RUN/);
  });

  it("tidak ada kode aplikasi yang menjalankan SQL ini (hanya file di db/)", () => {
    assert.ok(!/add_notifikasi_wa/.test(baca("package.json")));
  });
});

describe(".env.example", () => {
  const env = baca(".env.example");
  const NAMA = ["RESEND_API_KEY", "EMAIL_FROM_ADDRESS", "EMAIL_FROM_NAME", "EMAIL_REPLY_TO", "APP_BASE_URL", "FONNTE_TOKEN", "WA_NOTIF_ENABLED", "WA_NOTIF_BATAS_HARIAN"];

  it("semua variabel notifikasi ada sebagai placeholder tanpa nilai", () => {
    for (const nama of NAMA) assert.match(env, new RegExp(`^${nama}=\\s*$`, "m"), nama);
  });

  it("token Fonnte tidak diberi awalan NEXT_PUBLIC_ (tidak ke browser)", () => {
    assert.ok(!/NEXT_PUBLIC_FONNTE|NEXT_PUBLIC_RESEND/.test(env));
  });

  it("token Fonnte hanya dibaca di modul server (lib/notifikasi/wa/index.ts)", () => {
    for (const berkas of ["components/pengaturan/PengaturanClient.tsx", "app/api/pengaturan/notif-wa/route.ts", "lib/pengaturan/notifWaMentor.ts"]) {
      assert.ok(!baca(berkas).includes("FONNTE_TOKEN"), berkas);
    }
    assert.match(baca("lib/notifikasi/wa/index.ts"), /import "server-only"/);
    assert.match(baca("lib/notifikasi/wa/fonnte.ts"), /import "server-only"/);
  });
});

describe("pendaftaran tes", () => {
  it("tests/notifikasi-mentor.test.ts terdaftar di package.json (npm test)", () => {
    assert.match(baca("package.json"), /tests\/notifikasi-mentor\.test\.ts/);
  });
});
