/**
 * Perawatan unggah soal: alias kesulitan, bacaan yatim saat baris galat dilewati,
 * dan hapus batch draf (data layer + API terhadap Supabase tiruan di memori).
 * Aturan database RPC-nya diuji di db/test_studio_soal_impor_perawatan_DRYRUN.sql.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { ADMIN, ADMIN_NONAKTIF, SISWA, db, pasangDbTiruan, resetDbTiruan, rpc, u } from "./bantuan/dbTiruanSoal";
import { ringkasBatch } from "@/lib/shared/studio-soal/bankSoal";
import { KOLOM_BACAAN, KOLOM_SOAL, susunImpor, type SubtesImpor } from "@/lib/shared/studio-soal/impor";

const PU: SubtesImpor = { id: u(101), nama: "Penalaran Umum", kategori: "tps" };
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const csv = (judul: readonly string[], baris: Record<string, string>[]) =>
  [judul.join(","), ...baris.map((b) => judul.map((k) => q(b[k] ?? "")).join(","))].join("\n");
const soal = (ubah: Record<string, string> = {}): Record<string, string> => ({
  subtes: "Penalaran Umum",
  tipe: "pilihan_ganda",
  redaksi: "Berapakah dua tambah tiga?",
  opsi_a: "3",
  opsi_b: "4",
  opsi_c: "5",
  opsi_d: "6",
  opsi_e: "7",
  kunci: "C",
  pembahasan: "Dua ditambah tiga sama dengan lima.",
  ...ubah,
});
const bacaan = (kode: string) => ({ kode_bacaan: kode, subtes: "Penalaran Umum", teks: `Bacaan ${kode}.` });

describe("alias tingkat kesulitan", () => {
  const dengan = (kesulitan: string) => susunImpor({ soalCsv: csv(KOLOM_SOAL, [soal({ kesulitan })]), subtes: [PU], topik: [] });
  const alias: [string, string[]][] = [
    ["mudah", ["mudah", "easy", " EASY ", "Mudah"]],
    ["sedang", ["sedang", "menengah", "medium", "ME NENGAH", " Medium", ""]],
    ["hots", ["hots", "sulit", "susah", "hard", "HOTS", " Hard ", "H O T S"]],
  ];
  for (const [hasil, daftar] of alias) {
    it(`menjadi "${hasil}"`, () => {
      for (const teks of daftar) {
        const h = dengan(teks);
        assert.equal(h.galat.length, 0, `${teks}: ${JSON.stringify(h.galat)}`);
        assert.equal(h.soal[0].tingkat_kesulitan, hasil, teks);
      }
    });
  }
  it("nilai lain galat dan pesannya menyebut semua nilai yang diterima", () => {
    const h = dengan("gampang");
    assert.equal(h.soal.length, 0);
    const pesan = h.galat.find((g) => g.kolom === "kesulitan")?.pesan ?? "";
    for (const kata of ["gampang", "mudah", "easy", "sedang", "menengah", "medium", "hots", "sulit", "susah", "hard"]) {
      assert.match(pesan, new RegExp(kata), kata);
    }
  });
});

describe("bacaan yatim saat baris galat dilewati", () => {
  const h = susunImpor({
    soalCsv: csv(KOLOM_SOAL, [
      soal({ kode_bacaan: "B1", kunci: "Z", redaksi: "Satu?" }),
      soal({ kode_bacaan: "B1", kunci: "", redaksi: "Dua?" }),
      soal({ kode_bacaan: "B2", kunci: "Z", redaksi: "Tiga?" }),
      soal({ kode_bacaan: "B2", redaksi: "Empat?" }),
    ]),
    bacaanCsv: csv(KOLOM_BACAAN, [bacaan("B1"), bacaan("B2"), bacaan("B3")]),
    subtes: [PU],
    topik: [],
  });

  it("bacaan yang semua soalnya galat tidak disimpan; yang masih punya soal valid tetap disimpan", () => {
    assert.deepEqual(h.stimulus.map((s) => s.kode), ["b2"]);
    assert.equal(h.soal.length, 1);
    assert.equal(h.ringkasan.jumlahBacaan, 1);
    assert.equal(h.ringkasan.jumlahBacaanDilewati, 2, "B1 (semua soal galat) + B3 (tanpa soal)");
  });

  it("tanpa bacaan atau semua terpakai = 0", () => {
    const bersih = susunImpor({ soalCsv: csv(KOLOM_SOAL, [soal()]), subtes: [PU], topik: [] });
    assert.equal(bersih.ringkasan.jumlahBacaanDilewati, 0);
  });

  it("jumlahnya tampil di pratinjau dan hasil simpan", () => {
    const layar = readFileSync("components/admin/ImporSoalClient.tsx", "utf8");
    assert.match(layar, /ringkasan\.jumlahBacaanDilewati/);
    assert.match(layar, /tersimpan\.jumlahBacaanDilewati/);
    assert.match(readFileSync("lib/admin/studioSoalImpor.ts", "utf8"), /jumlahBacaanDilewati: hasil\.ringkasan\.jumlahBacaanDilewati/);
  });
});

describe("ringkasBatch", () => {
  const batch = [{ id: "b1", nama_berkas: "satu.docx", dibuat_pada: "2026-11-01T00:00:00Z" }];
  const s = (status: string, stimulus_id: string | null = null) => ({ impor_batch_id: "b1", status, stimulus_id });
  const st = (id: string, status = "draf") => ({ id, impor_batch_id: "b1", status });

  it("menghitung per status; bacaan draf yang akan ikut terhapus = tidak punya soal selain draf", () => {
    const [r] = ringkasBatch(
      batch,
      [s("draf", "a"), s("draf", "a"), s("terpublikasi", "b"), s("draf", "b"), s("diarsipkan"), s("digantikan")],
      [st("a"), st("b", "terpublikasi"), st("c"), st("d", "diarsipkan")],
    );
    assert.deepEqual(r, {
      id: "b1",
      namaBerkas: "satu.docx",
      dibuatPada: "2026-11-01T00:00:00Z",
      draf: 3,
      drafBaru: 3,
      terbit: 1,
      arsip: 1,
      lainnya: 1,
      bacaanAkanDihapus: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// API hapus batch & daftar batch terhadap Supabase tiruan
// ---------------------------------------------------------------------------

const BATCH = u(501);

describe("hapus batch draf (API) & daftar batch", () => {
  let route: typeof import("@/app/api/admin/studio-soal/bank/batch/[id]/route");
  let data: typeof import("@/lib/admin/bankSoal");
  let permintaan: (userId: string | null, role: "admin" | "student", method: string, body?: unknown) => NextRequest;

  before(async () => {
    permintaan = await pasangDbTiruan();
    route = await import("@/app/api/admin/studio-soal/bank/batch/[id]/route");
    data = await import("@/lib/admin/bankSoal");
  });
  beforeEach(() => resetDbTiruan());

  const hapus = async (userId: string | null, role: "admin" | "student" = "admin", id = BATCH) => {
    const res = await route.DELETE(permintaan(userId, role, "DELETE"), { params: Promise.resolve({ id }) });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };

  it("guard: tanpa login 401, bukan admin 403, admin nonaktif 403; RPC tidak dipanggil", async () => {
    assert.equal((await hapus(null)).status, 401);
    assert.equal((await hapus(SISWA, "student")).status, 403);
    assert.equal((await hapus(ADMIN_NONAKTIF)).status, 403);
    assert.equal(rpc.panggilan.length, 0);
  });

  it("id tidak valid 400", async () => {
    assert.equal((await hapus(ADMIN, "admin", "abc")).status, 400);
    assert.equal(rpc.panggilan.length, 0);
  });

  it("aktor dari session; hasil menyebut jumlah dihapus & dipertahankan", async () => {
    rpc.jawab = { status: "dihapus", jumlah_soal: 3, jumlah_bacaan: 1, dipertahankan: 2 };
    const r = await hapus(ADMIN);
    assert.equal(r.status, 200);
    assert.deepEqual(rpc.panggilan, [{ nama: "studio_soal_admin_hapus_batch_draf", args: { p_admin_id: ADMIN, p_batch_id: BATCH } }]);
    assert.match(String(r.json.pesan), /3 soal draf/);
    assert.match(String(r.json.pesan), /1 bacaan/);
    assert.match(String(r.json.pesan), /2 soal .*dipertahankan/);
    assert.deepEqual(db.soal_bank, [], "tidak ada tulis langsung ke tabel");
  });

  it("batch tidak ada 404; bukan_admin 403; galat database 500", async () => {
    rpc.jawab = { status: "tidak_ditemukan" };
    assert.equal((await hapus(ADMIN)).status, 404);
    rpc.jawab = { status: "bukan_admin" };
    assert.equal((await hapus(ADMIN)).status, 403);
    rpc.gagal = true;
    assert.equal((await hapus(ADMIN)).status, 500);
  });

  it("daftar batch: terbaru dulu, jumlah per status benar walau soal lebih dari satu halaman query", async () => {
    db.soal_impor_batch = [
      { id: u(502), nama_berkas: "lama.csv", dibuat_pada: "2026-10-01T00:00:00Z" },
      { id: BATCH, nama_berkas: "baru.docx", dibuat_pada: "2026-11-01T00:00:00Z" },
    ];
    db.soal_bank = Array.from({ length: 2300 }, (_, i) => ({ id: u(10000 + i), impor_batch_id: BATCH, status: i < 2100 ? "draf" : "terpublikasi", stimulus_id: null }));
    const daftar = await data.getBatchImpor();
    if (daftar === "gagal") assert.fail("gagal");
    assert.deepEqual(daftar.map((b) => [b.namaBerkas, b.draf, b.terbit]), [["baru.docx", 2100, 200], ["lama.csv", 0, 0]]);
  });
});
