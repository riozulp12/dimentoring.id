/**
 * Penilaian jawaban Studio Soal — FUNGSI MURNI (tanpa DB/server), dipakai
 * server Tahap 2 saat siswa mengirim jawaban. Penilaian tetap dihitung di
 * server; modul ini tidak pernah perlu dikirim ke browser siswa bersama kunci.
 *
 * Aturan default 'semua_benar': soal benar hanya bila SEMUA bagiannya benar
 * (majemuk: semua baris; isian: semua rumpang). `bagian` mencatat status per
 * opsi/baris/rumpang — dasar skor parsial nanti ('parsial_per_bagian') tanpa
 * migrasi destruktif.
 *
 * Jawaban yang tidak berbentuk benar / kosong / tipe salah dianggap salah dan
 * TIDAK melempar error. Yang melempar error hanya kesalahan pemrogram: tipe
 * soal atau aturan_skor yang tidak dikenal, bobot tidak valid.
 */
import { dalamToleransi, parseAngka, samaPecahan } from "./angka";
import { normalisasiTeks } from "./teks";
import { ATURAN_SKOR, type JenisRumpang, type TipeSoal } from "./tipe";

export interface SoalUntukDinilai {
  tipe: TipeSoal | string;
  konten: unknown;
  kunci: unknown;
  aturan_skor?: string | null;
  bobot?: number | string | null;
}

export interface BagianNilai {
  /** "opsi" (PG), id pernyataan (majemuk), atau id rumpang (isian). */
  id: string;
  benar: boolean;
}

export interface HasilNilai {
  benar: boolean;
  /** 0 atau bobot soal (aturan 'semua_benar'). */
  skor: number;
  bagian: BagianNilai[];
}

function objek(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function daftar(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function bacaBobot(bobot: SoalUntukDinilai["bobot"]): number {
  if (bobot === undefined || bobot === null) return 1;
  const n = typeof bobot === "string" ? Number(bobot) : bobot;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`nilaiJawaban: bobot tidak valid (${String(bobot)})`);
  return n;
}

/** Cocokkan satu jawaban isian dengan daftar jawaban diterima. */
export function cocokRumpang(
  jenis: JenisRumpang,
  jawaban: unknown,
  diterima: unknown[],
  toleransi?: unknown,
): boolean {
  if (typeof jawaban !== "string") return false;

  if (jenis === "angka") {
    const nilai = parseAngka(jawaban);
    if (!nilai) return false;
    const t = toleransi === undefined || toleransi === null ? null : parseAngka(toleransi);
    return diterima.some((d) => {
      const kunci = parseAngka(d);
      if (!kunci) return false;
      return t ? dalamToleransi(nilai, kunci, t) : samaPecahan(nilai, kunci);
    });
  }

  const norm = normalisasiTeks(jawaban);
  if (norm.length === 0) return false;
  return diterima.some((d) => typeof d === "string" && normalisasiTeks(d) === norm);
}

function nilaiBagian(soal: SoalUntukDinilai, jawaban: unknown): BagianNilai[] {
  const konten = objek(soal.konten) ?? {};
  const kunci = objek(soal.kunci) ?? {};
  const jwb = objek(jawaban) ?? {};

  switch (soal.tipe) {
    case "pilihan_ganda": {
      const benarOpsi = typeof kunci.opsi === "string" && jwb.opsi === kunci.opsi;
      return [{ id: "opsi", benar: benarOpsi }];
    }
    case "majemuk_kompleks": {
      const kunciBaris = objek(kunci.per_baris) ?? {};
      const jawabBaris = objek(jwb.per_baris) ?? {};
      return daftar(konten.pernyataan).flatMap((p) => {
        const id = objek(p)?.id;
        if (typeof id !== "string") return [];
        const k = kunciBaris[id];
        const benar = (k === 0 || k === 1) && jawabBaris[id] === k;
        return [{ id, benar }];
      });
    }
    case "isian": {
      const kunciRumpang = objek(kunci.rumpang) ?? {};
      const jawabRumpang = objek(jwb.rumpang) ?? {};
      return daftar(konten.rumpang).flatMap((r) => {
        const rumpang = objek(r);
        const id = rumpang?.id;
        if (typeof id !== "string") return [];
        const jenis: JenisRumpang = rumpang?.jenis === "angka" ? "angka" : "teks";
        const k = objek(kunciRumpang[id]);
        const benar = k ? cocokRumpang(jenis, jawabRumpang[id], daftar(k.diterima), k.toleransi) : false;
        return [{ id, benar }];
      });
    }
    default:
      throw new Error(`nilaiJawaban: tipe soal tidak dikenal (${String(soal.tipe)})`);
  }
}

export function nilaiJawaban(soal: SoalUntukDinilai, jawaban: unknown): HasilNilai {
  const aturan = soal.aturan_skor ?? "semua_benar";
  if (!(ATURAN_SKOR as readonly string[]).includes(aturan)) {
    throw new Error(`nilaiJawaban: aturan_skor tidak dikenal (${aturan})`);
  }
  const bobot = bacaBobot(soal.bobot);
  const bagian = nilaiBagian(soal, jawaban);
  // Soal tanpa bagian (data rusak) tidak boleh dianggap benar — every([]) = true.
  const benar = bagian.length > 0 && bagian.every((b) => b.benar);
  return { benar, skor: benar ? bobot : 0, bagian };
}
