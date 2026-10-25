/**
 * Form soal & stimulus Studio Soal (PR 3b) — modul MURNI, dipakai builder di
 * browser DAN API route, supaya bentuk data, validasi, dan pesan sama persis.
 *
 *   - bentuk state form (= bentuk payload API = nama kolom DB)
 *   - nilai awal per tipe, penambah pernyataan/rumpang dengan id stabil
 *   - parse body request API (tipe data saja; aturan isi = validasi.ts)
 *   - rapikan konten/kunci (buang field asing sebelum disimpan)
 *   - terjemahan kode hasil RPC studio_soal_* -> HTTP status + pesan
 */
import type { SoalInput, StimulusInput } from "./tipe";
import { BATAS, LABEL_OPSI, POLA_ID_BAGIAN, TINGKAT_KESULITAN, TIPE_SOAL, type BlokStimulus, type TipeSoal } from "./tipe";

export const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && POLA_UUID.test(v);

type Obj = Record<string, unknown>;
const isObjek = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// ============================================================================
// SOAL
// ============================================================================

export interface FormSoal {
  subtes_id: string;
  tipe: TipeSoal;
  stimulus_id: string | null;
  redaksi: string;
  konten: Obj;
  kunci: Obj;
  pembahasan: string;
  /** "" = tidak diisi (disimpan NULL). Opsional untuk soal (K4). */
  sumber_rujukan: string;
  /** "" = belum dipilih — wajib dipilih sebelum simpan pertama. */
  tingkat_kesulitan: string;
  level_kognitif: number | null;
  estimasi_waktu_detik: number | null;
}

export const LABEL_TIPE: Record<TipeSoal, string> = {
  pilihan_ganda: "Pilihan ganda",
  majemuk_kompleks: "Pilihan majemuk kompleks",
  isian: "Isian",
};

export const KETERANGAN_TIPE: Record<TipeSoal, string> = {
  pilihan_ganda: "5 opsi (A–E), satu kunci.",
  majemuk_kompleks: "2–6 pernyataan, tiap baris dijawab salah satu dari dua kolom.",
  isian: "1–5 rumpang di redaksi, jawaban teks atau angka.",
};

export const LABEL_KESULITAN: Record<string, string> = { mudah: "Mudah", sedang: "Sedang", hots: "HOTS" };

export const PRESET_LABEL_KOLOM: [string, string][] = [
  ["Benar", "Salah"],
  ["Ya", "Tidak"],
  ["Sesuai", "Tidak Sesuai"],
  ["Tepat", "Tidak Tepat"],
];

export function kontenAwal(tipe: TipeSoal): { konten: Obj; kunci: Obj } {
  if (tipe === "pilihan_ganda") {
    return { konten: { v: 1, opsi: LABEL_OPSI.map((label) => ({ label, teks: "" })) }, kunci: { v: 1 } };
  }
  if (tipe === "majemuk_kompleks") {
    return {
      konten: {
        v: 1,
        label_kolom: [...PRESET_LABEL_KOLOM[0]],
        pernyataan: [
          { id: "p1", teks: "" },
          { id: "p2", teks: "" },
        ],
      },
      kunci: { v: 1, per_baris: {} },
    };
  }
  return { konten: { v: 1, rumpang: [] }, kunci: { v: 1, rumpang: {} } };
}

export function formAwal(subtesId: string, tipe: TipeSoal, stimulusId: string | null = null): FormSoal {
  return {
    subtes_id: subtesId,
    tipe,
    stimulus_id: stimulusId,
    redaksi: "",
    ...kontenAwal(tipe),
    pembahasan: "",
    sumber_rujukan: "",
    tingkat_kesulitan: "",
    level_kognitif: null,
    estimasi_waktu_detik: null,
  };
}

/** Id bagian baru (p1, p2… / r1, r2…) yang belum dipakai — id stabil, bukan indeks. */
export function idBagianBaru(awalan: "p" | "r", sudahAda: string[]): string {
  const pakai = new Set(sudahAda);
  for (let n = 1; n <= 99; n++) {
    const id = `${awalan}${n}`;
    if (!pakai.has(id)) return id;
  }
  throw new Error("idBagianBaru: id habis");
}

/**
 * Bentuk input validator dari state form. Dipakai builder (cek langsung) dan
 * API (cek ulang) — satu sumber. Soal berstimulus: urutannya dihitung server
 * saat dibuat, jadi untuk validator diberi urutan pengganti 1.
 */
export function inputValidasiSoal(form: Omit<FormSoal, "sumber_rujukan"> & { sumber_rujukan: string | null }, subtesKategori?: string | null): SoalInput {
  const sumber = typeof form.sumber_rujukan === "string" && form.sumber_rujukan.trim() !== "" ? form.sumber_rujukan : null;
  return {
    ...(subtesKategori !== undefined ? { subtes_kategori: subtesKategori } : {}),
    tipe: form.tipe,
    redaksi: form.redaksi,
    konten: form.konten,
    kunci: form.kunci,
    pembahasan: form.pembahasan,
    tingkat_kesulitan: form.tingkat_kesulitan,
    level_kognitif: form.level_kognitif,
    estimasi_waktu_detik: form.estimasi_waktu_detik,
    sumber_rujukan: sumber,
    stimulus_id: form.stimulus_id,
    urutan_dalam_stimulus: form.stimulus_id ? 1 : null,
  };
}

export type PayloadSoal = FormSoal;

/** Parse body PUT soal: hanya cek TIPE DATA tiap field (aturan isi di validasiSoal). */
export function parseBodySimpanSoal(body: unknown): { ok: true; data: PayloadSoal } | { ok: false; error: string } {
  if (!isObjek(body)) return { ok: false, error: "Data soal tidak valid." };
  const gagal = (error: string) => ({ ok: false as const, error });
  if (!isUuid(body.subtes_id)) return gagal("Subtes wajib dipilih.");
  if (typeof body.tipe !== "string" || !(TIPE_SOAL as readonly string[]).includes(body.tipe)) return gagal("Tipe soal tidak dikenal.");
  if (body.stimulus_id !== undefined && body.stimulus_id !== null && !isUuid(body.stimulus_id)) return gagal("Stimulus tidak valid.");
  for (const k of ["redaksi", "pembahasan", "tingkat_kesulitan"] as const) {
    if (typeof body[k] !== "string") return gagal(`Field ${k} harus berupa teks.`);
  }
  if (body.sumber_rujukan !== undefined && body.sumber_rujukan !== null && typeof body.sumber_rujukan !== "string") {
    return gagal("Sumber rujukan harus berupa teks.");
  }
  if (!isObjek(body.konten) || !isObjek(body.kunci)) return gagal("Konten atau kunci soal tidak valid.");
  for (const k of ["level_kognitif", "estimasi_waktu_detik"] as const) {
    if (body[k] !== undefined && body[k] !== null && typeof body[k] !== "number") return gagal(`Field ${k} harus berupa angka.`);
  }
  return {
    ok: true,
    data: {
      subtes_id: body.subtes_id,
      tipe: body.tipe as TipeSoal,
      stimulus_id: (body.stimulus_id as string | null | undefined) ?? null,
      redaksi: body.redaksi as string,
      konten: body.konten,
      kunci: body.kunci,
      pembahasan: body.pembahasan as string,
      sumber_rujukan: (body.sumber_rujukan as string | null | undefined) ?? "",
      tingkat_kesulitan: body.tingkat_kesulitan as string,
      level_kognitif: (body.level_kognitif as number | null | undefined) ?? null,
      estimasi_waktu_detik: (body.estimasi_waktu_detik as number | null | undefined) ?? null,
    },
  };
}

/**
 * Salin hanya field yang dikenal (dipanggil SETELAH validasi bentuk lolos)
 * supaya JSONB yang tersimpan tidak memuat field asing dari klien.
 */
export function rapikanKontenKunci(tipe: TipeSoal, konten: Obj, kunci: Obj): { konten: Obj; kunci: Obj } {
  const arr = (v: unknown) => (Array.isArray(v) ? v : undefined);
  const ambil = (o: unknown, keys: string[]) =>
    isObjek(o) ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) : o;

  if (tipe === "pilihan_ganda") {
    const opsi = arr(konten.opsi);
    return {
      konten: { v: 1, ...(opsi ? { opsi: opsi.map((o) => ambil(o, ["label", "teks"])) } : {}) },
      kunci: { v: 1, ...(kunci.opsi !== undefined && kunci.opsi !== null ? { opsi: kunci.opsi } : {}) },
    };
  }
  if (tipe === "majemuk_kompleks") {
    const pernyataan = arr(konten.pernyataan);
    return {
      konten: {
        v: 1,
        ...(konten.label_kolom !== undefined ? { label_kolom: konten.label_kolom } : {}),
        ...(pernyataan ? { pernyataan: pernyataan.map((p) => ambil(p, ["id", "teks"])) } : {}),
      },
      kunci: { v: 1, ...(isObjek(kunci.per_baris) ? { per_baris: kunci.per_baris } : {}) },
    };
  }
  const rumpang = arr(konten.rumpang);
  const kunciRumpang = isObjek(kunci.rumpang)
    ? Object.fromEntries(
        Object.entries(kunci.rumpang).map(([id, k]) => {
          if (!isObjek(k)) return [id, k];
          const t = k.toleransi;
          return [id, { diterima: k.diterima, ...(t !== undefined && t !== null && t !== "" ? { toleransi: t } : {}) }];
        }),
      )
    : undefined;
  return {
    konten: { v: 1, ...(rumpang ? { rumpang: rumpang.map((r) => ambil(r, ["id", "jenis"])) } : {}) },
    kunci: { v: 1, ...(kunciRumpang ? { rumpang: kunciRumpang } : {}) },
  };
}

// ---- Isian: penanda rumpang di redaksi ----

/** Id rumpang yang muncul sebagai {{id}} di redaksi, berurutan. */
export function penandaDiRedaksi(redaksi: string): string[] {
  return [...redaksi.matchAll(/\{\{([^{}]*)\}\}/g)].map((m) => m[1]).filter((id) => POLA_ID_BAGIAN.test(id));
}

/** Rumpang baru di posisi kursor: menyisipkan {{rN}} ke redaksi + entri konten & kunci. */
export function sisipRumpang(form: FormSoal, posisi: number): { form: FormSoal; id: string; kursor: number } {
  const rumpang = Array.isArray(form.konten.rumpang) ? (form.konten.rumpang as { id: string; jenis: string }[]) : [];
  const id = idBagianBaru("r", [...rumpang.map((r) => r.id), ...penandaDiRedaksi(form.redaksi)]);
  const p = Math.max(0, Math.min(posisi, form.redaksi.length));
  const penanda = `{{${id}}}`;
  const kunciRumpang = isObjek(form.kunci.rumpang) ? form.kunci.rumpang : {};
  return {
    id,
    kursor: p + penanda.length,
    form: {
      ...form,
      redaksi: form.redaksi.slice(0, p) + penanda + form.redaksi.slice(p),
      konten: { ...form.konten, rumpang: [...rumpang, { id, jenis: "teks" }] },
      kunci: { ...form.kunci, rumpang: { ...kunciRumpang, [id]: { diterima: [""] } } },
    },
  };
}

/** Hapus rumpang: entri konten & kunci, dan penandanya di redaksi. */
export function hapusRumpang(form: FormSoal, id: string): FormSoal {
  const rumpang = Array.isArray(form.konten.rumpang) ? (form.konten.rumpang as { id: string }[]) : [];
  const kunciRumpang = isObjek(form.kunci.rumpang) ? { ...form.kunci.rumpang } : {};
  delete kunciRumpang[id];
  return {
    ...form,
    redaksi: form.redaksi.split(`{{${id}}}`).join(""),
    konten: { ...form.konten, rumpang: rumpang.filter((r) => r.id !== id) },
    kunci: { ...form.kunci, rumpang: kunciRumpang },
  };
}

// ============================================================================
// STIMULUS
// ============================================================================

export interface FormStimulus {
  subtes_id: string;
  judul_internal: string;
  /** WAJIB saat diajukan (K4): "Buatan sendiri" atau nama sumber. */
  sumber_rujukan: string;
  konten: { v: 1; blok: BlokStimulus[] };
}

export const SUMBER_BUATAN_SENDIRI = "Buatan sendiri";

export function stimulusAwal(subtesId: string): FormStimulus {
  return { subtes_id: subtesId, judul_internal: "", sumber_rujukan: "", konten: { v: 1, blok: [{ jenis: "teks", teks: "" }] } };
}

export function blokTabelBaru(): BlokStimulus {
  return { jenis: "tabel", judul: "", kepala: ["", ""], baris: [["", ""]] };
}

export function inputValidasiStimulus(form: FormStimulus, subtesKategori?: string | null): StimulusInput {
  return {
    ...(subtesKategori !== undefined ? { subtes_kategori: subtesKategori } : {}),
    judul_internal: form.judul_internal,
    konten: form.konten,
    sumber_rujukan: form.sumber_rujukan,
  };
}

export function parseBodySimpanStimulus(body: unknown): { ok: true; data: FormStimulus } | { ok: false; error: string } {
  if (!isObjek(body)) return { ok: false, error: "Data stimulus tidak valid." };
  if (!isUuid(body.subtes_id)) return { ok: false, error: "Subtes wajib dipilih." };
  if (typeof body.judul_internal !== "string") return { ok: false, error: "Judul internal wajib diisi." };
  if (typeof body.sumber_rujukan !== "string") return { ok: false, error: "Sumber rujukan harus berupa teks." };
  if (!isObjek(body.konten) || !Array.isArray(body.konten.blok)) return { ok: false, error: "Konten stimulus tidak valid." };
  return {
    ok: true,
    data: {
      subtes_id: body.subtes_id,
      judul_internal: body.judul_internal,
      sumber_rujukan: body.sumber_rujukan,
      konten: { v: 1, blok: body.konten.blok as BlokStimulus[] },
    },
  };
}

/** Salin hanya field blok yang dikenal (setelah validasi bentuk lolos). */
export function rapikanKontenStimulus(konten: FormStimulus["konten"]): FormStimulus["konten"] {
  return {
    v: 1,
    blok: konten.blok.map((b) =>
      b.jenis === "tabel"
        ? { jenis: "tabel", judul: b.judul ?? null, kepala: b.kepala, baris: b.baris }
        : { jenis: "teks", teks: (b as { teks: string }).teks },
    ),
  };
}

// ============================================================================
// HASIL RPC -> HTTP
// ============================================================================

export type ObjekStudio = "soal" | "stimulus";

export interface TerjemahanRpc {
  success: boolean;
  httpStatus: number;
  pesan: string;
}

const NAMA: Record<ObjekStudio, string> = { soal: "Soal", stimulus: "Stimulus" };

/**
 * Kode hasil fungsi studio_soal_* (db/add_studio_soal.sql,
 * db/add_studio_soal_draf.sql) -> respons API. Draf milik mentor lain
 * dijawab 404 (sama dengan tidak ada) supaya keberadaannya tidak bocor.
 */
export function terjemahkanHasilRpc(objek: ObjekStudio, status: unknown): TerjemahanRpc {
  const n = NAMA[objek];
  const ok = (pesan: string): TerjemahanRpc => ({ success: true, httpStatus: 200, pesan });
  const no = (httpStatus: number, pesan: string): TerjemahanRpc => ({ success: false, httpStatus, pesan });
  switch (status) {
    case "disimpan":
      return ok("Draf tersimpan.");
    case "diajukan":
      return ok(objek === "stimulus" ? "Stimulus dan soalnya diajukan untuk ditinjau." : "Soal diajukan untuk ditinjau.");
    case "ditarik":
      return ok("Pengajuan ditarik. Isinya bisa diedit lagi.");
    case "versi_dibuat":
      return ok("Versi baru dibuat sebagai draf. Versi lama tetap terpakai sampai versi baru lolos tinjauan.");
    case "dihapus":
      return ok("Draf dihapus.");
    case "input_tidak_valid":
    case "jenis_tidak_valid":
      return no(400, `Data ${n.toLowerCase()} tidak valid.`);
    case "data_tidak_valid":
      return no(400, `Data ${n.toLowerCase()} tidak memenuhi aturan. Periksa isian yang ditandai.`);
    case "subtes_tidak_valid":
      return no(400, "Studio Soal hanya untuk subtes SNBT.");
    case "tidak_eligible":
      return no(403, "Anda tidak ditugaskan Admin ke subtes ini.");
    case "bukan_penulis":
    case "tidak_ditemukan":
      return no(404, `${n} tidak ditemukan.`);
    case "terkunci":
      return no(409, `${n} sudah diajukan atau terbit sehingga isinya terkunci. Tarik pengajuan atau buat versi baru untuk mengubahnya.`);
    case "identitas_berubah":
      return no(409, "Subtes, tipe, dan stimulus tidak bisa diganti setelah disimpan. Hapus draf ini lalu buat yang baru.");
    case "stimulus_tidak_ditemukan":
      return no(404, "Stimulus tidak ditemukan.");
    case "stimulus_bukan_milik":
      return no(403, "Hanya penulis stimulus yang boleh menambah soal ke stimulus itu.");
    case "stimulus_beda_subtes":
      return no(400, "Stimulus berasal dari subtes lain.");
    case "stimulus_terkunci":
      return no(409, "Stimulus sedang ditinjau atau sudah tidak aktif, jadi belum bisa ditambah soal.");
    case "stimulus_penuh":
      return no(409, "Stimulus sudah berisi 50 soal (batas maksimal).");
    case "status_tidak_valid":
      return no(409, `Status ${n.toLowerCase()} tidak memungkinkan aksi ini. Muat ulang halaman.`);
    case "pernah_diajukan":
      return no(409, `${n} ini pernah diajukan sehingga tidak bisa dihapus.`);
    case "dipakai_paket":
      return no(409, "Soal ini dipakai di paket soal sehingga tidak bisa dihapus.");
    case "masih_ada_soal":
      return no(409, "Stimulus masih berisi soal. Hapus soalnya dulu.");
    case "ajukan_lewat_stimulus":
      return no(409, "Soal ini bagian dari stimulus yang belum terbit — ajukan bersama stimulusnya dari halaman stimulus.");
    case "tarik_lewat_stimulus":
      return no(409, "Soal ini diajukan bersama stimulusnya — tarik dari halaman stimulus.");
    case "stimulus_tidak_aktif":
      return no(409, "Stimulus soal ini sudah tidak aktif.");
    case "kelompok_kosong":
      return no(400, "Stimulus belum berisi soal draf untuk diajukan.");
    case "ada_versi_terbuka":
      return no(409, "Sudah ada versi baru yang belum terbit. Lanjutkan versi itu.");
    default:
      return no(500, "Terjadi kesalahan. Coba lagi nanti.");
  }
}

export const AKSI_STUDIO = ["ajukan", "tarik", "versi-baru"] as const;
export type AksiStudio = (typeof AKSI_STUDIO)[number];
export const isAksiStudio = (v: unknown): v is AksiStudio => typeof v === "string" && (AKSI_STUDIO as readonly string[]).includes(v);

/** Pilihan tingkat kesulitan untuk UI (urutan tetap). */
export const PILIHAN_KESULITAN = TINGKAT_KESULITAN;
export { BATAS };
