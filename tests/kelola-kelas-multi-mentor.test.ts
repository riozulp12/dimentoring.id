/**
 * Tes Kelola Kelas — BANYAK mentor per subtes (kelas_subtes_mentor, kunci utama
 * kelas+subtes+mentor). Menguji fungsi murni (lib/shared/mentorPerSubtes.ts), validateKelasInput
 * lewat rute POST/PATCH /api/kelola-kelas, pemuatan daftar (getKelasList) + opsi mentor aktif
 * (getActiveMentorsWithSubtes), dengan Supabase TIRUAN (tests/_fakeSupabase.ts).
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { buatFakeSupabase, type Db } from "./_fakeSupabase";
import {
  formatMentorPerSubtes,
  kelompokkanMentorPerSubtes,
  petaMentorPerSubtes,
  subtesTanpaMentor,
  subtesUnikDariPasangan,
  susunPasangan,
} from "@/lib/shared/mentorPerSubtes";

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const D = "mentor-d"; // aktif, hanya mengampu Fisika
const N = "mentor-n"; // belum aktif (pending), mengampu Kimia
const ADMIN = "admin-1";

describe("lib/shared/mentorPerSubtes — fungsi murni", () => {
  const pasangan = [
    { subtesId: "s-kim", subtesNama: "Kimia", mentorId: A, mentorNama: "Andi" },
    { subtesId: "s-fis", subtesNama: "Fisika", mentorId: D, mentorNama: "Dina" },
    { subtesId: "s-kim", subtesNama: "Kimia", mentorId: B, mentorNama: "Budi" },
    { subtesId: "s-kim", subtesNama: "Kimia", mentorId: A, mentorNama: "Andi" }, // kembar
  ];

  it("kelompokkan: urutan kemunculan pertama, kembar dibuang", () => {
    const k = kelompokkanMentorPerSubtes(pasangan);
    assert.deepEqual(k.map((x) => x.subtesNama), ["Kimia", "Fisika"]);
    assert.deepEqual(k[0].mentorIds, [A, B]);
    assert.deepEqual(k[0].mentorNama, ["Andi", "Budi"]);
  });

  it("tampilan tabel: semua nama mentor per subtes (\"Kimia: A, B\")", () => {
    assert.equal(formatMentorPerSubtes(pasangan), "Kimia: Andi, Budi; Fisika: Dina");
    assert.equal(formatMentorPerSubtes([pasangan[0]]), "Kimia: Andi");
  });

  it("muat form edit: SEMUA mentor tersimpan per subtes, subtes tidak ganda", () => {
    assert.deepEqual(petaMentorPerSubtes(pasangan), { "s-kim": [A, B], "s-fis": [D] });
    assert.deepEqual(subtesUnikDariPasangan(pasangan), ["s-kim", "s-fis"]);
  });

  it("susunPasangan: datar sesuai urutan subtes lalu mentor, tanpa duplikat", () => {
    assert.deepEqual(susunPasangan(["s-kim", "s-fis"], { "s-kim": [A, B, A], "s-fis": [D] }), [
      { subtesId: "s-kim", mentorId: A },
      { subtesId: "s-kim", mentorId: B },
      { subtesId: "s-fis", mentorId: D },
    ]);
  });

  it("minimal 1 mentor per subtes terpilih", () => {
    assert.deepEqual(subtesTanpaMentor(["s-kim", "s-fis"], { "s-kim": [A] }), ["s-fis"]);
    assert.deepEqual(subtesTanpaMentor(["s-kim"], { "s-kim": [A] }), []);
  });
});

// ---------------------------------------------------------------------------

let db: Db;
let fake: ReturnType<typeof buatFakeSupabase>;

type KelasRoute = typeof import("@/app/api/kelola-kelas/route");
type KelasIdRoute = typeof import("@/app/api/kelola-kelas/[kelasId]/route");
type DataModule = typeof import("@/lib/admin/getKelolaKelasData");
type SessionModule = typeof import("@/lib/auth/session");
let kelasRoute: KelasRoute;
let kelasIdRoute: KelasIdRoute;
let dataLib: DataModule;
let sessionLib: SessionModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: (t: string) => unknown }).from = (t: string) => fake.from(t);
  kelasRoute = await import("@/app/api/kelola-kelas/route");
  kelasIdRoute = await import("@/app/api/kelola-kelas/[kelasId]/route");
  dataLib = await import("@/lib/admin/getKelolaKelasData");
  sessionLib = await import("@/lib/auth/session");
});

const diampu = (...subtesIds: string[]) => subtesIds.map((id) => ({ subtes_id: id, subtes: { mapel_dasar: null } }));

function bangunDb(): Db {
  return {
    subtes: [
      { id: "s-kim", nama: "Kimia", mapel_dasar: null },
      { id: "s-fis", nama: "Fisika", mapel_dasar: null },
    ],
    user_roles: [
      { user_id: A, role_type: "mentor", status: "active", users: { nama: "Andi", mentor_profiles: { mentor_subtes_diampu: diampu("s-kim") } } },
      { user_id: B, role_type: "mentor", status: "active", users: { nama: "Budi", mentor_profiles: { mentor_subtes_diampu: diampu("s-kim") } } },
      { user_id: C, role_type: "mentor", status: "active", users: { nama: "Citra", mentor_profiles: { mentor_subtes_diampu: diampu("s-kim") } } },
      { user_id: D, role_type: "mentor", status: "active", users: { nama: "Dina", mentor_profiles: { mentor_subtes_diampu: diampu("s-fis") } } },
      { user_id: N, role_type: "mentor", status: "pending", users: { nama: "Nana", mentor_profiles: { mentor_subtes_diampu: diampu("s-kim") } } },
    ],
    mentor_profiles: [
      { user_id: A, mentor_subtes_diampu: diampu("s-kim") },
      { user_id: B, mentor_subtes_diampu: diampu("s-kim") },
      { user_id: C, mentor_subtes_diampu: diampu("s-kim") },
      { user_id: D, mentor_subtes_diampu: diampu("s-fis") },
      { user_id: N, mentor_subtes_diampu: diampu("s-kim") },
    ],
    kelas: [],
    kelas_mentor: [],
    kelas_subtes: [],
    kelas_subtes_mentor: [],
    enrollments: [],
    enrollment_subtes: [],
  };
}

beforeEach(() => {
  db = bangunDb();
  fake = buatFakeSupabase(db);
});

function cookie(userId: string, role: "admin" | "student" | "mentor" = "admin") {
  return `${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken({ userId, role })}`;
}

const bodyDasar = {
  nama: "Paket Saintek",
  programKategori: "snbt",
  tingkatKelas: "kelas_12",
  tipeKelas: "grouping",
  modePembelajaran: "online",
  jumlahSesi: 10,
  kapasitas: 20,
  harga: 500000,
};

function bodyKelas(pairs: { subtesId: string; mentorId: string }[], extra: Record<string, unknown> = {}) {
  return { ...bodyDasar, subtesMentorPairs: pairs, ...extra };
}

async function buat(body: unknown, opsi: { role?: "admin" | "student" | "mentor"; tanpaSesi?: boolean } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opsi.tanpaSesi) headers.cookie = cookie(ADMIN, opsi.role ?? "admin");
  const res = await kelasRoute.POST(new NextRequest("http://localhost/api/kelola-kelas", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function ubah(kelasId: string, body: unknown) {
  const res = await kelasIdRoute.PATCH(
    new NextRequest(`http://localhost/api/kelola-kelas/${kelasId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookie(ADMIN) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ kelasId }) },
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const pasanganDb = (kelasId?: string) =>
  db.kelas_subtes_mentor
    .filter((r) => !kelasId || r.kelas_id === kelasId)
    .map((r) => `${r.subtes_id}:${r.mentor_id}`)
    .sort();

describe("POST /api/kelola-kelas — mentor per subtes", () => {
  it("simpan 1 mentor: satu pasangan, kelas_mentor, kelas_subtes", async () => {
    const { status, json } = await buat(bodyKelas([{ subtesId: "s-kim", mentorId: A }]));
    assert.equal(status, 201);
    assert.deepEqual(pasanganDb(json.id as string), ["s-kim:mentor-a"]);
    assert.deepEqual(db.kelas_mentor.map((r) => r.mentor_id), [A]);
    assert.deepEqual(db.kelas_subtes.map((r) => r.subtes_id), ["s-kim"]);
    assert.equal(db.kelas[0].mentor_id, A); // kolom lama (deprecated) = mentor pertama
  });

  it("simpan 3 mentor pada satu subtes: tiga pasangan, kelas_subtes tetap SATU baris, kelas_mentor tiga", async () => {
    const { status, json } = await buat(
      bodyKelas([
        { subtesId: "s-kim", mentorId: A },
        { subtesId: "s-kim", mentorId: B },
        { subtesId: "s-kim", mentorId: C },
      ]),
    );
    assert.equal(status, 201);
    assert.deepEqual(pasanganDb(json.id as string), ["s-kim:mentor-a", "s-kim:mentor-b", "s-kim:mentor-c"]);
    assert.deepEqual(db.kelas_subtes.map((r) => r.subtes_id), ["s-kim"]);
    assert.deepEqual(db.kelas_mentor.map((r) => r.mentor_id).sort(), [A, B, C]);
    assert.equal(db.kelas[0].subtes_id, "s-kim");
  });

  it("beberapa subtes, beberapa mentor: kelas_mentor = gabungan unik semua mentor", async () => {
    const { status } = await buat(
      bodyKelas([
        { subtesId: "s-kim", mentorId: A },
        { subtesId: "s-kim", mentorId: B },
        { subtesId: "s-fis", mentorId: D },
      ]),
    );
    assert.equal(status, 201);
    assert.deepEqual(db.kelas_subtes.map((r) => r.subtes_id).sort(), ["s-fis", "s-kim"]);
    assert.deepEqual(db.kelas_mentor.map((r) => r.mentor_id).sort(), [A, B, D]);
    assert.equal(pasanganDb().length, 3);
  });

  it("pasangan (subtes, mentor) kembar ditolak (400), tidak ada yang tersimpan", async () => {
    const { status, json } = await buat(
      bodyKelas([
        { subtesId: "s-kim", mentorId: A },
        { subtesId: "s-kim", mentorId: A },
      ]),
    );
    assert.equal(status, 400);
    assert.match(json.error as string, /tidak boleh dipilih dua kali/);
    assert.equal(fake.tulisan().length, 0);
  });

  it("mentor nonaktif (pending) ditolak (400)", async () => {
    const { status, json } = await buat(
      bodyKelas([
        { subtesId: "s-kim", mentorId: A },
        { subtesId: "s-kim", mentorId: N },
      ]),
    );
    assert.equal(status, 400);
    assert.match(json.error as string, /belum aktif/);
    assert.equal(fake.tulisan().length, 0);
  });

  it("mentor yang tidak mengampu subtes itu ditolak oleh validateKelasInput — SETIAP pasangan diperiksa", async () => {
    const { status, json } = await buat(
      bodyKelas([
        { subtesId: "s-kim", mentorId: A },
        { subtesId: "s-kim", mentorId: B },
        { subtesId: "s-kim", mentorId: D }, // D hanya Fisika
      ]),
    );
    assert.equal(status, 400);
    assert.match(json.error as string, /tidak mengampu Subtes/);
    assert.equal(fake.tulisan().length, 0);
  });

  it("pasangan tanpa mentor/subtes ditolak (400)", async () => {
    const { status } = await buat(bodyKelas([{ subtesId: "s-kim", mentorId: "" }]));
    assert.equal(status, 400);
  });

  it("kelas Konsultasi (tanpa subtes): mentor generik tetap tersimpan ke kelas_mentor, tanpa pasangan", async () => {
    const { status } = await buat(bodyKelas([], { programKategori: "konsultasi", mentorIds: [A, B] }));
    assert.equal(status, 201);
    assert.deepEqual(db.kelas_mentor.map((r) => r.mentor_id).sort(), [A, B]);
    assert.equal(db.kelas_subtes_mentor.length, 0);
    assert.equal(db.kelas_subtes.length, 0);
  });

  it("kelas OFFLINE tidak berubah: pasangan dari body diabaikan, tanpa kelas_mentor/pasangan, hanya satu subtes", async () => {
    const { status } = await buat(
      bodyKelas(
        [
          { subtesId: "s-kim", mentorId: A },
          { subtesId: "s-kim", mentorId: B },
        ],
        { modePembelajaran: "offline", offlineSubtesId: "s-kim", jumlahSesi: 8 },
      ),
    );
    assert.equal(status, 201);
    assert.equal(db.kelas_subtes_mentor.length, 0);
    assert.equal(db.kelas_mentor.length, 0);
    assert.deepEqual(db.kelas_subtes.map((r) => r.subtes_id), ["s-kim"]);
    assert.equal(db.kelas[0].mentor_id, null);
  });

  it("hanya Admin: tanpa sesi 401, siswa/mentor 403", async () => {
    assert.equal((await buat(bodyKelas([{ subtesId: "s-kim", mentorId: A }]), { tanpaSesi: true })).status, 401);
    assert.equal((await buat(bodyKelas([{ subtesId: "s-kim", mentorId: A }]), { role: "student" })).status, 403);
    assert.equal((await buat(bodyKelas([{ subtesId: "s-kim", mentorId: A }]), { role: "mentor" })).status, 403);
    assert.equal(fake.tulisan().length, 0);
  });
});

describe("PATCH /api/kelola-kelas/[kelasId] — mentor per subtes", () => {
  beforeEach(() => {
    db.kelas.push({ id: "K1", nama: "Paket", mode_pembelajaran: "online" });
    db.kelas_subtes.push({ kelas_id: "K1", subtes_id: "s-kim" });
    db.kelas_mentor.push({ kelas_id: "K1", mentor_id: A });
    db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: A });
  });

  it("edit dari 1 ke 3 mentor: semua tersimpan, kelas_subtes tidak ganda", async () => {
    const { status } = await ubah(
      "K1",
      bodyKelas([
        { subtesId: "s-kim", mentorId: A },
        { subtesId: "s-kim", mentorId: B },
        { subtesId: "s-kim", mentorId: C },
      ]),
    );
    assert.equal(status, 200);
    assert.deepEqual(pasanganDb("K1"), ["s-kim:mentor-a", "s-kim:mentor-b", "s-kim:mentor-c"]);
    assert.deepEqual(db.kelas_mentor.map((r) => r.mentor_id).sort(), [A, B, C]);
    assert.equal(db.kelas_subtes.length, 1);
  });

  it("edit dari 3 ke 2 mentor (tanpa siswa): mentor yang dilepas hilang dari pasangan dan kelas_mentor", async () => {
    db.kelas_subtes_mentor.push({ kelas_id: "K1", subtes_id: "s-kim", mentor_id: B }, { kelas_id: "K1", subtes_id: "s-kim", mentor_id: C });
    db.kelas_mentor.push({ kelas_id: "K1", mentor_id: B }, { kelas_id: "K1", mentor_id: C });
    const { status } = await ubah(
      "K1",
      bodyKelas([
        { subtesId: "s-kim", mentorId: A },
        { subtesId: "s-kim", mentorId: B },
      ]),
    );
    assert.equal(status, 200);
    assert.deepEqual(pasanganDb("K1"), ["s-kim:mentor-a", "s-kim:mentor-b"]);
    assert.deepEqual(db.kelas_mentor.map((r) => r.mentor_id).sort(), [A, B]);
  });

  it("pasangan kembar / mentor nonaktif / mentor tidak mengampu ditolak di edit juga — pasangan lama tidak tersentuh", async () => {
    for (const pairs of [
      [{ subtesId: "s-kim", mentorId: A }, { subtesId: "s-kim", mentorId: A }],
      [{ subtesId: "s-kim", mentorId: A }, { subtesId: "s-kim", mentorId: N }],
      [{ subtesId: "s-kim", mentorId: A }, { subtesId: "s-kim", mentorId: D }],
    ]) {
      const { status } = await ubah("K1", bodyKelas(pairs));
      assert.equal(status, 400);
    }
    assert.deepEqual(pasanganDb("K1"), ["s-kim:mentor-a"]);
    assert.equal(fake.tulisan().length, 0);
  });
});

describe("pemuatan data Kelola Kelas", () => {
  it("edit kelas lama memuat SEMUA mentor tersimpan (getKelasList -> peta form) dan tabel menampilkan semua nama", async () => {
    db.kelas.push({
      id: "K1",
      nama: "Paket",
      program_kategori: "snbt",
      tingkat_kelas: "kelas_12",
      tipe_kelas: "grouping",
      mode_pembelajaran: "online",
      jumlah_sesi: 10,
      kapasitas: 20,
      harga: 500000,
      diskon_persen: 0,
      kelas_subtes: [{ subtes_id: "s-kim", subtes: { nama: "Kimia" } }],
      kelas_mentor: [A, B, C].map((m) => ({ mentor_id: m, users: { nama: `nama-${m}` } })),
      kelas_subtes_mentor: [A, B, C].map((m) => ({ subtes_id: "s-kim", mentor_id: m, subtes: { nama: "Kimia" }, users: { nama: `nama-${m}` } })),
      enrollments: [],
    });
    const [kelas] = await dataLib.getKelasList();
    assert.equal(kelas.subtesMentorPairs.length, 3);
    assert.deepEqual(petaMentorPerSubtes(kelas.subtesMentorPairs), { "s-kim": [A, B, C] });
    assert.deepEqual(subtesUnikDariPasangan(kelas.subtesMentorPairs), ["s-kim"]);
    assert.equal(formatMentorPerSubtes(kelas.subtesMentorPairs), "Kimia: nama-mentor-a, nama-mentor-b, nama-mentor-c");
  });

  it("opsi mentor: HANYA mentor AKTIF yang ditawarkan (nonaktif tidak muncul)", async () => {
    const opsi = await dataLib.getActiveMentorsWithSubtes();
    assert.deepEqual(opsi.map((m) => m.id).sort(), [A, B, C, D]);
    assert.ok(!opsi.some((m) => m.id === N));
    assert.deepEqual(opsi.find((m) => m.id === D)?.subtesIds, ["s-fis"]);
  });
});
