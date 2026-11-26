/**
 * Terbit draf dari Bank Soal: rute /api/admin/studio-soal/impor/terbitkan (satu
 * soal atau satu batch) memvalidasi ulang tiap draf (mode "ajukan") sebelum RPC.
 * Supabase tiruan di memori; penolakan sumber 'manual' oleh RPC-nya sendiri diuji
 * di db/test_studio_soal_impor_DRYRUN.sql.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";
import { ADMIN, ADMIN_NONAKTIF, SISWA, db, pasangDbTiruan, resetDbTiruan, rpc, tulisLangsung, u, type Row } from "./bantuan/dbTiruanSoal";
import { izinSoal, ringkasBatch } from "@/lib/shared/studio-soal/bankSoal";

const PU = u(101);
const BATCH = u(501);
const DIBACA = "2026-11-20T10:00:00.123456+00:00";

const soal = (n: number, ubah: Row = {}): Row => ({
  id: u(1000 + n),
  menggantikan_id: null,
  subtes_id: PU,
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
  impor_batch_id: BATCH,
  created_at: new Date(Date.UTC(2026, 0, 1) + n * 60000).toISOString(),
  updated_at: DIBACA,
  ...ubah,
});
const id = (n: number) => u(1000 + n);

let permintaan: Awaited<ReturnType<typeof pasangDbTiruan>>;
let route: typeof import("@/app/api/admin/studio-soal/impor/terbitkan/route");

before(async () => {
  permintaan = await pasangDbTiruan();
  route = await import("@/app/api/admin/studio-soal/impor/terbitkan/route");
});
beforeEach(() => {
  resetDbTiruan();
  db.subtes = [{ id: PU, nama: "Penalaran Umum", kategori: "tps" }];
  db.soal_impor_batch = [{ id: BATCH, nama_berkas: "satu.docx" }];
  rpc.jawab = (args) => ({ status: "selesai", diterbitkan: args.p_ids, stimulus_diterbitkan: [], dilewati: [] });
});

type Hasil = {
  status: number;
  json: { success: boolean; error?: string; diterbitkan?: number; dilewati?: { id: string; alasan: string; rincian?: string[] }[] };
};
async function terbit(body: unknown, userId: string | null = ADMIN, role: "admin" | "student" = "admin"): Promise<Hasil> {
  const res = await route.POST(permintaan(userId, role, "POST", body));
  return { status: res.status, json: (await res.json()) as Hasil["json"] };
}
const idDikirim = () => rpc.panggilan.flatMap((p) => (p.args.p_ids as string[]) ?? []);

describe("terbit satu soal dari Bank Soal", () => {
  it("guard admin: 401 tanpa login, 403 siswa & admin nonaktif; tidak ada RPC", async () => {
    db.soal_bank = [soal(1)];
    for (const body of [{ soalId: id(1) }, { batchId: BATCH }]) {
      assert.equal((await terbit(body, null)).status, 401);
      assert.equal((await terbit(body, SISWA, "student")).status, 403);
      assert.equal((await terbit(body, ADMIN_NONAKTIF)).status, 403);
    }
    assert.equal(rpc.panggilan.length, 0);
  });

  it("draf pertama yang lengkap diterbitkan lewat studio_soal_terbitkan_admin", async () => {
    db.soal_bank = [soal(1), soal(2)];
    const r = await terbit({ soalId: id(1), updatedAt: DIBACA });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual([r.json.diterbitkan, r.json.dilewati], [1, []]);
    assert.equal(rpc.panggilan.length, 1);
    assert.equal(rpc.panggilan[0].nama, "studio_soal_terbitkan_admin");
    assert.deepEqual([rpc.panggilan[0].args.p_admin_id, rpc.panggilan[0].args.p_ids], [ADMIN, [id(1)]]);
    assert.deepEqual(tulisLangsung, []);
  });

  it("draf tidak lengkap atau berumus rusak tidak diterbitkan dan alasannya dilaporkan", async () => {
    for (const [ubah, pola] of [
      [{ pembahasan: "" }, /Pembahasan/],
      [{ kunci: { v: 1 } }, /./],
      [{ redaksi: "\\(\\frac{1}{\\)" }, /Rumus/],
    ] as [Row, RegExp][]) {
      db.soal_bank = [soal(1, ubah)];
      const r = await terbit({ soalId: id(1) });
      assert.equal(r.status, 200);
      assert.equal(r.json.diterbitkan, 0);
      assert.deepEqual(r.json.dilewati?.map((d) => [d.id, d.alasan]), [[id(1), "belum_lengkap"]]);
      assert.match((r.json.dilewati?.[0].rincian ?? []).join(" "), pola);
    }
    assert.equal(rpc.panggilan.length, 0);
  });

  it("soal buatan mentor ditolak; soal terbit/arsip tidak bisa diterbitkan ulang; id tak ada 404", async () => {
    db.soal_bank = [
      soal(1, { sumber: "manual" }),
      soal(2, { status: "terpublikasi" }),
      soal(3, { status: "diarsipkan" }),
      soal(4, { status: "digantikan" }),
    ];
    const manual = await terbit({ soalId: id(1) });
    assert.equal(manual.status, 403);
    assert.match(String(manual.json.error), /hanya bisa dilihat/);
    for (const n of [2, 3, 4]) assert.equal((await terbit({ soalId: id(n) })).status, 409, `soal ${n}`);
    assert.equal((await terbit({ soalId: id(99) })).status, 404);
    assert.equal((await terbit({ soalId: "abc" })).status, 400);
    assert.equal(rpc.panggilan.length, 0);
  });

  it("soal yang berubah sejak dibuka ditolak: muat ulang", async () => {
    db.soal_bank = [soal(1)];
    const r = await terbit({ soalId: id(1), updatedAt: "2026-11-19T00:00:00+00:00" });
    assert.equal(r.status, 409);
    assert.match(String(r.json.error), /diubah di tempat lain.*muat ulang/i);
    assert.equal(rpc.panggilan.length, 0);
  });

  it("draf versi baru diterbitkan lewat RPC terbit versi (versi lama digantikan), dengan isi & updated_at baris", async () => {
    db.soal_bank = [soal(1, { menggantikan_id: id(50) })];
    rpc.jawab = { status: "versi_terbit", soal_id: id(1) };
    const r = await terbit({ soalId: id(1), updatedAt: DIBACA });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.diterbitkan, 1);
    const [p] = rpc.panggilan;
    assert.equal(p.nama, "studio_soal_admin_terbitkan_versi");
    assert.deepEqual([p.args.p_admin_id, p.args.p_soal_id, p.args.p_updated_at], [ADMIN, id(1), DIBACA]);
    assert.equal((p.args.p_data as Row).redaksi, "Soal nomor 1");
    assert.equal("menggantikan_id" in (p.args.p_data as Row), false);

    rpc.jawab = { status: "versi_lama_tidak_aktif" };
    const gagal = await terbit({ soalId: id(1) });
    assert.equal(gagal.status, 409);
    assert.match(String(gagal.json.error), /Versi lama/);
  });

  it("alasan dari RPC (mis. bacaan tidak bisa terbit) diteruskan", async () => {
    db.soal_bank = [soal(1)];
    rpc.jawab = { status: "selesai", diterbitkan: [], stimulus_diterbitkan: [], dilewati: [{ id: id(1), alasan: "stimulus_tidak_valid" }] };
    const r = await terbit({ soalId: id(1) });
    assert.deepEqual([r.json.diterbitkan, r.json.dilewati?.[0].alasan], [0, "stimulus_tidak_valid"]);
  });
});

describe("terbit semua draf satu batch", () => {
  it("hanya draf pertama yang lengkap dikirim ke RPC; yang lain dilaporkan atau tidak disentuh", async () => {
    db.soal_bank = [
      soal(1),
      soal(2, { pembahasan: "" }),
      soal(3, { status: "terpublikasi" }),
      soal(4, { sumber: "manual" }),
      soal(5, { menggantikan_id: id(3) }),
      soal(6),
      soal(7, { impor_batch_id: u(502) }),
    ];
    const r = await terbit({ batchId: BATCH });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(idDikirim(), [id(1), id(6)]);
    assert.equal(r.json.diterbitkan, 2);
    assert.deepEqual(r.json.dilewati?.map((d) => [d.id, d.alasan]), [[id(2), "belum_lengkap"], [id(5), "versi_baru"]]);
  });

  it("semua draf belum lengkap = tidak ada RPC", async () => {
    db.soal_bank = [soal(1, { pembahasan: "" })];
    const r = await terbit({ batchId: BATCH });
    assert.deepEqual([r.status, r.json.diterbitkan, r.json.dilewati?.length], [200, 0, 1]);
    assert.equal(rpc.panggilan.length, 0);
  });

  it("dipotong per 200 id setelah validasi", async () => {
    db.soal_bank = Array.from({ length: 251 }, (_, i) => soal(i + 1, i === 0 ? { pembahasan: "" } : {}));
    const r = await terbit({ batchId: BATCH });
    assert.deepEqual(rpc.panggilan.map((p) => (p.args.p_ids as string[]).length), [200, 50]);
    assert.equal(r.json.diterbitkan, 250);
  });
});

describe("layar", () => {
  const baca = (f: string) => readFileSync(f, "utf8");

  it("izin terbit hanya untuk draf Buatan Sendiri", () => {
    assert.equal(izinSoal({ sumber: "buatan_sendiri", status: "draf" }).terbit, true);
    for (const [sumber, status] of [["manual", "draf"], ["buatan_sendiri", "terpublikasi"], ["buatan_sendiri", "diarsipkan"], ["buatan_sendiri", "digantikan"]]) {
      assert.equal(izinSoal({ sumber, status }).terbit, false, `${sumber} ${status}`);
    }
  });

  it("jumlah di tombol batch tidak menghitung draf versi baru", () => {
    const [r] = ringkasBatch(
      [{ id: BATCH, nama_berkas: "a", dibuat_pada: DIBACA }],
      [
        { impor_batch_id: BATCH, status: "draf", stimulus_id: null, menggantikan_id: null },
        { impor_batch_id: BATCH, status: "draf", stimulus_id: null, menggantikan_id: id(9) },
      ],
      [],
    );
    assert.deepEqual([r.draf, r.drafBaru], [2, 1]);
  });

  it("tombol, konfirmasi, dan keterangan tersedia", () => {
    const detail = baca("components/admin/DetailSoalAdmin.tsx");
    assert.match(detail, /izin\.terbit/);
    assert.match(detail, /Terbitkan soal ini\?/);
    assert.match(detail, /terkunci setelah terbit[\s\S]*versi baru/);
    const batch = baca("components/admin/DaftarBatchImpor.tsx");
    assert.match(batch, /Terbitkan semua draf batch ini/);
    assert.match(batch, /\{[^}]*drafBaru[^}]*\} soal/);
    for (const f of [detail, batch]) assert.match(f, /\/api\/admin\/studio-soal\/impor\/terbitkan/);
    assert.match(baca("components/admin/ImporSoalClient.tsx"), /diterbitkan[^<]*dari[\s\S]{0,80}Bank Soal/);
  });
});
