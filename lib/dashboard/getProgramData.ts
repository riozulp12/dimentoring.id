import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { formatJadwal } from "@/lib/shared/formatJadwal";
import {
  PROGRAM_KATEGORI_LABEL,
  PROGRAM_KATEGORI_ORDER,
  PROGRAM_KATEGORI_SLUG,
  TINGKAT_KELAS_LABEL,
  TIPE_KELAS_LABEL,
  type ProgramKategori,
} from "@/lib/shared/kelasLabels";

/**
 * Data layer halaman publik /program (PRD Bagian 4.3 poin 5, 7.5.4) — 5
 * kategori bisnis kelas, terpisah dari lib/admin/getKelolaKelasData.ts yang
 * khusus Admin (butuh field CRUD, bukan cuma tampilan publik).
 */

export interface KelasCardPreview {
  id: string;
  nama: string;
  tipeKelas: string;
  tipeKelasLabel: string;
  harga: number;
  mentorNama: string | null;
}

export interface ProgramSection {
  kategori: ProgramKategori;
  kategoriLabel: string;
  slug: string;
  items: KelasCardPreview[];
}

type NamaJoin = { nama: string } | { nama: string }[] | null;

function firstNama(value: NamaJoin): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.nama ?? null;
}

interface KelasCardRow {
  id: string;
  nama: string;
  tipe_kelas: string;
  harga: number;
  mentor: NamaJoin;
}

function toCardPreview(row: KelasCardRow): KelasCardPreview {
  return {
    id: row.id,
    nama: row.nama,
    tipeKelas: row.tipe_kelas,
    tipeKelasLabel: TIPE_KELAS_LABEL[row.tipe_kelas] ?? row.tipe_kelas,
    harga: Number(row.harga),
    mentorNama: firstNama(row.mentor),
  };
}

/** Preview tiap kategori (max 4 terbaru) — dipakai app/program/page.tsx. Cuma
 * kategori yang punya isi yang dikembalikan (section kosong disembunyikan,
 * bukan tampil kosong — PRD 7.5.4). */
export async function getProgramPreviewSections(): Promise<ProgramSection[]> {
  const results = await Promise.all(
    PROGRAM_KATEGORI_ORDER.map(async (kategori) => {
      const { data, error } = await supabaseServer
        .from("kelas")
        .select("id, nama, tipe_kelas, harga, mentor:mentor_id(nama)")
        .eq("program_kategori", kategori)
        .order("created_at", { ascending: false })
        .limit(4);

      if (error) {
        console.error(`[getProgramPreviewSections] query kategori=${kategori} failed:`, error);
        return null;
      }

      const items = ((data ?? []) as unknown as KelasCardRow[]).map(toCardPreview);
      if (items.length === 0) return null;

      return {
        kategori,
        kategoriLabel: PROGRAM_KATEGORI_LABEL[kategori],
        slug: PROGRAM_KATEGORI_SLUG[kategori],
        items,
      };
    }),
  );

  return results.filter((section): section is ProgramSection => section !== null);
}

export interface KelasGridFilters {
  tipeKelas?: string;
  tingkatKelas?: string;
}

/** Grid penuh 1 kategori (app/program/[kategori]/page.tsx) — filter opsional
 * Tipe Kelas & Tingkat Kelas. */
export async function getKelasByKategori(
  kategori: ProgramKategori,
  filters: KelasGridFilters = {},
): Promise<KelasCardPreview[]> {
  let query = supabaseServer
    .from("kelas")
    .select("id, nama, tipe_kelas, harga, mentor:mentor_id(nama)")
    .eq("program_kategori", kategori)
    .order("created_at", { ascending: false });

  if (filters.tipeKelas) query = query.eq("tipe_kelas", filters.tipeKelas);
  if (filters.tingkatKelas) query = query.eq("tingkat_kelas", filters.tingkatKelas);

  const { data, error } = await query;

  if (error) {
    console.error(`[getKelasByKategori] query kategori=${kategori} failed:`, error);
    return [];
  }

  return ((data ?? []) as unknown as KelasCardRow[]).map(toCardPreview);
}

export interface KelasDetailPublic {
  id: string;
  nama: string;
  programKategori: ProgramKategori;
  programKategoriLabel: string;
  subtesNama: string | null;
  tipeKelas: string;
  tipeKelasLabel: string;
  tingkatKelas: string;
  tingkatKelasLabel: string;
  deskripsi: string | null;
  harga: number;
  jadwalDisplay: string;
  mentorNama: string | null;
}

/** Detail publik 1 kelas (app/program/kelas/[kelasId]/page.tsx). */
export async function getKelasDetailPublic(kelasId: string): Promise<KelasDetailPublic | null> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      `id, nama, program_kategori, tipe_kelas, tingkat_kelas, deskripsi, harga, jadwal,
       subtes:subtes_id(nama),
       mentor:mentor_id(nama)`,
    )
    .eq("id", kelasId)
    .maybeSingle();

  if (error) {
    console.error("[getKelasDetailPublic] query failed:", error);
    return null;
  }
  if (!data) return null;

  type Row = {
    id: string;
    nama: string;
    program_kategori: ProgramKategori;
    tipe_kelas: string;
    tingkat_kelas: string;
    deskripsi: string | null;
    harga: number;
    jadwal: unknown;
    subtes: NamaJoin;
    mentor: NamaJoin;
  };
  const row = data as unknown as Row;

  return {
    id: row.id,
    nama: row.nama,
    programKategori: row.program_kategori,
    programKategoriLabel: PROGRAM_KATEGORI_LABEL[row.program_kategori] ?? row.program_kategori,
    subtesNama: firstNama(row.subtes),
    tipeKelas: row.tipe_kelas,
    tipeKelasLabel: TIPE_KELAS_LABEL[row.tipe_kelas] ?? row.tipe_kelas,
    tingkatKelas: row.tingkat_kelas,
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[row.tingkat_kelas] ?? row.tingkat_kelas,
    deskripsi: row.deskripsi,
    harga: Number(row.harga),
    jadwalDisplay: formatJadwal(row.jadwal),
    mentorNama: firstNama(row.mentor),
  };
}
