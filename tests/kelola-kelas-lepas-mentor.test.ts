/**
 * Tes penjaga LEPAS mentor dari subtes pada kelas (PATCH /api/kelola-kelas/[kelasId]):
 * mentor yang masih jadi penerima (enrollment_subtes.mentor_id) siswa kelas itu pada subtes itu
 * TIDAK boleh dilepas (409). Gagal baca = 500 dan tidak ada yang tersimpan. Supabase TIRUAN.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { buatFakeSupabase, type Db } from "./_fakeSupabase";
import {
  hitungPerubahanPasangan,
  pesanMentorTertahan,
  tentukanMentorTertahan,
} from "@/lib/shared/lepasMentorKelas";

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const ADMIN = "admin-1";

describe("lib/shared/lepasMentorKelas — fungsi murni", () => {
  const p = (subtesId: string, mentorId: string) => ({ subtesId, mentorId });

  it("perubahan: dilepas vs ditambah dihitung per pasangan (subtes, mentor)", () => {
    const hasil = hitungPerubahanPasangan([p("k", A), p("k", B), p("f", A)], [p("k", A), p("k", C)]);
    assert.deepEqual(hasil.dilepas, [p("k", B), p("f", A)]);
    assert.deepEqual(hasil.ditambah, [p("k", C)]);
  });

  it("tertahan: hanya pasangan yang dilepas DAN masih jadi penerima; pesan sesuai spesifikasi", () => {
    const nama = new Map([[B, "Budi"], [C, "Citra"]]);
    const subtes = new Map([["k", "Kimia"]]);
    const tertahan = tentukanMentorTertahan([p("k", B), p("k", C)], [p("k", B), p("k", B), p("f", C)], nama, subtes);
    assert.equal(tertahan.length, 1);
    assert.equal(tertahan[0].jumlahSiswa, 2);
    assert.equal(pesanMentorTertahan(tertahan), "Mentor Budi masih memegang siswa di subtes Kimia. Pindahkan siswanya dulu.");
  });

  it("tanpa penerima = tidak ada yang tertahan", () => {
    assert.deepEqual(tentukanMentorTertahan([p("k", B)], [], new Map(), new Map()), []);
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
  (supabaseServer as unknown as { from: (t: string) => unknown }).from = (t: string) => fake.from(t);
  kelasIdRoute = await import("@/app/api/kelola-kelas/[kelasId]/route");
  sessionLib = await import("@/lib/auth/session");
});

const diampu = (...ids: string[]) => ids.map((id) => ({ subtes_id: id, subtes: { mapel_dasar: null } }));

function bangunDb(): Db {
  return {
    subtes: [
      { id: "s-kim", nama: "Kimia", mapel_dasar: null },
      { id: "s-fis", nama: "Fisika", mapel_dasar: null },
    ],
    users: [
      { id: A, nama: "Andi" },
      { id: B, nama: "Budi" },
      { id: C, nama: "Citra" },
    ],
    user_roles: [A, B, C].map((id) => ({ user_id: id, role_type: "mentor", status: "active" })),
    mentor_profiles: [A, B, C].map((id) => ({ user_id: id, mentor_subtes_diampu: diampu("s-kim", "s-fis") })),
    kelas: [
      { id: "K1", nama: "Paket", mode_pembelajaran: "online" },
      { id: "K2", nama: "Kelas Lain", mode_pembelajaran: "online" },
    ],
    kelas_subtes: [{ kelas_id: "K1", subtes_id: "s-kim" }],
    kelas_mentor: [A, B, C].map((m) => ({ kelas_id: "K1", mentor_id: m })),
    kelas_subtes_mentor: [A, B, C].map((m) => ({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: m })),
    enrollments: [
      { id: "e1", kelas_id: "K1" },
      { id: "e2", kelas_id: "K1" },
      { id: "e-lain", kelas_id: "K2" },
    ],
    enrollment_subtes: [
      { id: "es1", enrollment_id: "e1", subtes_id: "s-kim", mentor_id: B },
      { id: "es2", enrollment_id: "e2", subtes_id: "s-kim", mentor_id: null },
      { id: "es-lain", enrollment_id: "e-lain", subtes_id: "s-kim", mentor_id: C }, // C memegang siswa di kelas LAIN
    ],
  };
}

beforeEach(() => {
  db = bangunDb();
  fake = buatFakeSupabase(db);
});

const bodyDasar = {
  nama: "Paket",
  programKategori: "snbt",
  tingkatKelas: "kelas_12",
  tipeKelas: "grouping",
  modePembelajaran: "online",
  jumlahSesi: 10,
  kapasitas: 20,
  harga: 500000,
};

const pairs = (...mentor: string[]) => mentor.map((mentorId) => ({ subtesId: "s-kim", mentorId }));

async function ubah(body: Record<string, unknown>, kelasId = "K1") {
  const res = await kelasIdRoute.PATCH(
    new NextRequest(`http://localhost/api/kelola-kelas/${kelasId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken({ userId: ADMIN, role: "admin" })}` },
      body: JSON.stringify({ ...bodyDasar, ...body }),
    }),
    { params: Promise.resolve({ kelasId }) },
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const pasanganK1 = () =>
  db.kelas_subtes_mentor
    .filter((r) => r.kelas_id === "K1")
    .map((r) => `${r.subtes_id}:${r.mentor_id}`)
    .sort();

describe("PATCH /api/kelola-kelas/[kelasId] — penjaga lepas mentor", () => {
  it("lepas mentor yang MEMEGANG siswa ditolak (409) dengan pesan spesifikasi; kelas sama sekali tidak berubah", async () => {
    const { status, json } = await ubah({ subtesMentorPairs: pairs(A, C) }); // B dilepas, B memegang e1
    assert.equal(status, 409);
    assert.equal(json.error, "Mentor Budi masih memegang siswa di subtes Kimia. Pindahkan siswanya dulu.");
    assert.deepEqual(pasanganK1(), ["s-kim:mentor-a", "s-kim:mentor-b", "s-kim:mentor-c"]);
    assert.equal(fake.tulisan().length, 0); // bahkan data dasar kelas tidak ikut tersimpan
  });

  it("lepas mentor yang TIDAK memegang siswa lolos (penerima NULL tidak menahan)", async () => {
    const { status } = await ubah({ subtesMentorPairs: pairs(B, C) }); // A dilepas; A bukan penerima siapa pun
    assert.equal(status, 200);
    assert.deepEqual(pasanganK1(), ["s-kim:mentor-b", "s-kim:mentor-c"]);
  });

  it("memegang siswa di kelas LAIN tidak menahan pelepasan di kelas ini", async () => {
    const { status } = await ubah({ subtesMentorPairs: pairs(A, B) }); // C dilepas dari K1; C hanya memegang siswa K2
    assert.equal(status, 200);
    assert.deepEqual(pasanganK1(), ["s-kim:mentor-a", "s-kim:mentor-b"]);
    assert.equal(db.enrollment_subtes.find((r) => r.id === "es-lain")?.mentor_id, C); // tidak tersentuh
  });

  it("memegang siswa pada subtes LAIN tidak menahan pelepasan dari subtes ini", async () => {
    db.enrollment_subtes.push({ id: "es-fis", enrollment_id: "e2", subtes_id: "s-fis", mentor_id: A }); // A memegang Fisika, bukan Kimia
    const { status } = await ubah({ subtesMentorPairs: pairs(B, C) }); // A dilepas dari Kimia
    assert.equal(status, 200);
  });

  it("menghapus SELURUH subtes dari kelas ikut dijaga (semua pasangannya dilepas)", async () => {
    const { status, json } = await ubah({ subtesMentorPairs: [], programKategori: "konsultasi", mentorIds: [A] });
    assert.equal(status, 409);
    assert.match(json.error as string, /Mentor Budi masih memegang siswa di subtes Kimia/);
    assert.equal(fake.tulisan().length, 0);
  });

  it("beberapa mentor tertahan: semua disebut sekali jalan", async () => {
    db.enrollment_subtes.push({ id: "es3", enrollment_id: "e2", subtes_id: "s-kim", mentor_id: A });
    const { status, json } = await ubah({ subtesMentorPairs: pairs(C) });
    assert.equal(status, 409);
    assert.match(json.error as string, /Mentor Andi masih memegang siswa di subtes Kimia\./);
    assert.match(json.error as string, /Mentor Budi masih memegang siswa di subtes Kimia\./);
    assert.match(json.error as string, /Pindahkan siswanya dulu\.$/);
  });

  it("menambah mentor (tanpa melepas) lolos walau ada yang memegang siswa", async () => {
    db.user_roles.push({ user_id: "mentor-d", role_type: "mentor", status: "active" });
    db.mentor_profiles.push({ user_id: "mentor-d", mentor_subtes_diampu: diampu("s-kim") });
    const { status } = await ubah({ subtesMentorPairs: pairs(A, B, C, "mentor-d") });
    assert.equal(status, 200);
    assert.equal(pasanganK1().length, 4);
  });

  it("kelas tanpa pasangan lama (offline/Konsultasi): tidak ada yang dijaga", async () => {
    db.kelas_subtes_mentor.length = 0;
    const { status } = await ubah({ modePembelajaran: "offline", jumlahSesi: 8, offlineSubtesId: "s-kim" });
    assert.equal(status, 200);
    assert.equal(db.kelas_subtes_mentor.length, 0);
  });

  it("Admin menyimpan tanpa mengubah mentor tetap lolos (idempoten), pasangan utuh", async () => {
    const { status } = await ubah({ subtesMentorPairs: pairs(A, B, C) });
    assert.equal(status, 200);
    assert.deepEqual(pasanganK1(), ["s-kim:mentor-a", "s-kim:mentor-b", "s-kim:mentor-c"]);
  });

  for (const tabel of ["kelas_subtes_mentor", "enrollments", "enrollment_subtes"]) {
    it(`gagal baca ${tabel} = fail-closed (500), tidak ada yang tersimpan`, async () => {
      fake.gagal.add(`${tabel}:select`);
      const { status } = await ubah({ subtesMentorPairs: pairs(A, C) }); // B dilepas -> semua tabel dibaca
      assert.equal(status, 500);
      assert.equal(fake.tulisan().length, 0);
      assert.deepEqual(pasanganK1(), ["s-kim:mentor-a", "s-kim:mentor-b", "s-kim:mentor-c"]);
    });
  }

  it("gagal baca NAMA tidak melonggarkan penjaga: tetap 409 (id sebagai nama cadangan)", async () => {
    fake.gagal.add("users:select");
    const { status, json } = await ubah({ subtesMentorPairs: pairs(A, C) });
    assert.equal(status, 409);
    assert.match(json.error as string, /masih memegang siswa/);
    assert.equal(fake.tulisan().length, 0);
  });
});
