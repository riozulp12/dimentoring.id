/**
 * Validator bersama Studio Soal (PRD 7.7 revisi, BR-37) — modul MURNI, dipakai
 * builder di browser DAN API route (server tetap memvalidasi ulang).
 *
 * Dua jenis error:
 *   "bentuk"      — data tidak masuk akal / melanggar CHECK yang berlaku di
 *                   status apa pun (mis. 6 opsi, label kolom > 30 karakter).
 *                   Selalu ditolak, termasuk saat simpan draf.
 *   "kelengkapan" — isi belum lengkap (opsi kosong, kunci belum dipilih,
 *                   pembahasan pendek). Draf boleh menyimpan ini; wajib
 *                   bersih saat diajukan.
 * mode "draf" hanya mengembalikan error "bentuk"; mode "ajukan" semuanya.
 *
 * Panjang dihitung per karakter (code point) — [...str].length, sama dengan
 * length() Postgres di CHECK db/add_studio_soal.sql.
 */
import { parseAngka, samaPecahan, isNonNegatif, type Pecahan } from "./angka";
import { cekPembatasRumus, normalisasiTeks, panjangKarakter, panjangTrim } from "./teks";
import {
  BATAS,
  JENIS_RUMPANG,
  LABEL_OPSI,
  POLA_ID_BAGIAN,
  TINGKAT_KESULITAN,
  TIPE_SOAL,
  isSubtesSnbt,
  type JenisRumpang,
} from "./tipe";

export type JenisError = "bentuk" | "kelengkapan";
export type ModeValidasi = "draf" | "ajukan";

export interface ErrorValidasi {
  /** Jalur field, mis. "konten.opsi.2.teks" — dipakai builder untuk menandai input. */
  field: string;
  pesan: string;
  jenis: JenisError;
}

class Pengumpul {
  readonly daftar: ErrorValidasi[] = [];
  bentuk(field: string, pesan: string) {
    this.daftar.push({ field, pesan, jenis: "bentuk" });
  }
  lengkap(field: string, pesan: string) {
    this.daftar.push({ field, pesan, jenis: "kelengkapan" });
  }
  hasil(mode: ModeValidasi): ErrorValidasi[] {
    return mode === "ajukan" ? this.daftar : this.daftar.filter((e) => e.jenis === "bentuk");
  }
}

function isObjek(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBulatDalam(value: unknown, min: number, maks: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= maks;
}

/**
 * Teks wajib: string (bentuk), ≤ maks (bentuk), tidak kosong (kelengkapan),
 * pembatas rumus valid (kelengkapan). Mengembalikan teks bila string.
 */
function cekTeks(
  e: Pengumpul,
  field: string,
  value: unknown,
  opsi: { label: string; maks: number; min?: number; wajib?: boolean },
): string | null {
  if (value === undefined || value === null) {
    if (opsi.wajib !== false) e.lengkap(field, `${opsi.label} belum diisi.`);
    return null;
  }
  if (typeof value !== "string") {
    e.bentuk(field, `${opsi.label} harus berupa teks.`);
    return null;
  }
  if (panjangKarakter(value) > opsi.maks) {
    e.bentuk(field, `${opsi.label} terlalu panjang (maks. ${opsi.maks} karakter).`);
  }
  const panjang = panjangTrim(value);
  if (opsi.wajib !== false && panjang === 0) {
    e.lengkap(field, `${opsi.label} belum diisi.`);
  } else if (opsi.min && panjang > 0 && panjang < opsi.min) {
    e.lengkap(field, `${opsi.label} terlalu pendek (min. ${opsi.min} karakter).`);
  }
  const rumus = cekPembatasRumus(value);
  if (rumus) e.lengkap(field, rumus);
  return value;
}

/** Array dengan batas maks (bentuk) & min (kelengkapan). null bila bukan array. */
function cekArray(
  e: Pengumpul,
  field: string,
  value: unknown,
  opsi: { label: string; min: number; maks: number },
): unknown[] | null {
  if (value === undefined || value === null) {
    e.lengkap(field, `${opsi.label} belum diisi (minimal ${opsi.min}).`);
    return null;
  }
  if (!Array.isArray(value)) {
    e.bentuk(field, `${opsi.label} harus berupa daftar.`);
    return null;
  }
  if (value.length > opsi.maks) e.bentuk(field, `${opsi.label} terlalu banyak (maks. ${opsi.maks}).`);
  if (value.length < opsi.min) e.lengkap(field, `${opsi.label} kurang (minimal ${opsi.min}).`);
  return value;
}

/** Id bagian (pernyataan/rumpang): pola & unik. Mengembalikan id valid. */
function cekIdBagian(e: Pengumpul, field: string, value: unknown, sudahAda: Set<string>): string | null {
  if (typeof value !== "string" || !POLA_ID_BAGIAN.test(value)) {
    e.bentuk(field, "Id tidak valid (huruf kecil/angka/_, diawali huruf, maks. 20).");
    return null;
  }
  if (sudahAda.has(value)) {
    e.bentuk(field, `Id "${value}" dipakai lebih dari sekali.`);
    return null;
  }
  sudahAda.add(value);
  return value;
}

// ============================================================================
// SOAL
// ============================================================================

export function validasiSoal(input: unknown, mode: ModeValidasi = "ajukan"): ErrorValidasi[] {
  const e = new Pengumpul();
  if (!isObjek(input)) {
    e.bentuk("", "Data soal tidak valid.");
    return e.hasil(mode);
  }

  if (input.subtes_kategori !== undefined && !isSubtesSnbt(input.subtes_kategori)) {
    e.bentuk("subtes_id", "Studio Soal baru bisa dipakai untuk subtes SNBT.");
  }

  const tipe = input.tipe;
  if (typeof tipe !== "string" || !(TIPE_SOAL as readonly string[]).includes(tipe)) {
    e.bentuk("tipe", "Tipe soal tidak dikenal.");
    return e.hasil(mode);
  }

  const redaksi = cekTeks(e, "redaksi", input.redaksi, { label: "Teks soal", maks: BATAS.redaksiMaks });
  cekTeks(e, "pembahasan", input.pembahasan, {
    label: "Pembahasan",
    maks: BATAS.pembahasanMaks,
    min: BATAS.pembahasanMin,
  });

  if (
    typeof input.tingkat_kesulitan !== "string" ||
    !(TINGKAT_KESULITAN as readonly string[]).includes(input.tingkat_kesulitan)
  ) {
    e.bentuk("tingkat_kesulitan", "Pilih tingkat kesulitan.");
  }
  if (
    input.level_kognitif !== undefined &&
    input.level_kognitif !== null &&
    !isBulatDalam(input.level_kognitif, BATAS.levelKognitifMin, BATAS.levelKognitifMaks)
  ) {
    e.bentuk("level_kognitif", "Level kognitif harus 1, 2, atau 3.");
  }
  if (
    input.estimasi_waktu_detik !== undefined &&
    input.estimasi_waktu_detik !== null &&
    !isBulatDalam(input.estimasi_waktu_detik, BATAS.estimasiDetikMin, BATAS.estimasiDetikMaks)
  ) {
    e.bentuk(
      "estimasi_waktu_detik",
      `Perkiraan waktu harus angka bulat ${BATAS.estimasiDetikMin}–${BATAS.estimasiDetikMaks} detik.`,
    );
  }
  if (input.sumber_rujukan !== undefined && input.sumber_rujukan !== null) {
    cekTeks(e, "sumber_rujukan", input.sumber_rujukan, {
      label: "Sumber soal",
      maks: BATAS.sumberRujukanMaks,
      min: BATAS.sumberRujukanMin,
      wajib: false,
    });
  }

  const adaStimulus = input.stimulus_id !== undefined && input.stimulus_id !== null;
  const adaUrutan = input.urutan_dalam_stimulus !== undefined && input.urutan_dalam_stimulus !== null;
  if (adaStimulus !== adaUrutan) {
    e.bentuk("urutan_dalam_stimulus", "Soal berstimulus wajib punya urutan, soal mandiri tidak.");
  } else if (adaUrutan && !isBulatDalam(input.urutan_dalam_stimulus, 1, 50)) {
    e.bentuk("urutan_dalam_stimulus", "Urutan dalam stimulus harus 1–50.");
  }

  const konten = input.konten;
  const kunci = input.kunci;
  if (!isObjek(konten)) e.bentuk("konten", "Konten soal tidak valid.");
  if (!isObjek(kunci)) e.bentuk("kunci", "Kunci jawaban tidak valid.");
  if (!isObjek(konten) || !isObjek(kunci)) return e.hasil(mode);

  if (tipe === "pilihan_ganda") validasiPilihanGanda(e, konten, kunci);
  else if (tipe === "majemuk_kompleks") validasiMajemuk(e, konten, kunci);
  else validasiIsian(e, redaksi ?? "", konten, kunci);

  return e.hasil(mode);
}

function validasiPilihanGanda(e: Pengumpul, konten: Record<string, unknown>, kunci: Record<string, unknown>) {
  const opsi = cekArray(e, "konten.opsi", konten.opsi, {
    label: "Pilihan jawaban",
    min: LABEL_OPSI.length,
    maks: LABEL_OPSI.length,
  });
  if (opsi) {
    const terlihat = new Map<string, number>();
    opsi.forEach((item, i) => {
      const field = `konten.opsi.${i}`;
      if (!isObjek(item)) {
        e.bentuk(field, "Opsi tidak valid.");
        return;
      }
      if (item.label !== LABEL_OPSI[i]) {
        e.bentuk(`${field}.label`, `Opsi ke-${i + 1} harus berlabel ${LABEL_OPSI[i] ?? "A–E"}.`);
      }
      const teks = cekTeks(e, `${field}.teks`, item.teks, {
        label: `Pilihan ${LABEL_OPSI[i] ?? i + 1}`,
        maks: BATAS.opsiTeksMaks,
      });
      if (teks && panjangTrim(teks) > 0) {
        const kunciTeks = normalisasiTeks(teks);
        const sebelumnya = terlihat.get(kunciTeks);
        if (sebelumnya !== undefined) {
          e.lengkap(`${field}.teks`, `Pilihan ${LABEL_OPSI[i]} sama dengan pilihan ${LABEL_OPSI[sebelumnya]}.`);
        } else {
          terlihat.set(kunciTeks, i);
        }
      }
    });
  }

  if (kunci.opsi === undefined || kunci.opsi === null) {
    e.lengkap("kunci.opsi", "Pilih satu jawaban benar (A–E).");
  } else if (typeof kunci.opsi !== "string" || !(LABEL_OPSI as readonly string[]).includes(kunci.opsi)) {
    e.bentuk("kunci.opsi", "Jawaban benar harus salah satu dari A–E.");
  }
}

function validasiMajemuk(e: Pengumpul, konten: Record<string, unknown>, kunci: Record<string, unknown>) {
  const label = konten.label_kolom;
  if (label === undefined || label === null) {
    e.lengkap("konten.label_kolom", "Isi kedua label kolom jawaban.");
  } else if (!Array.isArray(label) || label.length !== 2) {
    e.bentuk("konten.label_kolom", "Label kolom harus tepat dua.");
  } else {
    const [kiri, kanan] = label.map((l, i) =>
      cekTeks(e, `konten.label_kolom.${i}`, l, { label: `Label kolom ${i + 1}`, maks: BATAS.labelKolomMaks }),
    );
    if (kiri && kanan && panjangTrim(kiri) > 0 && normalisasiTeks(kiri) === normalisasiTeks(kanan)) {
      e.lengkap("konten.label_kolom.1", "Dua label kolom tidak boleh sama.");
    }
  }

  const pernyataan = cekArray(e, "konten.pernyataan", konten.pernyataan, {
    label: "Pernyataan",
    min: BATAS.pernyataanMin,
    maks: BATAS.pernyataanMaks,
  });
  const ids: string[] = [];
  if (pernyataan) {
    const sudahAda = new Set<string>();
    pernyataan.forEach((item, i) => {
      const field = `konten.pernyataan.${i}`;
      if (!isObjek(item)) {
        e.bentuk(field, "Pernyataan tidak valid.");
        return;
      }
      const id = cekIdBagian(e, `${field}.id`, item.id, sudahAda);
      if (id) ids.push(id);
      cekTeks(e, `${field}.teks`, item.teks, { label: `Pernyataan ${i + 1}`, maks: BATAS.pernyataanTeksMaks });
    });
  }

  const perBaris = kunci.per_baris;
  if (perBaris === undefined || perBaris === null) {
    if (ids.length > 0) e.lengkap("kunci.per_baris", "Pilih jawaban benar untuk setiap pernyataan.");
    return;
  }
  if (!isObjek(perBaris)) {
    e.bentuk("kunci.per_baris", "Kunci per baris tidak valid.");
    return;
  }
  for (const [id, nilai] of Object.entries(perBaris)) {
    if (nilai !== 0 && nilai !== 1) e.bentuk(`kunci.per_baris.${id}`, "Kunci baris harus kolom 1 atau 2.");
    if (!ids.includes(id)) e.lengkap(`kunci.per_baris.${id}`, "Ada kunci untuk pernyataan yang sudah tidak ada.");
  }
  ids.forEach((id) => {
    if (!(id in perBaris)) e.lengkap(`kunci.per_baris.${id}`, "Jawaban benar pernyataan ini belum dipilih.");
  });
}

/** Penanda rumpang di redaksi: {{id}}. */
const POLA_PENANDA = /\{\{([^{}]*)\}\}/g;

function validasiIsian(
  e: Pengumpul,
  redaksi: string,
  konten: Record<string, unknown>,
  kunci: Record<string, unknown>,
) {
  const rumpang = cekArray(e, "konten.rumpang", konten.rumpang, {
    label: "Kotak jawaban",
    min: BATAS.rumpangMin,
    maks: BATAS.rumpangMaks,
  });
  const jenisPerId = new Map<string, JenisRumpang>();
  if (rumpang) {
    const sudahAda = new Set<string>();
    rumpang.forEach((item, i) => {
      const field = `konten.rumpang.${i}`;
      if (!isObjek(item)) {
        e.bentuk(field, "Kotak jawaban tidak valid.");
        return;
      }
      const id = cekIdBagian(e, `${field}.id`, item.id, sudahAda);
      if (typeof item.jenis !== "string" || !(JENIS_RUMPANG as readonly string[]).includes(item.jenis)) {
        e.bentuk(`${field}.jenis`, "Jenis kotak jawaban harus teks atau angka.");
      } else if (id) {
        jenisPerId.set(id, item.jenis as JenisRumpang);
      }
    });
  }

  // Penanda di redaksi <-> daftar rumpang (dua arah, tepat sekali).
  const hitungPenanda = new Map<string, number>();
  for (const cocok of redaksi.matchAll(POLA_PENANDA)) {
    const id = cocok[1];
    if (!POLA_ID_BAGIAN.test(id)) {
      e.lengkap("redaksi", `Tanda kotak jawaban "{{${id}}}" tidak valid.`);
      continue;
    }
    hitungPenanda.set(id, (hitungPenanda.get(id) ?? 0) + 1);
  }
  const sisa = redaksi.replace(POLA_PENANDA, "");
  if (sisa.includes("{{") || sisa.includes("}}")) {
    e.lengkap("redaksi", "Ada tanda kotak jawaban yang tidak lengkap: {{ atau }} tanpa pasangannya.");
  }
  for (const [id, jumlah] of hitungPenanda) {
    if (!jenisPerId.has(id)) e.lengkap("redaksi", `Tanda {{${id}}} tidak punya kotak jawaban.`);
    if (jumlah > 1) e.lengkap("redaksi", `Tanda {{${id}}} muncul ${jumlah} kali, harusnya sekali.`);
  }
  for (const id of jenisPerId.keys()) {
    if (!hitungPenanda.has(id)) e.lengkap("redaksi", `Kotak jawaban "${id}" belum ditaruh di teks soal ({{${id}}}).`);
  }

  // Kunci per rumpang.
  const kunciRumpang = kunci.rumpang;
  if (kunciRumpang === undefined || kunciRumpang === null) {
    if (jenisPerId.size > 0) e.lengkap("kunci.rumpang", "Isi jawaban benar untuk setiap kotak jawaban.");
    return;
  }
  if (!isObjek(kunciRumpang)) {
    e.bentuk("kunci.rumpang", "Jawaban kotak tidak valid.");
    return;
  }
  for (const id of Object.keys(kunciRumpang)) {
    if (!jenisPerId.has(id)) e.lengkap(`kunci.rumpang.${id}`, "Ada jawaban untuk kotak yang sudah dihapus.");
  }
  for (const [id, jenis] of jenisPerId) {
    validasiKunciRumpang(e, `kunci.rumpang.${id}`, jenis, kunciRumpang[id]);
  }
}

function validasiKunciRumpang(e: Pengumpul, field: string, jenis: JenisRumpang, kunci: unknown) {
  if (kunci === undefined || kunci === null) {
    e.lengkap(field, "Isi minimal satu jawaban benar.");
    return;
  }
  if (!isObjek(kunci)) {
    e.bentuk(field, "Jawaban kotak tidak valid.");
    return;
  }
  const diterima = cekArray(e, `${field}.diterima`, kunci.diterima, {
    label: "Jawaban benar",
    min: BATAS.jawabanDiterimaMin,
    maks: BATAS.jawabanDiterimaMaks,
  });
  if (diterima) {
    const teksTerlihat = new Set<string>();
    const angkaTerlihat: Pecahan[] = [];
    diterima.forEach((jawaban, i) => {
      const f = `${field}.diterima.${i}`;
      if (typeof jawaban !== "string") {
        e.bentuk(f, "Jawaban harus berupa teks.");
        return;
      }
      if (panjangKarakter(jawaban) > BATAS.jawabanTeksMaks) {
        e.bentuk(f, `Jawaban maksimal ${BATAS.jawabanTeksMaks} karakter.`);
      }
      if (panjangTrim(jawaban) === 0) {
        e.lengkap(f, "Jawaban tidak boleh kosong.");
        return;
      }
      if (jenis === "angka") {
        const nilai = parseAngka(jawaban);
        if (!nilai) {
          e.lengkap(f, "Angka tidak terbaca. Pakai bilangan bulat, desimal (koma/titik), atau pecahan a/b, tanpa titik ribuan.");
        } else if (angkaTerlihat.some((x) => samaPecahan(x, nilai))) {
          e.lengkap(f, "Nilai jawaban ini sama dengan jawaban lain.");
        } else {
          angkaTerlihat.push(nilai);
        }
      } else {
        const norm = normalisasiTeks(jawaban);
        if (teksTerlihat.has(norm)) e.lengkap(f, "Jawaban ini sama dengan jawaban lain.");
        teksTerlihat.add(norm);
      }
    });
  }

  if (kunci.toleransi !== undefined && kunci.toleransi !== null) {
    if (jenis !== "angka") {
      e.bentuk(`${field}.toleransi`, "Batas selisih hanya untuk kotak jawaban angka.");
    } else {
      const t = parseAngka(kunci.toleransi);
      if (!t || !isNonNegatif(t)) e.bentuk(`${field}.toleransi`, "Batas selisih harus angka 0 atau lebih.");
    }
  }
}

// ============================================================================
// STIMULUS
// ============================================================================

export function validasiStimulus(input: unknown, mode: ModeValidasi = "ajukan"): ErrorValidasi[] {
  const e = new Pengumpul();
  if (!isObjek(input)) {
    e.bentuk("", "Data bacaan tidak terbaca.");
    return e.hasil(mode);
  }
  if (input.subtes_kategori !== undefined && !isSubtesSnbt(input.subtes_kategori)) {
    e.bentuk("subtes_id", "Studio Soal baru bisa dipakai untuk subtes SNBT.");
  }

  // Judul internal di-CHECK di semua status -> error bentuk.
  if (typeof input.judul_internal !== "string") {
    e.bentuk("judul_internal", "Judul bacaan belum diisi.");
  } else {
    const p = panjangTrim(input.judul_internal);
    if (p < BATAS.stimulusJudulMin || panjangKarakter(input.judul_internal) > BATAS.stimulusJudulMaks) {
      e.bentuk(
        "judul_internal",
        `Judul bacaan harus ${BATAS.stimulusJudulMin}–${BATAS.stimulusJudulMaks} karakter.`,
      );
    }
  }

  // Atribusi WAJIB untuk stimulus (K4): "Buatan sendiri" atau nama sumber.
  cekTeks(e, "sumber_rujukan", input.sumber_rujukan, {
    label: 'Sumber bacaan (tulis "Buatan sendiri" atau nama sumbernya)',
    maks: BATAS.sumberRujukanMaks,
    min: BATAS.sumberRujukanMin,
  });

  const konten = input.konten;
  if (!isObjek(konten)) {
    e.bentuk("konten", "Isi bacaan tidak terbaca.");
    return e.hasil(mode);
  }
  const blok = cekArray(e, "konten.blok", konten.blok, { label: "Isi bacaan", min: 1, maks: BATAS.stimulusBlokMaks });
  blok?.forEach((item, i) => validasiBlok(e, `konten.blok.${i}`, item));
  return e.hasil(mode);
}

function validasiBlok(e: Pengumpul, field: string, blok: unknown) {
  if (!isObjek(blok)) {
    e.bentuk(field, "Blok tidak valid.");
    return;
  }
  if (blok.jenis === "teks") {
    cekTeks(e, `${field}.teks`, blok.teks, { label: "Teks bacaan", maks: BATAS.stimulusTeksMaks });
    return;
  }
  if (blok.jenis === "gambar") {
    e.bentuk(`${field}.jenis`, "Gambar di bacaan belum bisa dipakai.");
    return;
  }
  if (blok.jenis !== "tabel") {
    e.bentuk(`${field}.jenis`, "Jenis blok harus teks atau tabel.");
    return;
  }

  if (blok.judul !== undefined && blok.judul !== null) {
    cekTeks(e, `${field}.judul`, blok.judul, { label: "Judul tabel", maks: BATAS.stimulusJudulMaks, wajib: false });
  }
  const kepala = cekArray(e, `${field}.kepala`, blok.kepala, {
    label: "Kolom tabel",
    min: 1,
    maks: BATAS.tabelKolomMaks,
  });
  kepala?.forEach((sel, k) =>
    cekTeks(e, `${field}.kepala.${k}`, sel, { label: `Judul kolom ${k + 1}`, maks: BATAS.tabelSelMaks }),
  );
  const baris = cekArray(e, `${field}.baris`, blok.baris, {
    label: "Baris tabel",
    min: 1,
    maks: BATAS.tabelBarisMaks,
  });
  baris?.forEach((row, b) => {
    const f = `${field}.baris.${b}`;
    if (!Array.isArray(row)) {
      e.bentuk(f, "Baris tabel tidak valid.");
      return;
    }
    if (kepala && row.length !== kepala.length) {
      e.bentuk(f, `Baris ${b + 1} harus punya ${kepala.length} sel.`);
    }
    row.forEach((sel, k) => {
      // Sel boleh kosong (tabel data kadang punya sel kosong), tapi harus teks.
      cekTeks(e, `${f}.${k}`, sel, { label: `Sel baris ${b + 1}`, maks: BATAS.tabelSelMaks, wajib: false });
    });
  });
}

// ============================================================================
// PAKET
// ============================================================================

export interface PaketInput {
  subtes_kategori?: string | null;
  judul: unknown;
  deskripsi?: unknown;
  durasi_menit?: unknown;
}

/** Metadata paket — semua di-CHECK di DB di status apa pun, jadi selalu "bentuk". */
export function validasiPaket(input: PaketInput): ErrorValidasi[] {
  const e = new Pengumpul();
  if (input.subtes_kategori !== undefined && !isSubtesSnbt(input.subtes_kategori)) {
    e.bentuk("subtes_id", "Studio Soal baru bisa dipakai untuk subtes SNBT.");
  }
  if (typeof input.judul !== "string") {
    e.bentuk("judul", "Judul paket wajib diisi.");
  } else {
    const p = panjangTrim(input.judul);
    if (p < BATAS.paketJudulMin || panjangKarakter(input.judul) > BATAS.paketJudulMaks) {
      e.bentuk("judul", `Judul paket ${BATAS.paketJudulMin}–${BATAS.paketJudulMaks} karakter.`);
    }
  }
  if (input.deskripsi !== undefined && input.deskripsi !== null) {
    if (typeof input.deskripsi !== "string" || panjangKarakter(input.deskripsi) > BATAS.paketDeskripsiMaks) {
      e.bentuk("deskripsi", `Deskripsi maksimal ${BATAS.paketDeskripsiMaks} karakter.`);
    }
  }
  if (
    input.durasi_menit !== undefined &&
    input.durasi_menit !== null &&
    !isBulatDalam(input.durasi_menit, BATAS.paketDurasiMin, BATAS.paketDurasiMaks)
  ) {
    e.bentuk("durasi_menit", `Durasi ${BATAS.paketDurasiMin}–${BATAS.paketDurasiMaks} menit.`);
  }
  return e.daftar;
}

export interface ItemPaket {
  soal_id: string;
  subtes_id: string;
  stimulus_id: string | null;
}

/**
 * Urutan isi paket — cerminan studio_soal_simpan_item_paket (DB tetap
 * memeriksa ulang, termasuk status & kepemilikan soal yang tidak diketahui di
 * sini). Paket kosong boleh disimpan (draf) tapi tidak boleh diajukan.
 */
export function validasiUrutanPaket(
  items: ItemPaket[],
  paketSubtesId: string,
  mode: ModeValidasi = "ajukan",
): ErrorValidasi[] {
  const e = new Pengumpul();
  if (items.length > BATAS.paketSoalMaks) e.bentuk("item", `Paket maksimal ${BATAS.paketSoalMaks} soal.`);
  if (items.length === 0) e.lengkap("item", "Paket belum berisi soal.");

  const terlihat = new Set<string>();
  const posisiStimulus = new Map<string, number[]>();
  items.forEach((item, i) => {
    if (terlihat.has(item.soal_id)) e.bentuk(`item.${i}`, "Soal yang sama dimasukkan dua kali.");
    terlihat.add(item.soal_id);
    if (item.subtes_id !== paketSubtesId) e.bentuk(`item.${i}`, "Soal berasal dari subtes lain.");
    if (item.stimulus_id) {
      const daftar = posisiStimulus.get(item.stimulus_id) ?? [];
      daftar.push(i);
      posisiStimulus.set(item.stimulus_id, daftar);
    }
  });
  for (const posisi of posisiStimulus.values()) {
    if (posisi[posisi.length - 1] - posisi[0] + 1 !== posisi.length) {
      e.bentuk(`item.${posisi[0]}`, "Soal yang memakai stimulus yang sama harus berurutan (satu blok).");
    }
  }
  return e.hasil(mode);
}

// ============================================================================
// ALASAN TOLAK
// ============================================================================

/** null = valid. Dipangkas dulu, dihitung per karakter (BR-37: min. 10). */
export function validasiAlasanTolak(value: unknown): string | null {
  if (typeof value !== "string") return `Alasan tolak wajib diisi (min. ${BATAS.alasanTolakMin} karakter).`;
  const panjang = panjangTrim(value);
  if (panjang < BATAS.alasanTolakMin) return `Alasan tolak wajib diisi (min. ${BATAS.alasanTolakMin} karakter).`;
  if (panjang > BATAS.alasanTolakMaks) return `Alasan tolak maksimal ${BATAS.alasanTolakMaks} karakter.`;
  return null;
}
