/**
 * Test form soal Studio Soal (PR 3b):
 *   - modul murni: teksKaya (rumus/tebal/miring/rumpang), rumus (KaTeX),
 *     formSoal (nilai awal, rumpang, parse body, rapikan, terjemahan RPC)
 *   - validasi tiap tipe lewat jalur yang SAMA dengan builder & API
 *     (inputValidasiSoal -> validasiSoal), termasuk batas K1/K4
 *   - uji kunci jawaban memakai nilaiJawaban (pecahan, koma/titik desimal)
 *   - API /api/studio-soal/** terhadap Supabase TIRUAN di memori (tidak
 *     menyentuh database asli). Fungsi DB studio_soal_simpan_soal dkk. ditiru
 *     di `fakeRpc` mengikuti db/add_studio_soal_draf.sql; logika SQL aslinya
 *     diuji di db/test_studio_soal_draf_DRYRUN.sql.
 *   - pemeriksaan statis: tidak ada tulis langsung ke tabel, tidak ada
 *     dangerouslySetInnerHTML, migrasi idempoten.
 *
 * Jalankan: npm test
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { ambilRumus, uraiTeksKaya, type Segmen } from "@/lib/shared/studio-soal/teksKaya";
import { cekRumus, validasiRumusSoal, validasiRumusStimulus } from "@/lib/shared/studio-soal/rumus";
import {
  formAwal,
  hapusRumpang,
  idBagianBaru,
  inputValidasiSoal,
  inputValidasiStimulus,
  parseBodySimpanSoal,
  parseBodySimpanStimulus,
  penandaDiRedaksi,
  rapikanKontenKunci,
  sisipRumpang,
  stimulusAwal,
  terjemahkanHasilRpc,
  type FormSoal,
  type FormStimulus,
} from "@/lib/shared/studio-soal/formSoal";
import { validasiSoal, validasiStimulus } from "@/lib/shared/studio-soal/validasi";
import { nilaiJawaban } from "@/lib/shared/studio-soal/nilaiJawaban";

const ROOT = path.resolve(__dirname, "..");
const baca = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const M1 = u(11);
const M2 = u(12);
const M_PENDING = u(13);
const M3 = u(14); // mentor aktif, hanya ditugaskan ke PK
const SISWA = u(21);
const PU = u(101);
const PK = u(102);
const MTK = u(109); // TKA — bukan SNBT

// ---------------------------------------------------------------------------
// Data contoh (bentuk state form = payload API)
// ---------------------------------------------------------------------------

function soalPg(ubah: Partial<FormSoal> = {}): FormSoal {
  return {
    ...formAwal(PU, "pilihan_ganda"),
    redaksi: "Berapakah \\(2+3\\)?",
    konten: { v: 1, opsi: ["3", "4", "5", "6", "7"].map((teks, i) => ({ label: "ABCDE"[i], teks })) },
    kunci: { v: 1, opsi: "C" },
    pembahasan: "Dua ditambah tiga sama dengan lima.",
    tingkat_kesulitan: "mudah",
    ...ubah,
  };
}

function soalMajemuk(jumlah: number, ubah: Partial<FormSoal> = {}): FormSoal {
  const pernyataan = Array.from({ length: jumlah }, (_, i) => ({ id: `p${i + 1}`, teks: `Pernyataan ${i + 1}` }));
  return {
    ...formAwal(PU, "majemuk_kompleks"),
    redaksi: "Tentukan benar atau salah.",
    konten: { v: 1, label_kolom: ["Benar", "Salah"], pernyataan },
    kunci: { v: 1, per_baris: Object.fromEntries(pernyataan.map((p, i) => [p.id, i % 2])) },
    pembahasan: "Pernyataan ganjil benar, genap salah.",
    tingkat_kesulitan: "sedang",
    ...ubah,
  };
}

function soalIsian(jumlah: number, ubah: Partial<FormSoal> = {}): FormSoal {
  const ids = Array.from({ length: jumlah }, (_, i) => `r${i + 1}`);
  return {
    ...formAwal(PU, "isian"),
    redaksi: `Isi: ${ids.map((id) => `{{${id}}}`).join(" dan ")}.`,
    konten: { v: 1, rumpang: ids.map((id) => ({ id, jenis: "angka" })) },
    kunci: { v: 1, rumpang: Object.fromEntries(ids.map((id) => [id, { diterima: ["1/2"] }])) },
    pembahasan: "Setengah dapat ditulis 0,5 atau 1/2.",
    tingkat_kesulitan: "hots",
    ...ubah,
  };
}

function stimulusLengkap(ubah: Partial<FormStimulus> = {}): FormStimulus {
  return {
    subtes_id: PU,
    judul_internal: "Bacaan uji",
    sumber_rujukan: "Buatan sendiri",
    konten: { v: 1, blok: [{ jenis: "teks", teks: "Paragraf bacaan." }] },
    ...ubah,
  };
}

const errSoal = (f: FormSoal, mode: "draf" | "ajukan" = "ajukan") => validasiSoal(inputValidasiSoal(f, "tps"), mode);
const fields = (e: { field: string }[]) => e.map((x) => x.field);

// ---------------------------------------------------------------------------
// teksKaya
// ---------------------------------------------------------------------------

const segmen = (teks: string, rumpang = false): Segmen[] => uraiTeksKaya(teks, { rumpang }).flatMap((p) => p.segmen);

describe("teksKaya — pengurai teks + rumus", () => {
  it("\\( \\) dan \\[ \\] jadi rumus; $ biasa tetap teks", () => {
    assert.deepEqual(segmen("Harga $5 dan \\(x^2\\)"), [
      { jenis: "teks", teks: "Harga $5 dan ", tebal: false, miring: false },
      { jenis: "rumus", tex: "x^2", blok: false, tebal: false, miring: false },
    ]);
    assert.deepEqual(ambilRumus("a \\[\\frac{1}{2}\\] b \\(y\\)"), [
      { tex: "\\frac{1}{2}", blok: true },
      { tex: "y", blok: false },
    ]);
  });

  it("tebal & miring hanya bila berpasangan dan menempel ke teks", () => {
    assert.deepEqual(segmen("**tebal** dan *miring*"), [
      { jenis: "teks", teks: "tebal", tebal: true, miring: false },
      { jenis: "teks", teks: " dan ", tebal: false, miring: false },
      { jenis: "teks", teks: "miring", tebal: false, miring: true },
    ]);
    // "2 * 3 * 4": penanda diapit spasi -> teks biasa
    assert.deepEqual(segmen("2 * 3 * 4"), [{ jenis: "teks", teks: "2 * 3 * 4", tebal: false, miring: false }]);
    // tanpa pasangan -> teks biasa
    assert.deepEqual(segmen("**sendiri"), [{ jenis: "teks", teks: "**sendiri", tebal: false, miring: false }]);
    // escape \* = bintang biasa
    assert.deepEqual(segmen("\\*bukan miring\\*"), [{ jenis: "teks", teks: "*bukan miring*", tebal: false, miring: false }]);
  });

  it("paragraf (baris kosong) & pindah baris", () => {
    const p = uraiTeksKaya("Satu\nDua\n\n  \nTiga");
    assert.equal(p.length, 2);
    assert.deepEqual(p[0].segmen.map((s) => s.jenis), ["teks", "baris_baru", "teks"]);
  });

  it("rumpang {{r1}} hanya dikenali bila diminta; HTML tetap teks", () => {
    assert.deepEqual(segmen("A {{r1}} B", true).map((s) => s.jenis), ["teks", "rumpang", "teks"]);
    assert.deepEqual(segmen("A {{r1}} B").map((s) => s.jenis), ["teks"]);
    assert.deepEqual(segmen("<script>alert(1)</script>"), [
      { jenis: "teks", teks: "<script>alert(1)</script>", tebal: false, miring: false },
    ]);
  });

  it("rumus tanpa penutup tidak dianggap rumus", () => {
    assert.deepEqual(ambilRumus("\\(x^2"), []);
  });
});

describe("rumus — KaTeX (dipakai builder & API Ajukan)", () => {
  it("rumus valid lolos, rumus rusak ditolak dengan pesan", () => {
    assert.equal(cekRumus("\\frac{1}{2}"), null);
    assert.equal(cekRumus("\\sqrt{x} \\le 5", true), null);
    assert.ok(cekRumus("\\frac{1"));
    assert.ok(cekRumus("x^"));
    assert.ok(cekRumus("   "));
  });

  it("perintah tak tepercaya (\\href, \\url, \\htmlClass, \\includegraphics) ditolak", () => {
    for (const t of ["\\href{javascript:alert(1)}{x}", "\\url{http://x}", "\\htmlClass{a}{b}", "\\includegraphics{x.png}"]) {
      assert.match(cekRumus(t) ?? "", /tidak diizinkan/, t);
    }
  });

  it("makro tak berujung dibatasi maxExpand", () => {
    assert.ok(cekRumus("\\def\\a{\\a}\\a"));
  });

  it("validasiRumusSoal/Stimulus: error per field, jenis kelengkapan", () => {
    const e = validasiRumusSoal(soalPg({ pembahasan: "Hasil \\(\\frac{1\\) benar." }));
    assert.deepEqual(fields(e), ["pembahasan"]);
    assert.equal(e[0].jenis, "kelengkapan");
    const es = validasiRumusStimulus(
      stimulusLengkap({ konten: { v: 1, blok: [{ jenis: "tabel", judul: null, kepala: ["\\(x^\\)"], baris: [["1"]] }] } }),
    );
    assert.deepEqual(fields(es), ["konten.blok.0.kepala.0"]);
  });
});

// ---------------------------------------------------------------------------
// Validasi tiap tipe (jalur builder = jalur API)
// ---------------------------------------------------------------------------

describe("validasi soal tiap tipe (K1–K8)", () => {
  it("PG lengkap lolos; kunci & opsi kosong ditolak saat diajukan, boleh di draf", () => {
    assert.deepEqual(errSoal(soalPg()), []);
    const kosong = formAwal(PU, "pilihan_ganda");
    kosong.tingkat_kesulitan = "mudah";
    assert.deepEqual(errSoal(kosong, "draf"), []);
    const e = errSoal(kosong);
    assert.ok(fields(e).includes("kunci.opsi"));
    assert.ok(fields(e).includes("konten.opsi.0.teks"));
    assert.ok(fields(e).includes("redaksi"));
  });

  it("tingkat kesulitan wajib (mudah/sedang/hots) — bahkan untuk simpan draf", () => {
    assert.ok(fields(errSoal(soalPg({ tingkat_kesulitan: "" }), "draf")).includes("tingkat_kesulitan"));
    assert.ok(fields(errSoal(soalPg({ tingkat_kesulitan: "sulit" }), "draf")).includes("tingkat_kesulitan"));
    for (const k of ["mudah", "sedang", "hots"]) assert.deepEqual(errSoal(soalPg({ tingkat_kesulitan: k })), []);
  });

  it("pembahasan wajib (min. 10 karakter) saat diajukan", () => {
    assert.ok(fields(errSoal(soalPg({ pembahasan: "" }))).includes("pembahasan"));
    assert.ok(fields(errSoal(soalPg({ pembahasan: "Pendek" }))).includes("pembahasan"));
    assert.deepEqual(errSoal(soalPg({ pembahasan: "" }), "draf"), []);
  });

  it("majemuk kompleks 2–6 pernyataan (K1)", () => {
    assert.ok(fields(errSoal(soalMajemuk(1))).includes("konten.pernyataan"));
    assert.deepEqual(errSoal(soalMajemuk(2)), []);
    assert.deepEqual(errSoal(soalMajemuk(6)), []);
    const tujuh = errSoal(soalMajemuk(7), "draf"); // > 6 = error bentuk: draf pun ditolak
    assert.ok(fields(tujuh).includes("konten.pernyataan"));
  });

  it("isian 1–5 rumpang (K1)", () => {
    const nol = soalIsian(0, { redaksi: "Tanpa rumpang." });
    assert.ok(fields(errSoal(nol)).includes("konten.rumpang"));
    assert.deepEqual(errSoal(soalIsian(1)), []);
    assert.deepEqual(errSoal(soalIsian(5)), []);
    assert.ok(fields(errSoal(soalIsian(6), "draf")).includes("konten.rumpang"));
  });

  it("isian angka: jawaban diterima wajib angka yang bisa di-parse", () => {
    const f = soalIsian(1, { kunci: { v: 1, rumpang: { r1: { diterima: ["setengah"] } } } });
    assert.ok(fields(errSoal(f)).includes("kunci.rumpang.r1.diterima.0"));
  });

  it("sumber rujukan opsional untuk soal (K4)", () => {
    assert.deepEqual(errSoal(soalPg({ sumber_rujukan: "" })), []);
    assert.deepEqual(errSoal(soalPg({ sumber_rujukan: "Buku X" })), []);
  });

  it("estimasi waktu & level kognitif opsional, tapi dibatasi bila diisi", () => {
    assert.deepEqual(errSoal(soalPg({ estimasi_waktu_detik: 90, level_kognitif: 2 })), []);
    assert.ok(fields(errSoal(soalPg({ estimasi_waktu_detik: 5 }), "draf")).includes("estimasi_waktu_detik"));
    assert.ok(fields(errSoal(soalPg({ level_kognitif: 4 }), "draf")).includes("level_kognitif"));
  });

  it("stimulus: atribusi sumber WAJIB saat diajukan (K4), judul 3–150 selalu", () => {
    const v = (f: FormStimulus, mode: "draf" | "ajukan" = "ajukan") => fields(validasiStimulus(inputValidasiStimulus(f, "tps"), mode));
    assert.deepEqual(v(stimulusLengkap()), []);
    assert.ok(v(stimulusLengkap({ sumber_rujukan: "" })).includes("sumber_rujukan"));
    assert.deepEqual(v(stimulusLengkap({ sumber_rujukan: "" }), "draf"), []);
    assert.ok(v(stimulusLengkap({ judul_internal: "ab" }), "draf").includes("judul_internal"));
    assert.ok(v(stimulusLengkap({ konten: { v: 1, blok: [] } })).includes("konten.blok"));
  });
});

// ---------------------------------------------------------------------------
// formSoal (helper builder)
// ---------------------------------------------------------------------------

describe("formSoal — helper builder", () => {
  it("nilai awal per tipe", () => {
    assert.equal((formAwal(PU, "pilihan_ganda").konten.opsi as unknown[]).length, 5);
    assert.equal((formAwal(PU, "majemuk_kompleks").konten.pernyataan as unknown[]).length, 2);
    assert.deepEqual(formAwal(PU, "isian").konten, { v: 1, rumpang: [] });
    assert.equal(formAwal(PU, "isian").tingkat_kesulitan, "", "kesulitan belum dipilih");
    assert.equal(stimulusAwal(PU).konten.blok.length, 1);
  });

  it("id bagian stabil: tidak memakai ulang id yang ada", () => {
    assert.equal(idBagianBaru("p", ["p1", "p2"]), "p3");
    assert.equal(idBagianBaru("p", ["p1", "p3"]), "p2");
  });

  it("sisip & hapus rumpang menjaga redaksi, konten, dan kunci tetap sinkron", () => {
    const awal = { ...formAwal(PU, "isian"), redaksi: "3 + 4 = " };
    const a = sisipRumpang(awal, awal.redaksi.length);
    assert.equal(a.id, "r1");
    assert.equal(a.form.redaksi, "3 + 4 = {{r1}}");
    assert.equal(a.kursor, a.form.redaksi.length);
    const b = sisipRumpang(a.form, 0);
    assert.equal(b.id, "r2");
    assert.deepEqual(penandaDiRedaksi(b.form.redaksi), ["r2", "r1"]);
    const c = hapusRumpang(b.form, "r1");
    assert.equal(c.redaksi, "{{r2}}3 + 4 = ");
    assert.deepEqual(c.konten.rumpang, [{ id: "r2", jenis: "teks" }]);
    assert.deepEqual(Object.keys(c.kunci.rumpang as object), ["r2"]);
  });

  it("parse body: tipe data salah ditolak, field asing dibuang", () => {
    assert.equal(parseBodySimpanSoal(null).ok, false);
    assert.equal(parseBodySimpanSoal({ ...soalPg(), subtes_id: "x" }).ok, false);
    assert.equal(parseBodySimpanSoal({ ...soalPg(), tipe: "esai" }).ok, false);
    assert.equal(parseBodySimpanSoal({ ...soalPg(), konten: [] }).ok, false);
    assert.equal(parseBodySimpanSoal({ ...soalPg(), estimasi_waktu_detik: "90" }).ok, false);
    const r = parseBodySimpanSoal({ ...soalPg(), penulis_id: M2, status: "terpublikasi" });
    assert.ok(r.ok);
    if (r.ok) assert.equal("penulis_id" in r.data || "status" in r.data, false);
    assert.equal(parseBodySimpanStimulus({ ...stimulusLengkap(), konten: { v: 1 } }).ok, false);
  });

  it("rapikanKontenKunci membuang field asing di JSONB", () => {
    const r = rapikanKontenKunci(
      "isian",
      { v: 1, rumpang: [{ id: "r1", jenis: "angka", x: 1 }], sisipan: "<b>" },
      { v: 1, rumpang: { r1: { diterima: ["1"], toleransi: "", lain: true } } },
    );
    assert.deepEqual(r, { konten: { v: 1, rumpang: [{ id: "r1", jenis: "angka" }] }, kunci: { v: 1, rumpang: { r1: { diterima: ["1"] } } } });
  });

  it("terjemahan hasil RPC -> HTTP", () => {
    assert.equal(terjemahkanHasilRpc("soal", "disimpan").httpStatus, 200);
    assert.equal(terjemahkanHasilRpc("soal", "tidak_eligible").httpStatus, 403);
    assert.equal(terjemahkanHasilRpc("soal", "bukan_penulis").httpStatus, 404);
    assert.equal(terjemahkanHasilRpc("soal", "terkunci").httpStatus, 409);
    assert.equal(terjemahkanHasilRpc("soal", "stimulus_bukan_milik").httpStatus, 403);
    assert.equal(terjemahkanHasilRpc("stimulus", "masih_ada_soal").httpStatus, 409);
    assert.equal(terjemahkanHasilRpc("soal", "kode_aneh").httpStatus, 500);
  });
});

// ---------------------------------------------------------------------------
// Uji kunci jawaban = nilaiJawaban (fungsi penilaian siswa)
// ---------------------------------------------------------------------------

describe("uji kunci jawaban memakai nilaiJawaban", () => {
  const nilai = (f: FormSoal, jawaban: unknown) => nilaiJawaban({ tipe: f.tipe, konten: f.konten, kunci: f.kunci, aturan_skor: "semua_benar", bobot: 1 }, jawaban);

  it("isian angka pecahan: 1/2 = 0,5 = 0.5 = .5 = 2/4; salah tetap salah", () => {
    const f = soalIsian(1);
    for (const j of ["1/2", "0,5", "0.5", ".5", "2/4", " 0 , 5 "]) assert.equal(nilai(f, { rumpang: { r1: j } }).benar, true, j);
    for (const j of ["5.", "0,6", "1.000,5", "", "1 1/2"]) assert.equal(nilai(f, { rumpang: { r1: j } }).benar, false, j);
  });

  it("kunci yang salah ketahuan: jawaban benar menurut mentor dinilai salah", () => {
    const kunciSalah = soalPg({ kunci: { v: 1, opsi: "B" } }); // 2+3 seharusnya C
    assert.equal(nilai(kunciSalah, { opsi: "C" }).benar, false);
    assert.equal(nilai(soalPg(), { opsi: "C" }).benar, true);
  });

  it("majemuk: satu baris salah -> salah, bagian per baris tercatat", () => {
    const f = soalMajemuk(3);
    const h = nilai(f, { per_baris: { p1: 0, p2: 1, p3: 1 } });
    assert.equal(h.benar, false);
    assert.deepEqual(h.bagian, [
      { id: "p1", benar: true },
      { id: "p2", benar: true },
      { id: "p3", benar: false },
    ]);
  });

  it("isian dengan toleransi (teks koma) dari form", () => {
    const f = soalIsian(1, { kunci: { v: 1, rumpang: { r1: { diterima: ["3,14"], toleransi: "0,01" } } } });
    assert.equal(nilai(f, { rumpang: { r1: "3.1416" } }).benar, true);
    assert.equal(nilai(f, { rumpang: { r1: "3,2" } }).benar, false);
  });
});

// ---------------------------------------------------------------------------
// API + data layer terhadap Supabase tiruan
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let rpcCalls: Row[];

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: null }> {
  constructor(private rows: Row[]) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.rows = this.rows.filter((row) => values.includes(row[column]));
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.rows = this.rows.slice(0, n);
    return this;
  }
  maybeSingle() {
    return Promise.resolve({ data: this.rows[0] ? { ...this.rows[0] } : null, error: null });
  }
  then<A, B>(
    onfulfilled?: ((value: { data: Row[] | null; error: null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    return Promise.resolve({ data: this.rows.map((r) => ({ ...r })), error: null }).then(onfulfilled, onrejected);
  }
}

let tulisLangsung: string[];
function fakeFrom(table: string) {
  db[table] ??= [];
  let view = db[table];
  if (table === "studio_soal_penugasan") view = view.map((r) => ({ ...r, subtes: db.subtes.find((s) => s.id === r.subtes_id) ?? null }));
  const tolak = (op: string) => () => {
    tulisLangsung.push(`${op} ${table}`);
    return Promise.resolve({ data: null, error: null });
  };
  return Object.assign(new FakeQuery(view), { insert: tolak("insert"), update: tolak("update"), upsert: tolak("upsert"), delete: tolak("delete") });
}

const aktifMentor = (id: unknown) => db.user_roles.some((r) => r.user_id === id && r.role_type === "mentor" && r.status === "active");
const eligible = (m: unknown, s: unknown) => aktifMentor(m) && db.studio_soal_penugasan.some((r) => r.mentor_id === m && r.subtes_id === s);
const KOLOM_ISI = ["redaksi", "konten", "kunci", "pembahasan", "sumber_rujukan", "tingkat_kesulitan", "level_kognitif", "estimasi_waktu_detik"];

/** Tiruan RPC — aturan sama dengan db/add_studio_soal_draf.sql & add_studio_soal.sql (jalur yang diuji). */
function fakeRpc(name: string, p: Row) {
  rpcCalls.push({ name, ...p });
  const hasil = (status: string, extra: Row = {}) => Promise.resolve({ data: { status, ...extra }, error: null });
  const aktor = p.p_aktor_id;
  switch (name) {
    case "studio_soal_simpan_soal": {
      const d = p.p_data as Row;
      let s = db.soal_bank.find((r) => r.id === p.p_id);
      if (!s) {
        if (!["tps", "literasi"].includes(db.subtes.find((x) => x.id === d.subtes_id)?.kategori as string)) return hasil("subtes_tidak_valid");
        if (!eligible(aktor, d.subtes_id)) return hasil("tidak_eligible");
        let urutan: number | null = null;
        if (d.stimulus_id) {
          const st = db.soal_stimulus.find((r) => r.id === d.stimulus_id);
          if (!st) return hasil("stimulus_tidak_ditemukan");
          if (st.penulis_id !== aktor) return hasil("stimulus_bukan_milik");
          urutan = db.soal_bank.filter((r) => r.stimulus_id === d.stimulus_id).length + 1;
        }
        s = { id: p.p_id, subtes_id: d.subtes_id, tipe: d.tipe, stimulus_id: d.stimulus_id ?? null, urutan_dalam_stimulus: urutan, penulis_id: aktor, status: "draf", versi: 1, alasan_tolak: null, updated_at: "2026-10-25T00:00:00Z" };
        for (const k of KOLOM_ISI) s[k] = d[k];
        db.soal_bank.push(s);
        return hasil("disimpan", { id: p.p_id, dibuat: true });
      }
      if (s.penulis_id !== aktor) return hasil("bukan_penulis");
      if (!["draf", "ditolak"].includes(s.status as string)) return hasil("terkunci");
      if (d.subtes_id !== s.subtes_id || d.tipe !== s.tipe || (d.stimulus_id ?? null) !== s.stimulus_id) return hasil("identitas_berubah");
      if (!eligible(aktor, s.subtes_id)) return hasil("tidak_eligible");
      for (const k of KOLOM_ISI) s[k] = d[k];
      return hasil("disimpan", { id: p.p_id, dibuat: false });
    }
    case "studio_soal_simpan_stimulus": {
      const d = p.p_data as Row;
      const st = db.soal_stimulus.find((r) => r.id === p.p_id);
      if (!st) {
        if (!eligible(aktor, d.subtes_id)) return hasil("tidak_eligible");
        db.soal_stimulus.push({ id: p.p_id, subtes_id: d.subtes_id, judul_internal: d.judul_internal, konten: d.konten, sumber_rujukan: d.sumber_rujukan, penulis_id: aktor, status: "draf", versi: 1, alasan_tolak: null, updated_at: "2026-10-25T00:00:00Z" });
        return hasil("disimpan", { dibuat: true });
      }
      if (st.penulis_id !== aktor) return hasil("bukan_penulis");
      Object.assign(st, { judul_internal: d.judul_internal, konten: d.konten, sumber_rujukan: d.sumber_rujukan });
      return hasil("disimpan", { dibuat: false });
    }
    case "studio_soal_hapus_draf": {
      const tabel = p.p_objek_jenis === "soal" ? db.soal_bank : db.soal_stimulus;
      const i = tabel.findIndex((r) => r.id === p.p_id);
      if (i === -1) return hasil("tidak_ditemukan");
      if (tabel[i].penulis_id !== aktor) return hasil("bukan_penulis");
      if (tabel[i].status !== "draf") return hasil("status_tidak_valid");
      tabel.splice(i, 1);
      return hasil("dihapus");
    }
    case "studio_soal_ajukan_soal": {
      const s = db.soal_bank.find((r) => r.id === p.p_soal_id);
      if (!s) return hasil("tidak_ditemukan");
      if (s.penulis_id !== aktor) return hasil("bukan_penulis");
      s.status = "diajukan";
      db.soal_tinjauan_log.push({ objek_jenis: "soal", objek_id: s.id, aksi: "ajukan" });
      return hasil("diajukan");
    }
    case "studio_soal_ajukan_stimulus": {
      const st = db.soal_stimulus.find((r) => r.id === p.p_stimulus_id);
      if (!st) return hasil("tidak_ditemukan");
      const anak = db.soal_bank.filter((r) => r.stimulus_id === st.id && ["draf", "ditolak"].includes(r.status as string));
      if (anak.length === 0) return hasil("kelompok_kosong");
      st.status = "diajukan";
      for (const s of anak) s.status = "diajukan";
      return hasil("diajukan", { jumlah_soal: anak.length });
    }
    case "studio_soal_tarik": {
      const s = db.soal_bank.find((r) => r.id === p.p_id);
      if (!s || s.penulis_id !== aktor) return hasil("bukan_penulis");
      if (s.status !== "diajukan") return hasil("status_tidak_valid");
      s.status = "draf";
      return hasil("ditarik");
    }
    case "studio_soal_buat_versi_soal": {
      const s = db.soal_bank.find((r) => r.id === p.p_soal_id);
      if (!s || s.penulis_id !== aktor) return hasil("bukan_penulis");
      if (s.status !== "terpublikasi") return hasil("status_tidak_valid");
      const baru = { ...s, id: u(999), versi: 2, status: "draf" };
      db.soal_bank.push(baru);
      return hasil("versi_dibuat", { soal_id: baru.id });
    }
  }
  throw new Error(`rpc tiruan tidak dikenal: ${name}`);
}

type SoalRoute = typeof import("@/app/api/studio-soal/soal/[id]/route");
type SoalAksiRoute = typeof import("@/app/api/studio-soal/soal/[id]/[aksi]/route");
type StimulusRoute = typeof import("@/app/api/studio-soal/stimulus/[id]/route");
type StimulusAksiRoute = typeof import("@/app/api/studio-soal/stimulus/[id]/[aksi]/route");
type SessionModule = typeof import("@/lib/auth/session");
type DataModule = typeof import("@/lib/mentor/studioSoal");
let soalRoute: SoalRoute;
let soalAksi: SoalAksiRoute;
let stimulusRoute: StimulusRoute;
let stimulusAksi: StimulusAksiRoute;
let sessionLib: SessionModule;
let dataLib: DataModule;

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.SESSION_SECRET = "test-session-secret";
  const { supabaseServer } = await import("@/lib/supabase/server");
  Object.assign(supabaseServer as unknown as Record<string, unknown>, { from: fakeFrom, rpc: fakeRpc });
  soalRoute = await import("@/app/api/studio-soal/soal/[id]/route");
  soalAksi = await import("@/app/api/studio-soal/soal/[id]/[aksi]/route");
  stimulusRoute = await import("@/app/api/studio-soal/stimulus/[id]/route");
  stimulusAksi = await import("@/app/api/studio-soal/stimulus/[id]/[aksi]/route");
  sessionLib = await import("@/lib/auth/session");
  dataLib = await import("@/lib/mentor/studioSoal");
});

beforeEach(() => {
  rpcCalls = [];
  tulisLangsung = [];
  db = {
    user_roles: [
      { user_id: M1, role_type: "mentor", status: "active" },
      { user_id: M2, role_type: "mentor", status: "active" },
      { user_id: M3, role_type: "mentor", status: "active" },
      { user_id: M_PENDING, role_type: "mentor", status: "pending" },
      { user_id: SISWA, role_type: "student", status: "active" },
    ],
    subtes: [
      { id: PU, nama: "Penalaran Umum", kategori: "tps" },
      { id: PK, nama: "Pengetahuan Kuantitatif", kategori: "tps" },
      { id: MTK, nama: "Matematika", kategori: "tka_wajib" },
    ],
    studio_soal_penugasan: [
      { mentor_id: M1, subtes_id: PU },
      { mentor_id: M2, subtes_id: PU },
      { mentor_id: M3, subtes_id: PK },
      { mentor_id: M_PENDING, subtes_id: PU },
    ],
    soal_bank: [],
    soal_stimulus: [],
    soal_tinjauan_log: [],
  };
});

type Peran = "mentor" | "student" | "admin";
function req(method: string, url: string, userId: string | null, body?: unknown, role: Peran = "mentor") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers.cookie = `${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken({ userId, role })}`;
  return new NextRequest(`http://localhost${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const hasilnya = async (res: Response) => ({ status: res.status, json: (await res.json()) as Record<string, unknown> });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

const ID1 = u(501);
const ST1 = u(601);
const putSoal = (id: string, body: unknown, userId: string | null = M1, role: Peran = "mentor") =>
  soalRoute.PUT(req("PUT", `/api/studio-soal/soal/${id}`, userId, body, role), ctx({ id })).then(hasilnya);
const delSoal = (id: string, userId: string | null = M1) => soalRoute.DELETE(req("DELETE", `/api/studio-soal/soal/${id}`, userId), ctx({ id })).then(hasilnya);
const aksiSoal = (id: string, aksi: string, userId: string | null = M1) =>
  soalAksi.POST(req("POST", `/api/studio-soal/soal/${id}/${aksi}`, userId), ctx({ id, aksi })).then(hasilnya);
const putStimulus = (id: string, body: unknown, userId: string | null = M1) =>
  stimulusRoute.PUT(req("PUT", `/api/studio-soal/stimulus/${id}`, userId, body), ctx({ id })).then(hasilnya);
const aksiStimulus = (id: string, aksi: string, userId: string | null = M1) =>
  stimulusAksi.POST(req("POST", `/api/studio-soal/stimulus/${id}/${aksi}`, userId), ctx({ id, aksi })).then(hasilnya);

describe("API studio-soal — akses", () => {
  it("tanpa login 401; siswa 403; mentor pending 403 — RPC tidak dipanggil", async () => {
    assert.equal((await putSoal(ID1, soalPg(), null)).status, 401);
    assert.equal((await putSoal(ID1, soalPg(), SISWA, "student")).status, 403);
    assert.equal((await putSoal(ID1, soalPg(), M_PENDING)).status, 403);
    assert.equal(rpcCalls.length, 0);
  });

  it("mentor yang TIDAK ditugaskan ke subtes itu ditolak 403 sebelum RPC", async () => {
    const res = await putSoal(ID1, soalPg(), M3); // M3 hanya PK
    assert.equal(res.status, 403);
    assert.match(String(res.json.error), /tidak ditugaskan/);
    assert.equal(rpcCalls.length, 0);
    assert.equal(db.soal_bank.length, 0);
    const st = await putStimulus(ST1, stimulusLengkap(), M3);
    assert.equal(st.status, 403);
  });

  it("subtes TKA ditolak (tidak pernah ada di penugasan)", async () => {
    const res = await putSoal(ID1, soalPg({ subtes_id: MTK }));
    assert.equal(res.status, 403);
    assert.equal(rpcCalls.length, 0);
  });

  it("penulis = session, bukan body (penulis_id di body diabaikan)", async () => {
    const res = await putSoal(ID1, { ...soalPg(), penulis_id: M2 });
    assert.equal(res.status, 200);
    assert.equal(rpcCalls[0].p_aktor_id, M1);
    assert.equal((rpcCalls[0].p_data as Row).penulis_id, undefined);
    assert.equal(db.soal_bank[0].penulis_id, M1);
  });

  it("id bukan UUID 400; body bukan JSON 400", async () => {
    assert.equal((await putSoal("abc", soalPg())).status, 400);
    const raw = new NextRequest(`http://localhost/api/studio-soal/soal/${ID1}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: `${sessionLib.SESSION_COOKIE_NAME}=${sessionLib.createSessionToken({ userId: M1, role: "mentor" })}` },
      body: "{bukan json",
    });
    assert.equal((await hasilnya(await soalRoute.PUT(raw, ctx({ id: ID1 })))).status, 400);
  });
});

describe("API studio-soal — simpan draf", () => {
  it("simpan dobel (id sama) tidak membuat duplikat", async () => {
    const a = await putSoal(ID1, soalPg());
    const b = await putSoal(ID1, soalPg({ redaksi: "Berapakah \\(2+3\\)? (ubah)" }));
    assert.equal(a.status, 200);
    assert.equal(a.json.dibuat, true);
    assert.equal(b.json.dibuat, false);
    assert.equal(db.soal_bank.length, 1);
    assert.equal(db.soal_bank[0].redaksi, "Berapakah \\(2+3\\)? (ubah)");
  });

  it("draf belum lengkap boleh disimpan; error bentuk ditolak 400 dengan daftar error", async () => {
    const kosong = { ...formAwal(PU, "majemuk_kompleks"), tingkat_kesulitan: "sedang" };
    assert.equal((await putSoal(ID1, kosong)).status, 200);
    const res = await putSoal(u(502), soalMajemuk(7));
    assert.equal(res.status, 400);
    assert.ok(Array.isArray(res.json.errors));
    assert.equal(rpcCalls.length, 1); // hanya simpan pertama yang sampai RPC
  });

  it("JSONB dirapikan: field asing di konten/kunci tidak tersimpan", async () => {
    await putSoal(ID1, soalPg({ konten: { v: 1, opsi: (soalPg().konten.opsi as Row[]).map((o) => ({ ...o, html: "<b>x</b>" })), lain: 1 } }));
    assert.deepEqual(Object.keys(db.soal_bank[0].konten as object), ["v", "opsi"]);
    assert.deepEqual(Object.keys(((db.soal_bank[0].konten as Row).opsi as Row[])[0]), ["label", "teks"]);
  });

  it("draf milik mentor lain: tidak bisa diedit, dihapus, atau dibaca (404)", async () => {
    await putSoal(ID1, soalPg());
    const edit = await putSoal(ID1, soalPg({ redaksi: "dibajak" }), M2);
    assert.equal(edit.status, 404);
    assert.equal(db.soal_bank[0].redaksi, "Berapakah \\(2+3\\)?");
    assert.equal((await delSoal(ID1, M2)).status, 404);
    assert.equal((await aksiSoal(ID1, "ajukan", M2)).status, 404);
    assert.equal(db.soal_bank.length, 1);
    assert.equal(await dataLib.getSoalMilik(M2, ID1), null);
    assert.notEqual(await dataLib.getSoalMilik(M1, ID1), null);
  });

  it("soal terkunci setelah diajukan: edit langsung 409; tarik membuka lagi", async () => {
    await putSoal(ID1, soalPg());
    assert.equal((await aksiSoal(ID1, "ajukan")).status, 200);
    const edit = await putSoal(ID1, soalPg({ redaksi: "Ubah saat diajukan" }));
    assert.equal(edit.status, 409);
    assert.equal(db.soal_bank[0].redaksi, "Berapakah \\(2+3\\)?");
    assert.equal((await aksiSoal(ID1, "tarik")).status, 200);
    assert.equal((await putSoal(ID1, soalPg({ redaksi: "Berapakah \\(2+4\\)?" }))).status, 200);
  });

  it("subtes/tipe tidak bisa diganti setelah disimpan (409)", async () => {
    await putSoal(ID1, soalPg());
    assert.equal((await putSoal(ID1, soalIsian(1))).status, 409);
  });

  it("hapus draf milik sendiri", async () => {
    await putSoal(ID1, soalPg());
    assert.equal((await delSoal(ID1)).status, 200);
    assert.equal(db.soal_bank.length, 0);
  });
});

describe("API studio-soal — ajukan, versi baru", () => {
  it("ajukan memvalidasi isi TERSIMPAN secara lengkap (termasuk rumus) sebelum RPC", async () => {
    await putSoal(ID1, soalPg({ pembahasan: "", kunci: { v: 1 } }));
    const res = await aksiSoal(ID1, "ajukan");
    assert.equal(res.status, 400);
    const f = fields(res.json.errors as { field: string }[]);
    assert.ok(f.includes("pembahasan") && f.includes("kunci.opsi"));
    assert.equal(rpcCalls.some((c) => c.name === "studio_soal_ajukan_soal"), false);

    await putSoal(ID1, soalPg({ redaksi: "Berapakah \\(\\frac{2\\)?" }));
    const rumus = await aksiSoal(ID1, "ajukan");
    assert.equal(rumus.status, 400);
    assert.deepEqual(fields(rumus.json.errors as { field: string }[]), ["redaksi"]);

    await putSoal(ID1, soalPg());
    assert.equal((await aksiSoal(ID1, "ajukan")).status, 200);
    assert.equal(db.soal_bank[0].status, "diajukan");
  });

  it("penugasan dicabut: aksi ditolak 403 walau soalnya milik sendiri", async () => {
    await putSoal(ID1, soalPg());
    db.studio_soal_penugasan = db.studio_soal_penugasan.filter((r) => r.mentor_id !== M1);
    assert.equal((await aksiSoal(ID1, "ajukan")).status, 403);
    assert.equal((await delSoal(ID1)).status, 403);
    assert.equal((await putSoal(ID1, soalPg())).status, 403);
  });

  it("aksi tidak dikenal 404", async () => {
    await putSoal(ID1, soalPg());
    assert.equal((await aksiSoal(ID1, "terbitkan")).status, 404);
  });

  it("versi baru dari soal terbit mengembalikan id draf baru", async () => {
    await putSoal(ID1, soalPg());
    db.soal_bank[0].status = "terpublikasi";
    const res = await aksiSoal(ID1, "versi-baru");
    assert.equal(res.status, 200);
    assert.equal(res.json.id, u(999));
  });
});

describe("API studio-soal — stimulus & K7", () => {
  it("hanya penulis stimulus yang boleh menambah soal (403 untuk mentor lain)", async () => {
    assert.equal((await putStimulus(ST1, stimulusLengkap())).status, 200);
    const lain = await putSoal(u(503), soalPg({ stimulus_id: ST1 }), M2);
    assert.equal(lain.status, 403);
    assert.match(String(lain.json.error), /penulis stimulus/);
    const sendiri = await putSoal(u(504), soalPg({ stimulus_id: ST1 }));
    assert.equal(sendiri.status, 200);
    assert.equal(db.soal_bank.find((s) => s.id === u(504))?.urutan_dalam_stimulus, 1);
  });

  it("ajukan kelompok: stimulus tanpa sumber & soal belum lengkap dilaporkan per soal", async () => {
    await putStimulus(ST1, stimulusLengkap({ sumber_rujukan: "" }));
    await putSoal(u(504), soalPg({ stimulus_id: ST1, pembahasan: "" }));
    const res = await aksiStimulus(ST1, "ajukan");
    assert.equal(res.status, 400);
    assert.ok(fields(res.json.errors as { field: string }[]).includes("sumber_rujukan"));
    const perSoal = res.json.errorsSoal as { soalId: string; errors: { field: string }[] }[];
    assert.equal(perSoal[0].soalId, u(504));
    assert.ok(fields(perSoal[0].errors).includes("pembahasan"));

    await putStimulus(ST1, stimulusLengkap());
    await putSoal(u(504), soalPg({ stimulus_id: ST1 }));
    const ok = await aksiStimulus(ST1, "ajukan");
    assert.equal(ok.status, 200);
    assert.equal(ok.json.jumlahSoal, 1);
  });

  it("stimulus mentor lain tidak bisa dibaca data layer", async () => {
    await putStimulus(ST1, stimulusLengkap());
    assert.equal(await dataLib.getStimulusMilik(M2, ST1), null);
    assert.deepEqual(await dataLib.getSoalDiStimulus(M2, ST1), []);
  });

  it("pilihan subtes form = subtes yang ditugaskan saja", async () => {
    const daftar = await dataLib.getSubtesDitugaskan(M1);
    assert.notEqual(daftar, "gagal");
    if (daftar === "gagal") return;
    assert.deepEqual(daftar.map((s) => s.id), [PU]);
  });

  it("tidak ada tulis langsung ke tabel selama semua skenario API", async () => {
    await putStimulus(ST1, stimulusLengkap());
    await putSoal(ID1, soalPg());
    await aksiSoal(ID1, "ajukan");
    await delSoal(ID1);
    assert.deepEqual(tulisLangsung, []);
  });
});

// ---------------------------------------------------------------------------
// Pemeriksaan statis
// ---------------------------------------------------------------------------

function semuaFile(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return readdirSync(abs).flatMap((n) => {
    const rel = path.join(dir, n);
    return statSync(path.join(ROOT, rel)).isDirectory() ? semuaFile(rel) : [rel.replace(/\\/g, "/")];
  });
}

describe("statis", () => {
  const SERVER = [
    "lib/mentor/studioSoal.ts",
    "lib/mentor/studioSoalApi.ts",
    ...semuaFile("app/api/studio-soal"),
    ...semuaFile("app/(protected)/(mentor)/studio-soal"),
  ];
  const KOMPONEN = semuaFile("components/studio-soal");

  it("tidak ada insert/update/upsert/delete langsung dari kode aplikasi Studio Soal", () => {
    for (const f of SERVER) assert.doesNotMatch(baca(f), /\.(insert|update|upsert|delete)\(/, f);
  });

  it("tidak ada dangerouslySetInnerHTML di komponen & halaman Studio Soal", () => {
    for (const f of [...KOMPONEN, ...SERVER, "components/mentor/StudioSoalMentor.tsx"]) {
      assert.doesNotMatch(baca(f), /dangerouslySetInnerHTML\s*=|\.innerHTML\s*=/, f);
    }
  });

  it("komponen klien tidak mengimpor supabase server atau modul server-only", () => {
    for (const f of KOMPONEN.filter((x) => /\.tsx?$/.test(x))) {
      const isi = baca(f);
      assert.doesNotMatch(isi, /@\/lib\/supabase\/server|@\/lib\/mentor\/studioSoal/, f);
    }
  });

  it("semua RPC yang dipanggil API ada di migrasi", () => {
    const sql = ["db/add_studio_soal.sql", "db/add_studio_soal_draf.sql"].map(baca).join("\n");
    const dipanggil = [...baca("lib/mentor/studioSoalApi.ts").matchAll(/"(studio_soal_[a-z_]+)"/g)].map((m) => m[1]);
    assert.ok(dipanggil.length >= 8);
    for (const nama of new Set(dipanggil)) assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION ${nama}\\(`), nama);
  });

  it("migrasi draf: idempoten, tanpa policy, tanpa ubah tabel, EXECUTE hanya service_role", () => {
    const sql = baca("db/add_studio_soal_draf.sql");
    assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
    assert.match(sql, /DROP TRIGGER IF EXISTS trg_studio_soal_penulis_eligible_soal/);
    assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
    assert.doesNotMatch(sql, /CREATE POLICY/i);
    assert.doesNotMatch(sql, /ALTER TABLE|CREATE TABLE|DROP TABLE|ALTER TYPE/i);
    const t = baca("db/test_studio_soal_draf_DRYRUN.sql");
    assert.match(t, /DRY-RUN GAGAL \[v1\]/);
    for (const s of ["tidak_eligible", "bukan_penulis", "terkunci", "stimulus_bukan_milik", "pernah_diajukan", "masih_ada_soal", "identitas_berubah"]) {
      assert.ok(t.includes(`'${s}'`), s);
    }
  });

  it("katex dikunci versi persis", () => {
    const pkg = JSON.parse(baca("package.json")) as { dependencies: Record<string, string> };
    assert.match(pkg.dependencies.katex, /^\d+\.\d+\.\d+$/);
  });
});
