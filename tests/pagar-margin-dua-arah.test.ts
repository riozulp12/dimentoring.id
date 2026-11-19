/**
 * Tes pagar margin DUA ARAH di Kelola Kelas (POST /api/kelola-kelas, PATCH /api/kelola-kelas/[kelasId]):
 * kelas private online yang disimpan tidak boleh tertembus kode promo AKTIF yang mencakupnya
 * (Kasus A: diskon kelas dinaikkan; Kasus B: tipe/mode kelas diubah menjadi private online).
 * Gagal baca promo = tolak (500). Supabase TIRUAN di memori.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { buatFakeSupabase, type Db } from "./_fakeSupabase";

const ADMIN = "admin-1";

let db: Db;
let fake: ReturnType<typeof buatFakeSupabase>;
let hitungDari: Record<string, number>;
type KelasIdRoute = typeof import("@/app/api/kelola-kelas/[kelasId]/route");
type KelasRoute = typeof import("@/app/api/kelola-kelas/route");
type SessionModule = typeof import("@/lib/auth/session");
let kelasIdRoute: KelasIdRoute;
let kelasRoute: KelasRoute;
let sessionLib: SessionModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => unknown }).from = (t: string) => {
    hitungDari[t] = (hitungDari[t] ?? 0) + 1;
    return fake.from(t);
  };
  kelasIdRoute = await import("@/app/api/kelola-kelas/[kelasId]/route");
  kelasRoute = await import("@/app/api/kelola-kelas/route");
  sessionLib = await import("@/lib/auth/session");
});

const promo = (
  id: string,
  kode: string,
  tipe: "persen" | "nominal",
  nilai: number,
  opsi: { status?: string; semua?: boolean } = {},
) => ({
  id,
  kode,
  tipe_diskon: tipe,
  nilai_diskon: nilai,
  status: opsi.status ?? "aktif",
  berlaku_semua_kelas: opsi.semua ?? true,
});

beforeEach(() => {
  hitungDari = {};
  db = {
    kelas: [
      { id: "K1", nama: "Privat Intensif", tipe_kelas: "private", mode_pembelajaran: "online", harga: 1_000_000, diskon_persen: 0, jumlah_sesi: 10 },
      { id: "K2", nama: "Kelas Lain", tipe_kelas: "private", mode_pembelajaran: "online", harga: 1_000_000, diskon_persen: 0, jumlah_sesi: 10 },
    ],
    kode_promo: [],
    kode_promo_kelas: [],
    subtes: [{ id: "s1", nama: "Kimia", mapel_dasar: null }],
  };
  fake = buatFakeSupabase(db);
});

const bodyDasar = {
  nama: "Privat Intensif",
  programKategori: "snbt",
  tingkatKelas: "kelas_12",
  tipeKelas: "private",
  modePembelajaran: "online",
  jumlahSesi: 10,
  harga: 1_000_000,
};

const cookie = () => `${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken({ userId: ADMIN, role: "admin" })}`;

async function ubah(body: Record<string, unknown>, kelasId = "K1") {
  const res = await kelasIdRoute.PATCH(
    new NextRequest(`http://localhost/api/kelola-kelas/${kelasId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookie() },
      body: JSON.stringify({ ...bodyDasar, ...body }),
    }),
    { params: Promise.resolve({ kelasId }) },
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function buat(body: Record<string, unknown>) {
  const res = await kelasRoute.POST(
    new NextRequest("http://localhost/api/kelola-kelas", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookie() },
      body: JSON.stringify({ ...bodyDasar, ...body }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const kelasTersimpan = (id: string) => db.kelas.find((k) => k.id === id) as Record<string, unknown>;

describe("Kasus A — diskon kelas dinaikkan saat ada promo aktif yang mencakup kelas", () => {
  beforeEach(() => {
    db.kode_promo.push(promo("p1", "KODEX", "nominal", 50_000, { semua: false }));
    db.kode_promo_kelas.push({ kode_promo_id: "p1", kelas_id: "K1" });
  });

  it("diskon 3% (969.030 - promo 50.000 = 919.030, margin 29,3%) ditolak dengan pesan menyebut KODEX; tidak ada yang tersimpan", async () => {
    const { status, json } = await ubah({ diskonPersen: 3 });
    assert.equal(status, 400);
    assert.equal(
      json.error,
      "Kelas tidak bisa disimpan: kode promo KODEX masih aktif, dan bila ditumpuk dengan diskon kelas ini Dimentoring hanya menyisakan 29,3% (batas minimal 30%). Harga bayar paling rendah yang boleh: Rp927.643. Nonaktifkan kode promo itu atau kecilkan diskon.",
    );
    assert.equal(fake.tulisan().length, 0);
    assert.equal(kelasTersimpan("K1").diskon_persen, 0);
  });

  it("tanpa menaikkan diskon (0%): 999.000 - 50.000 = 949.000 aman, tersimpan normal", async () => {
    const { status } = await ubah({ diskonPersen: 0 });
    assert.equal(status, 200);
  });

  it("diskon 1% masih aman (989.010 - 50.000 = 939.010)", async () => {
    const { status } = await ubah({ diskonPersen: 1 });
    assert.equal(status, 200);
    assert.equal(kelasTersimpan("K1").diskon_persen, 1);
  });

  it("promo persen juga dihitung (10% dari harga setelah diskon kelas)", async () => {
    db.kode_promo.length = 0;
    db.kode_promo_kelas.length = 0;
    db.kode_promo.push(promo("p2", "HEMAT10", "persen", 10));
    const { status, json } = await ubah({ diskonPersen: 0 }); // 999.000 - 99.900 = 899.100 -> 27,8%
    assert.equal(status, 400);
    assert.match(String(json.error), /kode promo HEMAT10 masih aktif.*27,8%/);
  });

  it("beberapa promo bermasalah: yang potongannya terbesar disebut + jumlah promo lain", async () => {
    db.kode_promo.push(promo("p3", "BESAR", "nominal", 200_000));
    db.kode_promo.push(promo("p4", "SEDANG", "nominal", 100_000));
    const { status, json } = await ubah({ diskonPersen: 0 });
    assert.equal(status, 400);
    assert.match(String(json.error), /kode promo BESAR masih aktif/);
    assert.match(String(json.error), /Ada 1 kode promo aktif lain yang juga bermasalah\.$/);
  });
});

describe("Kasus B — kelas diubah menjadi private online saat ada promo aktif yang mencakupnya", () => {
  beforeEach(() => {
    db.kelas[0].tipe_kelas = "grouping";
  });

  it("promo semua-kelas besar: grup -> private online ditolak (tanpa diskon kelas: 'dipakai di kelas ini')", async () => {
    db.kode_promo.push(promo("p1", "MERDEKA", "persen", 20));
    const { status, json } = await ubah({ tipeKelas: "private" });
    assert.equal(status, 400);
    assert.match(String(json.error), /^Kelas tidak bisa disimpan: kode promo MERDEKA masih aktif, dan bila dipakai di kelas ini Dimentoring hanya menyisakan /);
    assert.match(String(json.error), /Nonaktifkan kode promo itu, atau jangan jadikan kelas ini private online\.$/);
    assert.equal(fake.tulisan().length, 0);
    assert.equal(kelasTersimpan("K1").tipe_kelas, "grouping");
  });

  it("promo lewat kode_promo_kelas untuk kelas ini juga menolak", async () => {
    db.kode_promo.push(promo("p1", "KHUSUS", "persen", 30, { semua: false }));
    db.kode_promo_kelas.push({ kode_promo_id: "p1", kelas_id: "K1" });
    const { status, json } = await ubah({ tipeKelas: "private" });
    assert.equal(status, 400);
    assert.match(String(json.error), /kode promo KHUSUS/);
  });

  it("promo untuk kelas LAIN tidak menghalangi kelas ini", async () => {
    db.kode_promo.push(promo("p1", "KHUSUS", "persen", 30, { semua: false }));
    db.kode_promo_kelas.push({ kode_promo_id: "p1", kelas_id: "K2" });
    const { status } = await ubah({ tipeKelas: "private" });
    assert.equal(status, 200);
    assert.equal(kelasTersimpan("K1").tipe_kelas, "private");
  });

  it("kelas private online diubah menjadi private OFFLINE: promo besar tidak menghalangi (bukan private online lagi)", async () => {
    db.kelas[0].tipe_kelas = "private";
    db.kode_promo.push(promo("p1", "MERDEKA", "persen", 50));
    hitungDari = {};
    const { status } = await ubah({ modePembelajaran: "offline", offlineSubtesId: "s1" });
    assert.equal(status, 200);
    assert.equal(hitungDari.kode_promo ?? 0, 0);
  });
});

describe("yang TIDAK boleh menghalangi", () => {
  it("promo NONAKTIF tidak menghalangi", async () => {
    db.kode_promo.push(promo("p1", "MATI", "persen", 50, { status: "nonaktif" }));
    const { status } = await ubah({ diskonPersen: 0 });
    assert.equal(status, 200);
  });

  it("kelas non-private (semi_private, grouping) tidak diblokir walau ada promo besar; tanpa query promo", async () => {
    db.kode_promo.push(promo("p1", "MERDEKA", "persen", 50));
    for (const tipeKelas of ["semi_private", "grouping"]) {
      hitungDari = {};
      const { status } = await ubah({ tipeKelas });
      assert.equal(status, 200, tipeKelas);
      assert.equal(hitungDari.kode_promo ?? 0, 0, `${tipeKelas}: tidak ada query kode_promo`);
    }
  });

  it("kelas private online TANPA promo aktif dan tanpa diskon tersimpan normal (PATCH dan POST)", async () => {
    const a = await ubah({});
    assert.equal(a.status, 200);
    const b = await buat({ nama: "Baru" });
    assert.equal(b.status, 201);
  });

  it("diskon kelas saja yang menembus batas tetap ditolak oleh pagar lama (tidak berubah)", async () => {
    const { status, json } = await ubah({ diskonPersen: 10 });
    assert.equal(status, 400);
    assert.match(String(json.error), /^Diskon terlalu besar\./);
  });
});

describe("gagal-tertutup: gagal baca promo menolak penyimpanan", () => {
  it("query kode_promo gagal -> 500, tidak ada yang tersimpan", async () => {
    fake.gagal.add("kode_promo");
    const { status, json } = await ubah({ diskonPersen: 0 });
    assert.equal(status, 500);
    assert.match(String(json.error), /Gagal memeriksa kode promo aktif/);
    assert.equal(fake.tulisan().length, 0);
  });

  it("query kode_promo_kelas gagal (ada promo per-kelas aktif) -> 500, tidak ada yang tersimpan", async () => {
    db.kode_promo.push(promo("p1", "KODEX", "nominal", 1_000, { semua: false }));
    fake.gagal.add("kode_promo_kelas");
    const { status, json } = await ubah({});
    assert.equal(status, 500);
    assert.match(String(json.error), /Gagal memeriksa cakupan kode promo/);
    assert.equal(fake.tulisan().length, 0);
  });

  it("POST: query kode_promo gagal -> 500 dan tidak ada kelas baru", async () => {
    fake.gagal.add("kode_promo");
    const { status } = await buat({ nama: "Baru" });
    assert.equal(status, 500);
    assert.equal(db.kelas.length, 2);
  });

  it("gagal baca TIDAK mengganggu kelas non-private (tidak ada query)", async () => {
    fake.gagal.add("kode_promo");
    const { status } = await ubah({ tipeKelas: "grouping" });
    assert.equal(status, 200);
  });
});

describe("POST — kelas baru", () => {
  it("promo semua-kelas besar menolak kelas baru private online", async () => {
    db.kode_promo.push(promo("p1", "MERDEKA", "persen", 20));
    const { status, json } = await buat({ nama: "Baru" });
    assert.equal(status, 400);
    assert.match(String(json.error), /kode promo MERDEKA masih aktif/);
    assert.equal(db.kelas.length, 2);
  });

  it("promo per-kelas tidak mencakup kelas yang belum ada: kelas baru tersimpan", async () => {
    db.kode_promo.push(promo("p1", "KHUSUS", "persen", 50, { semua: false }));
    db.kode_promo_kelas.push({ kode_promo_id: "p1", kelas_id: "K2" });
    const { status } = await buat({ nama: "Baru" });
    assert.equal(status, 201);
  });
});

describe("jumlah query tambahan per penyimpanan kelas", () => {
  it("private online, tanpa promo aktif: 1 query (kode_promo)", async () => {
    await ubah({});
    assert.equal(hitungDari.kode_promo, 1);
    assert.equal(hitungDari.kode_promo_kelas ?? 0, 0);
  });

  it("private online, hanya promo semua-kelas: 1 query", async () => {
    db.kode_promo.push(promo("p1", "KECIL", "nominal", 1_000));
    await ubah({});
    assert.equal(hitungDari.kode_promo, 1);
    assert.equal(hitungDari.kode_promo_kelas ?? 0, 0);
  });

  it("private online PATCH, ada promo per-kelas aktif: 2 query (kode_promo + kode_promo_kelas)", async () => {
    db.kode_promo.push(promo("p1", "KECIL", "nominal", 1_000, { semua: false }));
    await ubah({});
    assert.equal(hitungDari.kode_promo, 1);
    assert.equal(hitungDari.kode_promo_kelas, 1);
  });

  it("bukan private online: 0 query", async () => {
    await ubah({ tipeKelas: "grouping" });
    assert.equal(hitungDari.kode_promo ?? 0, 0);
    assert.equal(hitungDari.kode_promo_kelas ?? 0, 0);
  });
});
