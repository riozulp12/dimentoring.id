/**
 * Soal terbit di Bank Soal (Admin): "Edit & terbitkan ulang" satu langkah
 * (versi_baru lalu terbitkan_versi, draf dibuang bila gagal) dan "Hapus" = arsip.
 * Supabase tiruan: status baris disimulasikan di sini; aturan RPC & atomisitas
 * terbitkan_versi diuji di db/test_studio_soal_impor_perawatan_DRYRUN.sql.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { ADMIN, ADMIN_NONAKTIF, SISWA, db, pasangDbTiruan, resetDbTiruan, rpc, tulisLangsung, u, type Row } from "./bantuan/dbTiruanSoal";

const baca = (rel: string) => readFileSync(rel, "utf8");
const PU = u(101);
const LAMA = u(1001);
const BARU = u(1009);
const MANUAL = u(1002);
const JAM = "2026-11-27T01:02:03.456789+00:00";

const soal: Row = {
  id: LAMA,
  keluarga_id: u(3001),
  versi: 1,
  menggantikan_id: null,
  subtes_id: PU,
  stimulus_id: null,
  tipe: "pilihan_ganda",
  tingkat_kesulitan: "sedang",
  status: "terpublikasi",
  sumber: "buatan_sendiri",
  redaksi: "Soal lama",
  konten: { v: 1, opsi: ["A", "B", "C", "D", "E"].map((label) => ({ label, teks: `opsi ${label}` })) },
  kunci: { v: 1, opsi: "C" },
  pembahasan: "Pembahasan yang cukup panjang untuk lolos.",
  sumber_rujukan: "Buatan Sendiri",
  level_kognitif: null,
  estimasi_waktu_detik: 60,
  updated_at: "2026-11-20T10:00:00.123456+00:00",
};

/** Isi form yang dikirim layar: kunci dibetulkan ke B. */
const isi = (ubah: Row = {}) => ({
  ...Object.fromEntries(
    ["subtes_id", "tipe", "stimulus_id", "redaksi", "konten", "kunci", "pembahasan", "sumber_rujukan", "tingkat_kesulitan", "level_kognitif", "estimasi_waktu_detik", "updated_at"].map((k) => [k, soal[k]]),
  ),
  redaksi: "Soal dibetulkan",
  kunci: { v: 1, opsi: "B" },
  ...ubah,
});

const status = () => Object.fromEntries(db.soal_bank.filter((s) => s.sumber === "buatan_sendiri").map((s) => [s.id as string, s.status]));
const nama = () => rpc.panggilan.map((p) => p.nama.replace("studio_soal_admin_", ""));

/** Tiruan perubahan baris oleh RPC. `gagal`: jawaban pengganti untuk satu RPC (tanpa mengubah apa pun). */
function pasangRpc(gagal: Partial<Record<"versi_baru" | "terbitkan_versi" | "hapus_draf", Row | "putus" | "putus_sesudah_commit">> = {}) {
  rpc.jawab = (args, n) => {
    const pendek = n.replace("studio_soal_admin_", "") as "versi_baru" | "terbitkan_versi" | "hapus_draf" | "arsipkan";
    const paksa = pendek === "arsipkan" ? undefined : gagal[pendek];
    rpc.gagal = paksa === "putus" || paksa === "putus_sesudah_commit";
    if (paksa && paksa !== "putus_sesudah_commit") return typeof paksa === "string" ? {} : paksa;
    const baris = db.soal_bank.find((s) => s.id === args.p_soal_id);
    if (pendek === "versi_baru") {
      db.soal_bank.push({ ...baris, id: BARU, versi: 2, menggantikan_id: LAMA, status: "draf", updated_at: JAM });
      return { status: "versi_dibuat", soal_id: BARU };
    }
    if (pendek === "terbitkan_versi") {
      db.soal_bank.find((s) => s.id === baris!.menggantikan_id)!.status = "digantikan";
      Object.assign(baris!, args.p_data as Row, { status: "terpublikasi" });
      return { status: "versi_terbit", soal_id: BARU, menggantikan_id: LAMA };
    }
    if (pendek === "hapus_draf") {
      if (baris?.status !== "draf") return { status: "status_tidak_valid" };
      db.soal_bank.splice(db.soal_bank.indexOf(baris), 1);
      return { status: "dihapus", jumlah_bacaan: 0 };
    }
    baris!.status = "diarsipkan";
    return { status: "diarsipkan" };
  };
}

let permintaan: Awaited<ReturnType<typeof pasangDbTiruan>>;
let aksi: typeof import("@/app/api/admin/studio-soal/bank/[id]/[aksi]/route");
before(async () => {
  permintaan = await pasangDbTiruan();
  aksi = await import("@/app/api/admin/studio-soal/bank/[id]/[aksi]/route");
});
beforeEach(() => {
  resetDbTiruan();
  db.subtes = [{ id: PU, nama: "Penalaran Umum", kategori: "tps" }];
  db.soal_bank = [structuredClone(soal), { ...structuredClone(soal), id: MANUAL, keluarga_id: u(3002), sumber: "manual" }];
});

async function jalankan(a: string, body?: unknown, id = LAMA, userId: string | null = ADMIN, role: "admin" | "student" = "admin") {
  const res = await aksi.POST(permintaan(userId, role, "POST", body), { params: Promise.resolve({ id, aksi: a }) });
  return { status: res.status, json: (await res.json()) as Row };
}

describe("edit & terbitkan ulang soal terbit", () => {
  it("satu permintaan: versi lama digantikan, versi baru terpublikasi dengan isi baru", async () => {
    pasangRpc();
    const r = await jalankan("terbit-ulang", isi());
    assert.deepEqual([r.status, r.json.success, r.json.soalId], [200, true, BARU]);
    assert.deepEqual(nama(), ["versi_baru", "terbitkan_versi"]);
    assert.deepEqual(status(), { [LAMA]: "digantikan", [BARU]: "terpublikasi" });
    const terbit = rpc.panggilan[1].args;
    assert.deepEqual([terbit.p_admin_id, terbit.p_soal_id, terbit.p_updated_at], [ADMIN, BARU, JAM], "updated_at milik draf baru");
    assert.deepEqual((terbit.p_data as Row).kunci, { v: 1, opsi: "B" });
    assert.deepEqual(tulisLangsung, [], "semua tulis lewat RPC");
  });

  it("isi belum lengkap: ditolak sebelum draf apa pun dibuat", async () => {
    pasangRpc();
    for (const rusak of [{ pembahasan: "" }, { kunci: { v: 1, opsi: "" } }, { redaksi: " " }]) {
      const r = await jalankan("terbit-ulang", isi(rusak));
      assert.equal(r.status, 400);
      assert.ok((r.json.errors as unknown[]).length > 0);
    }
    assert.deepEqual(rpc.panggilan, []);
    assert.deepEqual(status(), { [LAMA]: "terpublikasi" });
  });

  for (const [judul, gagal, kode] of [
    ["ditolak database", { status: "data_tidak_valid", detail: "x" }, 400],
    ["bacaan tidak aktif", { status: "stimulus_tidak_aktif" }, 409],
    ["sambungan putus", "putus", 500],
  ] as const) {
    it(`terbit gagal (${judul}): draf dibuang, soal terbit tidak berubah`, async () => {
      pasangRpc({ terbitkan_versi: gagal });
      const r = await jalankan("terbit-ulang", isi());
      assert.deepEqual([r.status, r.json.success, r.json.soalId], [kode, false, undefined]);
      assert.match(String(r.json.error), /Soal terbit tidak berubah/);
      assert.deepEqual(nama(), ["versi_baru", "terbitkan_versi", "hapus_draf"]);
      assert.equal(rpc.panggilan[2].args.p_soal_id, BARU);
      assert.deepEqual(status(), { [LAMA]: "terpublikasi" });
    });
  }

  it("jawaban terbit hilang padahal sudah tersimpan: dilaporkan berhasil, versi baru tidak dihapus", async () => {
    pasangRpc({ terbitkan_versi: "putus_sesudah_commit" });
    const r = await jalankan("terbit-ulang", isi());
    assert.deepEqual([r.status, r.json.success, r.json.soalId], [200, true, BARU]);
    assert.deepEqual(status(), { [LAMA]: "digantikan", [BARU]: "terpublikasi" });
  });

  it("draf gagal dibuang: tetap draf (tak terlihat siswa) dan alamatnya diberitahukan", async () => {
    pasangRpc({ terbitkan_versi: { status: "stimulus_tidak_aktif" }, hapus_draf: "putus" });
    const r = await jalankan("terbit-ulang", isi());
    assert.deepEqual([r.status, r.json.soalId], [409, BARU]);
    assert.match(String(r.json.error), /draf versi baru belum terhapus/i);
    assert.deepEqual(status(), { [LAMA]: "terpublikasi", [BARU]: "draf" });
  });

  it("versi baru tidak bisa dibuat (sudah ada draf lain / bukan terbit): draf orang lain tidak disentuh", async () => {
    pasangRpc({ versi_baru: { status: "ada_versi_terbuka", soal_id: u(1005) } });
    const terbuka = await jalankan("terbit-ulang", isi());
    assert.deepEqual([terbuka.status, terbuka.json.soalId], [409, u(1005)]);
    pasangRpc({ versi_baru: { status: "status_tidak_valid" } });
    assert.equal((await jalankan("terbit-ulang", isi())).status, 409);
    assert.deepEqual(nama(), ["versi_baru", "versi_baru"]);
  });

  it("guard: bukan admin aktif dan soal buatan mentor ditolak tanpa RPC", async () => {
    pasangRpc();
    assert.equal((await jalankan("terbit-ulang", isi(), LAMA, null)).status, 401);
    assert.equal((await jalankan("terbit-ulang", isi(), LAMA, SISWA, "student")).status, 403);
    assert.equal((await jalankan("terbit-ulang", isi(), LAMA, ADMIN_NONAKTIF)).status, 403);
    assert.equal((await jalankan("terbit-ulang", isi(), MANUAL)).status, 403);
    assert.deepEqual(rpc.panggilan, []);
  });
});

describe("hapus soal terbit = arsip", () => {
  it("memakai RPC arsipkan; baris tetap ada dengan status diarsipkan dan muncul di filter arsip", async () => {
    pasangRpc();
    assert.equal((await jalankan("arsipkan")).status, 200);
    assert.deepEqual(nama().filter((n) => n !== "media_yatim"), ["arsipkan"]);
    assert.deepEqual(status(), { [LAMA]: "diarsipkan" });
    const { getBankSoal } = await import("@/lib/admin/bankSoal");
    const { parseFilterBank } = await import("@/lib/shared/studio-soal/bankSoal");
    const arsip = await getBankSoal(parseFilterBank({ status: "diarsipkan" }));
    assert.ok(arsip !== "gagal");
    assert.deepEqual(arsip.baris.map((b) => b.id), [LAMA]);
  });

  it("layar: tombol Edit & terbitkan ulang + Hapus berkonfirmasi, tanpa janji pulihkan dan tanpa hapus permanen", () => {
    const detail = baca("components/admin/DetailSoalAdmin.tsx");
    assert.match(detail, /Edit &amp; terbitkan ulang|Edit & terbitkan ulang/);
    assert.match(detail, /Hapus soal terbit ini\?/);
    assert.match(detail, /hilang dari siswa[\s\S]*Diarsipkan[\s\S]*belum bisa dipulihkan/);
    assert.doesNotMatch(detail, /versi-baru/);
    const edit = baca("components/admin/EditSoalAdmin.tsx");
    assert.match(edit, /terbit-ulang/);
    const halaman = baca("app/(protected)/(admin)/bank-soal/[id]/edit/page.tsx");
    assert.match(halaman, /requireAdminAktif\(/);
    assert.match(halaman, /terbitUlang=\{izin\.versiBaru\}/);
    assert.match(halaman, /redirect\(`\/bank-soal\/\$\{detail\.versiTerbuka\}\/edit`\)/);
    // Mode siswa TampilanSoal tetap tanpa kunci/pembahasan (diuji di studio-soal-bank).
    assert.doesNotMatch(baca("components/studio-soal/TampilanSoal.tsx"), /terbit-ulang/);
  });
});
