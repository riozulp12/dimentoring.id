/**
 * Tes "Tutup pendaftaran" kelas (kelas.pendaftaran_ditutup) + kartu "Harga paket" untuk kelas non-private-online.
 * Kartu/tombol/checkout dirender di proses terpisah; payment/create & validate-promo dijalankan sungguhan dengan
 * Supabase TIRUAN. Webhook/fulfillPayment tidak disentuh (dites di payment-mayar.test.ts).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import "./helpers/envSupabaseUji";
import { KELAS_CARD_SELECT, type KelasCardPreview } from "@/lib/dashboard/getProgramData";
import { TEKS_BADGE_DITUTUP, hitungKapasitasKelas, tandaiPendaftaranDitutup, teksBadgeKapasitas } from "@/lib/shared/kapasitasKelas";
import { resolveKelasDaftarAction } from "@/lib/shared/kelasDaftarTarget";
import { perluPeriksaPromo } from "@/lib/admin/periksaPromoAktifUntukKelas";
import { validateKelasInput, type KelasInputBody } from "@/lib/admin/validateKelasInput";

const baca = (p: string) => readFileSync(p, "utf8");

function render(modul: string, props: unknown, env: Record<string, string> = {}): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import(${JSON.stringify(modul)});
    const Komponen = typeof mod.default === "function" ? mod.default : mod.default.default;
    process.stdout.write(renderToStaticMarkup(React.createElement(Komponen, JSON.parse(process.argv[1]))));
  `;
  const e: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: "" };
  delete e.SESI_PILIHAN_AKTIF;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify(props)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...e, NEXT_PUBLIC_CHECKOUT_INTERNAL_READY: "true", ...env },
  }).replace(/<!-- -->/g, "");
}

const item = (ekstra: Partial<KelasCardPreview> = {}): KelasCardPreview =>
  ({
    id: "k1",
    nama: "Kelas Uji",
    tipeKelas: "group",
    tipeKelasLabel: "Grup",
    modePembelajaran: "offline",
    modePembelajaranLabel: "Offline",
    harga: 1500000,
    diskonPersen: 0,
    hargaSetelahDiskon: 1500000,
    jumlahSesi: 10,
    mentorNama: null,
    diskonAktif: null,
    kapasitasInfo: { penuh: false },
    deskripsi: null,
    programKategori: "snbt",
    tingkatKelas: "12",
    subtesNama: null,
    linkLynkid: null,
    ...ekstra,
  }) as KelasCardPreview;
const kartu = (i: KelasCardPreview, env: Record<string, string> = {}) =>
  render("@/components/program/KelasCardMeta", { item: i, sessionRole: "student" }, env);

describe("Bagian A — kartu 'Harga paket' & tombol sejajar", () => {
  it("kelas offline: 'Harga paket', harga sama (Rp1.500.000), tanpa 'Mulai dari' dan tanpa kalimat ajakan sesi", () => {
    const h = kartu(item());
    assert.match(h, /Harga paket<\/span><span[^>]*font-bold[^>]*text-\[#081EEA\][^>]*>Rp1\.500\.000<\/span>/);
    assert.ok(!h.includes("Mulai dari") && !h.includes("Makin banyak sesi"));
    assert.ok(!kartu(item(), { SESI_PILIHAN_AKTIF: "true" }).includes("Mulai dari"), "saklar sesi tidak memengaruhi non-private-online");
  });
  it("kelas non-private-online dengan diskon: harga setelah diskon tebal primary + harga asli dicoret", () => {
    const h = kartu(item({ diskonPersen: 20, hargaSetelahDiskon: 1200000, diskonAktif: { label: "Diskon 20%" } }));
    assert.match(h, /Harga paket<\/span><span[^>]*>Rp1\.200\.000<\/span>/);
    assert.match(h, /<s[^>]*>Rp1\.500\.000<\/s>/);
  });
  it("kartu private online tidak berubah: saklar hidup 'Mulai dari'; saklar mati harga lama (tanpa 'Harga paket')", () => {
    const priv = item({ tipeKelas: "private", modePembelajaran: "online", harga: 899000, hargaSetelahDiskon: 899000 });
    assert.match(kartu(priv, { SESI_PILIHAN_AKTIF: "true" }), /Mulai dari<\/span><span[^>]*>Rp102\.000<\/span>/);
    const mati = kartu(priv);
    assert.ok(!mati.includes("Mulai dari") && !mati.includes("Harga paket"));
    assert.ok(mati.includes("Rp899.000"));
  });
  it("tombol menempel di dasar kartu (mt-auto) dan isi kartu mengisi tinggi kartu (flex-1)", () => {
    assert.match(kartu(item()), /relative z-40 mt-auto/);
    assert.match(baca("components/program/KelasCardFrame.tsx"), /flex min-w-0 flex-1 flex-col/);
  });
});

describe("kartu/detail kelas ditutup", () => {
  it("overlay kapasitas: lencana 'Pendaftaran ditutup' menggantikan 'Hampir habis'; tidak ditutup = perilaku lama", () => {
    const hampir = hitungKapasitasKelas({ kapasitasManual: 10, lunas: 7, otomatis: null });
    assert.match(teksBadgeKapasitas(hampir)!, /^Hampir habis/);
    assert.equal(teksBadgeKapasitas(tandaiPendaftaranDitutup(hampir, true)), TEKS_BADGE_DITUTUP);
    assert.equal(tandaiPendaftaranDitutup(hampir, false), hampir);
    assert.equal(tandaiPendaftaranDitutup(hampir, null), hampir);
    const tanpaBatas = hitungKapasitasKelas({ kapasitasManual: null, lunas: 0, otomatis: null });
    assert.equal(teksBadgeKapasitas(tanpaBatas), null);
    assert.equal(teksBadgeKapasitas(tandaiPendaftaranDitutup(tanpaBatas, true)), "Pendaftaran ditutup");
  });
  it("aturan tombol: ditutup menang atas penuh dan link pendaftaran; terbuka = perilaku lama", () => {
    const dasar = { kelasId: "k1", penuh: false, linkPendaftaran: "https://lynk.id/x", sessionRole: "student" as const, isCheckoutInternalReady: true };
    const tutup = resolveKelasDaftarAction({ ...dasar, ditutup: true });
    assert.equal(tutup.kind, "disabled");
    assert.equal(tutup.kind === "disabled" && tutup.label, "Pendaftaran Ditutup");
    assert.equal(resolveKelasDaftarAction({ ...dasar, penuh: true, ditutup: true }).kind, "disabled");
    assert.equal(resolveKelasDaftarAction({ ...dasar, ditutup: false }).kind, "external");
    assert.equal(resolveKelasDaftarAction({ ...dasar, linkPendaftaran: null }).kind, "internal");
  });
  it("tombol kartu: ditutup = <button disabled> 'Pendaftaran Ditutup', bukan link; terbuka = link 'Daftar Sekarang'", () => {
    const tutup = kartu(item({ kapasitasInfo: { penuh: false, ditutup: true } as KelasCardPreview["kapasitasInfo"] }));
    assert.match(tutup, /<button[^>]*disabled[^>]*>/);
    assert.ok(tutup.includes("Pendaftaran Ditutup"));
    assert.ok(!tutup.includes("Daftar Sekarang") && !tutup.includes('href="/checkout'));
    const buka = kartu(item());
    assert.match(buka, /<a [^>]*href="\/checkout\/k1"[^>]*>Daftar Sekarang<\/a>/);
    assert.ok(!buka.includes("Pendaftaran Ditutup") && !/<button[^>]*disabled/.test(buka));
  });
  it("tombol detail: disabled 'Pendaftaran Ditutup' + keterangan", () => {
    const h = render("@/components/program/KelasDaftarButton", {
      kelasId: "k1", penuh: false, ditutup: true, sessionRole: "student", linkLynkid: null, variant: "detail",
    });
    assert.match(h, /<button[^>]*disabled[^>]*>Pendaftaran Ditutup<\/button>/);
    assert.ok(h.includes("sudah ditutup"));
  });
  it("lencana kartu abu-abu 'Pendaftaran ditutup' di KelasCardVisual; harga tetap tampil", () => {
    const h = render("@/components/ui/KelasCardVisual", {
      namaKelas: "Kelas Uji", index: 0, diskonAktif: null, programKategori: "snbt", tingkatKelas: "12", subtesNama: null,
      kapasitasInfo: { terbatas: true, kapasitas: 10, terisi: 7, sisa: 3, penuh: false, hampirHabis: true, ditutup: true },
      variant: "jual",
    });
    assert.match(h, /bg-\[#6B7280\][^>]*>Pendaftaran ditutup</);
    assert.ok(!h.includes("Hampir habis"));
    assert.ok(kartu(item({ kapasitasInfo: { penuh: false, ditutup: true } as KelasCardPreview["kapasitasInfo"] })).includes("Rp1.500.000"));
  });
});

describe("kueri kelas memuat pendaftaran_ditutup", () => {
  it("katalog, detail publik, checkout, dan Kelola Kelas memilih kolomnya", () => {
    assert.ok(KELAS_CARD_SELECT.includes("pendaftaran_ditutup"));
    assert.match(baca("lib/dashboard/getProgramData.ts"), /tampil_di_katalog, subtes_id, pendaftaran_ditutup,/);
    assert.ok(baca("lib/payment/getKelasForCheckout.ts").includes("jumlah_sesi, pendaftaran_ditutup"));
    assert.ok(baca("lib/admin/getKelolaKelasData.ts").includes("tampil_di_katalog, pendaftaran_ditutup,"));
  });
  it("fulfillPayment dan webhook Mayar TIDAK membaca pendaftaran_ditutup", () => {
    for (const f of ["lib/payment/fulfillPayment.ts", "app/api/payment/webhook/mayar/route.ts"]) {
      try {
        assert.ok(!/pendaftaran_?[dD]itutup/.test(baca(f)), f);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  });
});

describe("Admin: saklar Tutup pendaftaran", () => {
  const dasar = (ekstra: Partial<KelasInputBody> = {}): KelasInputBody => ({
    nama: "Kelas Uji",
    programKategori: "snbt",
    tingkatKelas: "kelas_12",
    tipeKelas: "grouping",
    modePembelajaran: "offline",
    jumlahSesi: 10,
    harga: 1500000,
    offlineSubtesId: "11111111-1111-4111-8111-111111111111",
    ...ekstra,
  } as KelasInputBody);

  beforeEach(() => {
    db.subtes = [{ id: "11111111-1111-4111-8111-111111111111" }];
  });
  it("hanya menulis pendaftaran_ditutup bila dikirim; non-boolean ditolak", async () => {
    const tanpa = await validateKelasInput(dasar());
    const dengan = await validateKelasInput(dasar({ pendaftaranDitutup: true }));
    const salah = await validateKelasInput(dasar({ pendaftaranDitutup: "ya" as unknown as boolean }));
    assert.ok(tanpa.ok && dengan.ok, JSON.stringify([tanpa, dengan]));
    assert.ok(!("pendaftaran_ditutup" in tanpa.data), "tidak dikirim = tidak menimpa kolom");
    assert.equal(dengan.data.pendaftaran_ditutup, true);
    assert.equal(salah.ok, false);
  });
  it("mengubah HANYA saklar tidak memicu pagar margin (perluPeriksaPromo = false)", async () => {
    const hasil = await validateKelasInput(dasar({ pendaftaranDitutup: true }));
    assert.ok(hasil.ok, JSON.stringify(hasil));
    if (!hasil.ok) return;
    const lama = {
      harga: hasil.data.harga,
      diskon_persen: hasil.data.diskon_persen,
      tipe_kelas: hasil.data.tipe_kelas,
      mode_pembelajaran: hasil.data.mode_pembelajaran,
      jumlah_sesi: hasil.data.jumlah_sesi,
      pendaftaran_ditutup: false,
    };
    assert.equal(perluPeriksaPromo(lama, hasil.data), false);
    assert.equal(perluPeriksaPromo({ ...lama, harga: lama.harga + 1 }, hasil.data), true);
  });
  it("form Kelola Kelas punya saklar dan keterangan yang diminta", () => {
    const f = baca("components/admin/KelolaKelasForm.tsx");
    assert.ok(f.includes("Tutup pendaftaran"));
    assert.ok(f.includes("Kartu kelas tetap tampil, tombol daftar dimatikan. Siswa yang sudah terdaftar tidak terpengaruh."));
    assert.ok(/^ +pendaftaranDitutup,\s*$/m.test(f), "dikirim di payload simpan");
  });
});

describe("Checkout: kelas ditutup tidak merender form", () => {
  it("komponen pesan memuat teks dan tautan /program", () => {
    const h = render("@/components/siswa/PendaftaranDitutupNotice", { namaKelas: "Kelas Uji" });
    assert.ok(h.includes("Pendaftaran kelas ini sudah ditutup"));
    assert.match(h, /<a [^>]*href="\/program"/);
    assert.ok(!h.includes("<form"));
  });
  it("halaman checkout mengembalikan pesan SEBELUM CheckoutForm (setelah cek sudah-lunas)", () => {
    const src = baca("app/(protected)/(siswa)/checkout/[kelasId]/page.tsx");
    const iLunas = src.indexOf("isKelasSudahLunas(session.userId");
    const iTutup = src.indexOf("if (kelas.pendaftaranDitutup)");
    const iForm = src.indexOf("<CheckoutForm");
    assert.ok(iLunas > 0 && iTutup > iLunas && iForm > iTutup);
    assert.ok(src.slice(iTutup, iForm).includes("<PendaftaranDitutupNotice"));
  });
});

// ---------------------------------------------------------------------------
// payment/create & validate-promo terhadap Supabase TIRUAN
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code: string; message: string } | null };
let db: Record<string, Row[]>;
let mayarCalls: string[];

class FakeQuery implements PromiseLike<Result> {
  private filters: ((row: Row) => boolean)[] = [];
  constructor(private table: string) {}
  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  is(column: string, value: unknown) { this.filters.push((row) => (row[column] ?? null) === value); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this.run().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data })); }
  single() { return this.maybeSingle(); }
  then<A, B>(f?: ((v: Result) => A | PromiseLike<A>) | null, r?: ((e: unknown) => B | PromiseLike<B>) | null) { return this.run().then(f, r); }
  private async run(): Promise<Result> {
    const rows = (db[this.table] ??= []);
    return { data: rows.filter((row) => this.filters.every((f) => f(row))), error: null };
  }
}

type SessionModule = typeof import("@/lib/auth/session");
let createRoute: typeof import("@/app/api/payment/create/route");
let promoRoute: typeof import("@/app/api/payment/validate-promo/route");
let sessionLib: SessionModule;
const SISWA = "siswa-uji";
const awalFetch = globalThis.fetch;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  process.env.MAYAR_BASE_URL = "https://api.mayar.io";
  process.env.MAYAR_API_KEY = "kunci-tiruan";
  process.env.APP_BASE_URL = "https://dimentoring.id";
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.VERCEL_ENV;
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => FakeQuery }).from = (table: string) => new FakeQuery(table);
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    mayarCalls.push(`${init?.method ?? "GET"} ${String(input)}`);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  createRoute = await import("@/app/api/payment/create/route");
  promoRoute = await import("@/app/api/payment/validate-promo/route");
  sessionLib = await import("@/lib/auth/session");
});
after(() => {
  globalThis.fetch = awalFetch;
});

const kelasUji = (ekstra: Row = {}): Row => ({
  id: "K-1", nama: "Kelas Uji", harga: 500000, diskon_persen: 0, mode_pembelajaran: "online", tipe_kelas: "group",
  link_lynkid: null, jadwal: null, jadwal_pilih_siswa: false, kapasitas: null, jumlah_sesi: 10, tampil_di_katalog: true,
  subtes_id: null, pendaftaran_ditutup: false, ...ekstra,
});

beforeEach(() => {
  mayarCalls = [];
  db = { kelas: [kelasUji()], kelas_subtes: [], kelas_subtes_mentor: [], user_roles: [], users: [], enrollments: [], payments: [], payment_subtes_pilihan: [], kode_promo: [] };
});

async function panggil(handler: "create" | "promo", body: Record<string, unknown>) {
  const semula = process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
  process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = "true";
  try {
    const token = sessionLib.createSessionToken({ userId: SISWA, role: "student" });
    const req = new NextRequest(`http://localhost/api/payment/${handler === "create" ? "create" : "validate-promo"}`, {
      method: "POST",
      headers: { cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
      body: JSON.stringify({ kelasId: "K-1", ...body }),
    });
    const res = handler === "create" ? await createRoute.POST(req) : await promoRoute.POST(req);
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  } finally {
    if (semula === undefined) delete process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY;
    else process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY = semula;
  }
}

describe("API menolak kelas yang pendaftarannya ditutup (409)", () => {
  it("payment/create: ditutup -> 409 + pesan jelas, tanpa invoice gateway dan tanpa baris payments", async () => {
    db.kelas = [kelasUji({ pendaftaran_ditutup: true })];
    const res = await panggil("create", {});
    assert.equal(res.status, 409);
    assert.match(String(res.json.error), /Pendaftaran kelas ini sudah ditutup/);
    assert.deepEqual(mayarCalls, []);
    assert.equal(db.payments.length, 0);
  });
  it("payment/create: kelas terbuka tidak ditolak karena alasan ini (bukan 409 'ditutup')", async () => {
    const res = await panggil("create", {});
    assert.ok(!/sudah ditutup/.test(String(res.json.error ?? "")), JSON.stringify(res));
  });
  it("validate-promo: ditutup -> 409; terbuka -> tidak 409 'ditutup'", async () => {
    db.kelas = [kelasUji({ pendaftaran_ditutup: true })];
    const tutup = await panggil("promo", { kode: "HEMAT" });
    assert.equal(tutup.status, 409);
    assert.match(String(tutup.json.error), /sudah ditutup/);
    db.kelas = [kelasUji()];
    const buka = await panggil("promo", { kode: "HEMAT" });
    assert.ok(!/sudah ditutup/.test(String(buka.json.error ?? "")));
  });
});

describe("migrasi pendaftaran_ditutup (statis, tidak dijalankan)", () => {
  it("tiga file ada; migrasi aditif satu kolom BOOLEAN NOT NULL DEFAULT false tanpa menyentuh data", () => {
    const m = baca("db/add_pendaftaran_ditutup.sql");
    assert.match(m, /ALTER TABLE kelas ADD COLUMN IF NOT EXISTS pendaftaran_ditutup BOOLEAN NOT NULL DEFAULT false;/);
    assert.ok(!/\b(UPDATE|DELETE|DROP|TRUNCATE)\b\s/i.test(m.replace(/--.*$/gm, "")));
    assert.match(baca("db/rollback_add_pendaftaran_ditutup.sql"), /DROP COLUMN IF EXISTS pendaftaran_ditutup/);
    assert.ok(/SELECT/i.test(baca("db/verify_add_pendaftaran_ditutup.sql")));
    assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b\s/i.test(baca("db/verify_add_pendaftaran_ditutup.sql").replace(/--.*$/gm, "")), "verifikasi hanya baca");
  });
});
