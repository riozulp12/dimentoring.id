import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { formatJadwal } from "@/lib/shared/formatJadwal";
import {
  KELAS_CARD_SELECT,
  getDiskonAktifByKelasId,
  getSisaSlotByKelasId,
  toCardPreview,
  type KelasCardPreview,
  type KelasCardRow,
} from "@/lib/dashboard/getProgramData";

/**
 * Data layer halaman "Kelas Saya" — PRD Bagian 7.5 & Bagian 13 (enrollments,
 * kelas, user_mapel_tersulit). Dua fungsi terpisah: kelas yang sudah diikuti
 * (lunas, variant "dimiliki" di KelasCardVisual) vs rekomendasi kelas yang
 * belum diikuti (variant "jual" — treatment SAMA PERSIS seperti /program,
 * makanya bentuknya KelasCardPreview & reuse helper diskon/sisa-slot dari
 * lib/dashboard/getProgramData.ts, bukan tipe/logic terpisah sendiri).
 */

export interface KelasSayaItem {
  id: string;
  nama: string;
  mentorNama: string | null;
  jadwal: string;
  progresPersen: number;
  programKategori: string;
  tingkatKelas: string;
  subtesNama: string | null;
}

type MentorJoin = { nama: string } | { nama: string }[] | null;

function resolveMentorNama(mentor: MentorJoin): string | null {
  if (!mentor) return null;
  const row = Array.isArray(mentor) ? mentor[0] : mentor;
  return row?.nama ?? null;
}

type SubtesJoin = { nama: string } | { nama: string }[] | null;

function resolveSubtesNama(subtes: SubtesJoin): string | null {
  if (!subtes) return null;
  const row = Array.isArray(subtes) ? subtes[0] : subtes;
  return row?.nama ?? null;
}

/** "Kelas Saya" — enrollments lunas milik siswa ini, JOIN kelas + mentor. */
export async function getKelasSaya(userId: string): Promise<KelasSayaItem[]> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select(
      "progres_persen, kelas:kelas_id(id, nama, jadwal, program_kategori, tingkat_kelas, subtes:subtes_id(nama), mentor:mentor_id(nama))",
    )
    .eq("user_id", userId)
    .eq("status_pembayaran", "lunas");

  if (error) {
    console.error("[getKelasSaya] query failed:", error);
    return [];
  }

  type KelasJoin = {
    id: string;
    nama: string;
    jadwal: unknown;
    program_kategori: string;
    tingkat_kelas: string;
    subtes: SubtesJoin;
    mentor: MentorJoin;
  };
  type Row = { progres_persen: number; kelas: KelasJoin | KelasJoin[] | null };

  return ((data ?? []) as unknown as Row[])
    .map((row) => {
      const kelas = Array.isArray(row.kelas) ? row.kelas[0] : row.kelas;
      if (!kelas) return null;
      return {
        id: kelas.id,
        nama: kelas.nama,
        mentorNama: resolveMentorNama(kelas.mentor),
        jadwal: formatJadwal(kelas.jadwal),
        progresPersen: row.progres_persen,
        programKategori: kelas.program_kategori,
        tingkatKelas: kelas.tingkat_kelas,
        subtesNama: resolveSubtesNama(kelas.subtes),
      };
    })
    .filter((item): item is KelasSayaItem => item !== null);
}

/**
 * "Rekomendasi Kelas" — kelas yang subtes-nya termasuk mapel_tersulit siswa
 * DAN tingkat_kelas cocok DAN belum diikuti sama sekali, diurutkan slot
 * tersisa terbanyak. Bentuk hasil PERSIS KelasCardPreview (dipakai
 * KelasCardFrame+KelasCardMeta yang sama dengan /program) karena kelas di
 * sini memang belum dibeli — treatment jualan lengkap tetap relevan.
 * Fallback ke array kosong (section disembunyikan total di page.tsx) kalau
 * siswa belum isi mapel_tersulit atau memang tidak ada kelas cocok — sengaja
 * tidak pernah melempar error di kedua kondisi itu.
 */
export async function getRekomendasiKelas(
  userId: string,
  tingkatKelas: string | null,
): Promise<KelasCardPreview[]> {
  if (!tingkatKelas) return [];

  const { data: mapelRows, error: mapelError } = await supabaseServer
    .from("user_mapel_tersulit")
    .select("subtes_id")
    .eq("user_id", userId);

  if (mapelError) {
    console.error("[getRekomendasiKelas] query user_mapel_tersulit failed:", mapelError);
    return [];
  }

  const subtesIds = (mapelRows ?? []).map((row) => row.subtes_id as string);
  if (subtesIds.length === 0) return [];

  const { data: enrolledRows, error: enrolledError } = await supabaseServer
    .from("enrollments")
    .select("kelas_id")
    .eq("user_id", userId);

  if (enrolledError) {
    console.error("[getRekomendasiKelas] query enrollments failed:", enrolledError);
    return [];
  }
  const enrolledKelasIds = new Set((enrolledRows ?? []).map((row) => row.kelas_id as string));

  const { data: kelasRows, error: kelasError } = await supabaseServer
    .from("kelas")
    .select(KELAS_CARD_SELECT)
    .eq("tingkat_kelas", tingkatKelas)
    .in("subtes_id", subtesIds);

  if (kelasError) {
    console.error("[getRekomendasiKelas] query kelas failed:", kelasError);
    return [];
  }

  const candidates = ((kelasRows ?? []) as unknown as KelasCardRow[]).filter(
    (row) => !enrolledKelasIds.has(row.id),
  );
  if (candidates.length === 0) return [];

  const kapasitasById = new Map(candidates.map((row) => [row.id, row.kapasitas]));
  const candidateIds = candidates.map((row) => row.id);
  const [diskonByKelas, sisaSlotByKelas] = await Promise.all([
    getDiskonAktifByKelasId(candidateIds),
    getSisaSlotByKelasId(candidateIds, kapasitasById),
  ]);

  return candidates
    .map((row) => toCardPreview(row, diskonByKelas.get(row.id) ?? null, sisaSlotByKelas.get(row.id) ?? row.kapasitas))
    .sort((a, b) => b.sisaSlot - a.sisaSlot)
    .slice(0, 6);
}
