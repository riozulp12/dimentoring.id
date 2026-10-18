import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Otorisasi Mentor atas siswa/enrollment untuk presensi & Kelas Saya (PRD
 * 7.5.5, BR-7) — SATU sumber, dipakai POST /api/mentor/sesi dan
 * lib/mentor/getKelasSayaData.ts (daftar kelas + daftar siswa).
 *
 * Mentor boleh menandai & melihat siswa suatu enrollment kalau dia:
 *   - "utama"   : kelas.mentor_id (kolom lama, DEPRECATED tapi masih diisi)
 *   - "kelas"   : terdaftar di kelas_mentor untuk kelas itu (multi-mentor)
 *   - "offline" : enrollments.mentor_offline_id (kelas offline — mentor
 *                 ditentukan per siswa saat checkout, kelas.mentor_id NULL)
 * "utama"/"kelas" melihat SEMUA siswa lunas di kelas; "offline" cuma siswa
 * yang ditugaskan ke dia. Selain itu ditolak. Cek status mentor 'active'
 * TETAP dilakukan pemanggil (getMentorRoleStatus).
 */

export type AksesMentor = "utama" | "kelas" | "offline";

export interface RelasiMentorEnrollment {
  kelasMentorId: string | null;
  kelasMentorIds: string[];
  mentorOfflineId: string | null;
}

/** Murni (tanpa DB) — urutan prioritas utama > kelas > offline. */
export function tentukanAksesMentor(mentorId: string, relasi: RelasiMentorEnrollment): AksesMentor | null {
  if (!mentorId) return null;
  if (relasi.kelasMentorId === mentorId) return "utama";
  if (relasi.kelasMentorIds.includes(mentorId)) return "kelas";
  if (relasi.mentorOfflineId === mentorId) return "offline";
  return null;
}

type Join<T> = T | T[] | null;
function first<T>(value: Join<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface EnrollmentAksesMentor {
  akses: AksesMentor;
  enrollment: { id: string; userId: string; kelasId: string; mentorOfflineId: string | null };
  kelas: { id: string; nama: string; mentorId: string | null; subtesId: string | null; subtesNama: string | null };
}

/**
 * Akses mentor ke SATU enrollment. "gagal" = error DB (sudah di-log); null =
 * enrollment tidak ada ATAU mentor tidak terkait (pemanggil menolak dengan
 * pesan yang sama untuk keduanya supaya tidak bocorkan kelas mentor lain).
 */
export async function getAksesMentorEnrollment(
  mentorId: string,
  enrollmentId: string,
): Promise<EnrollmentAksesMentor | null | "gagal"> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("id, user_id, kelas_id, mentor_offline_id, kelas:kelas_id(id, nama, mentor_id, subtes_id, subtes:subtes_id(nama))")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (error) {
    console.error("[getAksesMentorEnrollment] query enrollment failed:", error);
    return "gagal";
  }
  type KelasRow = { id: string; nama: string; mentor_id: string | null; subtes_id: string | null; subtes: Join<{ nama: string }> };
  const kelas = first(data?.kelas as Join<KelasRow>);
  if (!data || !kelas) return null;

  const { data: kmRows, error: kmError } = await supabaseServer
    .from("kelas_mentor")
    .select("mentor_id")
    .eq("kelas_id", kelas.id)
    .eq("mentor_id", mentorId);
  if (kmError) {
    console.error("[getAksesMentorEnrollment] query kelas_mentor failed:", kmError);
    return "gagal";
  }

  const akses = tentukanAksesMentor(mentorId, {
    kelasMentorId: kelas.mentor_id,
    kelasMentorIds: (kmRows ?? []).map((r) => r.mentor_id as string),
    mentorOfflineId: (data.mentor_offline_id as string | null) ?? null,
  });
  if (!akses) return null;

  return {
    akses,
    enrollment: {
      id: data.id as string,
      userId: data.user_id as string,
      kelasId: data.kelas_id as string,
      mentorOfflineId: (data.mentor_offline_id as string | null) ?? null,
    },
    kelas: {
      id: kelas.id,
      nama: kelas.nama,
      mentorId: kelas.mentor_id,
      subtesId: kelas.subtes_id,
      subtesNama: first(kelas.subtes)?.nama ?? null,
    },
  };
}

/**
 * Semua kelas yang boleh dibuka mentor ini di Kelas Saya, dengan akses
 * tertingginya per kelas. Offline cuma dihitung dari enrollment LUNAS (siswa
 * yang benar-benar ditugaskan). Map kosong kalau error (sudah di-log).
 */
export async function getKelasAksesMentor(mentorId: string): Promise<Map<string, AksesMentor>> {
  const [utamaRes, kmRes, offlineRes] = await Promise.all([
    supabaseServer.from("kelas").select("id").eq("mentor_id", mentorId),
    supabaseServer.from("kelas_mentor").select("kelas_id").eq("mentor_id", mentorId),
    supabaseServer
      .from("enrollments")
      .select("kelas_id")
      .eq("mentor_offline_id", mentorId)
      .eq("status_pembayaran", "lunas"),
  ]);

  const map = new Map<string, AksesMentor>();
  if (utamaRes.error || kmRes.error || offlineRes.error) {
    console.error("[getKelasAksesMentor] query failed:", utamaRes.error ?? kmRes.error ?? offlineRes.error);
    return map;
  }
  // Prioritas: utama > kelas > offline (yang lebih rendah tidak menimpa).
  for (const row of offlineRes.data ?? []) map.set(row.kelas_id as string, "offline");
  for (const row of kmRes.data ?? []) map.set(row.kelas_id as string, "kelas");
  for (const row of utamaRes.data ?? []) map.set(row.id as string, "utama");
  return map;
}

/** Akses mentor ke SATU kelas (guard halaman detail Kelas Saya). null = tidak terkait. */
export async function getAksesMentorKelas(mentorId: string, kelasId: string): Promise<AksesMentor | null> {
  const map = await getKelasAksesMentor(mentorId);
  return map.get(kelasId) ?? null;
}
