/**
 * Tes "bekukan pemilik" (B5): saat pemegang AKTIF sebuah subtes pada kelas naik dari 1 menjadi >=2,
 * enrollment_subtes kelas itu pada subtes itu yang pendaftarannya pada/setelah 2026-11-15T00:00:00+07:00
 * dan masih mentor_id NULL diisi mentor tunggal yang lama. Legacy (sebelum tanggal itu) dan baris yang
 * sudah terisi TIDAK disentuh. Pembekuan + simpan mentor atomik lewat fungsi SQL simpan_mentor_kelas
 * (di tes ditiru oleh handler yang berperilaku sama: semua atau tidak sama sekali).
 *
 * CATATAN: SQL-nya sendiri (db/add_rpc_simpan_mentor_kelas.sql) TIDAK dijalankan oleh tes ini —
 * yang diuji adalah logika TypeScript (perencanaan, penjaga, urutan, penanganan galat).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { buatFakeSupabase, type Db, type HasilRpc } from "./_fakeSupabase";
import { subtesPemicuBekukan, tentukanPembekuan } from "@/lib/shared/bekukanPemilik";

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const N = "mentor-n"; // tidak aktif
const ADMIN = "admin-1";

const BARU1 = "2026-11-16T10:00:00+07:00";
const BARU2 = "2026-11-20T10:00:00+07:00";
const TEPAT = "2026-11-15T00:00:00+07:00"; // tepat batas = baru
const LEGACY = "2026-11-10T10:00:00+07:00";

describe("lib/shared/bekukanPemilik — fungsi murni", () => {
  const peta = (obj: Record<string, string[]>) => new Map(Object.entries(obj));

  it("pemicu: hanya 1 -> >=2 dengan pemegang lama masih ada", () => {
    assert.deepEqual(Array.from(subtesPemicuBekukan(peta({ k: [A] }), peta({ k: [A, B] })).entries()), [["k", A]]);
    assert.equal(subtesPemicuBekukan(peta({ k: [A, B] }), peta({ k: [A, B, C] })).size, 0); // 2 -> 3
    assert.equal(subtesPemicuBekukan(peta({ k: [A] }), peta({ k: [B] })).size, 0); // 1 -> 1
    assert.equal(subtesPemicuBekukan(peta({ k: [] }), peta({ k: [A, B] })).size, 0); // 0 -> 2
    assert.equal(subtesPemicuBekukan(peta({ k: [A] }), peta({ k: [B, C] })).size, 0); // pemegang lama dilepas
    assert.equal(subtesPemicuBekukan(peta({ k: [A, A] }), peta({ k: [A, B] })).size, 1); // duplikat tidak dihitung dua kali
  });

  it("pembekuan: hanya NULL + pendaftaran >= tanggal pemberlakuan; legacy dan yang terisi dibiarkan", () => {
    const pemicu = new Map([["k", A]]);
    const hasil = tentukanPembekuan(pemicu, [
      { id: "1", subtesId: "k", mentorId: null, tanggalDaftar: BARU1 },
      { id: "2", subtesId: "k", mentorId: null, tanggalDaftar: LEGACY },
      { id: "3", subtesId: "k", mentorId: B, tanggalDaftar: BARU2 },
      { id: "4", subtesId: "k", mentorId: null, tanggalDaftar: TEPAT },
      { id: "5", subtesId: "lain", mentorId: null, tanggalDaftar: BARU1 },
    ]);
    assert.deepEqual(hasil.map((h) => h.id), ["1", "4"]);
    assert.ok(hasil.every((h) => h.mentorId === A));
  });
});

// ---------------------------------------------------------------------------

let db: Db;
let fake: ReturnType<typeof buatFakeSupabase>;
type KelasIdRoute = typeof import("@/app/api/kelola-kelas/[kelasId]/route");
type SessionModule = typeof import("@/lib/auth/session");
let kelasIdRoute: KelasIdRoute;
let sessionLib: SessionModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  const klien = supabaseServer as unknown as { from: (t: string) => unknown; rpc: (n: string, a: Record<string, unknown>) => unknown };
  klien.from = (t: string) => fake.from(t);
  klien.rpc = (n: string, a: Record<string, unknown>) => fake.rpc(n, a);
  kelasIdRoute = await import("@/app/api/kelola-kelas/[kelasId]/route");
  sessionLib = await import("@/lib/auth/session");
});

const diampu = (...ids: string[]) => ids.map((id) => ({ subtes_id: id, subtes: { mapel_dasar: null } }));

/** Tiruan fungsi SQL simpan_mentor_kelas: satu transaksi — semua dilakukan atau tidak ada yang berubah. */
function pasangFungsiSql(opsi: { galat?: boolean } = {}) {
  fake.rpcHandlers.simpan_mentor_kelas = (args): HasilRpc => {
    if (opsi.galat) return { data: null, error: { message: "galat tiruan di tengah transaksi" } }; // rollback: tidak ada yang berubah
    const kelasId = args.p_kelas_id as string;
    if (!db.kelas.some((k) => k.id === kelasId)) return { data: { status: "kelas_tidak_ditemukan" }, error: null };
    const bekukan = args.p_bekukan as { id: string; mentor_id: string; diterima_pada: string }[];
    const pasangan = args.p_pasangan as { subtes_id: string; mentor_id: string }[];
    const enrollmentKelas = new Set(db.enrollments.filter((e) => e.kelas_id === kelasId).map((e) => e.id));
    let dibekukan = 0;
    for (const item of bekukan) {
      const baris = db.enrollment_subtes.find((r) => r.id === item.id);
      if (baris && enrollmentKelas.has(baris.enrollment_id as string) && baris.mentor_id === null) {
        baris.mentor_id = item.mentor_id; // WHERE mentor_id IS NULL
        baris.diterima_pada = item.diterima_pada;
        dibekukan++;
      }
    }
    db.kelas_subtes_mentor = db.kelas_subtes_mentor.filter((r) => r.kelas_id !== kelasId);
    db.kelas_subtes_mentor.push(...pasangan.map((p) => ({ kelas_id: kelasId, subtes_id: p.subtes_id, mentor_id: p.mentor_id })));
    db.kelas_mentor = db.kelas_mentor.filter((r) => r.kelas_id !== kelasId);
    db.kelas_mentor.push(...(args.p_mentor_ids as string[]).map((m) => ({ kelas_id: kelasId, mentor_id: m })));
    return { data: { status: "ok", dibekukan }, error: null };
  };
}

function bangunDb(): Db {
  return {
    subtes: [
      { id: "s-kim", nama: "Kimia", mapel_dasar: null },
      { id: "s-fis", nama: "Fisika", mapel_dasar: null },
    ],
    users: [A, B, C, N].map((id) => ({ id, nama: `nama-${id}` })),
    user_roles: [
      ...[A, B, C].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })),
      { user_id: N, role_type: "mentor", status: "pending" },
    ],
    mentor_profiles: [A, B, C, N].map((id) => ({ user_id: id, mentor_subtes_diampu: diampu("s-kim", "s-fis") })),
    kelas: [{ id: "K1", nama: "Paket", mode_pembelajaran: "online" }],
    kelas_subtes: [{ kelas_id: "K1", subtes_id: "s-kim" }],
    kelas_mentor: [{ kelas_id: "K1", mentor_id: A }],
    kelas_subtes_mentor: [{ kelas_id: "K1", subtes_id: "s-kim", mentor_id: A }],
    enrollments: [
      { id: "e-baru1", kelas_id: "K1", tanggal_daftar: BARU1 },
      { id: "e-baru2", kelas_id: "K1", tanggal_daftar: BARU2 },
      { id: "e-lama", kelas_id: "K1", tanggal_daftar: LEGACY },
      { id: "e-tepat", kelas_id: "K1", tanggal_daftar: TEPAT },
    ],
    enrollment_subtes: [
      { id: "es-baru1", enrollment_id: "e-baru1", subtes_id: "s-kim", mentor_id: null, diterima_pada: null },
      { id: "es-baru2", enrollment_id: "e-baru2", subtes_id: "s-kim", mentor_id: A, diterima_pada: "2026-11-21T00:00:00.000Z" },
      { id: "es-lama", enrollment_id: "e-lama", subtes_id: "s-kim", mentor_id: null, diterima_pada: null },
      { id: "es-tepat", enrollment_id: "e-tepat", subtes_id: "s-kim", mentor_id: null, diterima_pada: null },
    ],
  };
}

beforeEach(() => {
  db = bangunDb();
  fake = buatFakeSupabase(db);
  pasangFungsiSql();
});

const bodyDasar = {
  nama: "Paket Baru Nama",
  programKategori: "snbt",
  tingkatKelas: "kelas_12",
  tipeKelas: "grouping",
  modePembelajaran: "online",
  jumlahSesi: 10,
  kapasitas: 20,
  harga: 500000,
};

const pairs = (subtesId: string, ...mentor: string[]) => mentor.map((mentorId) => ({ subtesId, mentorId }));

async function ubah(subtesMentorPairs: { subtesId: string; mentorId: string }[], extra: Record<string, unknown> = {}) {
  const res = await kelasIdRoute.PATCH(
    new NextRequest("http://localhost/api/kelola-kelas/K1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken({ userId: ADMIN, role: "admin" })}` },
      body: JSON.stringify({ ...bodyDasar, subtesMentorPairs, ...extra }),
    }),
    { params: Promise.resolve({ kelasId: "K1" }) },
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const penerima = (id: string) => db.enrollment_subtes.find((r) => r.id === id)?.mentor_id ?? null;
const pasangan = () => db.kelas_subtes_mentor.map((r) => `${r.subtes_id}:${r.mentor_id}`).sort();
const snapshotSiswa = () => JSON.stringify(db.enrollment_subtes);

describe("bekukan pemilik — 1 menjadi >=2 mentor aktif", () => {
  it("tambah mentor kedua: siswa BARU ber-mentor_id NULL dibekukan ke mentor lama; legacy dan yang terisi tidak berubah", async () => {
    const { status } = await ubah(pairs("s-kim", A, B));
    assert.equal(status, 200);
    assert.equal(penerima("es-baru1"), A);
    assert.equal(penerima("es-tepat"), A); // tepat pada batas = pendaftaran baru
    assert.equal(penerima("es-lama"), null); // legacy tidak disentuh
    assert.equal(penerima("es-baru2"), A); // sudah terisi: tetap
    assert.equal(db.enrollment_subtes.find((r) => r.id === "es-baru2")?.diterima_pada, "2026-11-21T00:00:00.000Z"); // tidak ditimpa
    assert.equal(db.enrollment_subtes.find((r) => r.id === "es-lama")?.diterima_pada, null);
    // diterima_pada mengikuti konvensi terimaSiswa: ISO UTC dari "sekarang"
    const dt = db.enrollment_subtes.find((r) => r.id === "es-baru1")?.diterima_pada as string;
    assert.match(dt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(Math.abs(Date.now() - Date.parse(dt)) < 60_000);
    // mentor ikut tersimpan
    assert.deepEqual(pasangan(), ["s-kim:mentor-a", "s-kim:mentor-b"]);
    assert.deepEqual(db.kelas_mentor.map((r) => r.mentor_id).sort(), [A, B]);
  });

  it("pembekuan dan simpan mentor dalam SATU pemanggilan atomik, dipanggil SEBELUM data kelas diubah", async () => {
    await ubah(pairs("s-kim", A, B));
    assert.equal(fake.rpcLog.length, 1);
    const args = fake.rpcLog[0].args;
    assert.deepEqual((args.p_bekukan as { id: string }[]).map((b) => b.id).sort(), ["es-baru1", "es-tepat"]);
    assert.deepEqual(args.p_mentor_ids, [A, B]);
    const urutan = fake.log.filter((l) => l.table === "kelas" && l.op === "update");
    assert.equal(urutan.length, 1); // data kelas tetap tersimpan setelah RPC sukses
    // jalur biasa untuk mentor TIDAK dipakai ganda
    assert.equal(fake.tulisan("delete", "kelas_subtes_mentor").length, 0);
    assert.equal(fake.tulisan("insert", "kelas_subtes_mentor").length, 0);
  });

  it("tanpa siswa: tidak ada pembekuan, fungsi atomik tidak dipanggil, simpan mentor jalur biasa", async () => {
    db.enrollments.length = 0;
    db.enrollment_subtes.length = 0;
    const { status } = await ubah(pairs("s-kim", A, B));
    assert.equal(status, 200);
    assert.equal(fake.rpcLog.length, 0);
    assert.deepEqual(pasangan(), ["s-kim:mentor-a", "s-kim:mentor-b"]);
  });

  it("subtes dengan siswa tapi tidak ada baris NULL baru: tidak ada yang dibekukan (fungsi atomik tidak dipanggil)", async () => {
    db.enrollment_subtes.splice(0, db.enrollment_subtes.length, { id: "es-x", enrollment_id: "e-baru2", subtes_id: "s-kim", mentor_id: A, diterima_pada: "x" });
    const { status } = await ubah(pairs("s-kim", A, B));
    assert.equal(status, 200);
    assert.equal(fake.rpcLog.length, 0);
    assert.deepEqual(pasangan(), ["s-kim:mentor-a", "s-kim:mentor-b"]);
  });

  it("2 menjadi 3 mentor: tidak membekukan apa pun", async () => {
    db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: B });
    const sebelum = snapshotSiswa();
    const { status } = await ubah(pairs("s-kim", A, B, C));
    assert.equal(status, 200);
    assert.equal(fake.rpcLog.length, 0);
    assert.equal(snapshotSiswa(), sebelum);
  });

  it("1 menjadi 1 (mentor diganti): tidak membekukan", async () => {
    db.enrollment_subtes.find((r) => r.id === "es-baru2")!.mentor_id = null; // supaya A boleh dilepas (penjaga lepas mentor)
    const { status } = await ubah(pairs("s-kim", B));
    assert.equal(status, 200);
    assert.equal(fake.rpcLog.length, 0);
    assert.equal(penerima("es-baru1"), null);
  });

  it("pemegang lama ikut dilepas saat bertambah (A diganti B dan C): tidak ada pembekuan ke mentor yang dilepas", async () => {
    db.enrollment_subtes.find((r) => r.id === "es-baru2")!.mentor_id = null;
    const { status } = await ubah(pairs("s-kim", B, C));
    assert.equal(status, 200);
    assert.equal(fake.rpcLog.length, 0);
    assert.equal(penerima("es-baru1"), null);
  });

  it("hanya pemegang AKTIF yang dihitung: sebelum A (aktif) + N (tidak aktif) = 1 aktif; sesudah A + B = 2 aktif -> beku ke A", async () => {
    db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: N }); // N pending, tidak memegang siswa
    const { status } = await ubah(pairs("s-kim", A, B)); // N dilepas, B ditambah
    assert.equal(status, 200);
    assert.equal(fake.rpcLog.length, 1);
    assert.equal(penerima("es-baru1"), A);
  });

  it("hanya subtes yang memicu yang dibekukan: Fisika 1 -> 1 tidak disentuh", async () => {
    db.kelas_subtes.push({ kelas_id: "K1", subtes_id: "s-fis" });
    db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-fis", mentor_id: C });
    db.enrollment_subtes.push({ id: "es-fis", enrollment_id: "e-baru1", subtes_id: "s-fis", mentor_id: null, diterima_pada: null });
    const { status } = await ubah([...pairs("s-kim", A, B), ...pairs("s-fis", C)]);
    assert.equal(status, 200);
    assert.equal(penerima("es-baru1"), A);
    assert.equal(penerima("es-fis"), null);
  });

  it("simpan ulang setelah dibekukan: tidak membekukan lagi", async () => {
    await ubah(pairs("s-kim", A, B));
    fake.rpcLog.length = 0;
    const { status } = await ubah(pairs("s-kim", A, B));
    assert.equal(status, 200);
    assert.equal(fake.rpcLog.length, 0);
  });

  it("kelas OFFLINE tidak berubah: tanpa pasangan, tanpa pembekuan, tanpa fungsi atomik", async () => {
    db.kelas_subtes_mentor.length = 0;
    const sebelum = snapshotSiswa();
    const { status } = await ubah([], { modePembelajaran: "offline", jumlahSesi: 8, offlineSubtesId: "s-kim" });
    assert.equal(status, 200);
    assert.equal(fake.rpcLog.length, 0);
    assert.equal(snapshotSiswa(), sebelum);
  });
});

describe("bekukan pemilik — kegagalan = tidak ada yang tersimpan", () => {
  it("fungsi atomik gagal (rollback): 500, mentor_id tidak terisi, pasangan dan data kelas tidak berubah", async () => {
    pasangFungsiSql({ galat: true });
    const sebelum = snapshotSiswa();
    const { status } = await ubah(pairs("s-kim", A, B));
    assert.equal(status, 500);
    assert.equal(snapshotSiswa(), sebelum);
    assert.deepEqual(pasangan(), ["s-kim:mentor-a"]);
    assert.equal(db.kelas[0].nama, "Paket"); // data kelas belum diubah karena RPC dipanggil lebih dulu
    assert.equal(fake.tulisan("update", "kelas").length, 0);
  });

  it("fungsi SQL belum dipasang (PGRST202): 500 dengan petunjuk berkas, tidak ada yang tersimpan", async () => {
    delete fake.rpcHandlers.simpan_mentor_kelas;
    const sebelum = snapshotSiswa();
    const { status, json } = await ubah(pairs("s-kim", A, B));
    assert.equal(status, 500);
    assert.match(json.error as string, /db\/add_rpc_simpan_mentor_kelas\.sql/);
    assert.equal(snapshotSiswa(), sebelum);
    assert.deepEqual(pasangan(), ["s-kim:mentor-a"]);
    assert.equal(fake.tulisan().length, 0);
  });

  for (const tabel of ["user_roles", "enrollments", "enrollment_subtes"]) {
    it(`gagal baca ${tabel} saat merencanakan = fail-closed (500), tidak ada yang tersimpan`, async () => {
      // user_roles dibaca juga oleh validateKelasInput (2 pasangan = 2 pemanggilan); yang digagalkan adalah pemanggilan perencana.
      if (tabel === "user_roles") fake.gagalMulaiKe.set("user_roles:select", 3);
      else fake.gagal.add(`${tabel}:select`);
      const sebelum = snapshotSiswa();
      const { status } = await ubah(pairs("s-kim", A, B));
      assert.equal(status, 500);
      assert.equal(fake.rpcLog.length, 0);
      assert.equal(fake.tulisan().length, 0);
      assert.equal(snapshotSiswa(), sebelum);
      assert.deepEqual(pasangan(), ["s-kim:mentor-a"]);
    });
  }

  it("penjaga lepas mentor tetap berjalan lebih dulu: lepas mentor yang memegang siswa = 409 tanpa memanggil fungsi atomik", async () => {
    const { status } = await ubah(pairs("s-kim", B)); // A dilepas, A memegang es-baru2
    assert.equal(status, 409);
    assert.equal(fake.rpcLog.length, 0);
    assert.equal(fake.tulisan().length, 0);
  });

  it("penjaga di dalam fungsi SQL (balapan): 'mentor_masih_memegang_siswa' -> 409, tidak ada yang tersimpan", async () => {
    fake.rpcHandlers.simpan_mentor_kelas = (): HasilRpc => ({ data: { status: "mentor_masih_memegang_siswa" }, error: null });
    const { status } = await ubah(pairs("s-kim", A, B));
    assert.equal(status, 409);
    assert.equal(fake.tulisan().length, 0);
  });
});
