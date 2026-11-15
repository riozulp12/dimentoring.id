/**
 * Test fondasi penerimaan siswa per subtes (Tahap A): logika murni
 * (lib/shared/penerimaanSiswa.ts) dan klaim atomik (lib/mentor/terimaSiswa.ts),
 * dijalankan terhadap Supabase TIRUAN di memori (tidak pernah menyentuh database asli).
 *
 * Tiruan ini mengevaluasi filter + mutasi dalam SATU blok sinkron saat query
 * di-await — meniru atomisitas UPDATE ... WHERE di Postgres. Karena itu tes
 * balapan benar-benar membuktikan klaim bersyarat: implementasi baca-lalu-tulis
 * akan membiarkan dua pemenang.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

let db: Db;

type Hasil = { data: Row[] | Row | null; error: null };

class FakeQuery implements PromiseLike<Hasil> {
  private filters: Array<(row: Row) => boolean> = [];
  private mutation: Row | null = null;
  private single = false;

  constructor(private rows: Row[]) {}

  select() {
    return this;
  }
  update(values: Row) {
    this.mutation = values;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  // Filter dan mutasi dievaluasi SEKALIGUS di sini (sinkron) = atomik.
  then<A, B>(
    onfulfilled?: ((value: Hasil) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    const cocok = this.rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.mutation) for (const row of cocok) Object.assign(row, this.mutation);
    const data = this.single ? (cocok[0] ?? null) : cocok;
    return Promise.resolve({ data, error: null } as Hasil).then(onfulfilled, onrejected);
  }
}

function fakeFrom(table: string) {
  db[table] ??= [];
  return new FakeQuery(db[table]);
}

type LogikaModule = typeof import("@/lib/shared/penerimaanSiswa");
type TerimaModule = typeof import("@/lib/mentor/terimaSiswa");
let logika: LogikaModule;
let terima: TerimaModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const { supabaseServer } = await import("@/lib/supabase/server");
  (supabaseServer as unknown as { from: typeof fakeFrom }).from = fakeFrom;
  logika = await import("@/lib/shared/penerimaanSiswa");
  terima = await import("@/lib/mentor/terimaSiswa");
});

const KELAS = "kelas-mtk-intensif";
const SUBTES_MTK = "subtes-mtk";
const ENROLLMENT = "enr-1";
const ES_ID = "es-1";

const SESUDAH_PEMBERLAKUAN = "2026-11-16T10:00:00+07:00";
const SEBELUM_PEMBERLAKUAN = "2026-11-14T23:59:59+07:00";
const MENTOR_A = "mentor-a";
const MENTOR_B = "mentor-b";
const MENTOR_C = "mentor-c";
const MENTOR_PENDING = "mentor-pending";
const MENTOR_BUKAN_PEMEGANG = "mentor-bukan-pemegang";
const MENTOR_DILEPAS = "mentor-dilepas"; // aktif, tapi tidak ada di kelas_subtes_mentor

beforeEach(() => {
  db = {
    enrollments: [{ id: ENROLLMENT, kelas_id: KELAS, status_pembayaran: "lunas", tanggal_daftar: SESUDAH_PEMBERLAKUAN }],
    enrollment_subtes: [{ id: ES_ID, enrollment_id: ENROLLMENT, subtes_id: SUBTES_MTK, mentor_id: null, diterima_pada: null }],
    kelas_subtes_mentor: [MENTOR_A, MENTOR_B, MENTOR_C, MENTOR_PENDING].map((mentor_id) => ({
      kelas_id: KELAS,
      subtes_id: SUBTES_MTK,
      mentor_id,
    })),
    user_roles: [
      { user_id: MENTOR_A, role_type: "mentor", status: "active" },
      { user_id: MENTOR_B, role_type: "mentor", status: "active" },
      { user_id: MENTOR_C, role_type: "mentor", status: "active" },
      { user_id: MENTOR_PENDING, role_type: "mentor", status: "pending" },
      { user_id: MENTOR_BUKAN_PEMEGANG, role_type: "mentor", status: "active" },
      { user_id: MENTOR_DILEPAS, role_type: "mentor", status: "active" },
    ],
  };
});

describe("logika murni penerimaan siswa", () => {
  it("1 mentor aktif -> otomatis, tidak perlu klaim", () => {
    assert.equal(logika.perluKlaim([MENTOR_A]), false);
    assert.equal(logika.penerimaOtomatis([MENTOR_A]), MENTOR_A);
  });

  it("3 mentor aktif -> perlu klaim, tidak ada penerima otomatis", () => {
    assert.equal(logika.perluKlaim([MENTOR_A, MENTOR_B, MENTOR_C]), true);
    assert.equal(logika.penerimaOtomatis([MENTOR_A, MENTOR_B, MENTOR_C]), null);
  });

  it("0 mentor aktif -> tidak perlu klaim dan tidak ada penerima", () => {
    assert.equal(logika.perluKlaim([]), false);
    assert.equal(logika.penerimaOtomatis([]), null);
  });

  it("id ganda dihitung sekali (data ganda bukan 2 mentor)", () => {
    assert.equal(logika.perluKlaim([MENTOR_A, MENTOR_A]), false);
    assert.equal(logika.penerimaOtomatis([MENTOR_A, MENTOR_A]), MENTOR_A);
  });

  it("batas jam tanpa penerima = 24", () => {
    assert.equal(logika.BATAS_JAM_TANPA_PENERIMA, 24);
  });
});

describe("terimaSiswaSubtes (klaim atomik)", () => {
  it("klaim pertama menang dan mengisi mentor_id + diterima_pada", async () => {
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: true });
    assert.equal(db.enrollment_subtes[0].mentor_id, MENTOR_A);
    assert.equal(typeof db.enrollment_subtes[0].diterima_pada, "string");
  });

  it("klaim kedua (mentor lain) ditolak dan TIDAK menimpa penerima", async () => {
    await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    const diterimaPada = db.enrollment_subtes[0].diterima_pada;

    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_B, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "sudah_diterima_mentor_lain" });
    assert.equal(db.enrollment_subtes[0].mentor_id, MENTOR_A);
    assert.equal(db.enrollment_subtes[0].diterima_pada, diterimaPada);
  });

  it("DUA klaim bersamaan (Promise.all) -> tepat satu ok, satu ditolak", async () => {
    const [x, y] = await Promise.all([
      terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID }),
      terima.terimaSiswaSubtes({ mentorId: MENTOR_B, enrollmentSubtesId: ES_ID }),
    ]);
    const hasil = [x, y];
    assert.equal(hasil.filter((h) => h.ok).length, 1);
    assert.equal(hasil.filter((h) => !h.ok).length, 1);
    const kalah = hasil.find((h) => !h.ok);
    assert.deepEqual(kalah, { ok: false, alasan: "sudah_diterima_mentor_lain" });
    // Penerima akhir = si pemenang, bukan yang terakhir menulis.
    const pemenang = x.ok ? MENTOR_A : MENTOR_B;
    assert.equal(db.enrollment_subtes[0].mentor_id, pemenang);
  });

  it("TIGA klaim bersamaan -> tepat satu pemenang", async () => {
    const hasil = await Promise.all(
      [MENTOR_A, MENTOR_B, MENTOR_C].map((mentorId) => terima.terimaSiswaSubtes({ mentorId, enrollmentSubtesId: ES_ID })),
    );
    assert.equal(hasil.filter((h) => h.ok).length, 1);
    assert.equal(hasil.filter((h) => !h.ok && h.alasan === "sudah_diterima_mentor_lain").length, 2);
  });

  it("mentor nonaktif (pending) ditolak dan baris tidak berubah", async () => {
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_PENDING, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "mentor_tidak_aktif" });
    assert.equal(db.enrollment_subtes[0].mentor_id, null);
  });

  it("mentor aktif yang BUKAN pemegang subtes ditolak dan baris tidak berubah", async () => {
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_BUKAN_PEMEGANG, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "bukan_mentor_subtes" });
    assert.equal(db.enrollment_subtes[0].mentor_id, null);
  });

  it("mentor yang sama dua kali -> idempoten, penerima dan waktu tidak berubah", async () => {
    const pertama = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    const diterimaPada = db.enrollment_subtes[0].diterima_pada;
    const kedua = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(pertama, { ok: true });
    assert.deepEqual(kedua, { ok: true, sudahMilikSendiri: true });
    assert.equal(db.enrollment_subtes[0].mentor_id, MENTOR_A);
    assert.equal(db.enrollment_subtes[0].diterima_pada, diterimaPada);
  });

  it("enrollmentSubtesId tidak ada -> tidak_ditemukan", async () => {
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: "tidak-ada" });
    assert.deepEqual(hasil, { ok: false, alasan: "tidak_ditemukan" });
  });

  it("mentor bukan pemegang tidak bisa 'mengintip' siswa yang sudah diterima mentor lain", async () => {
    await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_BUKAN_PEMEGANG, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "bukan_mentor_subtes" });
  });

  it("fungsi klaim tidak menyentuh sesi_kelas", async () => {
    db.sesi_kelas = [{ id: "s1", enrollment_id: ENROLLMENT, nomor_sesi: 1, mentor_id: null }];
    await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.equal(db.sesi_kelas[0].mentor_id, null);
  });
});

// ---------------------------------------------------------------------------
// B1a: pemilik efektif, penjaga presensi, klaim atas pemilik nonaktif
// ---------------------------------------------------------------------------

describe("statusPenerimaanSubtes — matriks pemegang aktif (siswa baru)", () => {
  const baru = SESUDAH_PEMBERLAKUAN;

  it("0 pemegang aktif -> tidak_perlu_klaim", () => {
    assert.equal(logika.statusPenerimaanSubtes({ mentorIdPenerima: null, mentorAktifSubtes: [], tanggalDaftar: baru }), "tidak_perlu_klaim");
  });

  it("1 pemegang aktif -> tidak_perlu_klaim (walau penerima NULL)", () => {
    assert.equal(logika.statusPenerimaanSubtes({ mentorIdPenerima: null, mentorAktifSubtes: [MENTOR_A], tanggalDaftar: baru }), "tidak_perlu_klaim");
  });

  it("2 pemegang aktif tanpa penerima -> menunggu", () => {
    assert.equal(logika.statusPenerimaanSubtes({ mentorIdPenerima: null, mentorAktifSubtes: [MENTOR_A, MENTOR_B], tanggalDaftar: baru }), "menunggu");
  });

  it("3 pemegang aktif tanpa penerima -> menunggu", () => {
    assert.equal(
      logika.statusPenerimaanSubtes({ mentorIdPenerima: null, mentorAktifSubtes: [MENTOR_A, MENTOR_B, MENTOR_C], tanggalDaftar: baru }),
      "menunggu",
    );
  });

  it("3 pemegang aktif, penerima salah satunya -> diterima", () => {
    assert.equal(
      logika.statusPenerimaanSubtes({ mentorIdPenerima: MENTOR_B, mentorAktifSubtes: [MENTOR_A, MENTOR_B, MENTOR_C], tanggalDaftar: baru }),
      "diterima",
    );
  });

  it("pemilik TIDAK aktif (tidak ada di daftar aktif) -> menunggu lagi", () => {
    assert.equal(
      logika.statusPenerimaanSubtes({ mentorIdPenerima: MENTOR_PENDING, mentorAktifSubtes: [MENTOR_A, MENTOR_B], tanggalDaftar: baru }),
      "menunggu",
    );
  });

  it("pemilik dilepas dari pasangan (tidak ada di pemegang) -> menunggu lagi", () => {
    assert.equal(
      logika.statusPenerimaanSubtes({ mentorIdPenerima: MENTOR_DILEPAS, mentorAktifSubtes: [MENTOR_A, MENTOR_B, MENTOR_C], tanggalDaftar: baru }),
      "menunggu",
    );
  });

  it("pemilik nonaktif dan tinggal 1 pemegang aktif -> tidak_perlu_klaim (pemegang itu langsung boleh)", () => {
    assert.equal(
      logika.statusPenerimaanSubtes({ mentorIdPenerima: MENTOR_PENDING, mentorAktifSubtes: [MENTOR_A], tanggalDaftar: baru }),
      "tidak_perlu_klaim",
    );
  });

  it("id pemegang ganda dihitung sekali (2 baris yang sama = 1 pemegang)", () => {
    assert.equal(logika.statusPenerimaanSubtes({ mentorIdPenerima: null, mentorAktifSubtes: [MENTOR_A, MENTOR_A], tanggalDaftar: baru }), "tidak_perlu_klaim");
  });
});

describe("statusPenerimaanSubtes — tanggal pemberlakuan 15 Nov 2026 WIB", () => {
  const tigaPemegang = [MENTOR_A, MENTOR_B, MENTOR_C];

  it("siswa lama (sebelum 15 Nov) -> tidak_perlu_klaim walau 3 pemegang tanpa penerima", () => {
    assert.equal(logika.statusPenerimaanSubtes({ mentorIdPenerima: null, mentorAktifSubtes: tigaPemegang, tanggalDaftar: SEBELUM_PEMBERLAKUAN }), "tidak_perlu_klaim");
  });

  it("batas: 1 detik sebelum 15 Nov 00:00 WIB = lama; tepat 00:00 WIB = baru", () => {
    assert.equal(logika.sebelumPemberlakuan("2026-11-14T16:59:59Z"), true); // 23:59:59 WIB
    assert.equal(logika.sebelumPemberlakuan("2026-11-14T17:00:00Z"), false); // 00:00:00 WIB 15 Nov
    assert.equal(logika.sebelumPemberlakuan(new Date("2026-11-14T17:00:00Z")), false);
  });

  it("tanggal kosong/rusak -> diperlakukan BARU (ketat), bukan lama", () => {
    assert.equal(logika.sebelumPemberlakuan(null), false);
    assert.equal(logika.sebelumPemberlakuan(undefined), false);
    assert.equal(logika.sebelumPemberlakuan("bukan-tanggal"), false);
    assert.equal(logika.statusPenerimaanSubtes({ mentorIdPenerima: null, mentorAktifSubtes: tigaPemegang, tanggalDaftar: null }), "menunggu");
  });

  it("konstanta pemberlakuan = 2026-11-15T00:00:00+07:00", () => {
    assert.equal(logika.TANGGAL_PEMBERLAKUAN_PENERIMAAN, "2026-11-15T00:00:00+07:00");
  });
});

describe("bolehMenandaiSesi (penjaga presensi, fail-closed)", () => {
  const sub = (status: "tidak_perlu_klaim" | "menunggu" | "diterima", mentorMemegang: boolean, mentorIdPenerima: string | null = null) => ({
    status,
    mentorMemegang,
    mentorIdPenerima,
  });

  it("mentor PENERIMA subtes multi-mentor -> boleh", () => {
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [sub("diterima", true, MENTOR_A)] }), true);
  });

  it("mentor pemegang tapi BUKAN penerima (diterima mentor lain) -> diblokir", () => {
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_B, subtesSiswa: [sub("diterima", true, MENTOR_A)] }), false);
  });

  it("subtes masih menunggu -> pemegang diblokir", () => {
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [sub("menunggu", true)] }), false);
  });

  it("subtes 1 mentor (tidak_perlu_klaim) -> pemegang langsung boleh", () => {
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [sub("tidak_perlu_klaim", true)] }), true);
  });

  it("memegang DUA subtes, salah satunya diterima mentor ini -> boleh", () => {
    assert.equal(
      logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [sub("diterima", true, MENTOR_A), sub("diterima", true, MENTOR_B)] }),
      true,
    );
  });

  it("memegang DUA subtes, keduanya menunggu / diterima mentor lain -> diblokir", () => {
    assert.equal(
      logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [sub("menunggu", true), sub("diterima", true, MENTOR_B)] }),
      false,
    );
  });

  it("memegang dua subtes, satu menunggu dan satu tidak_perlu_klaim -> boleh", () => {
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [sub("menunggu", true), sub("tidak_perlu_klaim", true)] }), true);
  });

  it("subtes yang menunggu dipegang mentor LAIN tidak memblokir mentor yang tidak memegangnya", () => {
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [sub("tidak_perlu_klaim", true), sub("menunggu", false)] }), true);
  });

  it("mentor tidak memegang subtes siswa sama sekali -> perilaku lama (boleh)", () => {
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [sub("menunggu", false)] }), true);
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: [] }), true);
  });

  it("data gagal dibaca -> DITOLAK (fail-closed)", () => {
    assert.equal(logika.bolehMenandaiSesi({ mentorId: MENTOR_A, subtesSiswa: "gagal" }), false);
    assert.equal(logika.BOLEH_MENANDAI_BILA_DATA_GAGAL, false);
  });
});

describe("terimaSiswaSubtes — pemilik efektif & klaim atas pemilik nonaktif", () => {
  const baris = () => db.enrollment_subtes[0];

  it("pemilik lama NONAKTIF -> mentor lain boleh mengklaim (ok), pemilik diganti", async () => {
    baris().mentor_id = MENTOR_PENDING;
    baris().diterima_pada = "2026-11-16T11:00:00+07:00";
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: true });
    assert.equal(baris().mentor_id, MENTOR_A);
  });

  it("pemilik lama DILEPAS dari pasangan -> boleh diklaim mentor lain", async () => {
    baris().mentor_id = MENTOR_DILEPAS;
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_B, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: true });
    assert.equal(baris().mentor_id, MENTOR_B);
  });

  it("pemilik lama masih AKTIF -> klaim mentor lain ditolak, tidak menimpa", async () => {
    baris().mentor_id = MENTOR_C;
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "sudah_diterima_mentor_lain" });
    assert.equal(baris().mentor_id, MENTOR_C);
  });

  it("BALAPAN dua mentor atas pemilik NONAKTIF -> tepat satu pemenang", async () => {
    baris().mentor_id = MENTOR_PENDING;
    const [x, y] = await Promise.all([
      terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID }),
      terima.terimaSiswaSubtes({ mentorId: MENTOR_B, enrollmentSubtesId: ES_ID }),
    ]);
    assert.equal([x, y].filter((h) => h.ok).length, 1);
    assert.deepEqual([x, y].find((h) => !h.ok), { ok: false, alasan: "sudah_diterima_mentor_lain" });
    assert.equal(baris().mentor_id, x.ok ? MENTOR_A : MENTOR_B);
  });

  it("BALAPAN tiga mentor atas pemilik nonaktif -> tepat satu pemenang", async () => {
    baris().mentor_id = MENTOR_PENDING;
    const hasil = await Promise.all(
      [MENTOR_A, MENTOR_B, MENTOR_C].map((mentorId) => terima.terimaSiswaSubtes({ mentorId, enrollmentSubtesId: ES_ID })),
    );
    assert.equal(hasil.filter((h) => h.ok).length, 1);
  });

  it("pemilik nonaktif menekan lagi -> tetap ditolak (mentor_tidak_aktif), tidak mengambil kembali", async () => {
    baris().mentor_id = MENTOR_PENDING;
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_PENDING, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "mentor_tidak_aktif" });
  });

  it("siswa LAMA (sebelum 15 Nov) -> pendaftaran_sebelum_pemberlakuan, baris tidak berubah", async () => {
    db.enrollments[0].tanggal_daftar = SEBELUM_PEMBERLAKUAN;
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "pendaftaran_sebelum_pemberlakuan" });
    assert.equal(baris().mentor_id, null);
    assert.equal(baris().diterima_pada, null);
  });

  it("subtes dengan 1 mentor aktif -> tidak_perlu_klaim, baris tidak berubah", async () => {
    db.kelas_subtes_mentor = db.kelas_subtes_mentor.filter((p) => p.mentor_id === MENTOR_A || p.mentor_id === MENTOR_PENDING);
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: false, alasan: "tidak_perlu_klaim" });
    assert.equal(baris().mentor_id, null);
  });

  it("pemegang aktif 2 (A,B) -> perlu klaim, A menang", async () => {
    db.kelas_subtes_mentor = db.kelas_subtes_mentor.filter((p) => p.mentor_id === MENTOR_A || p.mentor_id === MENTOR_B);
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: true });
  });

  it("pemilik yang masih aktif menekan lagi -> idempoten walau subtes kini 1 pemegang", async () => {
    baris().mentor_id = MENTOR_A;
    baris().diterima_pada = "2026-11-16T11:00:00+07:00";
    db.kelas_subtes_mentor = db.kelas_subtes_mentor.filter((p) => p.mentor_id === MENTOR_A);
    const hasil = await terima.terimaSiswaSubtes({ mentorId: MENTOR_A, enrollmentSubtesId: ES_ID });
    assert.deepEqual(hasil, { ok: true, sudahMilikSendiri: true });
    assert.equal(baris().diterima_pada, "2026-11-16T11:00:00+07:00");
  });
});
