import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { formatJadwal } from "@/lib/shared/formatJadwal";

/**
 * Data layer halaman "Kelas Saya" — PRD Bagian 7.5 & Bagian 13 (enrollments,
 * kelas, user_mapel_tersulit). Dua fungsi terpisah: kelas yang sudah diikuti
 * (lunas) vs rekomendasi kelas yang belum diikuti, biar page.tsx tinggal
 * gabungkan hasilnya tanpa logic tambahan.
 */

export interface KelasSayaItem {
  id: string;
  nama: string;
  mentorNama: string | null;
  jadwal: string;
  progresPersen: number;
}

export interface KelasRekomendasiItem {
  id: string;
  nama: string;
  mentorNama: string | null;
  jadwal: string;
}

type MentorJoin = { nama: string } | { nama: string }[] | null;

function resolveMentorNama(mentor: MentorJoin): string | null {
  if (!mentor) return null;
  const row = Array.isArray(mentor) ? mentor[0] : mentor;
  return row?.nama ?? null;
}

/** "Kelas Saya" — enrollments lunas milik siswa ini, JOIN kelas + mentor. */
export async function getKelasSaya(userId: string): Promise<KelasSayaItem[]> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("progres_persen, kelas:kelas_id(id, nama, jadwal, mentor:mentor_id(nama))")
    .eq("user_id", userId)
    .eq("status_pembayaran", "lunas");

  if (error) {
    console.error("[getKelasSaya] query failed:", error);
    return [];
  }

  type KelasJoin = { id: string; nama: string; jadwal: unknown; mentor: MentorJoin };
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
      };
    })
    .filter((item): item is KelasSayaItem => item !== null);
}

/**
 * "Rekomendasi Kelas" — kelas yang subtes-nya termasuk mapel_tersulit siswa
 * DAN tingkat_kelas cocok DAN belum diikuti sama sekali, diurutkan slot
 * tersisa terbanyak. Fallback ke array kosong (section disembunyikan total
 * di page.tsx) kalau siswa belum isi mapel_tersulit atau memang tidak ada
 * kelas cocok — sengaja tidak pernah melempar error di kedua kondisi itu.
 */
export async function getRekomendasiKelas(
  userId: string,
  tingkatKelas: string | null,
): Promise<KelasRekomendasiItem[]> {
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
    .select("id, nama, jadwal, kapasitas, mentor:mentor_id(nama)")
    .eq("tingkat_kelas", tingkatKelas)
    .in("subtes_id", subtesIds);

  if (kelasError) {
    console.error("[getRekomendasiKelas] query kelas failed:", kelasError);
    return [];
  }

  type KelasCandidate = {
    id: string;
    nama: string;
    jadwal: unknown;
    kapasitas: number;
    mentor: MentorJoin;
  };

  const candidates = ((kelasRows ?? []) as unknown as KelasCandidate[]).filter(
    (row) => !enrolledKelasIds.has(row.id),
  );
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((row) => row.id);
  const { data: lunasRows, error: lunasError } = await supabaseServer
    .from("enrollments")
    .select("kelas_id")
    .in("kelas_id", candidateIds)
    .eq("status_pembayaran", "lunas");

  if (lunasError) {
    console.error("[getRekomendasiKelas] query lunas count failed:", lunasError);
  }

  const lunasCountByKelas = new Map<string, number>();
  for (const row of lunasRows ?? []) {
    const id = row.kelas_id as string;
    lunasCountByKelas.set(id, (lunasCountByKelas.get(id) ?? 0) + 1);
  }

  return candidates
    .map((row) => ({
      id: row.id,
      nama: row.nama,
      mentorNama: resolveMentorNama(row.mentor),
      jadwal: formatJadwal(row.jadwal),
      slotTersisa: row.kapasitas - (lunasCountByKelas.get(row.id) ?? 0),
    }))
    .sort((a, b) => b.slotTersisa - a.slotTersisa)
    .slice(0, 6)
    .map(({ id, nama, mentorNama, jadwal }) => ({ id, nama, mentorNama, jadwal }));
}
