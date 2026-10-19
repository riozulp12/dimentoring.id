/**
 * Test Lead Capture tahap 1 (PRD 7.4.6, BR-38) — normalisasi nomor WA,
 * cookie atribusi dm_attr (proxy.ts), POST /api/leads, export CSV, dan
 * otorisasi API Admin leads. Dijalankan terhadap Supabase TIRUAN di memori
 * (tidak pernah menyentuh database asli). Fungsi DB simpan_lead ditiru di
 * `fakeRpc` mengikuti db/add_leads.sql.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { normalisasiNoWa } from "@/lib/shared/noWa";
import {
  ATTR_COOKIE_NAME,
  ATTR_MAX_PANJANG,
  buatAtribusiDariUrl,
  parseAtribusiCookie,
  pilihUtmPendaftaran,
} from "@/lib/shared/atribusi";
import { buatCsv, selCsvAman } from "@/lib/shared/csv";
import { CONSENT_VERSI, LEAD_RATE_LIMIT_PER_TRIAL } from "@/lib/shared/leadConsent";
import { TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

let db: Db;
let idCounter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`;

type Filter = (row: Row) => boolean;

class FakeQuery implements PromiseLike<{ data: unknown; error: null; count: number }> {
  private filters: Filter[] = [];
  private mode: "select" | "update" | "delete" | "insert" = "select";
  private values: Row | Row[] | null = null;
  private head = false;
  private limitN: number | null = null;
  private returnRows = false;

  constructor(private table: string) {}

  select(_cols?: string, options?: { head?: boolean; count?: string }) {
    if (options?.head) this.head = true;
    if (this.mode !== "select") this.returnRows = true;
    return this;
  }
  insert(values: Row | Row[]) {
    this.mode = "insert";
    this.values = values;
    return this;
  }
  update(values: Row) {
    this.mode = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  is(c: string, v: unknown) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  not(c: string, _op: string, v: unknown) {
    this.filters.push((r) => (r[c] ?? null) !== v);
    return this;
  }
  gt(c: string, v: string) {
    this.filters.push((r) => Date.parse(r[c] as string) > Date.parse(v));
    return this;
  }
  lt(c: string, v: string) {
    this.filters.push((r) => Date.parse(r[c] as string) < Date.parse(v));
    return this;
  }
  ilike(c: string, pola: string) {
    const isi = pola.replace(/%/g, "").toLowerCase();
    this.filters.push((r) => typeof r[c] === "string" && (r[c] as string).toLowerCase().includes(isi));
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    return this.run().then((res) => ({ data: Array.isArray(res.data) ? (res.data[0] ?? null) : null, error: null }));
  }
  single() {
    return this.maybeSingle();
  }
  private run() {
    db[this.table] ??= [];
    const rows = db[this.table];
    if (this.mode === "insert") {
      const list = (Array.isArray(this.values) ? this.values : [this.values!]).map((v) => ({
        id: newId(),
        created_at: new Date().toISOString(),
        ...v,
      }));
      rows.push(...list);
      return Promise.resolve({ data: this.returnRows ? list : null, error: null, count: list.length });
    }
    let hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === "update") {
      for (const r of hit) Object.assign(r, this.values);
    } else if (this.mode === "delete") {
      db[this.table] = rows.filter((r) => !hit.includes(r));
    }
    if (this.limitN !== null) hit = hit.slice(0, this.limitN);
    const data = this.head || (this.mode !== "select" && !this.returnRows) ? null : hit.map((r) => ({ ...r }));
    return Promise.resolve({ data, error: null, count: hit.length });
  }
  then<A, B>(
    onfulfilled?: ((value: { data: unknown; error: null; count: number }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    return this.run().then(onfulfilled, onrejected);
  }
}

/** Tiruan simpan_lead() — logika sama dengan db/add_leads.sql. */
function fakeRpc(name: string, p: Row) {
  if (name !== "simpan_lead") return Promise.resolve({ data: null, error: { message: `rpc ${name} tidak ada` } });
  db.leads ??= [];
  if (!/^628[0-9]{8,12}$/.test(p.p_no_wa as string)) {
    return Promise.resolve({ data: null, error: { message: "violates check constraint leads_no_wa_format" } });
  }
  const nama = typeof p.p_nama === "string" && p.p_nama.trim() ? p.p_nama.trim() : null;
  const lama = db.leads.find((l) => l.no_wa === p.p_no_wa);
  const now = new Date().toISOString();
  if (lama) {
    lama.assessment_id = p.p_assessment_id ?? lama.assessment_id;
    lama.nama = lama.nama ?? nama;
    lama.user_id = lama.user_id ?? p.p_user_id;
    lama.anonymous_trial_id = lama.anonymous_trial_id ?? p.p_anonymous_trial_id;
    lama.jumlah_submit = (lama.jumlah_submit as number) + 1;
    lama.updated_at = now;
    return Promise.resolve({ data: { baru: false }, error: null });
  }
  db.leads.push({
    id: newId(),
    no_wa: p.p_no_wa,
    nama,
    sumber: p.p_sumber,
    assessment_id: p.p_assessment_id,
    anonymous_trial_id: p.p_anonymous_trial_id,
    user_id: p.p_user_id,
    utm_source: p.p_utm_source,
    utm_medium: p.p_utm_medium,
    utm_campaign: p.p_utm_campaign,
    utm_content: p.p_utm_content,
    fbclid: p.p_fbclid,
    consent_wa: true,
    consent_versi: p.p_consent_versi,
    consent_at: now,
    status: "baru",
    catatan: null,
    jumlah_submit: 1,
    created_at: now,
    updated_at: now,
  });
  return Promise.resolve({ data: { baru: true }, error: null });
}

type LeadsRoute = typeof import("@/app/api/leads/route");
type AdminListRoute = typeof import("@/app/api/admin/leads/route");
type AdminPatchRoute = typeof import("@/app/api/admin/leads/[id]/route");
type AdminExportRoute = typeof import("@/app/api/admin/leads/export/route");
type SessionModule = typeof import("@/lib/auth/session");
type ProxyModule = typeof import("@/proxy");

let leadsRoute: LeadsRoute;
let adminList: AdminListRoute;
let adminPatch: AdminPatchRoute;
let adminExport: AdminExportRoute;
let sessionLib: SessionModule;
let proxyMod: ProxyModule;

const TRIAL_A = "11111111-1111-4111-8111-111111111111";
const TRIAL_B = "22222222-2222-4222-8222-222222222222";
const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const SISWA = "aaaaaaaa-0000-4000-8000-000000000002";
const MENTOR = "aaaaaaaa-0000-4000-8000-000000000003";
const ASSESSMENT_A = "bbbbbbbb-0000-4000-8000-00000000000a";
const ASSESSMENT_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const ASSESSMENT_SISWA = "bbbbbbbb-0000-4000-8000-00000000000c";

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  Object.assign(supabaseServer as unknown as Record<string, unknown>, {
    from: (table: string) => new FakeQuery(table),
    rpc: fakeRpc,
  });
  leadsRoute = await import("@/app/api/leads/route");
  adminList = await import("@/app/api/admin/leads/route");
  adminPatch = await import("@/app/api/admin/leads/[id]/route");
  adminExport = await import("@/app/api/admin/leads/export/route");
  sessionLib = await import("@/lib/auth/session");
  proxyMod = await import("@/proxy");
});

beforeEach(() => {
  db = {
    leads: [],
    lead_rate_limit: [],
    lead_status_log: [],
    assessments: [
      { id: ASSESSMENT_A, user_id: null, anonymous_trial_id: TRIAL_A },
      { id: ASSESSMENT_B, user_id: null, anonymous_trial_id: TRIAL_B },
      { id: ASSESSMENT_SISWA, user_id: SISWA, anonymous_trial_id: null },
    ],
    user_roles: [
      { user_id: ADMIN, role_type: "admin", status: "active" },
      { user_id: SISWA, role_type: "student", status: "active" },
      { user_id: MENTOR, role_type: "mentor", status: "active" },
    ],
  };
});

function attrCookie(campaign: string) {
  return `${ATTR_COOKIE_NAME}=${encodeURIComponent(
    JSON.stringify({ utm_source: "ig", utm_medium: "paid", utm_campaign: campaign, landing_path: "/", ts: 1 }),
  )}`;
}

function postLead(body: unknown, opts: { trial?: string | null; attr?: string; session?: { userId: string; role: "student" } ; ip?: string } = {}) {
  const cookies: string[] = [];
  const trial = opts.trial === undefined ? TRIAL_A : opts.trial;
  if (trial) cookies.push(`${TRIAL_COOKIE_NAME}=${trial}`);
  if (opts.attr) cookies.push(opts.attr);
  if (opts.session) cookies.push(`${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken(opts.session)}`);
  return leadsRoute.POST(
    new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": opts.ip ?? "10.0.0.1",
        cookie: cookies.join("; "),
      },
      body: JSON.stringify(body),
    }),
  );
}

function adminRequest(url: string, role: "admin" | "student" | "mentor", userId: string, init: { method?: string; body?: unknown } = {}) {
  const token = sessionLib.createSessionToken({ userId, role });
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("normalisasiNoWa", () => {
  it("08xx, 628xx, +628xx, spasi & tanda hubung -> 628…", () => {
    assert.equal(normalisasiNoWa("081234567890"), "6281234567890");
    assert.equal(normalisasiNoWa("6281234567890"), "6281234567890");
    assert.equal(normalisasiNoWa("+6281234567890"), "6281234567890");
    assert.equal(normalisasiNoWa("+62 812-3456-7890"), "6281234567890");
    assert.equal(normalisasiNoWa(" 0812 3456 7890 "), "6281234567890");
    assert.equal(normalisasiNoWa("(0812) 3456.7890"), "6281234567890");
  });
  it("batas panjang: 628 + 8 s.d. 12 digit", () => {
    assert.equal(normalisasiNoWa("0812345678"), "62812345678"); // 8 digit setelah 628
    assert.equal(normalisasiNoWa("0812345678901234"), null); // 14 digit setelah 628
    assert.equal(normalisasiNoWa("081234567"), null); // 7 digit setelah 628
    assert.equal(normalisasiNoWa("08123456789012"), "628123456789012"); // 12 digit
  });
  it("menolak format lain", () => {
    for (const v of ["", "abc", "0812abc4567", "021555123", "+1 415 555 0101", "812345678", "+0812345678", "62212345678", null, 81234567890]) {
      assert.equal(normalisasiNoWa(v), null, String(v));
    }
  });
});

describe("atribusi dm_attr", () => {
  it("URL tanpa utm/fbclid -> tidak ada atribusi", () => {
    assert.equal(buatAtribusiDariUrl(new URLSearchParams("a=1"), "/"), null);
  });
  it("membuang karakter aneh & memotong panjang", () => {
    const attr = buatAtribusiDariUrl(
      new URLSearchParams({ utm_source: "<script>ig</script>", utm_campaign: "x".repeat(300), fbclid: "Ab_9-z" }),
      "/assessment",
      42,
    )!;
    assert.equal(attr.utm_source, "scriptigscript");
    assert.equal(attr.utm_campaign!.length, ATTR_MAX_PANJANG);
    assert.equal(attr.fbclid, "Ab_9-z");
    assert.equal(attr.landing_path, "/assessment");
    assert.equal(attr.ts, 42);
  });
  it("cookie dibaca ulang dengan validasi: rusak/terlalu panjang/tanpa utm -> null; nilai dibersihkan", () => {
    assert.equal(parseAtribusiCookie("bukan json"), null);
    assert.equal(parseAtribusiCookie("[1,2]"), null);
    assert.equal(parseAtribusiCookie(JSON.stringify({ landing_path: "/", ts: 1 })), null);
    assert.equal(parseAtribusiCookie("x".repeat(3000)), null);
    const attr = parseAtribusiCookie(
      JSON.stringify({ utm_source: "ig\"';--", utm_campaign: 123, landing_path: "//evil.com", ts: "x" }),
    )!;
    assert.equal(attr.utm_source, "ig--");
    assert.equal(attr.utm_campaign, null);
    assert.equal(attr.landing_path, null);
    assert.equal(attr.ts, 0);
  });
  it("register: query UTM diutamakan; kosong -> dari dm_attr", () => {
    const attr = parseAtribusiCookie(JSON.stringify({ utm_source: "ig", utm_campaign: "tes", ts: 1 }));
    assert.deepEqual(pilihUtmPendaftaran("meta", undefined, attr), { utmSource: "meta", utmCampaign: null });
    assert.deepEqual(pilihUtmPendaftaran(" ", "", attr), { utmSource: "ig", utmCampaign: "tes" });
    assert.deepEqual(pilihUtmPendaftaran(undefined, undefined, null), { utmSource: null, utmCampaign: null });
  });

  function jalankanProxy(url: string, cookie = "") {
    return proxyMod.proxy(new NextRequest(url, { headers: cookie ? { cookie } : {} }));
  }

  it("proxy: kunjungan pertama dengan UTM memasang dm_attr (httpOnly, lax, 30 hari)", () => {
    const res = jalankanProxy("http://localhost/?utm_source=ig&utm_campaign=tes");
    const c = res.cookies.get(ATTR_COOKIE_NAME)!;
    assert.ok(c);
    const attr = parseAtribusiCookie(c.value)!;
    assert.equal(attr.utm_source, "ig");
    assert.equal(attr.utm_campaign, "tes");
    assert.equal(attr.landing_path, "/");
    assert.equal(c.httpOnly, true);
    assert.equal(c.sameSite, "lax");
    assert.equal(c.maxAge, 60 * 60 * 24 * 30);
    // dm_trial_id tetap hanya di /assessment
    assert.equal(res.cookies.get(TRIAL_COOKIE_NAME), undefined);
  });
  it("proxy: first-touch — UTM berbeda di kunjungan kedua tidak menimpa", () => {
    const res = jalankanProxy("http://localhost/assessment?utm_source=tiktok&utm_campaign=lain", attrCookie("tes"));
    assert.equal(res.cookies.get(ATTR_COOKIE_NAME), undefined);
    assert.ok(res.cookies.get(TRIAL_COOKIE_NAME)); // trial tetap dipasang di /assessment
  });
  it("proxy: tanpa UTM tidak memasang dm_attr; trial tidak ditimpa", () => {
    const res = jalankanProxy("http://localhost/assessment", `${TRIAL_COOKIE_NAME}=${TRIAL_A}`);
    assert.equal(res.cookies.get(ATTR_COOKIE_NAME), undefined);
    assert.equal(res.cookies.get(TRIAL_COOKIE_NAME), undefined);
  });
});

describe("POST /api/leads", () => {
  const valid = { noWa: "081234567890", consent: true, assessmentId: ASSESSMENT_A };

  it("tanpa centang persetujuan -> 400, tidak tersimpan", async () => {
    for (const consent of [false, undefined, "true", 1]) {
      const res = await postLead({ ...valid, consent });
      assert.equal(res.status, 400);
    }
    assert.equal(db.leads.length, 0);
  });

  it("nomor tidak valid -> 400", async () => {
    const res = await postLead({ ...valid, noWa: "12345" });
    assert.equal(res.status, 400);
  });

  it("honeypot terisi -> balas sukses tanpa menyimpan", async () => {
    const res = await postLead({ ...valid, website: "http://spam" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).success, true);
    assert.equal(db.leads.length, 0);
  });

  it("tersimpan dengan atribusi dari cookie (bukan body) & versi consent dari server", async () => {
    const res = await postLead(
      { ...valid, nama: "  Budi  ", consent_versi: "palsu", consentVersi: "palsu", utm_campaign: "dari-body" },
      { attr: attrCookie("tes") },
    );
    assert.equal(res.status, 200);
    assert.equal(db.leads.length, 1);
    const lead = db.leads[0];
    assert.equal(lead.no_wa, "6281234567890");
    assert.equal(lead.nama, "Budi");
    assert.equal(lead.consent_versi, CONSENT_VERSI);
    assert.equal(lead.consent_wa, true);
    assert.equal(lead.utm_campaign, "tes");
    assert.equal(lead.utm_source, "ig");
    assert.equal(lead.assessment_id, ASSESSMENT_A);
    assert.equal(lead.anonymous_trial_id, TRIAL_A);
    assert.equal(lead.sumber, "assessment_snbp");
  });

  it("nomor sama (0812… lalu +62812…) -> satu baris, jumlah_submit 2, data pertama tidak ditimpa", async () => {
    const r1 = await postLead({ ...valid, nama: "Pertama" }, { attr: attrCookie("pertama") });
    db.leads[0].status = "dihubungi";
    const r2 = await postLead(
      { noWa: "+62 812-3456-7890", consent: true, nama: "Kedua", assessmentId: ASSESSMENT_B },
      { trial: TRIAL_B, attr: attrCookie("kedua") },
    );
    assert.equal(db.leads.length, 1);
    const lead = db.leads[0];
    assert.equal(lead.jumlah_submit, 2);
    assert.equal(lead.utm_campaign, "pertama");
    assert.equal(lead.nama, "Pertama");
    assert.equal(lead.status, "dihubungi");
    assert.equal(lead.assessment_id, ASSESSMENT_B); // assessment terbaru
    // Respons identik: tidak membocorkan nomor sudah ada.
    assert.deepEqual(await r1.json(), await r2.json());
  });

  it("assessment milik trial lain -> 403", async () => {
    const res = await postLead({ ...valid, assessmentId: ASSESSMENT_B });
    assert.equal(res.status, 403);
    assert.equal(db.leads.length, 0);
  });

  it("assessment milik user login lain / tamu tanpa cookie -> 403; pemilik login -> boleh", async () => {
    assert.equal((await postLead({ ...valid, assessmentId: ASSESSMENT_SISWA })).status, 403);
    assert.equal((await postLead({ ...valid }, { trial: null })).status, 403);
    const ok = await postLead(
      { ...valid, assessmentId: ASSESSMENT_SISWA },
      { trial: null, session: { userId: SISWA, role: "student" } },
    );
    assert.equal(ok.status, 200);
    assert.equal(db.leads[0].user_id, SISWA);
  });

  it(`rate limit: percobaan ke-${LEAD_RATE_LIMIT_PER_TRIAL + 1} per trial dalam 1 jam -> 429`, async () => {
    for (let i = 0; i < LEAD_RATE_LIMIT_PER_TRIAL; i++) {
      const res = await postLead({ ...valid, noWa: `08123456789${i}` }, { ip: `10.0.0.${i + 10}` });
      assert.equal(res.status, 200);
    }
    const res = await postLead({ ...valid, noWa: "081299999999" }, { ip: "10.0.0.99" });
    assert.equal(res.status, 429);
    assert.equal(db.leads.length, LEAD_RATE_LIMIT_PER_TRIAL);
    // IP tidak pernah disimpan mentah
    assert.ok(db.lead_rate_limit.every((r) => !String(r.kunci).includes("10.0.0.")));
  });
});

describe("export CSV anti-injection", () => {
  it("sel diawali = + - @ tab diberi awalan tanda kutip", () => {
    assert.equal(selCsvAman('=HYPERLINK("http://x","klik")'), `"'=HYPERLINK(""http://x"",""klik"")"`);
    assert.equal(selCsvAman("+1"), `"'+1"`);
    assert.equal(selCsvAman("-2"), `"'-2"`);
    assert.equal(selCsvAman("@SUM(A1)"), `"'@SUM(A1)"`);
    assert.equal(selCsvAman("\t=1"), `"'\t=1"`);
    assert.equal(selCsvAman("6281234567890"), `"6281234567890"`);
    assert.equal(selCsvAman(null), `""`);
  });
  it("buatCsv: BOM + header + CRLF", () => {
    assert.equal(buatCsv(["a", "b"], [["=1", 2]]), `﻿"a","b"\r\n"'=1","2"\r\n`);
  });
  it("export admin: nama '=HYPERLINK(...)' tidak menjadi rumus, nomor format 628", async () => {
    await postLead({ noWa: "0812 3456 7890", consent: true, nama: '=HYPERLINK("http://evil","x")' });
    const res = await adminExport.GET(adminRequest("http://localhost/api/admin/leads/export", "admin", ADMIN));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
    const csv = await res.text();
    assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"",""x"")"`));
    assert.ok(csv.includes(`"6281234567890"`));
    assert.ok(!/(^|,)"=/m.test(csv));
  });
});

describe("otorisasi API Admin leads", () => {
  it("siswa & mentor -> 403 di daftar, ubah, export; tanpa login -> 401", async () => {
    await postLead({ noWa: "081234567890", consent: true });
    const leadId = db.leads[0].id as string;
    for (const [role, userId] of [["student", SISWA], ["mentor", MENTOR]] as const) {
      assert.equal((await adminList.GET(adminRequest("http://localhost/api/admin/leads", role, userId))).status, 403);
      assert.equal((await adminExport.GET(adminRequest("http://localhost/api/admin/leads/export", role, userId))).status, 403);
      const patch = await adminPatch.PATCH(
        adminRequest(`http://localhost/api/admin/leads/${leadId}`, role, userId, { method: "PATCH", body: { status: "daftar" } }),
        { params: Promise.resolve({ id: leadId }) },
      );
      assert.equal(patch.status, 403);
    }
    assert.equal(db.leads[0].status, "baru");
    assert.equal((await adminList.GET(new NextRequest("http://localhost/api/admin/leads"))).status, 401);
  });

  it("role admin di cookie tapi tidak aktif di DB -> 403", async () => {
    db.user_roles = db.user_roles.filter((r) => r.user_id !== ADMIN);
    assert.equal((await adminList.GET(adminRequest("http://localhost/api/admin/leads", "admin", ADMIN))).status, 403);
  });

  it("admin: daftar dengan filter utm_campaign, ubah status tercatat di log, catatan tersimpan", async () => {
    await postLead({ noWa: "081234567890", consent: true }, { attr: attrCookie("tes") });
    await postLead({ noWa: "081298765432", consent: true }, { attr: attrCookie("lain"), trial: TRIAL_B });

    const list = await adminList.GET(adminRequest("http://localhost/api/admin/leads?utm_campaign=tes", "admin", ADMIN));
    const json = await list.json();
    assert.equal(json.success, true);
    assert.equal(json.leads.length, 1);
    assert.equal(json.leads[0].utmCampaign, "tes");
    assert.deepEqual(json.campaignOptions, ["lain", "tes"]);

    const cari = await (await adminList.GET(adminRequest("http://localhost/api/admin/leads?q=0812-9876", "admin", ADMIN))).json();
    assert.equal(cari.leads.length, 1);
    assert.equal(cari.leads[0].noWa, "6281298765432");

    const leadId = json.leads[0].id as string;
    const patch = await adminPatch.PATCH(
      adminRequest(`http://localhost/api/admin/leads/${leadId}`, "admin", ADMIN, {
        method: "PATCH",
        body: { status: "dihubungi", catatan: "  sudah chat  " },
      }),
      { params: Promise.resolve({ id: leadId }) },
    );
    assert.equal(patch.status, 200);
    const lead = db.leads.find((l) => l.id === leadId)!;
    assert.equal(lead.status, "dihubungi");
    assert.equal(lead.catatan, "sudah chat");
    assert.equal(db.lead_status_log.length, 1);
    assert.equal(db.lead_status_log[0].admin_id, ADMIN);
    assert.equal(db.lead_status_log[0].status_lama, "baru");
    assert.equal(db.lead_status_log[0].status_baru, "dihubungi");

    const salah = await adminPatch.PATCH(
      adminRequest(`http://localhost/api/admin/leads/${leadId}`, "admin", ADMIN, { method: "PATCH", body: { status: "hacked" } }),
      { params: Promise.resolve({ id: leadId }) },
    );
    assert.equal(salah.status, 400);
  });
});
