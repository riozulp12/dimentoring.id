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

export const KELAS_CARD_SELECT =
  "id, nama, tipe_kelas, harga, kapasitas, deskripsi, program_kategori, tingkat_kelas, subtes:subtes_id(nama), mentor:mentor_id(nama)";

/**
 * Data layer halaman publik /program (PRD Bagian 4.3 poin 5, 7.5.4) — 5
 * kategori bisnis kelas, terpisah dari lib/admin/getKelolaKelasData.ts yang
 * khusus Admin (butuh field CRUD, bukan cuma tampilan publik).
 */

export interface DiskonAktif {
  label: string;
}

export interface KelasCardPreview {
  id: string;
  nama: string;
  tipeKelas: string;
  tipeKelasLabel: string;
  harga: number;
  mentorNama: string | null;
  diskonAktif: DiskonAktif | null;
  kapasitas: number;
  sisaSlot: number;
  deskripsi: string | null;
  programKategori: string;
  tingkatKelas: string;
  subtesNama: string | null;
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

export interface KelasCardRow {
  id: string;
  nama: string;
  tipe_kelas: string;
  harga: number;
  kapasitas: number;
  deskripsi: string | null;
  program_kategori: string;
  tingkat_kelas: string;
  subtes: NamaJoin;
  mentor: NamaJoin;
}

export function toCardPreview(row: KelasCardRow, diskonAktif: DiskonAktif | null, sisaSlot: number): KelasCardPreview {
  return {
    id: row.id,
    nama: row.nama,
    tipeKelas: row.tipe_kelas,
    tipeKelasLabel: TIPE_KELAS_LABEL[row.tipe_kelas] ?? row.tipe_kelas,
    harga: Number(row.harga),
    mentorNama: firstNama(row.mentor),
    diskonAktif,
    kapasitas: row.kapasitas,
    sisaSlot,
    deskripsi: row.deskripsi,
    programKategori: row.program_kategori,
    tingkatKelas: row.tingkat_kelas,
    subtesNama: firstNama(row.subtes),
  };
}

/** Sisa slot per kelas (PRD Bagian 13 `enrollments`, kolom `kapasitas` di
 * `kelas`) — kapasitas dikurangi jumlah enrollment `status_pembayaran='lunas'`.
 * Dipakai buat badge kuota "Tersisa X Slot!"/"Kelas Penuh" di KelasCardVisual. */
export async function getSisaSlotByKelasId(
  kelasIds: string[],
  kapasitasById: Map<string, number>,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (kelasIds.length === 0) return result;

  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("kelas_id")
    .eq("status_pembayaran", "lunas")
    .in("kelas_id", kelasIds);

  if (error) {
    console.error("[getSisaSlotByKelasId] query enrollments failed:", error);
  }

  const lunasCount = new Map<string, number>();
  for (const row of (data ?? []) as { kelas_id: string }[]) {
    lunasCount.set(row.kelas_id, (lunasCount.get(row.kelas_id) ?? 0) + 1);
  }

  for (const kelasId of kelasIds) {
    const kapasitas = kapasitasById.get(kelasId) ?? 0;
    result.set(kelasId, kapasitas - (lunasCount.get(kelasId) ?? 0));
  }

  return result;
}

interface ActivePromoRow {
  id: string;
  tipe_diskon: "persen" | "nominal";
  nilai_diskon: number;
  berlaku_semua_kelas: boolean;
}

function formatDiskonLabel(tipe: "persen" | "nominal", nilai: number): string {
  return tipe === "persen"
    ? `Diskon ${Math.round(nilai)}%`
    : `Diskon Rp${Math.round(nilai).toLocaleString("id-ID")}`;
}

/** Kode promo aktif per kelas (PRD Bagian 13, db/schema.sql `kode_promo` +
 * `kode_promo_kelas`) — dipakai buat badge ribbon diskon di card Kelas
 * publik. Kalau lebih dari satu kode berlaku untuk 1 kelas, ambil yang
 * `nilai_diskon` PALING BESAR (bukan digabung/di-stack). */
export async function getDiskonAktifByKelasId(kelasIds: string[]): Promise<Map<string, DiskonAktif>> {
  const result = new Map<string, DiskonAktif>();
  if (kelasIds.length === 0) return result;

  const today = new Date().toISOString().slice(0, 10);

  const { data: promoRows, error: promoError } = await supabaseServer
    .from("kode_promo")
    .select("id, tipe_diskon, nilai_diskon, berlaku_semua_kelas")
    .eq("status", "aktif")
    .or(`tanggal_mulai.is.null,tanggal_mulai.lte.${today}`)
    .or(`tanggal_selesai.is.null,tanggal_selesai.gte.${today}`);

  if (promoError) {
    console.error("[getDiskonAktifByKelasId] query kode_promo failed:", promoError);
    return result;
  }

  const promos = (promoRows ?? []) as unknown as ActivePromoRow[];
  if (promos.length === 0) return result;

  const globalPromos = promos.filter((p) => p.berlaku_semua_kelas);
  const scopedPromoIds = promos.filter((p) => !p.berlaku_semua_kelas).map((p) => p.id);

  const scopedByKelas = new Map<string, ActivePromoRow[]>();
  if (scopedPromoIds.length > 0) {
    const { data: scopeRows, error: scopeError } = await supabaseServer
      .from("kode_promo_kelas")
      .select("kode_promo_id, kelas_id")
      .in("kode_promo_id", scopedPromoIds)
      .in("kelas_id", kelasIds);

    if (scopeError) {
      console.error("[getDiskonAktifByKelasId] query kode_promo_kelas failed:", scopeError);
    } else {
      const promoById = new Map(promos.map((p) => [p.id, p]));
      for (const row of (scopeRows ?? []) as { kode_promo_id: string; kelas_id: string }[]) {
        const promo = promoById.get(row.kode_promo_id);
        if (!promo) continue;
        const list = scopedByKelas.get(row.kelas_id) ?? [];
        list.push(promo);
        scopedByKelas.set(row.kelas_id, list);
      }
    }
  }

  for (const kelasId of kelasIds) {
    const candidates = [...globalPromos, ...(scopedByKelas.get(kelasId) ?? [])];
    if (candidates.length === 0) continue;

    const best = candidates.reduce((max, p) => (Number(p.nilai_diskon) > Number(max.nilai_diskon) ? p : max));
    result.set(kelasId, { label: formatDiskonLabel(best.tipe_diskon, Number(best.nilai_diskon)) });
  }

  return result;
}

/** Preview tiap kategori (max 4 terbaru) — dipakai app/program/page.tsx. Cuma
 * kategori yang punya isi yang dikembalikan (section kosong disembunyikan,
 * bukan tampil kosong — PRD 7.5.4). */
export async function getProgramPreviewSections(): Promise<ProgramSection[]> {
  const results = await Promise.all(
    PROGRAM_KATEGORI_ORDER.map(async (kategori) => {
      const { data, error } = await supabaseServer
        .from("kelas")
        .select(KELAS_CARD_SELECT)
        .eq("program_kategori", kategori)
        .order("created_at", { ascending: false })
        .limit(4);

      if (error) {
        console.error(`[getProgramPreviewSections] query kategori=${kategori} failed:`, error);
        return null;
      }

      const rows = (data ?? []) as unknown as KelasCardRow[];
      if (rows.length === 0) return null;

      const kapasitasById = new Map(rows.map((row) => [row.id, row.kapasitas]));
      const [diskonByKelas, sisaSlotByKelas] = await Promise.all([
        getDiskonAktifByKelasId(rows.map((row) => row.id)),
        getSisaSlotByKelasId(rows.map((row) => row.id), kapasitasById),
      ]);
      const items = rows.map((row) =>
        toCardPreview(row, diskonByKelas.get(row.id) ?? null, sisaSlotByKelas.get(row.id) ?? row.kapasitas),
      );

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
    .select(KELAS_CARD_SELECT)
    .eq("program_kategori", kategori)
    .order("created_at", { ascending: false });

  if (filters.tipeKelas) query = query.eq("tipe_kelas", filters.tipeKelas);
  if (filters.tingkatKelas) query = query.eq("tingkat_kelas", filters.tingkatKelas);

  const { data, error } = await query;

  if (error) {
    console.error(`[getKelasByKategori] query kategori=${kategori} failed:`, error);
    return [];
  }

  const rows = (data ?? []) as unknown as KelasCardRow[];
  const kapasitasById = new Map(rows.map((row) => [row.id, row.kapasitas]));
  const [diskonByKelas, sisaSlotByKelas] = await Promise.all([
    getDiskonAktifByKelasId(rows.map((row) => row.id)),
    getSisaSlotByKelasId(rows.map((row) => row.id), kapasitasById),
  ]);
  return rows.map((row) =>
    toCardPreview(row, diskonByKelas.get(row.id) ?? null, sisaSlotByKelas.get(row.id) ?? row.kapasitas),
  );
}

export interface KelasMentorInfo {
  nama: string;
  avatarUrl: string | null;
  asalPtn: string | null;
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
  mentors: KelasMentorInfo[];
  kapasitas: number;
  sisaSlot: number;
  diskonAktif: DiskonAktif | null;
}

type MentorJoin = { id: string; nama: string; avatar_url: string | null } | { id: string; nama: string; avatar_url: string | null }[] | null;

function firstMentor(value: MentorJoin) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Detail publik 1 kelas (app/program/kelas/[kelasId]/page.tsx). */
export async function getKelasDetailPublic(kelasId: string): Promise<KelasDetailPublic | null> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      `id, nama, program_kategori, tipe_kelas, tingkat_kelas, deskripsi, harga, jadwal, kapasitas,
       subtes:subtes_id(nama),
       mentor:mentor_id(id, nama, avatar_url)`,
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
    kapasitas: number;
    subtes: NamaJoin;
    mentor: MentorJoin;
  };
  const row = data as unknown as Row;
  const mentorRow = firstMentor(row.mentor);

  const [{ count, error: countError }, diskonByKelas, profileResult] = await Promise.all([
    supabaseServer
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("kelas_id", kelasId)
      .eq("status_pembayaran", "lunas"),
    getDiskonAktifByKelasId([kelasId]),
    mentorRow
      ? supabaseServer.from("mentor_profiles").select("asal_ptn").eq("user_id", mentorRow.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (countError) {
    console.error("[getKelasDetailPublic] query enrollments count failed:", countError);
  }
  if (profileResult.error) {
    console.error("[getKelasDetailPublic] query mentor_profiles failed:", profileResult.error);
  }

  const asalPtn = (profileResult.data as { asal_ptn: string } | null)?.asal_ptn ?? null;

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
    mentorNama: mentorRow?.nama ?? null,
    mentors: mentorRow ? [{ nama: mentorRow.nama, avatarUrl: mentorRow.avatar_url, asalPtn }] : [],
    kapasitas: row.kapasitas,
    sisaSlot: row.kapasitas - (count ?? 0),
    diskonAktif: diskonByKelas.get(kelasId) ?? null,
  };
}

export type MateriTipePublic = "video" | "dokumen" | "rangkuman_teks";

export interface MateriPublicItem {
  id: string;
  judul: string;
  tipe: MateriTipePublic;
  snippet: string;
}

function buildMateriSnippet(tipe: MateriTipePublic, konten: string | null): string {
  if (tipe === "rangkuman_teks") {
    const text = (konten ?? "").trim();
    if (!text) return "Rangkuman materi belajar";
    return text.length > 90 ? `${text.slice(0, 90).trimEnd()}…` : text;
  }
  return tipe === "video" ? "Tautan video pembelajaran" : "Tautan dokumen belajar";
}

/** Materi published untuk sidebar "Materi" di detail kelas publik (PRD 7.5.1
 * — cuma status published yang boleh tampil ke siswa, materi draft AI belum
 * direview tetap tersembunyi). */
export async function getMateriPublicByKelasId(kelasId: string): Promise<MateriPublicItem[]> {
  const { data, error } = await supabaseServer
    .from("materi")
    .select("id, judul, tipe, konten")
    .eq("kelas_id", kelasId)
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getMateriPublicByKelasId] query failed:", error);
    return [];
  }

  return (data ?? []).map((r) => {
    const tipe = r.tipe as MateriTipePublic;
    return {
      id: r.id as string,
      judul: r.judul as string,
      tipe,
      snippet: buildMateriSnippet(tipe, r.konten as string | null),
    };
  });
}
