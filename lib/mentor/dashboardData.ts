import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer Dashboard Mentor — PRD Bagian 7.5.1/7.7 (revisi) & BR-7 (Mentor
 * cuma kelola kelas & siswa yang di-assign eksplisit Admin, sesuai Subtes
 * yang Diampu). Semua query di sini scoped ke mentor_id = user yang login.
 */

export interface MentorStats {
  kelasDiampu: number;
  siswaBinaan: number;
  /** null kalau belum ada siswa sama sekali (bukan 0%, supaya beda kasus "kosong" vs "0%"). */
  rataRataProgress: number | null;
  kontenMenungguReview: number;
}

export interface MentorKelasSiswaProgress {
  kelasId: string;
  kelasNama: string;
  siswa: { userId: string; nama: string; progresPersen: number }[];
}

export interface MentorKelasTerdaftar {
  id: string;
  nama: string;
  tingkatKelas: string;
  jadwal: unknown;
  subtesNama: string | null;
  jumlahSiswa: number;
}

interface EnrollmentRow {
  user_id: string;
  progres_persen: number;
  users: { nama: string; nama_panggilan: string | null } | null;
}

interface KelasWithEnrollments {
  id: string;
  nama: string;
  tingkat_kelas: string;
  jadwal: unknown;
  subtes: { nama: string } | null;
  enrollments: EnrollmentRow[];
}

async function getMentorSubtesIds(userId: string): Promise<string[]> {
  const { data: profile } = await supabaseServer
    .from("mentor_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return [];

  const { data: rows } = await supabaseServer
    .from("mentor_subtes_diampu")
    .select("subtes_id")
    .eq("mentor_profile_id", profile.id);

  return (rows ?? []).map((r: { subtes_id: string }) => r.subtes_id);
}

async function getMentorKelasWithEnrollments(userId: string): Promise<KelasWithEnrollments[]> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      "id, nama, tingkat_kelas, jadwal, subtes:subtes_id(nama), enrollments(user_id, progres_persen, users:user_id(nama, nama_panggilan))",
    )
    .eq("mentor_id", userId);

  if (error) {
    console.error("[getMentorKelasWithEnrollments] query failed:", error);
    return [];
  }

  return (data ?? []) as unknown as KelasWithEnrollments[];
}

/** Bagian 3: 4 stat card ("Kelas Diampu", "Siswa Binaan", "Rata-rata Progress", "Konten AI Menunggu Review"). */
export async function getMentorStats(userId: string): Promise<MentorStats> {
  const [kelasList, subtesIds] = await Promise.all([
    getMentorKelasWithEnrollments(userId),
    getMentorSubtesIds(userId),
  ]);

  const kelasDiampu = kelasList.length;
  const allEnrollments = kelasList.flatMap((k) => k.enrollments ?? []);
  const siswaIds = new Set(allEnrollments.map((e) => e.user_id));
  const siswaBinaan = siswaIds.size;
  const rataRataProgress =
    allEnrollments.length > 0
      ? Math.round(
          allEnrollments.reduce((sum, e) => sum + (e.progres_persen ?? 0), 0) / allEnrollments.length,
        )
      : null;

  let kontenMenungguReview = 0;
  if (subtesIds.length > 0) {
    const [soalRes, materiRes] = await Promise.all([
      supabaseServer
        .from("soal_ai")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft")
        .in("subtes_id", subtesIds),
      supabaseServer
        .from("materi")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft")
        .in("subtes_id", subtesIds),
    ]);
    kontenMenungguReview = (soalRes.count ?? 0) + (materiRes.count ?? 0);
  }

  return { kelasDiampu, siswaBinaan, rataRataProgress, kontenMenungguReview };
}

/** Card "Progress Siswa Binaan" — group by kelas, list siswa + progress bar. */
export async function getMentorProgressByKelas(userId: string): Promise<MentorKelasSiswaProgress[]> {
  const kelasList = await getMentorKelasWithEnrollments(userId);

  return kelasList.map((k) => ({
    kelasId: k.id,
    kelasNama: k.nama,
    siswa: (k.enrollments ?? []).map((e) => ({
      userId: e.user_id,
      nama: e.users?.nama_panggilan || e.users?.nama || "Siswa",
      progresPersen: e.progres_persen,
    })),
  }));
}

/** Card "Kelas Terdaftar" — list kelas + jadwal. */
export async function getMentorKelasTerdaftar(userId: string): Promise<MentorKelasTerdaftar[]> {
  const kelasList = await getMentorKelasWithEnrollments(userId);

  return kelasList.map((k) => ({
    id: k.id,
    nama: k.nama,
    tingkatKelas: k.tingkat_kelas,
    jadwal: k.jadwal,
    subtesNama: k.subtes?.nama ?? null,
    jumlahSiswa: (k.enrollments ?? []).length,
  }));
}
