/**
 * Test fitur "saran kelas/event + tombol kembali + Beasiswa & Event di /program" (Supabase TIRUAN di memori):
 *   (a) "Kelas lain di program ini": tidak memuat kelas tampil_di_katalog=false (mis. [UJI]), tidak memuat kelas
 *       yang sedang dibuka, hanya program yang sama, maksimal 3, jenjang sama lebih dulu; kosong = tidak dirender.
 *   (b) "Program lainnya": dari SEMUA jenis, tanpa event yang sedang dibuka, tanpa yang ditutup / lewat deadline,
 *       maksimal 3, urut deadline terdekat (tanpa deadline terakhir, lalu terbaru dibuat dulu); kosong = tidak dirender.
 *   (c) /program: Beasiswa & Event (program mahasiswa) tampil walau belum ada kelas di kategorinya, urutan section tetap,
 *       section yang benar-benar kosong tetap disembunyikan.
 *   + struktur halaman: tombol kembali memakai SATU komponen, data saran ikut Promise.all, tombol Daftar Sekarang utuh.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import { hariIniWib, kontenMasihBuka } from "@/lib/shared/kontenInfoTerbuka";
import { susunSectionProgram } from "@/lib/shared/programOverview";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
let db: Db;

class FakeQuery implements PromiseLike<{ data: Row[]; error: null; count: number }> {
  private urutan: Array<{ column: string; dir: 1 | -1 }> = [];
  constructor(private rows: Row[]) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.rows = this.rows.filter((row) => values.includes(row[column]));
    return this;
  }
  or() {
    return this;
  }
  /** Kunci urut menumpuk (order pertama = utama), seperti PostgREST; null/kosong selalu di akhir. */
  order(column: string, options?: { ascending?: boolean }) {
    this.urutan.push({ column, dir: options?.ascending === false ? -1 : 1 });
    return this;
  }
  private terurut(): Row[] {
    if (this.urutan.length === 0) return this.rows;
    return [...this.rows].sort((a, b) => {
      for (const { column, dir } of this.urutan) {
        const x = a[column] as string | null | undefined;
        const y = b[column] as string | null | undefined;
        if (x === y) continue;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return x < y ? -dir : dir;
      }
      return 0;
    });
  }
  limit(n: number) {
    this.rows = this.rows.slice(0, n);
    return this;
  }
  maybeSingle() {
    return Promise.resolve({ data: this.terurut()[0] ?? null, error: null });
  }
  then<A, B>(
    onfulfilled?: ((value: { data: Row[]; error: null; count: number }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    const hasil = this.terurut();
    return Promise.resolve({ data: hasil, error: null, count: hasil.length }).then(onfulfilled, onrejected);
  }
}

/** Catatan tabel yang dibaca (untuk membuktikan jumlah kueri). */
const dibacaLog: string[] = [];
const fakeFrom = (table: string) => {
  dibacaLog.push(table);
  return new FakeQuery(db[table] ?? []);
};

function kelas(id: string, extra: Row = {}): Row {
  return {
    id,
    nama: `Kelas ${id}`,
    tipe_kelas: "grouping",
    mode_pembelajaran: "online",
    harga: 100000,
    diskon_persen: 0,
    kapasitas: 10,
    deskripsi: null,
    program_kategori: "tka",
    tingkat_kelas: "kelas_12",
    link_lynkid: null,
    jadwal: null,
    jadwal_pilih_siswa: false,
    jumlah_sesi: 10,
    tampil_di_katalog: true,
    subtes_id: null,
    subtes: null,
    mentor: null,
    created_at: "2026-01-01",
    ...extra,
  };
}

/** Tanggal relatif hari ini (WIB) dalam format DATE konten_info.deadline. */
function tanggal(offsetHari: number): string {
  const [y, m, d] = hariIniWib().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetHari)).toISOString().slice(0, 10);
}

function konten(id: string, extra: Row = {}): Row {
  return { id, tipe: "beasiswa", judul: `Konten ${id}`, deskripsi: null, deadline: tanggal(30), status: "aktif", created_at: "2026-01-01", ...extra };
}

type ProgramModule = typeof import("@/lib/dashboard/getProgramData");
type InfoModule = typeof import("@/lib/dashboard/getInfoBeasiswaEvent");
let programData: ProgramModule;
let infoData: InfoModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  programData = await import("@/lib/dashboard/getProgramData");
  infoData = await import("@/lib/dashboard/getInfoBeasiswaEvent");
});

beforeEach(() => {
  db = {
    kelas: [
      kelas("T-BUKA", { tingkat_kelas: "kelas_12", created_at: "2026-01-05" }), // kelas yang sedang dibuka
      kelas("T-SAMA-1", { tingkat_kelas: "kelas_12", created_at: "2026-01-02" }),
      kelas("T-BEDA-1", { tingkat_kelas: "kelas_11", created_at: "2026-01-09" }), // terbaru, tapi jenjang beda
      kelas("T-BEDA-2", { tingkat_kelas: "gap_year", created_at: "2026-01-08" }),
      kelas("T-SAMA-2", { tingkat_kelas: "kelas_12", created_at: "2026-01-01" }),
      kelas("T-SEMBUNYI", { tampil_di_katalog: false, tingkat_kelas: "kelas_12", created_at: "2026-01-10" }),
      kelas("T-UJI", { nama: "[UJI] Presensi E2E", tampil_di_katalog: false, harga: 0, created_at: "2026-01-11" }),
      kelas("S-LAIN", { program_kategori: "snbt", created_at: "2026-01-12" }), // program lain
      kelas("M-SENDIRI", { program_kategori: "ujian_mandiri" }), // satu-satunya di programnya
    ],
    konten_info: [],
  };
});

describe('(a) "Kelas lain di program ini" — getKelasLainDiProgram', () => {
  it("tidak memuat kelas yang sedang dibuka, kelas tersembunyi ([UJI]/tampil_di_katalog=false), maupun program lain", async () => {
    const ids = (await programData.getKelasLainDiProgram("T-BUKA", 99)).map((k) => k.id);
    assert.ok(!ids.includes("T-BUKA"), "kelas yang sedang dibuka ikut tampil");
    assert.ok(!ids.includes("T-SEMBUNYI") && !ids.includes("T-UJI"), `kelas tersembunyi bocor: ${ids}`);
    assert.ok(!ids.includes("S-LAIN"), "kelas program lain ikut tampil");
    assert.deepEqual([...ids].sort(), ["T-BEDA-1", "T-BEDA-2", "T-SAMA-1", "T-SAMA-2"]);
  });

  it("maksimal 3 kartu (bawaan), jenjang yang sama lebih dulu lalu urutan katalog (terbaru dulu)", async () => {
    const ids = (await programData.getKelasLainDiProgram("T-BUKA")).map((k) => k.id);
    assert.equal(ids.length, 3);
    assert.deepEqual(ids, ["T-SAMA-1", "T-SAMA-2", "T-BEDA-1"]);
  });

  it("kelas tersembunyi tidak lolos walau kelas acuannya sendiri ada di katalog atau tidak", async () => {
    const dariAcuanTersembunyi = (await programData.getKelasLainDiProgram("T-UJI", 99)).map((k) => k.id);
    assert.ok(!dariAcuanTersembunyi.includes("T-UJI") && !dariAcuanTersembunyi.includes("T-SEMBUNYI"));
  });

  it("kelas yang tidak punya kelas lain di programnya → daftar kosong; id tidak dikenal → kosong", async () => {
    assert.deepEqual(await programData.getKelasLainDiProgram("M-SENDIRI"), []);
    assert.deepEqual(await programData.getKelasLainDiProgram("tidak-ada"), []);
  });

  it("urutkanKelasSaran stabil dan tidak mengubah array asal", () => {
    const asal = [{ id: "a", tingkat_kelas: "x" }, { id: "b", tingkat_kelas: "y" }, { id: "c", tingkat_kelas: "x" }];
    assert.deepEqual(programData.urutkanKelasSaran(asal, "y").map((r) => r.id), ["b", "a", "c"]);
    assert.deepEqual(asal.map((r) => r.id), ["a", "b", "c"]);
  });
});

describe("(b) hanya konten yang MASIH BUKA — kontenMasihBuka", () => {
  const hariIni = "2026-11-18";
  it("aktif + deadline belum lewat atau hari ini atau kosong = buka; ditutup atau lewat = tidak", () => {
    assert.equal(kontenMasihBuka({ status: "aktif", deadline: "2026-12-01" }, hariIni), true);
    assert.equal(kontenMasihBuka({ status: "aktif", deadline: "2026-11-18" }, hariIni), true);
    assert.equal(kontenMasihBuka({ status: "aktif", deadline: null }, hariIni), true);
    assert.equal(kontenMasihBuka({ status: "aktif", deadline: "2026-11-17" }, hariIni), false);
    assert.equal(kontenMasihBuka({ status: "ditutup", deadline: "2026-12-01" }, hariIni), false);
    assert.equal(kontenMasihBuka({ status: "draft", deadline: null }, hariIni), false);
  });

  it("hariIniWib memakai zona Asia/Jakarta (UTC+7)", () => {
    assert.equal(hariIniWib(new Date("2026-11-17T18:00:00Z")), "2026-11-18");
    assert.equal(hariIniWib(new Date("2026-11-17T16:59:00Z")), "2026-11-17");
  });
});

describe('(b) "Program lainnya" — getKontenInfoLainnya (semua jenis)', () => {
  beforeEach(() => {
    db.konten_info = [
      konten("E-BUKA", { tipe: "beasiswa", deadline: tanggal(10) }), // event yang sedang dibuka
      konten("E-1", { tipe: "beasiswa", deadline: tanggal(5) }),
      konten("E-2", { tipe: "webinar", deadline: tanggal(20) }),
      konten("E-TANPA", { tipe: "workshop", deadline: null }),
      konten("E-TUTUP", { tipe: "event", status: "ditutup", deadline: tanggal(3) }),
      konten("E-LEWAT", { tipe: "beasiswa", deadline: tanggal(-2) }), // masih 'aktif' tapi deadline lewat
      konten("E-INTERN", { tipe: "internship", deadline: tanggal(4) }), // jenis lain: SEKARANG ikut
      konten("E-HARI-INI", { tipe: "event", deadline: tanggal(0) }),
      konten("E-3", { tipe: "beasiswa", deadline: tanggal(40) }),
    ];
  });

  it("memuat event dari jenis lain (beasiswa → internship/webinar/event), tanpa yang sedang dibuka", async () => {
    const hasil = await infoData.getKontenInfoLainnya("E-BUKA", 99);
    const ids = hasil.map((k) => k.id);
    assert.ok(!ids.includes("E-BUKA"), "event yang sedang dibuka ikut tampil");
    assert.ok(ids.includes("E-INTERN") && ids.includes("E-2"), `jenis lain tidak ikut: ${ids}`);
    const jenis = new Set(hasil.map((k) => k.tipe));
    assert.ok(jenis.has("internship") && jenis.has("webinar") && jenis.has("event") && jenis.size >= 4, "jenis: " + [...jenis].join(","));
  });

  it("tidak memuat yang ditutup atau yang deadline-nya lewat; urut deadline terdekat, tanpa deadline paling akhir", async () => {
    const ids = (await infoData.getKontenInfoLainnya("E-BUKA", 99)).map((k) => k.id);
    for (const dilarang of ["E-BUKA", "E-TUTUP", "E-LEWAT"]) {
      assert.ok(!ids.includes(dilarang), `${dilarang} ikut tampil: ${ids}`);
    }
    assert.deepEqual(ids, ["E-HARI-INI", "E-INTERN", "E-1", "E-2", "E-3", "E-TANPA"]);
  });

  it("maksimal 3 kartu (bawaan)", async () => {
    assert.deepEqual((await infoData.getKontenInfoLainnya("E-BUKA")).map((k) => k.id), ["E-HARI-INI", "E-INTERN", "E-1"]);
  });

  it("deadline sama: yang terakhir dibuat tampil dulu; deadline sama dan dibuat sama: urutan asal tetap (stabil)", async () => {
    db.konten_info = [
      konten("X", { deadline: tanggal(7), created_at: "2026-02-01" }),
      konten("LAMA", { tipe: "webinar", deadline: tanggal(7), created_at: "2026-01-01" }),
      konten("BARU", { tipe: "internship", deadline: tanggal(7), created_at: "2026-03-01" }),
      konten("KEMBAR-1", { tipe: "event", deadline: tanggal(9), created_at: "2026-01-05" }),
      konten("KEMBAR-2", { tipe: "event", deadline: tanggal(9), created_at: "2026-01-05" }),
      konten("TANPA-LAMA", { deadline: null, created_at: "2026-01-01" }),
      konten("TANPA-BARU", { deadline: null, created_at: "2026-04-01" }),
    ];
    const ids = (await infoData.getKontenInfoLainnya("X", 99)).map((k) => k.id);
    assert.deepEqual(ids, ["BARU", "LAMA", "KEMBAR-1", "KEMBAR-2", "TANPA-BARU", "TANPA-LAMA"]);
  });

  it("event yang sedang dibuka sudah ditutup pun tetap hanya menyarankan yang masih buka", async () => {
    const hasil = await infoData.getKontenInfoLainnya("E-TUTUP");
    assert.ok(hasil.length > 0 && hasil.every((k) => k.status === "aktif"));
  });

  it("tidak ada event lain yang masih buka → kosong (bagian tidak dirender)", async () => {
    db.konten_info = [konten("SENDIRI"), konten("T", { status: "ditutup" }), konten("L", { deadline: tanggal(-1) })];
    assert.deepEqual(await infoData.getKontenInfoLainnya("SENDIRI"), []);
  });

  it("satu kueri saja (tanpa langkah acuan berantai)", async () => {
    dibacaLog.length = 0;
    await infoData.getKontenInfoLainnya("E-BUKA");
    assert.deepEqual(dibacaLog, ["konten_info"]);
  });
});

describe("(c) /program: Beasiswa & Event (program mahasiswa) ikut tampil", () => {
  const susun = async () =>
    susunSectionProgram(await programData.getProgramPreviewSections(), await infoData.getKontenInfoTerbuka({ limit: 3 }));

  it("tampil walau belum ada kelas di kategori pendampingan_mahasiswa, memuat info beasiswa yang masih buka", async () => {
    db.konten_info = [
      konten("B1", { tipe: "beasiswa", deadline: tanggal(7) }),
      konten("K1", { tipe: "internship", deadline: tanggal(9) }),
      konten("B-TUTUP", { status: "ditutup" }),
      konten("B-LEWAT", { deadline: tanggal(-5) }),
    ];
    const sections = await susun();
    const mahasiswa = sections.find((s) => s.kategori === "pendampingan_mahasiswa");
    assert.ok(mahasiswa, "section Beasiswa & Event tidak muncul");
    assert.equal(mahasiswa.kategoriLabel, "Beasiswa & Event");
    assert.equal(mahasiswa.slug, "pendampingan-mahasiswa");
    assert.deepEqual(mahasiswa.kontenInfo.map((k) => k.id), ["B1", "K1"]);
    assert.deepEqual(mahasiswa.items, []);
  });

  it("urutan section tetap mengikuti PROGRAM_KATEGORI_ORDER; section SMA tidak membawa konten info", async () => {
    db.konten_info = [konten("B1")];
    const kategori = (await susun()).map((s) => s.kategori);
    assert.deepEqual(kategori, ["tka", "snbt", "ujian_mandiri", "pendampingan_mahasiswa"]);
    for (const s of await susun()) {
      if (s.kategori !== "pendampingan_mahasiswa") assert.deepEqual(s.kontenInfo, []);
    }
  });

  it("section yang benar-benar kosong tetap disembunyikan (tanpa kelas dan tanpa konten)", async () => {
    db.konten_info = [konten("B-TUTUP", { status: "ditutup" }), konten("B-LEWAT", { deadline: tanggal(-1) })];
    assert.ok(!(await susun()).some((s) => s.kategori === "pendampingan_mahasiswa"));
    assert.ok(!(await susun()).some((s) => s.kategori === "konsultasi"));
  });

  it("kelas di kategori mahasiswa tetap tampil seperti sebelumnya (tanpa konten info)", async () => {
    db.kelas.push(kelas("MHS-1", { program_kategori: "pendampingan_mahasiswa" }));
    const mahasiswa = (await susun()).find((s) => s.kategori === "pendampingan_mahasiswa");
    assert.deepEqual(mahasiswa?.items.map((k) => k.id), ["MHS-1"]);
    assert.deepEqual(mahasiswa?.kontenInfo, []);
  });

  it("kelas tersembunyi tetap tidak muncul di /program", async () => {
    const ids = (await susun()).flatMap((s) => s.items.map((k) => k.id));
    assert.ok(!ids.includes("T-SEMBUNYI") && !ids.includes("T-UJI"));
  });
});

describe("struktur halaman", () => {
  const baca = (relatif: string) => readFileSync(path.join(process.cwd(), relatif), "utf8");
  const kelasPage = baca("app/program/kelas/[kelasId]/page.tsx");
  const eventPage = baca("app/beasiswa-event/[id]/page.tsx");
  const programPage = baca("app/program/page.tsx");

  it("tombol kembali di detail kelas dan detail event memakai SATU komponen BackLink", () => {
    for (const sumber of [kelasPage, eventPage]) {
      assert.ok(sumber.includes('import BackLink from "@/components/ui/BackLink";'));
      assert.ok(sumber.includes("<BackLink href="));
    }
    assert.match(kelasPage, /<BackLink href=\{`\/program\/\$\{PROGRAM_KATEGORI_SLUG\[kelas\.programKategori\]\}`\}>\{kelas\.programKategoriLabel\}<\/BackLink>/);
    assert.ok(eventPage.includes('<BackLink href="/beasiswa-event">{NAMA_BEASISWA_EVENT}</BackLink>'), "label kembali bukan per jenis");
    const komponen = baca("components/ui/BackLink.tsx");
    assert.ok(komponen.includes("&larr; {children}"));
    assert.ok(komponen.includes("text-sm font-medium text-[#081EEA] hover:underline"));
  });

  it("data saran diambil di Promise.all yang sama dengan data halaman (tidak berantai)", () => {
    assert.match(kelasPage, /Promise\.all\(\[\s*getKelasDetailPublic\(kelasId\),\s*getMateriPublicByKelasId\(kelasId\),\s*getKelasLainDiProgram\(kelasId\),?\s*\]\)/);
    assert.match(eventPage, /Promise\.all\(\[\s*getNavbarProps\(session\),[\s\S]*?getKontenInfoLainnya\(id\),?\s*\]\)/);
    assert.match(programPage, /Promise\.all\(\[\s*getNavbarProps\(session\),\s*getProgramPreviewSections\(\),\s*getKontenInfoTerbuka\(/);
  });

  it("kelas tersembunyi disaring lewat satu pintu katalog yang sama (tidak menduplikasi aturan filter)", () => {
    const lib = baca("lib/dashboard/getProgramData.ts");
    const awal = lib.indexOf("export async function getKelasLainDiProgram");
    const fungsi = lib.slice(awal, lib.indexOf("export interface KelasMentorInfo"));
    assert.ok(fungsi.includes("queryKelasKatalog()"));
    assert.ok(!fungsi.includes("tampil_di_katalog"));
  });

  it("tombol Daftar Sekarang dan alur pendaftaran tidak berubah", () => {
    // Kelas: komponen & prop yang sama; bagian saran ada SESUDAH blok tombol.
    assert.match(kelasPage, /<KelasDaftarButton\s+kelasId=\{kelas\.id\}\s+penuh=\{kelas\.kapasitasInfo\.penuh\}\s+ditutup=\{kelas\.kapasitasInfo\.ditutup === true\}\s+sessionRole=\{session\?\.role \?\? null\}\s+linkLynkid=\{kelas\.linkLynkid\}\s+variant="detail"\s*\/>/);
    assert.ok(kelasPage.indexOf("<KelasDaftarButton") < kelasPage.indexOf("<SaranKelasSection"));
    // Event: tautan pendaftaran eksternal tetap, dan tetap dinonaktifkan untuk ditutup / tanpa link.
    assert.ok(eventPage.includes('let ctaLabel = "Daftar Sekarang";'));
    assert.ok(eventPage.includes('"Pendaftaran Sudah Ditutup"') && eventPage.includes('"Link Pendaftaran Belum Tersedia"'));
    // Tautan eksternal kini lewat DaftarLeadLink (Meta Pixel Lead); tetap target _blank + noopener.
    assert.match(eventPage, /<DaftarLeadLink\s+href=\{linkPendaftaran as string\}/);
    const daftarLead = readFileSync("components/beasiswa-event/DaftarLeadLink.tsx", "utf8");
    assert.match(daftarLead, /target="_blank"\s+rel="noopener noreferrer"/);
    assert.ok(eventPage.includes("<DetailInteractionButtons kontenInfoId={konten.id as string} />"));
  });

  it("tidak menyentuh pembayaran, checkout, atau lib/mentor", () => {
    const berkas = [
      "components/ui/BackLink.tsx",
      "components/beasiswa-event/KontenInfoCard.tsx",
      "components/beasiswa-event/ProgramLainnyaSection.tsx",
      "components/program/SaranKelasSection.tsx",
      "lib/shared/programOverview.ts",
      "lib/shared/kontenInfoTerbuka.ts",
    ];
    for (const f of berkas) {
      const impor = Array.from(baca(f).matchAll(/^import[^;]*?from\s+"([^"]+)";/gm), (m) => m[1]);
      assert.deepEqual(impor.filter((s) => /payment|checkout|mayar|midtrans|lib\/mentor/i.test(s)), [], f);
    }
  });
});

/** Render komponen di PROSES TERPISAH tanpa kondisi "react-server" (react-dom/server menolaknya), kembalikan HTML-nya. */
function render(modul: string, props: unknown): string {
  const kode = `
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import(process.argv[1]);
    const Komponen = typeof mod.default === "function" ? mod.default : mod.default.default;
    const out = renderToStaticMarkup(React.createElement(Komponen, JSON.parse(process.argv[2])));
    process.stdout.write(out);
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, modul, JSON.stringify(props)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

const KAPASITAS = { penuh: false, hampirHabis: false, sisa: null, kapasitas: null, label: null };
const kartuKelas = (id: string, nama: string) => ({
  id, nama, tipeKelas: "grouping", tipeKelasLabel: "Grouping", modePembelajaran: "online", modePembelajaranLabel: "Online",
  harga: 100000, diskonPersen: 0, hargaSetelahDiskon: 100000, mentorNama: null, diskonAktif: null, kapasitasInfo: KAPASITAS,
  deskripsi: null, programKategori: "tka", tingkatKelas: "kelas_12", subtesNama: null, linkLynkid: null,
});

describe("render komponen saran (HTML sungguhan)", () => {
  it('"Kelas lain di program ini": judul, link ke detail tiap kelas, satu kolom di HP dan maksimal tiga di desktop', () => {
    const html = render("@/components/program/SaranKelasSection", {
      items: [kartuKelas("k1", "TKA Matematika"), kartuKelas("k2", "TKA Fisika"), kartuKelas("k3", "TKA Kimia")],
      sessionRole: null,
    });
    assert.ok(html.includes("Kelas lain di program ini"));
    for (const id of ["k1", "k2", "k3"]) assert.ok(html.includes(`href="/program/kelas/${id}"`), id);
    assert.ok(html.includes("grid-cols-1") && html.includes("lg:grid-cols-3"));
    assert.ok(!/lg:grid-cols-[4-9]/.test(html), "lebih dari tiga kolom di desktop");
    assert.ok(!html.includes("overflow-x-") && !html.includes("w-screen") && !html.includes("min-w-["), "berpotensi scroll horizontal");
  });

  it("tanpa kelas lain: tidak ada yang dirender sama sekali (tidak ada judul kosong)", () => {
    assert.equal(render("@/components/program/SaranKelasSection", { items: [], sessionRole: null }), "");
  });

  it('"Program lainnya": judul, kartu event menuju detail-nya, grid satu kolom di HP / tiga di desktop', () => {
    const items = [
      { id: "e1", tipe: "beasiswa", judul: "Beasiswa Satu", deskripsi: null, deadline: "2026-12-20", status: "aktif" },
      { id: "e2", tipe: "beasiswa", judul: "Beasiswa Dua", deskripsi: "ringkas", deadline: null, status: "aktif" },
    ];
    const html = render("@/components/beasiswa-event/ProgramLainnyaSection", { items });
    assert.ok(html.includes("Program lainnya"));
    assert.ok(html.includes('href="/beasiswa-event/e1"') && html.includes('href="/beasiswa-event/e2"'));
    assert.ok(html.includes("Beasiswa Satu") && html.includes("Masih Buka"));
    assert.ok(html.includes("grid-cols-1") && html.includes("lg:grid-cols-3"));
  });

  it("tanpa program lain: tidak ada yang dirender sama sekali", () => {
    assert.equal(render("@/components/beasiswa-event/ProgramLainnyaSection", { items: [] }), "");
  });

  it("BackLink: panah + label, gaya tautan yang sama dengan detail kelas", () => {
    const html = render("@/components/ui/BackLink", { href: "/beasiswa-event", children: "Beasiswa" });
    assert.match(html, /<a [^>]*href="\/beasiswa-event"[^>]*>←(?: |&nbsp;)?(?:<!-- -->)? ?(?:<!-- -->)?Beasiswa<\/a>/);
    assert.ok(html.includes("text-sm font-medium text-[#081EEA] hover:underline"));
  });
});
