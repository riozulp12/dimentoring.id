/**
 * Tes ubah "Subtes yang Diampu" mentor — fungsi murni (lib/shared/ubahSubtesMentor.ts),
 * endpoint kartu Info Mengajar (PATCH /api/mentor/subtes-diampu) dan rute Edit Profil
 * (PATCH /api/profil/update), dengan Supabase TIRUAN (tests/_fakeSupabase.ts).
 *
 * Yang dikunci: penjaga lepas subtes di KEDUA jalur (kelas_subtes_mentor + pendaftaran
 * offline), penulisan DIFF (tidak pernah hapus-semua-lalu-sisip), gagal baca = tidak ada
 * yang tersimpan, otorisasi sesi, dan nama/WA/PTN tetap tersimpan di rute profil.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { buatFakeSupabase, type Db } from "./_fakeSupabase";
import {
  alasanTertahan,
  hitungDiffSubtes,
  pesanTertahan,
  tentukanTertahan,
  validasiDaftarSubtes,
} from "@/lib/shared/ubahSubtesMentor";

const MASTER = [
  { id: "s-mtk", nama: "Matematika" },
  { id: "s-fis", nama: "Fisika" },
  { id: "s-kim", nama: "Kimia" },
  { id: "s-bio", nama: "Biologi" },
];

const M1 = "mentor-1";
const M2 = "mentor-2";
const P1 = "profil-1";
const P2 = "profil-2";

describe("lib/shared/ubahSubtesMentor — fungsi murni", () => {
  it("validasi: lolos untuk nama di master, mengembalikan id sesuai urutan input", () => {
    const hasil = validasiDaftarSubtes(["Fisika", "Matematika"], MASTER);
    assert.deepEqual(hasil, { ok: true, subtesIds: ["s-fis", "s-mtk"] });
  });

  it("validasi: kosong / bukan array = minimal 1 (400)", () => {
    for (const input of [[], undefined, null, "Fisika", {}]) {
      const hasil = validasiDaftarSubtes(input, MASTER);
      assert.equal(hasil.ok, false);
      if (!hasil.ok) {
        assert.equal(hasil.status, 400);
        assert.equal(hasil.error, "Pilih minimal satu Subtes yang Diampu.");
      }
    }
  });

  it("validasi: duplikat ditolak, tak dikenal ditolak, bukan-string ditolak", () => {
    const dup = validasiDaftarSubtes(["Fisika", "Fisika"], MASTER);
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.match(dup.error, /duplikat/);
    const asing = validasiDaftarSubtes(["Fisika", "Astrologi"], MASTER);
    assert.equal(asing.ok, false);
    if (!asing.ok) assert.equal(asing.error, "Salah satu Subtes yang Diampu tidak dikenali sistem.");
    const bukanString = validasiDaftarSubtes(["Fisika", 3], MASTER);
    assert.equal(bukanString.ok, false);
  });

  it("diff: tambah vs lepas dihitung benar, yang tetap tidak muncul di keduanya", () => {
    assert.deepEqual(hitungDiffSubtes(["a", "b", "c"], ["b", "c", "d"]), { tambah: ["d"], lepas: ["a"] });
    assert.deepEqual(hitungDiffSubtes(["a", "b"], ["a", "b"]), { tambah: [], lepas: [] });
    assert.deepEqual(hitungDiffSubtes(["a"], ["b"]), { tambah: ["b"], lepas: ["a"] });
  });

  it("tentukanTertahan: hanya subtes yang DILEPAS yang ditahan; pesan 409 sesuai spesifikasi", () => {
    const nama = new Map(MASTER.map((s) => [s.id, s.nama]));
    const pemakaian = [
      { subtesId: "s-kim", sumber: "kelas" as const },
      { subtesId: "s-mtk", sumber: "kelas" as const }, // dipakai tapi TIDAK dilepas
    ];
    const tertahan = tentukanTertahan(["s-kim", "s-bio"], pemakaian, nama);
    assert.equal(tertahan.length, 1);
    assert.equal(tertahan[0].nama, "Kimia");
    assert.equal(pesanTertahan(tertahan), "Subtes Kimia masih dipakai di kelas. Hubungi Admin untuk memindahkannya.");
    assert.equal(alasanTertahan("Kimia", ["kelas"]), "Subtes Kimia masih dipakai di kelas. Hubungi Admin untuk memindahkannya.");
  });

  it("tentukanTertahan: tanpa pemakaian = tidak ada yang tertahan", () => {
    assert.deepEqual(tentukanTertahan(["s-kim"], [], new Map()), []);
  });
});

// ---------------------------------------------------------------------------

let db: Db;
let fake: ReturnType<typeof buatFakeSupabase>;

type SubtesRoute = typeof import("@/app/api/mentor/subtes-diampu/route");
type ProfilRoute = typeof import("@/app/api/profil/update/route");
type SessionModule = typeof import("@/lib/auth/session");
let subtesRoute: SubtesRoute;
let profilRoute: ProfilRoute;
let sessionLib: SessionModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => unknown }).from = (t: string) => fake.from(t);
  subtesRoute = await import("@/app/api/mentor/subtes-diampu/route");
  profilRoute = await import("@/app/api/profil/update/route");
  sessionLib = await import("@/lib/auth/session");
});

function bangunDb(): Db {
  return {
    subtes: MASTER.map((s) => ({ ...s })),
    users: [
      { id: M1, nama: "Mentor Satu", no_wa: "081111111111" },
      { id: M2, nama: "Mentor Dua", no_wa: "082222222222" },
    ],
    mentor_profiles: [
      { id: P1, user_id: M1, asal_ptn: "UI", semester: 5, jurusan: "Kimia" },
      { id: P2, user_id: M2, asal_ptn: "ITB", semester: 7, jurusan: "Fisika" },
    ],
    mentor_subtes_diampu: [
      { mentor_profile_id: P1, subtes_id: "s-mtk" },
      { mentor_profile_id: P1, subtes_id: "s-fis" },
      { mentor_profile_id: P1, subtes_id: "s-kim" },
      { mentor_profile_id: P2, subtes_id: "s-mtk" },
      { mentor_profile_id: P2, subtes_id: "s-bio" },
    ],
    kelas_subtes_mentor: [],
    enrollments: [],
    kelas_subtes: [],
    kelas: [],
  };
}

beforeEach(() => {
  db = bangunDb();
  fake = buatFakeSupabase(db);
});

const subtesMilik = (profilId: string) =>
  db.mentor_subtes_diampu
    .filter((r) => r.mentor_profile_id === profilId)
    .map((r) => r.subtes_id as string)
    .sort();

function cookie(userId: string, role: "mentor" | "student" | "admin" = "mentor") {
  const token = sessionLib.createSessionToken({ userId, role });
  return `${sessionLib.SESSION_COOKIE_NAME}=${token}`;
}

async function ubahLewatKartu(opsi: { userId?: string; role?: "mentor" | "student" | "admin"; body?: unknown; tanpaSesi?: boolean }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opsi.tanpaSesi) headers.cookie = cookie(opsi.userId ?? M1, opsi.role ?? "mentor");
  const request = new NextRequest("http://localhost/api/mentor/subtes-diampu", {
    method: "PATCH",
    headers,
    body: JSON.stringify(opsi.body ?? {}),
  });
  const response = await subtesRoute.PATCH(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

const bodyProfil = (subtesDiampu: unknown) => ({
  namaLengkap: "Mentor Satu Baru",
  whatsapp: "081234567890",
  asalPtn: "UGM",
  semester: 6,
  jurusan: "Kimia Murni",
  subtesDiampu,
});

async function ubahLewatProfil(subtesDiampu: unknown, userId = M1) {
  const request = new NextRequest("http://localhost/api/profil/update", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookie(userId) },
    body: JSON.stringify(bodyProfil(subtesDiampu)),
  });
  const response = await profilRoute.PATCH(request);
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

/** Dua jalur yang berbagi penjaga yang sama: tiap skenario penjaga diuji di KEDUANYA. */
const JALUR = [
  { nama: "PATCH /api/mentor/subtes-diampu", ubah: (s: unknown) => ubahLewatKartu({ body: { subtesDiampu: s } }) },
  { nama: "PATCH /api/profil/update", ubah: (s: unknown) => ubahLewatProfil(s) },
] as const;

for (const jalur of JALUR) {
  describe(`penjaga & diff — ${jalur.nama}`, () => {
    it("tambah subtes: baris baru disisipkan, tidak ada yang dihapus", async () => {
      const { status } = await jalur.ubah(["Matematika", "Fisika", "Kimia", "Biologi"]);
      assert.equal(status, 200);
      assert.deepEqual(subtesMilik(P1), ["s-bio", "s-fis", "s-kim", "s-mtk"]);
      assert.equal(fake.tulisan("delete", "mentor_subtes_diampu").length, 0);
      assert.deepEqual(
        fake.tulisan("insert", "mentor_subtes_diampu").flatMap((l) => l.rows.map((r) => r.subtes_id)),
        ["s-bio"],
      );
    });

    it("hapus lolos bila subtes tidak dipakai di kelas maupun offline", async () => {
      const { status } = await jalur.ubah(["Matematika", "Fisika"]);
      assert.equal(status, 200);
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-mtk"]);
    });

    it("hapus ditolak (409) karena kelas_subtes_mentor — pesan memuat nama subtes, tidak ada yang tersimpan", async () => {
      db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: M1 });
      const { status, json } = await jalur.ubah(["Matematika", "Fisika"]);
      assert.equal(status, 409);
      assert.equal(json.error, "Subtes Kimia masih dipakai di kelas. Hubungi Admin untuk memindahkannya.");
      assert.deepEqual((json.tertahan as { nama: string }[]).map((t) => t.nama), ["Kimia"]);
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]);
      assert.equal(fake.tulisan("delete").length, 0);
      assert.equal(fake.tulisan("insert").length, 0);
    });

    it("pasangan kelas mentor LAIN pada subtes yang sama tidak menahan; subtes yang tidak dilepas tidak diperiksa", async () => {
      db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: M2 }); // mentor lain
      db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-mtk", mentor_id: M1 }); // dipakai, tapi tidak dilepas
      const { status } = await jalur.ubah(["Matematika", "Fisika"]);
      assert.equal(status, 200);
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-mtk"]);
    });

    it("hapus ditolak (409) karena pendaftaran offline (kelas memuat subtes lewat kelas_subtes)", async () => {
      db.enrollments.push({ id: "e1", kelas_id: "KO", mentor_offline_id: M1 });
      db.kelas_subtes.push({ kelas_id: "KO", subtes_id: "s-kim" });
      const { status, json } = await jalur.ubah(["Matematika", "Fisika"]);
      assert.equal(status, 409);
      assert.match(json.error as string, /Subtes Kimia masih dipakai pada siswa kelas offline/);
      assert.match(json.error as string, /Hubungi Admin untuk memindahkannya\./);
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]);
    });

    it("hapus ditolak (409) karena pendaftaran offline (kolom lama kelas.subtes_id)", async () => {
      db.enrollments.push({ id: "e1", kelas_id: "KO", mentor_offline_id: M1 });
      db.kelas.push({ id: "KO", subtes_id: "s-fis" });
      const { status } = await jalur.ubah(["Matematika", "Kimia"]);
      assert.equal(status, 409);
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]);
    });

    it("pendaftaran offline mentor LAIN tidak menahan", async () => {
      db.enrollments.push({ id: "e1", kelas_id: "KO", mentor_offline_id: M2 });
      db.kelas_subtes.push({ kelas_id: "KO", subtes_id: "s-kim" });
      const { status } = await jalur.ubah(["Matematika", "Fisika"]);
      assert.equal(status, 200);
    });

    it("beberapa subtes tertahan: semua disebut, tidak ada yang tersimpan", async () => {
      db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: M1 });
      db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-fis", mentor_id: M1 });
      const { status, json } = await jalur.ubah(["Matematika", "Biologi"]);
      assert.equal(status, 409);
      assert.match(json.error as string, /Fisika, Kimia|Kimia, Fisika/);
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]); // Biologi pun tidak ikut tersisip
    });

    it("minimal 1 subtes: daftar kosong ditolak (400), tidak ada yang tersimpan", async () => {
      const { status, json } = await jalur.ubah([]);
      assert.equal(status, 400);
      assert.equal(json.error, "Pilih minimal satu Subtes yang Diampu.");
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]);
      assert.equal(fake.tulisan().length, 0);
    });

    it("duplikat dan subtes tak dikenal ditolak (400)", async () => {
      assert.equal((await jalur.ubah(["Fisika", "Fisika"])).status, 400);
      assert.equal((await jalur.ubah(["Fisika", "Astrologi"])).status, 400);
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]);
      assert.equal(fake.tulisan().length, 0);
    });

    it("diff: hanya subtes yang dilepas yang dihapus — satu baris, bukan hapus-semua-lalu-sisip", async () => {
      const { status } = await jalur.ubah(["Matematika", "Fisika", "Biologi"]); // lepas Kimia, tambah Biologi
      assert.equal(status, 200);
      const dihapus = fake.tulisan("delete", "mentor_subtes_diampu");
      assert.equal(dihapus.length, 1);
      assert.deepEqual(dihapus[0].rows.map((r) => r.subtes_id), ["s-kim"]);
      assert.deepEqual(
        fake.tulisan("insert", "mentor_subtes_diampu").flatMap((l) => l.rows.map((r) => r.subtes_id)),
        ["s-bio"],
      );
      assert.deepEqual(subtesMilik(P1), ["s-bio", "s-fis", "s-mtk"]);
      assert.deepEqual(subtesMilik(P2), ["s-bio", "s-mtk"]); // mentor lain tak tersentuh
    });

    it("diff: daftar sama persis = tidak ada tulisan sama sekali", async () => {
      const { status } = await jalur.ubah(["Matematika", "Fisika", "Kimia"]);
      assert.equal(status, 200);
      assert.equal(fake.tulisan(undefined, "mentor_subtes_diampu").length, 0);
    });

    it("gagal di tengah (hapus gagal setelah sisip): subtes yang tidak dilepas TIDAK hilang, 500", async () => {
      fake.gagal.add("mentor_subtes_diampu:delete");
      const { status } = await jalur.ubah(["Matematika", "Fisika", "Biologi"]); // lepas Kimia, tambah Biologi
      assert.equal(status, 500);
      for (const id of ["s-mtk", "s-fis", "s-kim"]) assert.ok(subtesMilik(P1).includes(id), `${id} harus tetap ada`);
      assert.equal(fake.tulisan("delete").length, 0);
    });

    it("sisip gagal: tidak ada perubahan sama sekali (tidak ada hapus), 500", async () => {
      fake.gagal.add("mentor_subtes_diampu:insert");
      const { status } = await jalur.ubah(["Matematika", "Fisika", "Biologi"]);
      assert.equal(status, 500);
      assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]);
      assert.equal(fake.tulisan("delete").length, 0);
    });

    for (const tabel of ["subtes", "mentor_profiles", "mentor_subtes_diampu", "kelas_subtes_mentor", "enrollments", "kelas_subtes", "kelas"]) {
      it(`gagal baca tabel ${tabel} = fail-closed (500), tidak ada yang tersimpan`, async () => {
        db.enrollments.push({ id: "e1", kelas_id: "KO", mentor_offline_id: M1 }); // kelas offline tanpa subtes yang dilepas: cabang kelas_subtes/kelas ikut terbaca
        fake.gagal.add(tabel);
        const { status } = await jalur.ubah(["Matematika", "Biologi"]); // ada yang dilepas & ditambah
        assert.equal(status, 500);
        assert.equal(fake.tulisan("delete").length, 0);
        assert.equal(fake.tulisan("insert").length, 0);
        assert.equal(fake.tulisan("update").length, 0);
        assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]);
      });
    }
  });
}

describe("PATCH /api/mentor/subtes-diampu — otorisasi", () => {
  it("tanpa sesi = 401", async () => {
    const { status } = await ubahLewatKartu({ tanpaSesi: true, body: { subtesDiampu: ["Matematika"] } });
    assert.equal(status, 401);
  });

  it("bukan mentor (siswa/admin) = 403, tidak ada yang tersimpan", async () => {
    for (const role of ["student", "admin"] as const) {
      const { status } = await ubahLewatKartu({ role, body: { subtesDiampu: ["Matematika"] } });
      assert.equal(status, 403);
    }
    assert.equal(fake.tulisan().length, 0);
  });

  it("mentor tidak bisa mengubah mentor lain (403) — mentorUserId beda dengan sesi", async () => {
    const { status } = await ubahLewatKartu({ userId: M1, body: { mentorUserId: M2, subtesDiampu: ["Matematika"] } });
    assert.equal(status, 403);
    assert.deepEqual(subtesMilik(P2), ["s-bio", "s-mtk"]);
    assert.deepEqual(subtesMilik(P1), ["s-fis", "s-kim", "s-mtk"]);
    assert.equal(fake.tulisan().length, 0);
  });

  it("mentor selalu mengubah miliknya dari sesi: mentorUserId sama dengan sesi boleh, mentor lain tak tersentuh", async () => {
    const { status } = await ubahLewatKartu({ userId: M1, body: { mentorUserId: M1, subtesDiampu: ["Matematika", "Fisika"] } });
    assert.equal(status, 200);
    assert.deepEqual(subtesMilik(P1), ["s-fis", "s-mtk"]);
    assert.deepEqual(subtesMilik(P2), ["s-bio", "s-mtk"]);
  });

  it("body bukan JSON = 400", async () => {
    const request = new NextRequest("http://localhost/api/mentor/subtes-diampu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookie(M1) },
      body: "{bukan json",
    });
    const response = await subtesRoute.PATCH(request);
    assert.equal(response.status, 400);
  });
});

describe("PATCH /api/profil/update — bagian lain tidak berubah perilakunya", () => {
  it("nama, WA, dan PTN/semester/jurusan tetap tersimpan bersama diff subtes", async () => {
    const { status } = await ubahLewatProfil(["Matematika", "Fisika", "Biologi"]);
    assert.equal(status, 200);
    const user = db.users.find((u) => u.id === M1)!;
    assert.equal(user.nama, "Mentor Satu Baru");
    assert.equal(user.no_wa, "081234567890");
    const profil = db.mentor_profiles.find((p) => p.id === P1)!;
    assert.equal(profil.asal_ptn, "UGM");
    assert.equal(profil.semester, 6);
    assert.equal(profil.jurusan, "Kimia Murni");
    assert.deepEqual(subtesMilik(P1), ["s-bio", "s-fis", "s-mtk"]);
  });

  it("subtes ditolak penjaga (409): nama/WA/PTN juga TIDAK tersimpan sebagian", async () => {
    db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: M1 });
    const { status } = await ubahLewatProfil(["Matematika", "Fisika"]);
    assert.equal(status, 409);
    assert.equal(db.users.find((u) => u.id === M1)!.nama, "Mentor Satu");
    assert.equal(db.mentor_profiles.find((p) => p.id === P1)!.asal_ptn, "UI");
    assert.equal(fake.tulisan().length, 0);
  });

  it("validasi lama tetap: WA tidak valid = 400 tanpa menulis apa pun", async () => {
    const request = new NextRequest("http://localhost/api/profil/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookie(M1) },
      body: JSON.stringify({ ...bodyProfil(["Matematika"]), whatsapp: "123" }),
    });
    const response = await profilRoute.PATCH(request);
    assert.equal(response.status, 400);
    assert.equal(fake.tulisan().length, 0);
  });

  it("rute tidak lagi menghapus-semua-lalu-sisip: tidak ada delete massal mentor_subtes_diampu pada simpan biasa", async () => {
    await ubahLewatProfil(["Matematika", "Fisika", "Kimia"]);
    assert.equal(fake.tulisan("delete", "mentor_subtes_diampu").length, 0);
  });
});
