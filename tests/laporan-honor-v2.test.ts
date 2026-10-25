/**
 * Test Laporan Honor Mentor v2 (scripts/laporan-honor-v2) — fungsi hitung
 * murni, tanpa database. Penjaga waktu dicek juga lewat menjalankan skrip
 * (keluar sebelum menyentuh .env.local / database).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import {
  cekBolehJalan,
  cekPendaftaran,
  hitungDasarHonor,
  hitungHonorPertemuan,
  hitungNilaiSesi,
  kategoriPeriode,
  pisahkanLaporan,
  statusConfirmed,
  susunPertemuan,
  tentukanPersen,
  type EnrollmentData,
  type KelasData,
  type SesiData,
} from "../scripts/laporan-honor-v2/hitung";
import { diDalamRepo, tulisKeluaran } from "../scripts/laporan-honor-v2/keluaran";
import { buatFetchHanyaBaca, parseEnv, projectRef } from "../scripts/laporan-honor-v2/hanyaBaca";

const NOW = new Date("2026-10-23T02:00:00.000Z"); // 23 Okt 09:00 WIB
const MENTOR_A = "aaaaaaaa-0000-0000-0000-000000000001";
const MENTOR_B = "bbbbbbbb-0000-0000-0000-000000000002";

function kelas(extra: Partial<KelasData> = {}): KelasData {
  return {
    id: "kelas-1", nama: "Kelas Uji", tipe_kelas: "private", mode_pembelajaran: "online",
    harga: 1_000_000, jumlah_sesi: 10, kapasitas: 1, mentor_id: MENTOR_A, ...extra,
  };
}

function enr(id: string, extra: Partial<EnrollmentData> = {}): EnrollmentData {
  return {
    id, kelas_id: "kelas-1", status_pembayaran: "lunas", tanggal_daftar: "2026-09-01T00:00:00.000Z",
    sumber: "checkout", nominal_dibayar: null, mentor_offline_id: null,
    pembayaran: { status: "berhasil", jumlah: 1_000_000, jumlah_sebelum_diskon: 1_000_000 },
    subtes_ids: [], diskon_dari_mentor: false, ...extra,
  };
}

let nSesi = 0;
/** Sesi dikonfirmasi siswa pada `tanggal` 10:00 WIB. */
function sesi(enrollmentId: string, tanggal: string, extra: Partial<SesiData> = {}): SesiData {
  nSesi += 1;
  return {
    id: `sesi-${nSesi}`, enrollment_id: enrollmentId, nomor_sesi: nSesi, tanggal_dilaksanakan: tanggal,
    dikonfirmasi_mentor: true, dikonfirmasi_mentor_pada: `${tanggal}T03:00:00.000Z`,
    status_siswa: "dikonfirmasi", dikonfirmasi_siswa_pada: `${tanggal}T04:00:00.000Z`,
    mentor_id: MENTOR_A, review_setujui_pada: null, sudah_dibayar: null, ...extra,
  };
}

/** Grup 4 kursi, Rp3.000.000 total = kelas.harga Rp750.000 per kursi, 10 sesi → Rp75.000 per kursi per sesi. */
const KELAS_GRUP = kelas({ id: "grup-1", tipe_kelas: "grouping", harga: 750_000, kapasitas: 4 });
const grupEnr = (id: string, extra: Partial<EnrollmentData> = {}) =>
  enr(id, { kelas_id: "grup-1", pembayaran: { status: "berhasil", jumlah: 750_000, jumlah_sebelum_diskon: 750_000 }, ...extra });

describe("rumus honor", () => {
  it("private Rp1.000.000, 10 sesi, 1 sesi confirmed = Rp65.000", () => {
    const hasil = susunPertemuan({ kelas: new Map([["kelas-1", kelas()]]), enrollments: [enr("e1")], sesi: [sesi("e1", "2026-10-01")], now: NOW });
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].honor, 65_000);
    assert.equal(hasil[0].tier, "private");
    assert.equal(hasil[0].kategori, "periode_ini");
  });

  it("grup 4 siswa (Rp75.000 per kursi per sesi), 4 aktif = Rp135.000", () => {
    const es = ["g1", "g2", "g3", "g4"].map((id) => grupEnr(id));
    const hasil = susunPertemuan({ kelas: new Map([["grup-1", KELAS_GRUP]]), enrollments: es, sesi: es.map((e) => sesi(e.id, "2026-10-05")), now: NOW });
    assert.equal(hasil.length, 1);
    assert.equal(hasil[0].jumlahAktif, 4);
    assert.equal(hasil[0].persen, 45);
    assert.equal(hasil[0].honor, 135_000);
    assert.deepEqual(hasil[0].cek, []);
  });

  it("grup yang sama, 3 aktif (1 keluar/refund) = Rp112.500", () => {
    const es = [grupEnr("g1"), grupEnr("g2"), grupEnr("g3")];
    const hasil = susunPertemuan({ kelas: new Map([["grup-1", KELAS_GRUP]]), enrollments: es, sesi: es.map((e) => sesi(e.id, "2026-10-05")), now: NOW });
    assert.equal(hasil[0].honor, 112_500);
    assert.equal(tentukanPersen("grouping", 3).persen, 50);
  });

  it("grup yang sama, 4 aktif tapi 1 absen (tanpa baris sesi) = tetap Rp135.000", () => {
    const es = ["g1", "g2", "g3", "g4"].map((id) => grupEnr(id));
    const hadir = es.slice(0, 3).map((e) => sesi(e.id, "2026-10-06"));
    const hasil = susunPertemuan({ kelas: new Map([["grup-1", KELAS_GRUP]]), enrollments: es, sesi: hadir, now: NOW });
    assert.equal(hasil[0].jumlahAktif, 4);
    assert.equal(hasil[0].honor, 135_000);
  });

  it("refund tanpa tanggal keluar: tidak dihitung, ditandai PERLU DICEK + honor alternatif", () => {
    const es = [grupEnr("g1"), grupEnr("g2"), grupEnr("g3"), grupEnr("g4", { pembayaran: { status: "refunded", jumlah: 750_000, jumlah_sebelum_diskon: 750_000 } })];
    const hasil = susunPertemuan({ kelas: new Map([["grup-1", KELAS_GRUP]]), enrollments: es, sesi: es.slice(0, 3).map((e) => sesi(e.id, "2026-10-07")), now: NOW });
    assert.equal(hasil[0].honor, 112_500);
    assert.equal(hasil[0].honorAlternatif, 135_000);
    assert.ok(hasil[0].cek.some((c) => c.includes("tanpa tanggal keluar")));
    assert.ok(hasil[0].fallback.length > 0);
  });

  it("tersisa 1 siswa aktif di grup: 65% × nilai_sesi kursi grup (bukan harga private)", () => {
    const hasil = susunPertemuan({ kelas: new Map([["grup-1", KELAS_GRUP]]), enrollments: [grupEnr("g1")], sesi: [sesi("g1", "2026-10-08")], now: NOW });
    assert.equal(hasil[0].honor, 48_750); // 65% × 75.000
  });

  it("kelas 10 sesi: mentor A 6 sesi dan mentor B 4 sesi, keduanya terhitung (bukan Rp0)", () => {
    const k = kelas({ mentor_id: MENTOR_A }); // kelas.mentor_id = A saja
    const ss = [
      ...Array.from({ length: 6 }, (_, i) => sesi("e1", `2026-10-0${i + 1}`, { mentor_id: MENTOR_A })),
      ...Array.from({ length: 4 }, (_, i) => sesi("e1", `2026-10-1${i + 1}`, { mentor_id: MENTOR_B })),
    ];
    const hasil = susunPertemuan({ kelas: new Map([["kelas-1", k]]), enrollments: [enr("e1")], sesi: ss, now: NOW });
    const total = (m: string) => hasil.filter((p) => p.mentor_id === m).reduce((a, p) => a + p.honor, 0);
    assert.equal(total(MENTOR_A), 6 * 65_000);
    assert.equal(total(MENTOR_B), 4 * 65_000);
  });

  it("diskon dari mentor memakai nominal_dibayar; diskon Dimentoring memakai harga normal", () => {
    assert.deepEqual(hitungDasarHonor({ harga: 1_000_000, hargaDibayar: 800_000, diskonDariMentor: true }).dasar, 800_000);
    assert.deepEqual(hitungDasarHonor({ harga: 1_000_000, hargaDibayar: 800_000, diskonDariMentor: false }).dasar, 1_000_000);
    const manualMentor = susunPertemuan({
      kelas: new Map([["kelas-1", kelas()]]),
      enrollments: [enr("m1", { sumber: "manual", nominal_dibayar: 800_000, pembayaran: null, diskon_dari_mentor: true })],
      sesi: [sesi("m1", "2026-10-02")], now: NOW,
    });
    assert.equal(manualMentor[0].honor, 52_000); // 65% × 80.000
    const manualDimentoring = susunPertemuan({
      kelas: new Map([["kelas-1", kelas()]]),
      enrollments: [enr("m2", { sumber: "manual", nominal_dibayar: 800_000, pembayaran: null })],
      sesi: [sesi("m2", "2026-10-02")], now: NOW,
    });
    assert.equal(manualDimentoring[0].honor, 65_000);
  });

  it("pendaftaran manual dengan nominal < harga (tanpa penanda) masuk PERLU DICEK", () => {
    const c = cekPendaftaran(enr("m3", { sumber: "manual", nominal_dibayar: 500_000, pembayaran: null }), kelas());
    assert.ok(c.some((x) => x.includes("pendaftaran manual")));
    assert.ok(c.some((x) => x.includes("dipakai kelas.harga")));
    assert.ok(c.some((x) => x.includes("selisih harga")));
  });

  it("nilai_sesi = dasar / jumlah_sesi; jumlah_sesi 0 → null", () => {
    assert.equal(hitungNilaiSesi(1_000_000, 10), 100_000);
    assert.equal(hitungNilaiSesi(1_000_000, 0), null);
    assert.equal(hitungHonorPertemuan(45, [75_000, 75_000, 75_000, 75_000]), 135_000);
  });

  it("grup > 4 siswa → tier 4 (45%) dan PERLU DICEK; private > 1 siswa → 65% tiap kursi dan PERLU DICEK", () => {
    const t = tentukanPersen("semi_private", 5);
    assert.equal(t.persen, 45);
    assert.ok(t.cek.length > 0);
    const p = tentukanPersen("private", 2);
    assert.equal(p.persen, 65);
    assert.ok(p.cek.length > 0);
  });
});

describe("periode & status confirmed (statusSesi.ts)", () => {
  it("batas WIB: 22 Okt 23:59 masuk periode ini, 23 Okt 00:00 sesudah cut-off, 22 Sep 23:59 periode sebelumnya", () => {
    assert.equal(kategoriPeriode("2026-10-22T16:59:59.000Z"), "periode_ini");
    assert.equal(kategoriPeriode("2026-10-22T17:00:00.000Z"), "sesudah_cutoff");
    assert.equal(kategoriPeriode("2026-09-22T16:59:59.000Z"), "sebelumnya");
    assert.equal(kategoriPeriode("2026-09-22T17:00:00.000Z"), "periode_ini");
  });

  it("diam 24 jam = auto-confirmed (waktu = tanda + 24 jam); disangkal tidak dihitung; disetujui Admin pakai waktu review", () => {
    const auto = statusConfirmed(sesi("e1", "2026-10-21", { status_siswa: "belum", dikonfirmasi_siswa_pada: null }), NOW);
    assert.equal(auto.confirmed, true);
    assert.equal(auto.waktu, "2026-10-22T03:00:00.000Z");
    const sangkal = statusConfirmed(sesi("e1", "2026-10-21", { status_siswa: "disangkal" }), NOW);
    assert.equal(sangkal.confirmed, false);
    const review = statusConfirmed(sesi("e1", "2026-10-21", { review_setujui_pada: "2026-10-23T01:00:00.000Z" }), NOW);
    assert.equal(review.waktu, "2026-10-23T01:00:00.000Z");
    assert.equal(kategoriPeriode(review.waktu!), "sesudah_cutoff");
  });

  it("status campuran dalam satu pertemuan grup: tetap dihitung, masuk PERLU DICEK", () => {
    const es = ["g1", "g2"].map((id) => grupEnr(id));
    const ss = [sesi("g1", "2026-10-09"), sesi("g2", "2026-10-09", { status_siswa: "disangkal" })];
    const hasil = susunPertemuan({ kelas: new Map([["grup-1", KELAS_GRUP]]), enrollments: es, sesi: ss, now: NOW });
    assert.equal(hasil[0].honor, Math.round(0.55 * 150_000));
    assert.ok(hasil[0].cek.some((c) => c.includes("status campuran")));
  });

  it("sesi tanpa mentor_id: dihitung tapi ditandai, mentor_id null", () => {
    const hasil = susunPertemuan({ kelas: new Map([["kelas-1", kelas()]]), enrollments: [enr("e1")], sesi: [sesi("e1", "2026-10-03", { mentor_id: null })], now: NOW });
    assert.equal(hasil[0].mentor_id, null);
    assert.ok(hasil[0].cek.some((c) => c.includes("tanpa mentor_id")));
  });
});

describe("penjaga jalan & dry-run", () => {
  const REPO = resolve(__dirname, "..");

  it("cekBolehJalan menolak sebelum 23 Okt 2026 00:00 WIB", () => {
    assert.equal(cekBolehJalan(new Date("2026-10-22T16:59:59.999Z")).boleh, false);
    assert.equal(cekBolehJalan(new Date("2026-10-22T17:00:00.000Z")).boleh, true);
  });

  it("skrip keluar (exit 2) sebelum 23 Okt dan tidak menulis apa pun", () => {
    const out = mkdtempSync(join(tmpdir(), "honor-v2-"));
    try {
      const r = spawnSync(process.execPath, ["--import", "tsx", join(REPO, "scripts/laporan-honor-v2.ts"), "--force-date", "2026-10-22T23:59:00+07:00", "--out", out], { cwd: REPO, encoding: "utf8" });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /DITOLAK/);
      assert.deepEqual(readdirSync(out), []);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("skrip menolak --out di dalam repo", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", join(REPO, "scripts/laporan-honor-v2.ts"), "--force-date", "2026-10-23T08:00:00+07:00", "--out", join(REPO, "tmp-honor")], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /di dalam repo/);
    assert.equal(existsSync(join(REPO, "tmp-honor")), false);
  });

  it("dry-run tidak menulis file maupun folder", () => {
    const base = mkdtempSync(join(tmpdir(), "honor-v2-"));
    const out = join(base, "laporan");
    try {
      const h = tulisKeluaran(out, { "a.csv": "x", "b.md": "y" }, true);
      assert.equal(h.ditulis.length, 0);
      assert.equal(h.dilewati.length, 2);
      assert.equal(existsSync(out), false);
      const nyata = tulisKeluaran(out, { "a.csv": "x" }, false);
      assert.equal(nyata.ditulis.length, 1);
      assert.ok(existsSync(join(out, "a.csv")));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("diDalamRepo", () => {
    assert.equal(diDalamRepo(join(REPO, "x"), REPO), true);
    assert.equal(diDalamRepo(join(REPO, "..", "luar"), REPO), false);
  });
});

describe("penanda sudah dibayar", () => {
  const k = new Map([["kelas-1", kelas()]]);
  const susun = (ss: SesiData[]) => pisahkanLaporan(susunPertemuan({ kelas: k, enrollments: [enr("e1")], sesi: ss, now: NOW }));

  it("sesi periode ini yang ditandai dibayar tidak masuk total periode ini", () => {
    const lap = susun([sesi("e1", "2026-10-01", { sudah_dibayar: true }), sesi("e1", "2026-10-02", { sudah_dibayar: false })]);
    assert.equal(lap.periodeIni.length, 1);
    assert.equal(lap.periodeIni[0].tanggal, "2026-10-02");
    assert.equal(lap.periodeIni.reduce((a, p) => a + p.honor, 0), 65_000);
    assert.equal(lap.periodeIniSudahDibayar.length, 1);
  });

  it("sesi periode sebelumnya yang ditandai dibayar tidak muncul di daftar periode sebelumnya", () => {
    const lap = susun([sesi("e1", "2026-09-10", { sudah_dibayar: true }), sesi("e1", "2026-09-11", { sudah_dibayar: false })]);
    assert.deepEqual(lap.sebelumnya.map((p) => p.tanggal), ["2026-09-11"]);
    assert.equal(lap.sebelumnyaSudahDibayar.length, 1);
  });

  it("tanpa penanda (null) → status 'tidak diketahui', TIDAK dianggap belum dibayar", () => {
    const lap = susun([sesi("e1", "2026-09-10"), sesi("e1", "2026-10-01")]);
    assert.equal(lap.sebelumnya[0].sudahDibayar, null);
    assert.equal(lap.periodeIni[0].sudahDibayar, null);
  });

  it("grup dengan penanda campuran → tidak diketahui + PERLU DICEK", () => {
    const es = ["g1", "g2"].map((id) => grupEnr(id));
    const hasil = susunPertemuan({
      kelas: new Map([["grup-1", KELAS_GRUP]]), enrollments: es, now: NOW,
      sesi: [sesi("g1", "2026-10-09", { sudah_dibayar: true }), sesi("g2", "2026-10-09", { sudah_dibayar: false })],
    });
    assert.equal(hasil[0].sudahDibayar, null);
    assert.ok(hasil[0].cek.some((c) => c.includes("ditandai dibayar")));
  });
});

describe("--env & read-only", () => {
  const REPO = resolve(__dirname, "..");
  const SCRIPT = join(REPO, "scripts/laporan-honor-v2.ts");
  const gitStatus = () => spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: REPO, encoding: "utf8" }).stdout;

  it("--env menampilkan project ref dari file env dan tidak menulis ke repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "honor-v2-env-"));
    const envFile = join(dir, "prod.env");
    // Host .invalid: tidak pernah ter-resolve, jadi tidak ada request yang benar-benar terkirim.
    writeFileSync(envFile, "NEXT_PUBLIC_SUPABASE_URL=https://ujiref1234567890.supabase.invalid\nSUPABASE_SERVICE_ROLE_KEY=palsu\n");
    const sebelum = gitStatus();
    try {
      const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--env", envFile, "--force-date", "2026-10-23T08:00:00+07:00", "--out", join(dir, "out")], { cwd: REPO, encoding: "utf8" });
      assert.match(r.stdout, /project ref ujiref1234567890/);
      assert.match(r.stdout, /Env: .*prod\.env/);
      assert.notEqual(r.status, 0); // koneksi gagal → keluar dengan error, bukan laporan kosong
      assert.equal(existsSync(join(dir, "out")), false);
      assert.equal(gitStatus(), sebelum);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--env di dalam repo ditolak", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, "--env", join(REPO, ".env.local"), "--force-date", "2026-10-23T08:00:00+07:00", "--dry-run"], { cwd: REPO, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--env .* di dalam repo/);
  });

  it("fetch read-only menolak POST/PATCH/PUT/DELETE, meneruskan GET/HEAD", async () => {
    const dipanggil: string[] = [];
    const palsu = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      dipanggil.push(init?.method ?? "GET");
      return new Response("[]");
    }) as typeof fetch;
    const f = buatFetchHanyaBaca(palsu);
    await f("https://x.supabase.co/rest/v1/kelas");
    await f("https://x.supabase.co/rest/v1/kelas", { method: "HEAD" });
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
      await assert.rejects(f("https://x.supabase.co/rest/v1/kelas", { method: m }), /read-only/);
    }
    assert.deepEqual(dipanggil, ["GET", "HEAD"]);
  });

  it("kode skrip tidak memanggil insert/update/upsert/delete/rpc", () => {
    for (const f of ["scripts/laporan-honor-v2.ts", "scripts/laporan-honor-v2/hitung.ts"]) {
      const src = readFileSync(join(REPO, f), "utf8");
      assert.doesNotMatch(src, /\.(insert|update|upsert|delete|rpc)\(/, f);
    }
  });

  it("projectRef & parseEnv", () => {
    assert.equal(projectRef("https://abcdef123.supabase.co"), "abcdef123");
    assert.deepEqual(parseEnv('A=1\nB="dua"\n# c\n'), { A: "1", B: "dua" });
  });
});
