/**
 * Test SATU aturan kepemilikan siswa-mentor (lib/shared/siswaMentor.ts) — logika murni, tanpa DB.
 * Aturan: penerima (enrollment_subtes.mentor_id) yang masih pemegang aktif; pemilik implisit (satu-satunya
 * pemegang aktif subtes); siswa lama (sebelum 2026-11-15T00:00:00+07:00) mengikuti perilaku lama (relasi
 * kelas); mentor tatap muka lewat mentor_offline_id; siswa "menunggu" tidak milik siapa pun.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siswaMilikMentor, type InputSiswaMilikMentor } from "@/lib/shared/siswaMentor";

const A = "mentor-a";
const B = "mentor-b";
const C = "mentor-c";
const BARU = "2026-11-20T10:00:00+07:00";
const LAMA = "2026-11-14T23:59:59+07:00";

/** Default: pendaftaran baru, subtes Matematika dipegang A & B (aktif), belum ada penerima. */
function masukan(m: string, patch: Partial<InputSiswaMilikMentor> = {}): InputSiswaMilikMentor {
  return {
    mentorId: m,
    tanggalDaftar: BARU,
    mentorOfflineId: null,
    terkaitKelas: true, // A & B sama-sama terkait kelas (kelas.mentor_id / kelas_mentor)
    subtes: [{ mentorIdPenerima: null, mentorAktifSubtes: [A, B] }],
    ...patch,
  };
}

describe("siswaMilikMentor — pendaftaran baru, subtes dipegang >= 2 mentor aktif", () => {
  it("diterima A: milik A dan TIDAK milik B (walau B terkait kelas)", () => {
    const subtes = [{ mentorIdPenerima: A, mentorAktifSubtes: [A, B] }];
    assert.equal(siswaMilikMentor(masukan(A, { subtes })), true);
    assert.equal(siswaMilikMentor(masukan(B, { subtes })), false);
  });

  it("menunggu (belum ada penerima): TIDAK milik siapa pun", () => {
    assert.equal(siswaMilikMentor(masukan(A)), false);
    assert.equal(siswaMilikMentor(masukan(B)), false);
  });

  it("penerima nonaktif (tidak lagi pemegang aktif): kembali menunggu — tidak milik penerima lama maupun mentor lain", () => {
    const subtes = [{ mentorIdPenerima: C, mentorAktifSubtes: [A, B] }];
    assert.equal(siswaMilikMentor(masukan(C, { subtes, terkaitKelas: true })), false);
    assert.equal(siswaMilikMentor(masukan(A, { subtes })), false);
    assert.equal(siswaMilikMentor(masukan(B, { subtes })), false);
  });

  it("penerima nonaktif lalu tinggal satu pemegang aktif: pemegang itu jadi pemilik implisit, penerima lama bukan", () => {
    const subtes = [{ mentorIdPenerima: C, mentorAktifSubtes: [B] }];
    assert.equal(siswaMilikMentor(masukan(B, { subtes })), true);
    assert.equal(siswaMilikMentor(masukan(C, { subtes })), false);
  });

  it("penerima A, lalu A dinonaktifkan dan B satu-satunya pemegang aktif: milik B, bukan A", () => {
    const subtes = [{ mentorIdPenerima: A, mentorAktifSubtes: [B] }];
    assert.equal(siswaMilikMentor(masukan(A, { subtes })), false);
    assert.equal(siswaMilikMentor(masukan(B, { subtes })), true);
  });

  it("id mentor ganda di daftar pemegang tidak dihitung dua kali (satu pemegang aktif = pemilik implisit)", () => {
    const subtes = [{ mentorIdPenerima: null, mentorAktifSubtes: [A, A] }];
    assert.equal(siswaMilikMentor(masukan(A, { subtes })), true);
  });
});

describe("siswaMilikMentor — pemilik implisit (satu pemegang aktif)", () => {
  it("mentor_id NULL dan A satu-satunya pemegang aktif: milik A; B yang hanya terkait kelas bukan pemilik", () => {
    const subtes = [{ mentorIdPenerima: null, mentorAktifSubtes: [A] }];
    assert.equal(siswaMilikMentor(masukan(A, { subtes })), true);
    assert.equal(siswaMilikMentor(masukan(B, { subtes })), false);
  });

  it("mentor yang bukan pemegang subtes dan tidak terkait kelas: bukan pemilik", () => {
    const subtes = [{ mentorIdPenerima: null, mentorAktifSubtes: [A] }];
    assert.equal(siswaMilikMentor(masukan(C, { subtes, terkaitKelas: false })), false);
  });
});

describe("siswaMilikMentor — legacy (sebelum 2026-11-15T00:00:00+07:00): perilaku lama", () => {
  it("pendaftaran lama: semua mentor terkait kelas memilikinya, tanpa klaim", () => {
    assert.equal(siswaMilikMentor(masukan(A, { tanggalDaftar: LAMA })), true);
    assert.equal(siswaMilikMentor(masukan(B, { tanggalDaftar: LAMA })), true);
  });

  it("pendaftaran lama: mentor yang tidak terkait kelas bukan pemilik", () => {
    assert.equal(siswaMilikMentor(masukan(C, { tanggalDaftar: LAMA, terkaitKelas: false })), false);
  });

  it("legacy tidak peduli penerima/pemegang aktif (perilaku lama mengabaikan penerimaan)", () => {
    const subtes = [{ mentorIdPenerima: A, mentorAktifSubtes: [A, B] }];
    assert.equal(siswaMilikMentor(masukan(B, { tanggalDaftar: LAMA, subtes })), true);
  });

  it("tepat di batas 15 Nov 2026 00:00 WIB dan sesudahnya = pendaftaran BARU; tanggal kosong/rusak = BARU (ketat)", () => {
    assert.equal(siswaMilikMentor(masukan(B, { tanggalDaftar: "2026-11-15T00:00:00+07:00" })), false);
    assert.equal(siswaMilikMentor(masukan(B, { tanggalDaftar: null })), false);
    assert.equal(siswaMilikMentor(masukan(B, { tanggalDaftar: "bukan tanggal" })), false);
    assert.equal(siswaMilikMentor(masukan(B, { tanggalDaftar: "2026-11-14T16:59:59Z" })), true); // 23:59:59 WIB
  });
});

describe("siswaMilikMentor — tanpa data pemilik jatuh ke relasi kelas (siswa tidak hilang)", () => {
  it("pendaftaran baru tanpa baris enrollment_subtes: mengikuti relasi kelas", () => {
    assert.equal(siswaMilikMentor(masukan(A, { subtes: [] })), true);
    assert.equal(siswaMilikMentor(masukan(C, { subtes: [], terkaitKelas: false })), false);
  });

  it("subtes tanpa pemegang aktif satu pun: mengikuti relasi kelas", () => {
    const subtes = [{ mentorIdPenerima: null, mentorAktifSubtes: [] }];
    assert.equal(siswaMilikMentor(masukan(A, { subtes })), true);
    assert.equal(siswaMilikMentor(masukan(C, { subtes, terkaitKelas: false })), false);
  });
});

describe("siswaMilikMentor — mentor tatap muka (offline) tidak berubah", () => {
  it("mentor_offline_id = M → milik M, apa pun status penerimaan", () => {
    assert.equal(siswaMilikMentor(masukan(C, { mentorOfflineId: C, terkaitKelas: false, subtes: [] })), true);
    assert.equal(siswaMilikMentor(masukan(C, { mentorOfflineId: C, terkaitKelas: false })), true);
  });

  it("mentor offline lain / mentor kelas tidak otomatis memilikinya; yang bukan penugasan tetap lewat aturan biasa", () => {
    assert.equal(siswaMilikMentor(masukan(A, { mentorOfflineId: C, terkaitKelas: false, subtes: [] })), false);
    assert.equal(siswaMilikMentor(masukan(C, { mentorOfflineId: null, terkaitKelas: false, subtes: [] })), false);
  });
});

describe("siswaMilikMentor — kelas paket (beberapa subtes)", () => {
  it("satu siswa bisa milik dua mentor (satu per subtes); mentor ketiga tidak", () => {
    const subtes = [
      { mentorIdPenerima: A, mentorAktifSubtes: [A, B] }, // Matematika diterima A
      { mentorIdPenerima: B, mentorAktifSubtes: [B, C] }, // Fisika diterima B
    ];
    assert.equal(siswaMilikMentor(masukan(A, { subtes })), true);
    assert.equal(siswaMilikMentor(masukan(B, { subtes })), true);
    assert.equal(siswaMilikMentor(masukan(C, { subtes })), false);
  });

  it("satu subtes menunggu dan satu sudah diterima: hanya penerima yang memiliki", () => {
    const subtes = [
      { mentorIdPenerima: null, mentorAktifSubtes: [A, B] }, // menunggu
      { mentorIdPenerima: A, mentorAktifSubtes: [A, C] }, // diterima A
    ];
    assert.equal(siswaMilikMentor(masukan(A, { subtes })), true);
    assert.equal(siswaMilikMentor(masukan(B, { subtes })), false);
  });
});

describe("siswaMilikMentor — masukan tidak valid", () => {
  it("mentorId kosong → false", () => {
    assert.equal(siswaMilikMentor(masukan("")), false);
  });
});
