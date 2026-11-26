/**
 * Bank Soal Admin: daftar/filter/paginasi, izin per sumber & status, API (guard,
 * validasi, argumen RPC, tabrakan edit) terhadap Supabase tiruan, dan TampilanSoal
 * (mode siswa tidak memuat kunci/pembahasan). Aturan database (versi baru, terbit
 * atomik, tabrakan, arsip, hapus, sumber manual) diuji di
 * db/test_studio_soal_impor_perawatan_DRYRUN.sql.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import type { PropsTampilanSoal } from "@/components/studio-soal/TampilanSoal";
import { ADMIN, ADMIN_NONAKTIF, SISWA, db, pasangDbTiruan, resetDbTiruan, rpc, tulisLangsung, u, type Row } from "./bantuan/dbTiruanSoal";
import { PER_HALAMAN, izinSoal, parseFilterBank, queryFilter, terjemahkanRpcAdmin } from "@/lib/shared/studio-soal/bankSoal";

const baca = (rel: string) => readFileSync(rel, "utf8");
const PU = u(101);
const PK = u(102);
const TOPIK = u(201);
const BATCH = u(501);
const S1 = u(1001);

const barisSoal = (n: number, ubah: Row = {}): Row => ({
  id: u(1000 + n),
  keluarga_id: u(3000 + n),
  versi: 1,
  menggantikan_id: null,
  subtes_id: PU,
  topik_id: null,
  stimulus_id: null,
  tipe: "pilihan_ganda",
  tingkat_kesulitan: "sedang",
  status: "draf",
  sumber: "buatan_sendiri",
  redaksi: `Soal nomor ${n}`,
  konten: { v: 1, opsi: ["A", "B", "C", "D", "E"].map((label) => ({ label, teks: `opsi ${label}` })) },
  kunci: { v: 1, opsi: "C" },
  pembahasan: "Pembahasan yang cukup panjang untuk lolos.",
  sumber_rujukan: "Buatan Sendiri",
  level_kognitif: null,
  estimasi_waktu_detik: 60,
  impor_batch_id: null,
  created_at: new Date(Date.UTC(2026, 0, 1) + n * 60000).toISOString(),
  updated_at: "2026-11-20T10:00:00.123456+00:00",
  ...ubah,
});

describe("filter & izin", () => {
  it("parseFilterBank hanya menerima nilai yang dikenal", () => {
    assert.deepEqual(parseFilterBank({}), { subtes: "", topik: "", jenis: "", kesulitan: "", status: "", batch: "", q: "", hal: 1 });
    assert.deepEqual(
      parseFilterBank({ subtes: PU, topik: TOPIK, jenis: "isian", kesulitan: "hots", status: "digantikan", batch: BATCH, q: "  akar  ", hal: "3" }),
      { subtes: PU, topik: TOPIK, jenis: "isian", kesulitan: "hots", status: "digantikan", batch: BATCH, q: "akar", hal: 3 },
    );
    const kacau = parseFilterBank({ subtes: "x", jenis: "esai", kesulitan: "susah", status: "hilang", batch: ["a", "b"], hal: "-2", q: "a".repeat(500) });
    assert.deepEqual([kacau.subtes, kacau.jenis, kacau.kesulitan, kacau.status, kacau.batch, kacau.hal, kacau.q.length], ["", "", "", "", "", 1, 200]);
  });

  it("queryFilter membawa filter ke halaman lain tanpa isian kosong", () => {
    assert.equal(queryFilter(parseFilterBank({ status: "draf", q: "x & y" }), { hal: 2 }), "?status=draf&q=x+%26+y&hal=2");
    assert.equal(queryFilter(parseFilterBank({}), { hal: 1 }), "");
  });

  const kosong = { edit: false, versiBaru: false, arsip: false, hapus: false };
  it("soal buatan mentor (manual) hanya-lihat di semua status", () => {
    for (const status of ["draf", "terpublikasi", "ditolak", "diajukan"]) assert.deepEqual(izinSoal({ sumber: "manual", status }), kosong, status);
  });
  it("buatan sendiri: draf edit+hapus; terbit versi baru+arsip (tanpa hapus); digantikan/diarsipkan tidak ada aksi", () => {
    const sendiri = (status: string) => izinSoal({ sumber: "buatan_sendiri", status });
    assert.deepEqual(sendiri("draf"), { ...kosong, edit: true, hapus: true });
    assert.deepEqual(sendiri("terpublikasi"), { ...kosong, versiBaru: true, arsip: true });
    assert.deepEqual(sendiri("digantikan"), kosong);
    assert.deepEqual(sendiri("diarsipkan"), kosong);
  });

  it("pesan hasil RPC: tabrakan edit meminta muat ulang", () => {
    const t = terjemahkanRpcAdmin({ status: "sudah_berubah" });
    assert.equal(t.httpStatus, 409);
    assert.match(t.pesan, /sudah diubah di tempat lain.*muat ulang/i);
    assert.equal(terjemahkanRpcAdmin({ status: "bukan_buatan_sendiri" }).httpStatus, 403);
    assert.equal(terjemahkanRpcAdmin({ status: "status_tidak_valid" }).httpStatus, 409);
    for (const s of ["disimpan", "versi_dibuat", "versi_terbit", "diarsipkan"]) assert.equal(terjemahkanRpcAdmin({ status: s }).success, true, s);
    assert.equal(terjemahkanRpcAdmin({ status: "entah" }).httpStatus, 500);
  });
});

let permintaan: Awaited<ReturnType<typeof pasangDbTiruan>>;

describe("data layer Bank Soal", () => {
  let data: typeof import("@/lib/admin/bankSoal");
  before(async () => {
    permintaan = await pasangDbTiruan();
    data = await import("@/lib/admin/bankSoal");
  });
  beforeEach(() => {
    resetDbTiruan();
    db.subtes = [
      { id: PU, nama: "Penalaran Umum", kategori: "tps" },
      { id: PK, nama: "Pengetahuan Kuantitatif", kategori: "tps" },
    ];
    db.soal_topik = [{ id: TOPIK, subtes_id: PU, nama: "Logika" }];
    db.soal_impor_batch = [{ id: BATCH, nama_berkas: "satu.docx", dibuat_pada: "2026-11-01T00:00:00Z" }];
  });

  const daftar = async (sp: Record<string, string> = {}) => {
    const h = await data.getBankSoal(parseFilterBank(sp));
    if (h === "gagal") assert.fail("gagal");
    return h;
  };

  it("paginasi 50, terbaru dulu; halaman di luar jangkauan kembali ke halaman 1", async () => {
    db.soal_bank = Array.from({ length: 120 }, (_, i) => barisSoal(i + 1));
    const satu = await daftar();
    assert.equal(PER_HALAMAN, 50);
    assert.deepEqual([satu.total, satu.jumlahHalaman, satu.baris.length, satu.baris[0].redaksi], [120, 3, 50, "Soal nomor 120"]);
    const tiga = await daftar({ hal: "3" });
    assert.deepEqual([tiga.hal, tiga.baris.length, tiga.baris.at(-1)?.redaksi], [3, 20, "Soal nomor 1"]);
    const jauh = await daftar({ hal: "99" });
    assert.deepEqual([jauh.hal, jauh.baris.length], [1, 50]);
  });

  it("tiap filter menyaring; kolom berisi nama subtes, topik, batch, dan cuplikan", async () => {
    db.soal_bank = [
      barisSoal(1, { topik_id: TOPIK, impor_batch_id: BATCH, redaksi: "Diskon 50% berapa?" }),
      barisSoal(2, { subtes_id: PK, tipe: "isian", tingkat_kesulitan: "hots", status: "terpublikasi", redaksi: "Akar kuadrat" }),
      barisSoal(3, { sumber: "manual", status: "diarsipkan", redaksi: "Diskon 500 rupiah" }),
    ];
    const id = async (sp: Record<string, string>) => (await daftar(sp)).baris.map((b) => b.id);
    assert.deepEqual(await id({ subtes: PK }), [u(1002)]);
    assert.deepEqual(await id({ topik: TOPIK }), [u(1001)]);
    assert.deepEqual(await id({ jenis: "isian" }), [u(1002)]);
    assert.deepEqual(await id({ kesulitan: "hots" }), [u(1002)]);
    assert.deepEqual(await id({ status: "diarsipkan" }), [u(1003)]);
    assert.deepEqual(await id({ batch: BATCH }), [u(1001)]);
    assert.deepEqual(await id({ q: "akar KUADRAT" }), [u(1002)]);
    assert.deepEqual(await id({ q: "50%" }), [u(1001)], "% dicari harfiah");
    const [b] = (await daftar({ batch: BATCH })).baris;
    assert.deepEqual([b.subtes, b.topik, b.batch, b.redaksi], ["Penalaran Umum", "Logika", "satu.docx", "Diskon 50% berapa?"]);
  });

  it("detail: bacaan dengan urutan blok asli, dan versi terbuka bila ada", async () => {
    const blok = [{ jenis: "teks", teks: "a" }, { jenis: "tabel", kepala: ["k"], baris: [["1"]] }, { jenis: "teks", teks: "b" }];
    db.soal_stimulus = [{ id: S1, judul_internal: "B1", status: "terpublikasi", konten: { v: 1, blok } }];
    db.soal_bank = [
      barisSoal(1, { status: "terpublikasi", stimulus_id: S1, keluarga_id: u(3000) }),
      barisSoal(2, { versi: 2, keluarga_id: u(3000) }),
    ];
    const d = await data.getDetailSoalAdmin(u(1001));
    if (d === "gagal" || !d) assert.fail("detail kosong");
    assert.deepEqual(d.bacaan?.blok, blok);
    assert.equal(d.versiTerbuka, u(1002));
    assert.equal(d.subtes.nama, "Penalaran Umum");
    assert.equal(await data.getDetailSoalAdmin(u(9999)), null);
  });

  it("halaman bank soal memakai guard admin yang sama dengan rute impor", () => {
    for (const f of ["page.tsx", "[id]/page.tsx", "[id]/edit/page.tsx"]) {
      const isi = baca(`app/(protected)/(admin)/bank-soal/${f}`);
      assert.match(isi, /requireAdminAktif\(/, f);
      assert.doesNotMatch(isi, /\.(insert|update|upsert|delete)\(/, f);
    }
  });
});

describe("API Bank Soal", () => {
  let satu: typeof import("@/app/api/admin/studio-soal/bank/[id]/route");
  let aksi: typeof import("@/app/api/admin/studio-soal/bank/[id]/[aksi]/route");
  before(async () => {
    permintaan = await pasangDbTiruan();
    satu = await import("@/app/api/admin/studio-soal/bank/[id]/route");
    aksi = await import("@/app/api/admin/studio-soal/bank/[id]/[aksi]/route");
  });
  beforeEach(() => {
    resetDbTiruan();
    db.subtes = [{ id: PU, nama: "Penalaran Umum", kategori: "tps" }];
    db.soal_bank = [barisSoal(1), barisSoal(2, { sumber: "manual" })];
  });

  const ID = u(1001);
  const MANUAL = u(1002);
  const isi = (ubah: Row = {}) => {
    const s = barisSoal(1);
    const kunci = ["subtes_id", "tipe", "stimulus_id", "redaksi", "konten", "kunci", "pembahasan", "sumber_rujukan", "tingkat_kesulitan", "level_kognitif", "estimasi_waktu_detik", "updated_at"];
    return { ...Object.fromEntries(kunci.map((k) => [k, s[k]])), ...ubah };
  };
  const baca2 = async (res: Response) => ({ status: res.status, json: (await res.json()) as Row });
  const simpan = async (body: unknown, id = ID, userId: string | null = ADMIN, role: "admin" | "student" = "admin") =>
    baca2(await satu.PUT(permintaan(userId, role, "PUT", body), { params: Promise.resolve({ id }) }));
  const hapus = async (id = ID, userId: string | null = ADMIN, role: "admin" | "student" = "admin") =>
    baca2(await satu.DELETE(permintaan(userId, role, "DELETE"), { params: Promise.resolve({ id }) }));
  const jalankan = async (nama: string, body?: unknown, id = ID, userId: string | null = ADMIN, role: "admin" | "student" = "admin") =>
    baca2(await aksi.POST(permintaan(userId, role, "POST", body), { params: Promise.resolve({ id, aksi: nama }) }));

  it("guard di setiap rute: 401 tanpa login, 403 siswa & admin nonaktif; RPC tidak dipanggil", async () => {
    const semua: ((userId: string | null, role: "admin" | "student") => Promise<{ status: number }>)[] = [
      (a, r) => simpan(isi(), ID, a, r),
      (a, r) => hapus(ID, a, r),
      ...["versi-baru", "terbitkan-versi", "arsipkan"].map((n) => (a: string | null, r: "admin" | "student") => jalankan(n, isi(), ID, a, r)),
    ];
    for (const panggil of semua) {
      assert.equal((await panggil(null, "admin")).status, 401);
      assert.equal((await panggil(SISWA, "student")).status, 403);
      assert.equal((await panggil(ADMIN_NONAKTIF, "admin")).status, 403);
    }
    assert.equal(rpc.panggilan.length, 0);
  });

  it("soal buatan mentor tidak bisa diubah, dihapus, diarsipkan, atau dibuatkan versi", async () => {
    for (const r of [
      await simpan(isi(), MANUAL),
      await hapus(MANUAL),
      await jalankan("versi-baru", undefined, MANUAL),
      await jalankan("terbitkan-versi", isi(), MANUAL),
      await jalankan("arsipkan", undefined, MANUAL),
    ]) {
      assert.equal(r.status, 403);
      assert.match(String(r.json.error), /hanya bisa dilihat/);
    }
    assert.equal(rpc.panggilan.length, 0);
    assert.deepEqual(tulisLangsung, []);
  });

  it("simpan draf: aktor dari session, updated_at diteruskan persis, field asing dibuang", async () => {
    rpc.jawab = { status: "disimpan", soal_id: ID, updated_at: "2026-11-21T00:00:00.000001+00:00" };
    const r = await simpan(isi({ redaksi: "Baru", status: "terpublikasi", penulis_id: SISWA, konten: { ...(barisSoal(1).konten as Row), asing: 1 } }));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.updatedAt, "2026-11-21T00:00:00.000001+00:00");
    const [p] = rpc.panggilan;
    assert.equal(p.nama, "studio_soal_admin_simpan");
    assert.deepEqual([p.args.p_admin_id, p.args.p_soal_id, p.args.p_updated_at], [ADMIN, ID, "2026-11-20T10:00:00.123456+00:00"]);
    const d = p.args.p_data as Row;
    assert.equal(d.redaksi, "Baru");
    assert.equal("status" in d || "penulis_id" in d || "updated_at" in d, false);
    assert.equal("asing" in (d.konten as Row), false);
    assert.deepEqual(tulisLangsung, []);
  });

  it("draf boleh belum lengkap; bentuk rusak atau tanpa updated_at ditolak sebelum RPC", async () => {
    rpc.jawab = { status: "disimpan" };
    assert.equal((await simpan(isi({ pembahasan: "" }))).status, 200);
    rpc.panggilan = [];
    assert.equal((await simpan(isi({ updated_at: undefined }))).status, 400);
    assert.equal((await simpan(isi({ konten: "x" }))).status, 400);
    assert.equal((await simpan(isi(), "bukan-uuid")).status, 400);
    assert.equal((await simpan(isi(), u(9999))).status, 404);
    assert.equal(rpc.panggilan.length, 0);
  });

  it("tabrakan edit: RPC menjawab sudah_berubah -> 409 'muat ulang'", async () => {
    rpc.jawab = { status: "sudah_berubah" };
    const r = await simpan(isi());
    assert.equal(r.status, 409);
    assert.match(String(r.json.error), /sudah diubah di tempat lain.*muat ulang/i);
  });

  it("terbitkan versi: divalidasi mode 'ajukan' (termasuk rumus) sebelum RPC", async () => {
    for (const rusak of [{ pembahasan: "" }, { redaksi: "\\(\\frac{1}{\\)" }, { kunci: { v: 1 } }]) {
      const r = await jalankan("terbitkan-versi", isi(rusak));
      assert.equal(r.status, 400, JSON.stringify(rusak));
      assert.ok(Array.isArray(r.json.errors) && (r.json.errors as unknown[]).length > 0);
    }
    assert.equal(rpc.panggilan.length, 0);
    rpc.jawab = { status: "versi_terbit", soal_id: ID };
    assert.equal((await jalankan("terbitkan-versi", isi())).status, 200);
    assert.equal(rpc.panggilan[0].nama, "studio_soal_admin_terbitkan_versi");
    assert.equal(rpc.panggilan[0].args.p_updated_at, "2026-11-20T10:00:00.123456+00:00");
  });

  it("versi baru, arsip, hapus draf memanggil RPC admin; id versi terbuka diteruskan", async () => {
    rpc.jawab = { status: "versi_dibuat", soal_id: u(1009) };
    assert.equal((await jalankan("versi-baru")).json.soalId, u(1009));
    rpc.jawab = { status: "ada_versi_terbuka", soal_id: u(1008) };
    const terbuka = await jalankan("versi-baru");
    assert.deepEqual([terbuka.status, terbuka.json.soalId], [409, u(1008)]);
    rpc.jawab = { status: "diarsipkan" };
    assert.equal((await jalankan("arsipkan")).status, 200);
    rpc.jawab = { status: "dihapus", jumlah_bacaan: 0 };
    assert.equal((await hapus()).status, 200);
    rpc.jawab = { status: "status_tidak_valid" };
    assert.equal((await hapus()).status, 409, "soal terbit tidak bisa dihapus");
    assert.deepEqual(
      [...new Set(rpc.panggilan.map((p) => p.nama))],
      ["studio_soal_admin_versi_baru", "studio_soal_admin_arsipkan", "studio_soal_admin_hapus_draf"],
    );
    assert.equal((await jalankan("setujui")).status, 404);
  });
});

// react-dom/server menolak kondisi "react-server" runner tes: render di proses terpisah (pola tests/badge-kapasitas.test.ts).
function render(props: unknown): string {
  const kode = `
    (await import("node:module")).default._extensions[".css"] = () => {};
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("./components/studio-soal/TampilanSoal.tsx");
    const K = typeof mod.default === "function" ? mod.default : mod.default.default;
    process.stdout.write(renderToStaticMarkup(React.createElement(K, JSON.parse(process.argv[1]))));
  `;
  return execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", kode, JSON.stringify(props)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
}

describe("TampilanSoal", () => {
  const soal = {
    tipe: "majemuk_kompleks",
    redaksi: "Tentukan nilainya.",
    konten: { v: 1, label_kolom: ["Fakta", "Opini"], pernyataan: [{ id: "p1", teks: "Pernyataan satu" }, { id: "p2", teks: "Pernyataan dua" }] },
  };
  const rahasia = { kunci: { v: 1, per_baris: { p1: 0, p2: 1 }, catatan: "RAHASIA-KUNCI" }, pembahasan: "RAHASIA-PEMBAHASAN" };
  const stimulus = [
    { jenis: "teks", teks: "Paragraf awal." },
    { jenis: "tabel", kepala: ["Kolom tabel"], baris: [["Isi sel"]] },
    { jenis: "teks", teks: "Paragraf akhir." },
  ];
  const metadata = { subtes: "Penalaran Umum", topik: "Logika", kesulitan: "hots", level: 2, estimasiDetik: 90, versi: 3, status: "terpublikasi" };

  it("jenis prop mode siswa tidak memuat kunci dan pembahasan (diperiksa tsc)", () => {
    const dasar = { tipe: "isian", redaksi: "", konten: {} };
    const bocorKunci: PropsTampilanSoal = {
      mode: "siswa",
      // @ts-expect-error mode siswa tidak boleh menerima kunci
      soal: { ...dasar, kunci: {} },
    };
    const bocorPembahasan: PropsTampilanSoal = {
      mode: "siswa",
      // @ts-expect-error mode siswa tidak boleh menerima pembahasan
      soal: { ...dasar, pembahasan: "x" },
    };
    assert.ok(bocorKunci && bocorPembahasan);
  });

  it("mode siswa: bacaan berurutan, pernyataan & label tampil; kunci/pembahasan tidak pernah dirender walau diselipkan", () => {
    const html = render({ mode: "siswa", soal: { ...soal, ...rahasia }, stimulus, awalTampilKunci: true });
    const urut = ["Paragraf awal.", "Kolom tabel", "Isi sel", "Paragraf akhir.", "Tentukan nilainya.", "Pernyataan satu", "Pernyataan dua"].map((t) => html.indexOf(t));
    assert.equal(urut.every((x, i) => x >= 0 && (i === 0 || x > urut[i - 1])), true, JSON.stringify(urut));
    assert.match(html, /Fakta/);
    assert.doesNotMatch(html, /RAHASIA|[Kk]unci|[Pp]embahasan|ring-success/);
  });

  it("mode siswa: pilihan ganda dan isian tampil sebagai isian jawaban", () => {
    const pg = render({ mode: "siswa", soal: { tipe: "pilihan_ganda", redaksi: "Pilih.", konten: barisSoal(1).konten } });
    assert.equal((pg.match(/role="radio"/g) ?? []).length, 5);
    const isian = render({ mode: "siswa", soal: { tipe: "isian", redaksi: "Hasil {{r1}}.", konten: { v: 1, rumpang: [{ id: "r1", jenis: "angka" }] } } });
    assert.match(isian, /<input[^>]*aria-label="Jawaban kotak r1"/);
  });

  it("mode admin: metadata dan tombol kunci; kunci & pembahasan tampil setelah dibuka", () => {
    const tutup = render({ mode: "admin", soal: { ...soal, ...rahasia }, stimulus, metadata });
    for (const t of ["Penalaran Umum", "Logika", "HOTS", "L2", "90 detik", "Terbit", "Tampilkan kunci dan pembahasan", "Periksa jawaban"]) assert.match(tutup, new RegExp(t), t);
    assert.match(tutup, /Versi<\/dt><dd[^>]*>3</);
    assert.doesNotMatch(tutup, /RAHASIA/);
    const buka = render({ mode: "admin", soal: { ...soal, ...rahasia }, metadata, awalTampilKunci: true });
    assert.match(buka, /RAHASIA-PEMBAHASAN/);
    assert.match(buka, /1\. Fakta · 2\. Opini/);
  });

  it("komponen murni presentasi: tanpa akses server/jaringan, belum dipakai layar siswa", () => {
    const isi = baca("components/studio-soal/TampilanSoal.tsx");
    assert.doesNotMatch(isi, /fetch\(|supabase|panggilApi|next\/navigation/);
  });
});
