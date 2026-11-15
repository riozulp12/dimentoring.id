/**
 * Test notifikasi penerimaan siswa (B2): (1) mentor yang kalah + penerima dapat
 * notifikasi web setelah klaim, kegagalan kirim tidak membatalkan klaim;
 * (2) teks email/WhatsApp/lonceng "siswa baru" bersyarat — hanya subtes yang
 * perlu diterima (>=2 pemegang aktif) memakai kalimat "menerima lebih dulu";
 * (3) notifyMentorsSiswaBaruDaftar tetap tidak pernah melempar dan tanda
 * tangannya tidak berubah. Supabase dan Resend TIRUAN (tidak ada jaringan nyata).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null };

let db: Db;
let tabelGagal: Set<string>;
/** Insert ke tabel ini mengembalikan galat (tanpa melempar) — meniru gagal kirim notifikasi. */
let insertGagal: Set<string>;

class FakeQuery implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
  private mutation: Row | null = null;
  private single = false;

  constructor(
    private rows: Row[],
    private gagal: boolean,
  ) {}

  select() {
    return this;
  }
  update(values: Row) {
    this.mutation = values;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<A, B>(onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    if (this.gagal) return Promise.resolve({ data: null, error: { message: "galat tiruan" } } as Hasil).then(onfulfilled, onrejected);
    const cocok = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.mutation) for (const row of cocok) Object.assign(row, this.mutation);
    return Promise.resolve({ data: this.single ? (cocok[0] ?? null) : cocok, error: null } as Hasil).then(onfulfilled, onrejected);
  }
}

function fakeFrom(table: string) {
  db[table] ??= [];
  let rows = db[table];
  if (table === "kelas_subtes_mentor") {
    // embed: users:mentor_id(...) dan subtes:subtes_id(nama)
    rows = rows.map((row) => ({
      ...row,
      users: db.users.find((u) => u.id === row.mentor_id) ?? null,
      subtes: db.subtes.find((s) => s.id === row.subtes_id) ?? null,
    }));
  }
  const query = new FakeQuery(rows, tabelGagal.has(table));
  return Object.assign(query, {
    insert(values: Row | Row[]) {
      if (insertGagal.has(table)) return Promise.resolve({ data: null, error: { message: "insert gagal tiruan" } });
      db[table].push(...(Array.isArray(values) ? values : [values]));
      return Promise.resolve({ data: null, error: null });
    },
  });
}

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const D = "mentor-d"; // satu-satunya pemegang Fisika
const E_PENDING = "mentor-e";
const BARU = "2026-11-16T10:00:00+07:00";

type NotifyModule = typeof import("@/lib/notifikasi/notify");
type RouteModule = typeof import("@/app/api/mentor/terima-siswa/route");
type SessionModule = typeof import("@/lib/auth/session");
type WaModule = typeof import("@/lib/notifikasi/wa/pesan");
type EmailModule = typeof import("@/lib/email/kirimEmailMentorSiswaBaru");
let notify: NotifyModule;
let route: RouteModule;
let sessionLib: SessionModule;
let wa: WaModule;
let emailLib: EmailModule;

const ENV_ASLI = { ...process.env };
const FETCH_ASLI = globalThis.fetch;
let terkirimEmail: Array<{ to: string[]; subject: string; html: string; text: string }>;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  notify = await import("@/lib/notifikasi/notify");
  route = await import("@/app/api/mentor/terima-siswa/route");
  sessionLib = await import("@/lib/auth/session");
  wa = await import("@/lib/notifikasi/wa/pesan");
  emailLib = await import("@/lib/email/kirimEmailMentorSiswaBaru");
});

after(() => {
  process.env = { ...ENV_ASLI };
  globalThis.fetch = FETCH_ASLI;
});

beforeEach(async () => {
  tabelGagal = new Set();
  insertGagal = new Set();
  terkirimEmail = [];
  delete process.env.WA_NOTIF_ENABLED;
  process.env.RESEND_API_KEY = "re_test_kunci_rahasia";
  // Resend memakai fetch: tangkap isi email, tidak ada jaringan nyata.
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    terkirimEmail.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const { resetPenjagaEmailUntukTes } = await import("@/lib/notifikasi/siswaBaru");
  resetPenjagaEmailUntukTes();

  db = {
    subtes: [
      { id: "s-mtk", nama: "Matematika TKA" },
      { id: "s-fis", nama: "Fisika" },
    ],
    kelas: [{ id: "K1", nama: "Matematika TKA Intensif" }],
    enrollments: [{ id: "e-baru", user_id: "siswa-1", kelas_id: "K1", tanggal_daftar: BARU }],
    enrollment_subtes: [{ id: "es-baru-mtk", enrollment_id: "e-baru", subtes_id: "s-mtk", mentor_id: null, diterima_pada: null }],
    kelas_subtes_mentor: [
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: A },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: B },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: C },
      { kelas_id: "K1", subtes_id: "s-mtk", mentor_id: E_PENDING },
      { kelas_id: "K1", subtes_id: "s-fis", mentor_id: D },
    ],
    user_roles: [A, B, C, D].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })).concat([{ user_id: E_PENDING, role_type: "mentor", status: "pending" }]),
    users: [
      { id: A, nama: "Mentor A", email: "a@contoh.id", notif_email: true },
      { id: B, nama: "Mentor B", email: "b@contoh.id", notif_email: true },
      { id: C, nama: "Mentor C", email: "c@contoh.id", notif_email: true },
      { id: D, nama: "Mentor D", email: "d@contoh.id", notif_email: true },
      { id: E_PENDING, nama: "Mentor E", email: "e@contoh.id", notif_email: true },
      { id: "siswa-1", nama: "Budi Santoso", email: "budi@contoh.id" },
    ],
    notifikasi: [],
  };
});

const bell = (userId: string) => db.notifikasi.filter((n) => n.user_id === userId);

async function terimaLewatRoute(mentorId: string, enrollmentSubtesId = "es-baru-mtk") {
  const token = sessionLib.createSessionToken({ userId: mentorId, role: "mentor" });
  const request = new NextRequest("http://localhost/api/mentor/terima-siswa", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${token}` },
    body: JSON.stringify({ enrollmentSubtesId }),
  });
  const response = await route.POST(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

function diamkanLog<T>(fn: () => Promise<T>): Promise<T> {
  const asli = { error: console.error, warn: console.warn };
  console.error = () => {};
  console.warn = () => {};
  return fn().finally(() => {
    console.error = asli.error;
    console.warn = asli.warn;
  });
}

describe("notifikasi setelah klaim (B2 #8)", () => {
  it("penerima dapat konfirmasi; pemegang aktif LAIN dapat 'sudah diterima mentor lain'; non-pemegang/nonaktif tidak", async () => {
    const res = await terimaLewatRoute(A);
    assert.equal(res.status, 200);

    assert.equal(bell(A).length, 1);
    assert.match(String(bell(A)[0].pesan), /Kamu menerima siswa baru untuk subtes Matematika TKA di kelas Matematika TKA Intensif/);
    for (const kalah of [B, C]) {
      assert.equal(bell(kalah).length, 1, kalah);
      assert.match(String(bell(kalah)[0].judul), /sudah diterima mentor lain/);
      assert.match(String(bell(kalah)[0].pesan), /subtes Matematika TKA.*sudah diterima mentor lain/);
      assert.equal(bell(kalah)[0].link_tujuan, "/kelas-saya/K1");
    }
    assert.equal(bell(D).length, 0, "pemegang subtes LAIN tidak ikut diberi tahu");
    assert.equal(bell(E_PENDING).length, 0, "mentor nonaktif tidak diberi tahu");
  });

  it("lonceng tidak memuat nama siswa (privasi anak)", async () => {
    await terimaLewatRoute(A);
    assert.ok(!JSON.stringify(db.notifikasi).includes("Budi"));
  });

  it("tekan dua kali (idempoten) TIDAK mengirim notifikasi ganda", async () => {
    await terimaLewatRoute(A);
    const jumlah = db.notifikasi.length;
    const kedua = await terimaLewatRoute(A);
    assert.equal(kedua.status, 200);
    assert.equal(db.notifikasi.length, jumlah);
  });

  it("mentor yang KALAH (409) tidak membuat notifikasi baru", async () => {
    await terimaLewatRoute(A);
    const jumlah = db.notifikasi.length;
    assert.equal((await terimaLewatRoute(B)).status, 409);
    assert.equal(db.notifikasi.length, jumlah);
  });

  it("gagal kirim notifikasi TIDAK membatalkan klaim (tetap 200, penerima tercatat)", async () => {
    insertGagal = new Set(["notifikasi"]);
    const res = await diamkanLog(() => terimaLewatRoute(A));
    assert.equal(res.status, 200);
    assert.equal(db.enrollment_subtes[0].mentor_id, A);
    assert.equal(db.notifikasi.length, 0);
  });

  it("gagal membaca data notifikasi (tabel galat) TIDAK melempar dan klaim tetap sah", async () => {
    tabelGagal = new Set(["kelas_subtes_mentor"]);
    // klaim sendiri butuh kelas_subtes_mentor -> pakai gagal HANYA setelah klaim: panggil notify langsung
    tabelGagal = new Set();
    await terimaLewatRoute(A);
    db.notifikasi.length = 0;
    tabelGagal = new Set(["kelas_subtes_mentor", "user_roles", "kelas"]);
    await diamkanLog(async () => {
      await assert.doesNotReject(notify.notifyPenerimaanSiswa("es-baru-mtk", A));
    });
    assert.equal(db.enrollment_subtes[0].mentor_id, A);
  });

  it("notifyPenerimaanSiswa untuk id yang tidak ada: tidak melempar, tidak membuat notifikasi", async () => {
    await assert.doesNotReject(notify.notifyPenerimaanSiswa("tidak-ada", A));
    assert.equal(db.notifikasi.length, 0);
  });
});

describe("teks 'siswa baru' bersyarat (B2 #9) — lewat notifyMentorsSiswaBaruDaftar sampai Resend tiruan", () => {
  const SISWA = { kejadianId: "pay-1", siswaUserId: "siswa-1" };
  const emailKe = (alamat: string) => terkirimEmail.find((e) => e.to.includes(alamat));

  it("subtes multi-mentor: mentor aktif dapat teks 'siapa menerima lebih dulu' di lonceng DAN email", async () => {
    await notify.notifyMentorsSiswaBaruDaftar("K1", "Matematika TKA Intensif", "Senin 16.00", ["s-mtk"], SISWA);
    for (const id of [A, B, C]) {
      assert.match(String(bell(id)[0].pesan), /subtes Matematika TKA\)\. Siapa yang menerima lebih dulu akan mengajar siswa ini/, id);
    }
    for (const alamat of ["a@contoh.id", "b@contoh.id", "c@contoh.id"]) {
      const email = emailKe(alamat);
      assert.ok(email, alamat);
      for (const bagian of [email.html, email.text]) {
        assert.ok(bagian.includes("Ada siswa baru di kelas Matematika TKA Intensif (subtes Matematika TKA)."), alamat);
        assert.ok(bagian.includes("Siapa yang menerima lebih dulu akan mengajar siswa ini."), alamat);
        assert.ok(bagian.includes("Buka tombol di atas untuk menerima."), alamat);
      }
      assert.equal(email.subject, "Ada siswa baru di kelas Matematika TKA Intensif");
    }
  });

  it("subtes 1 mentor (Fisika): teks sekarang, TANPA kata 'menerima' / 'Penerimaan siswa'", async () => {
    db.enrollment_subtes = [{ id: "es-fis", enrollment_id: "e-baru", subtes_id: "s-fis", mentor_id: null, diterima_pada: null }];
    await notify.notifyMentorsSiswaBaruDaftar("K1", "Matematika TKA Intensif", "Senin 16.00", ["s-fis"], SISWA);
    assert.equal(bell(D).length, 1);
    assert.doesNotMatch(String(bell(D)[0].pesan), /menerima|Penerimaan siswa/i);
    const email = emailKe("d@contoh.id");
    assert.ok(email);
    for (const bagian of [email.html, email.text, email.subject]) assert.doesNotMatch(bagian, /menerima|Penerimaan siswa/i);
    assert.ok(email.text.includes("Buka tombol di atas untuk melihat kelas dan siswa barumu."));
  });

  it("siswa pilih Matematika + Fisika: pemegang Matematika dapat teks klaim, mentor Fisika (1 mentor) teks biasa", async () => {
    await notify.notifyMentorsSiswaBaruDaftar("K1", "Matematika TKA Intensif", "Senin 16.00", ["s-mtk", "s-fis"], SISWA);
    assert.match(String(bell(A)[0].pesan), /menerima lebih dulu/);
    assert.doesNotMatch(String(bell(D)[0].pesan), /menerima/i);
    assert.match(emailKe("a@contoh.id")!.text, /menerima lebih dulu/);
    assert.doesNotMatch(emailKe("d@contoh.id")!.text, /menerima|Penerimaan siswa/i);
  });

  it("mentor NONAKTIF yang ikut dinotifikasi (perilaku lama) tidak dijanjikan 'menerima'", async () => {
    await notify.notifyMentorsSiswaBaruDaftar("K1", "Matematika TKA Intensif", "Senin 16.00", ["s-mtk"], SISWA);
    assert.equal(bell(E_PENDING).length, 1);
    assert.doesNotMatch(String(bell(E_PENDING)[0].pesan), /menerima/i);
  });

  it("subtes dipegang 2 mentor aktif -> klaim; 1 aktif + 1 nonaktif -> BUKAN klaim", async () => {
    db.kelas_subtes_mentor = db.kelas_subtes_mentor.filter((p) => p.subtes_id !== "s-mtk" || p.mentor_id === A || p.mentor_id === E_PENDING);
    await notify.notifyMentorsSiswaBaruDaftar("K1", "Matematika TKA Intensif", "Senin 16.00", ["s-mtk"], SISWA);
    assert.doesNotMatch(String(bell(A)[0].pesan), /menerima/i);
  });

  it("tanpa pilihan subtes (kelas tanpa subtes): teks sekarang tanpa kata 'menerima'", async () => {
    db.kelas_mentor = [{ kelas_id: "K1", mentor_id: A }];
    db.users.find((u) => u.id === A)!.email = "a@contoh.id";
    await notify.notifyMentorsSiswaBaruDaftar("K1", "Kelas Konsultasi", null, [], SISWA);
    assert.ok(bell(A).length <= 1);
    assert.ok(db.notifikasi.every((n) => !/menerima/i.test(String(n.pesan))));
  });

  it("gagal membaca user_roles: TIDAK melempar, jatuh ke teks biasa (bell tetap dibuat)", async () => {
    tabelGagal = new Set(["user_roles"]);
    await diamkanLog(async () => {
      await assert.doesNotReject(notify.notifyMentorsSiswaBaruDaftar("K1", "Matematika TKA Intensif", "Senin 16.00", ["s-mtk"], SISWA));
    });
    assert.equal(bell(A).length, 1);
    assert.doesNotMatch(String(bell(A)[0].pesan), /menerima/i);
  });

  it("gagal insert bell: TIDAK melempar", async () => {
    insertGagal = new Set(["notifikasi"]);
    await diamkanLog(async () => {
      await assert.doesNotReject(notify.notifyMentorsSiswaBaruDaftar("K1", "Matematika TKA Intensif", "Senin 16.00", ["s-mtk"], SISWA));
    });
  });
});

describe("teks WhatsApp & isi email (unit)", () => {
  it("WA: subtes perlu klaim memuat kalimat menerima; tanpa subtes = teks lama tanpa kata menerima", () => {
    const klaim = wa.buatPesanWaSiswaBaru("Rina", "Intensif UTBK", "Matematika TKA");
    assert.ok(klaim.includes("(subtes Matematika TKA)"));
    assert.ok(klaim.includes("Siapa yang menerima lebih dulu akan mengajar siswa ini."));
    const biasa = wa.buatPesanWaSiswaBaru("Rina", "Intensif UTBK");
    assert.doesNotMatch(biasa, /menerima|Penerimaan siswa/i);
    assert.doesNotMatch(wa.buatPesanWaSiswaBaru("Rina", "Intensif UTBK", null), /menerima/i);
    assert.doesNotMatch(wa.buatPesanWaSiswaBaru("Rina", "Intensif UTBK", ""), /menerima/i);
  });

  it("WA: tidak memuat nama siswa dan satu baris walau nama subtes berisi karakter kontrol", () => {
    const pesan = wa.buatPesanWaSiswaBaru("Rina", "Kelas", "Mate\nmatika\r\nKlik http://jahat.test");
    assert.ok(!/[\r\n]/.test(pesan));
  });

  it("email: nama subtes/kelas jahat di-escape di HTML", () => {
    const isi = {
      namaMentor: "Rina",
      namaSiswa: "Budi",
      kelasNama: "Kelas <script>x</script>",
      jadwalDisplay: null,
      tautan: "https://dimentoring.id/kelas-saya/k",
      subtesKlaim: "<img src=x onerror=1>",
    };
    const html = emailLib.buatHtmlSiswaBaru(isi);
    assert.ok(!html.includes("<script>x</script>"));
    assert.ok(!html.includes("<img src=x onerror=1>"));
    assert.ok(html.includes("&lt;img src=x onerror=1&gt;"));
  });

  it("email tanpa subtesKlaim identik dengan sebelumnya (tidak ada kata menerima)", () => {
    const teks = emailLib.buatTeksSiswaBaru({ namaMentor: "Rina", namaSiswa: "Budi", kelasNama: "Kelas A", jadwalDisplay: null, tautan: "https://dimentoring.id/kelas-saya/k" });
    assert.doesNotMatch(teks, /menerima|Penerimaan siswa/i);
  });
});

describe("tanda tangan & sifat notify tidak berubah", () => {
  const sumber = readFileSync("lib/notifikasi/notify.ts", "utf8");

  it("tanda tangan notifyMentorsSiswaBaruDaftar / notifyMentorOfflineSiswaBaruDaftar / kabariMentorSiswaBaru tetap", () => {
    assert.match(
      sumber,
      /export async function notifyMentorsSiswaBaruDaftar\(\s*kelasId: string,\s*kelasNama: string,\s*jadwalDisplay: string \| null,\s*subtesIds: string\[\] = \[\],\s*siswa: SiswaBaruInfo,\s*\)/,
    );
    assert.match(
      sumber,
      /export async function notifyMentorOfflineSiswaBaruDaftar\(\s*mentorUserId: string,\s*kelasId: string,\s*kelasNama: string,\s*jadwalDisplay: string \| null,\s*siswa: SiswaBaruInfo,\s*\)/,
    );
  });

  it("urutan pemanggilan: bell (insertNotifikasi) dulu, lalu kabariMentorLuarWeb (setelah respons)", () => {
    const awal = sumber.indexOf("export async function notifyMentorsSiswaBaruDaftar");
    const akhir = sumber.indexOf("export async function notifyMentorOfflineSiswaBaruDaftar");
    const badan = sumber.slice(awal, akhir);
    assert.ok(badan.indexOf("insertNotifikasi(") > 0);
    assert.ok(badan.indexOf("insertNotifikasi(") < badan.indexOf("await kabariMentorLuarWeb("));
    assert.match(sumber, /jalankanSetelahRespons\("notifikasi-siswa-baru"/);
  });

  it("fulfillPayment tidak berubah: tidak mengimpor logika penerimaan", () => {
    const fulfill = readFileSync("lib/payment/fulfillPayment.ts", "utf8");
    assert.ok(!/penerimaan|terimaSiswa|statusPenerimaan/i.test(fulfill));
  });
});
