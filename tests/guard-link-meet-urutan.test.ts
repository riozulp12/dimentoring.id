/**
 * Test pengecualian urutan di halaman detail Kelas Saya (mentor): bolehKelolaLinkMeetKelas kini berjalan BERSAMAAN
 * dengan pembacaan kelas/akses (Promise.all), sebelum guard. Yang dibuktikan:
 *   1. bolehKelolaLinkMeetKelas HANYA MEMBACA: Supabase tiruan di sini sengaja tidak punya insert/update/delete/upsert
 *      (memanggilnya = TypeError), dan isi database identik sebelum/sesudah, untuk mentor berhak, bukan berhak,
 *      kelas tidak ada, dan galat database.
 *   2. Hasilnya tidak bocor: di halaman, nilainya hanya masuk ke satu ekspresi boolean (bisaEditLinkMeetKelas), dan
 *      pemakaian itu berada SESUDAH guard `redirect(...)`. Untuk mentor yang ditolak guard, redirect melempar sebelum
 *      baris itu tercapai, jadi nilainya dibuang — tidak dirender dan tidak dikirim ke klien.
 *   3. Mentor yang tidak berhak (false) dan galat ("gagal") sama-sama membuat formulir tersembunyi, dan tidak ada
 *      nilai yang membedakan "kelas tidak ada" dari "kelas milik mentor lain" (keduanya false).
 *
 * Halaman adalah Server Component (butuh cookies() Next), jadi urutan di halaman dibuktikan lewat struktur kode
 * (pola yang sama dengan privasi-antar-mentor.test.ts), bukan dengan merender.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, describe, it } from "node:test";

type Row = Record<string, unknown>;
type Hasil = { data: Row[] | Row | null; error: { message: string } | null };

let db: Record<string, Row[]>;
let tabelGagal: Set<string>;
let tabelDibaca: string[];

/** Hanya select/eq/maybeSingle — TANPA insert/update/delete/upsert, jadi tulis apa pun akan melempar TypeError. */
class FakeQueryBacaSaja implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
  private single = false;
  constructor(
    private rows: Row[],
    private gagal: boolean,
  ) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<A, B>(onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    if (this.gagal) return Promise.resolve({ data: null, error: { message: "galat tiruan" } } as Hasil).then(onfulfilled, onrejected);
    const cocok = this.rows.filter((row) => this.filters.every((f) => f(row)));
    return Promise.resolve({ data: this.single ? (cocok[0] ?? null) : cocok, error: null } as Hasil).then(onfulfilled, onrejected);
  }
}

function fakeFrom(table: string) {
  tabelDibaca.push(table);
  db[table] ??= [];
  return new FakeQueryBacaSaja(db[table], tabelGagal.has(table));
}

const LAMA = "mentor-lama";
const DI_KELAS_MENTOR = "mentor-kelas-mentor";
const ASING = "mentor-asing";

type AksesModule = typeof import("@/lib/mentor/aksesMentor");
let akses: AksesModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  akses = await import("@/lib/mentor/aksesMentor");
});

beforeEach(() => {
  tabelGagal = new Set();
  tabelDibaca = [];
  db = {
    kelas: [
      { id: "K1", mentor_id: LAMA, link_meet: "https://meet.google.com/rahasia" },
      { id: "K2", mentor_id: ASING, link_meet: null },
    ],
    kelas_mentor: [{ kelas_id: "K1", mentor_id: DI_KELAS_MENTOR }],
    kelas_subtes_mentor: [],
  };
});

describe("bolehKelolaLinkMeetKelas — hanya membaca", () => {
  it("tidak menulis apa pun (tiruan tanpa insert/update/delete) dan database identik untuk semua kasus", async () => {
    const sebelum = structuredClone(db);
    const asli = console.error;
    console.error = () => {};
    try {
      assert.equal(await akses.bolehKelolaLinkMeetKelas(LAMA, "K1"), true);
      assert.equal(await akses.bolehKelolaLinkMeetKelas(DI_KELAS_MENTOR, "K1"), true);
      assert.equal(await akses.bolehKelolaLinkMeetKelas(ASING, "K1"), false);
      assert.equal(await akses.bolehKelolaLinkMeetKelas(LAMA, "tidak-ada"), false);
      tabelGagal = new Set(["kelas_mentor"]);
      assert.equal(await akses.bolehKelolaLinkMeetKelas(LAMA, "K1"), "gagal");
    } finally {
      console.error = asli;
    }
    assert.deepEqual(db, sebelum);
    // Hanya tiga tabel kepemilikan yang disentuh, tidak ada tabel siswa/enrollment/pembayaran.
    assert.deepEqual([...new Set(tabelDibaca)].sort(), ["kelas", "kelas_mentor", "kelas_subtes_mentor"]);
  });

  it("nilai kembaliannya hanya boolean atau 'gagal' (tidak ada data kelas/mentor lain yang ikut terbawa)", async () => {
    const asli = console.error;
    console.error = () => {};
    try {
      tabelGagal = new Set(["kelas"]);
      const hasil = [
        await akses.bolehKelolaLinkMeetKelas(ASING, "K1"),
        await akses.bolehKelolaLinkMeetKelas(ASING, "K2"),
        await akses.bolehKelolaLinkMeetKelas(ASING, "tidak-ada"),
      ];
      for (const nilai of hasil) assert.ok(nilai === true || nilai === false || nilai === "gagal");
      tabelGagal = new Set();
      // Mentor asing: kelas milik mentor lain dan kelas yang tidak ada tidak bisa dibedakan dari hasilnya.
      assert.equal(await akses.bolehKelolaLinkMeetKelas(ASING, "K1"), await akses.bolehKelolaLinkMeetKelas(ASING, "tidak-ada"));
    } finally {
      console.error = asli;
    }
  });
});

describe("halaman detail Kelas Saya (mentor) — hasil bolehKelolaLinkMeetKelas dibuang bila guard menolak", () => {
  const sumber = readFileSync("app/(protected)/(mentor)/kelas-saya/[kelasId]/page.tsx", "utf8");
  // Buang komentar supaya yang dihitung hanya kode.
  const kode = sumber
    .split("\n")
    .filter((baris) => !baris.trim().startsWith("//"))
    .join("\n");

  it("nilainya dipakai tepat di dua tempat: ditampung dari Promise.all dan satu ekspresi bisaEditLinkMeetKelas", () => {
    const pemakaian = kode.match(/\bbolehLinkMeetKelas\b/g) ?? [];
    assert.equal(pemakaian.length, 2);
    assert.match(kode, /const bisaEditLinkMeetKelas = !kelasPrivate && bolehLinkMeetKelas === true;/);
  });

  it("pemakaian nilainya berada SESUDAH guard redirect (!kelas || !akses), jadi mentor yang ditolak tidak sampai ke sana", () => {
    const guard = kode.indexOf("if (!kelas || !akses) {");
    const redirectGuard = kode.indexOf("redirect(`/kelas-saya?error=", guard);
    const pakai = kode.indexOf("const bisaEditLinkMeetKelas");
    assert.ok(guard > 0 && redirectGuard > guard, "guard tidak ditemukan");
    assert.ok(pakai > redirectGuard, "nilai dipakai sebelum guard");
    // Tidak ada pembacaan data siswa/sesi/materi (data sensitif) yang dimulai sebelum guard.
    for (const fungsi of ["getSesiKelasMentor(", "getMentorMateriList("]) {
      assert.ok(kode.indexOf(fungsi) > redirectGuard, `${fungsi} dipanggil sebelum guard`);
    }
  });

  it("nilainya tidak diteruskan sebagai prop ke komponen dan tidak dirender langsung; hanya bisaEditLinkMeetKelas yang dirender", () => {
    assert.doesNotMatch(kode, /\{[^}]*\bbolehLinkMeetKelas\b[^}]*\}/); // tidak ada di JSX/prop/template
    assert.match(kode, /\{bisaEditLinkMeetKelas \? <LinkMeetForm kelasId=\{kelas\.id\} initialLinkMeet=\{kelas\.linkMeet\} \/> : null\}/);
  });

  it("galat baca ('gagal') dan tidak berhak (false) sama-sama menyembunyikan formulir (=== true)", () => {
    assert.match(kode, /bolehLinkMeetKelas === true/);
  });
});
