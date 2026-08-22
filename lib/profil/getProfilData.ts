import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { SessionRole } from "@/lib/auth/session";

/**
 * Data layer halaman Profil — SATU halaman untuk semua role, kontennya
 * menyesuaikan role sesi yang login (PRD 7, poin 1). Bagian 13 (Data Model):
 * users, mentor_profiles, mentor_subtes_diampu, user_mapel_tersulit, provinsi.
 *
 * Mapel Tersulit & Subtes yang Diampu SENGAJA dikembalikan sebagai nama
 * (bukan id) — checklist edit di ProfilClient toggle berdasar nama persis
 * seperti opsi yang ditampilkan (dari tabel `subtes` yang sama), jadi id
 * cuma perlu di-resolve sekali di app/api/profil/update/route.ts saat submit.
 */

export type MentorRoleStatus = "active" | "pending" | "rejected" | null;

export interface ProfilData {
  userId: string;
  role: SessionRole;
  nama: string;
  email: string;
  noWa: string;
  avatarUrl: string | null;
  createdAt: string;
  // Khusus Student
  namaSekolah: string | null;
  provinsiId: string | null;
  provinsiNama: string | null;
  tingkatKelas: string | null;
  subStatus: string | null;
  mapelTersulit: string[];
  // Khusus Mentor
  mentorAsalPtn: string | null;
  mentorSemester: number | null;
  mentorJurusan: string | null;
  mentorSubtesDiampu: string[];
  mentorStatus: MentorRoleStatus;
}

interface SubtesJoinRow {
  subtes: { nama: string } | { nama: string }[] | null;
}

function extractSubtesNama(rows: SubtesJoinRow[] | null): string[] {
  return (rows ?? [])
    .map((row) => (Array.isArray(row.subtes) ? row.subtes[0] : row.subtes))
    .filter((s): s is { nama: string } => Boolean(s))
    .map((s) => s.nama);
}

export async function getProfilData(userId: string, role: SessionRole): Promise<ProfilData | null> {
  const { data: user, error } = await supabaseServer
    .from("users")
    .select(
      "id, nama, email, no_wa, avatar_url, created_at, nama_sekolah, provinsi_id, tingkat_kelas, sub_status, provinsi:provinsi_id(nama)",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    console.error("[getProfilData] query users failed:", error);
    return null;
  }

  const provinsiJoin = user.provinsi as unknown as { nama: string } | { nama: string }[] | null;
  const provinsi = Array.isArray(provinsiJoin) ? provinsiJoin[0] : provinsiJoin;

  let mapelTersulit: string[] = [];
  if (role === "student") {
    const { data: rows, error: mapelError } = await supabaseServer
      .from("user_mapel_tersulit")
      .select("subtes:subtes_id(nama)")
      .eq("user_id", userId);
    if (mapelError) {
      console.error("[getProfilData] query user_mapel_tersulit failed:", mapelError);
    }
    mapelTersulit = extractSubtesNama(rows as SubtesJoinRow[] | null);
  }

  let mentorAsalPtn: string | null = null;
  let mentorSemester: number | null = null;
  let mentorJurusan: string | null = null;
  let mentorSubtesDiampu: string[] = [];
  let mentorStatus: MentorRoleStatus = null;

  if (role === "mentor") {
    const [profileRes, roleRes] = await Promise.all([
      supabaseServer
        .from("mentor_profiles")
        .select("asal_ptn, semester, jurusan, mentor_subtes_diampu(subtes:subtes_id(nama))")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseServer
        .from("user_roles")
        .select("status")
        .eq("user_id", userId)
        .eq("role_type", "mentor")
        .maybeSingle(),
    ]);

    if (profileRes.error) {
      console.error("[getProfilData] query mentor_profiles failed:", profileRes.error);
    }
    if (profileRes.data) {
      mentorAsalPtn = profileRes.data.asal_ptn as string;
      mentorSemester = profileRes.data.semester as number;
      mentorJurusan = profileRes.data.jurusan as string;
      mentorSubtesDiampu = extractSubtesNama(
        profileRes.data.mentor_subtes_diampu as SubtesJoinRow[] | null,
      );
    }
    mentorStatus = (roleRes.data?.status as MentorRoleStatus) ?? null;
  }

  return {
    userId: user.id as string,
    role,
    nama: user.nama as string,
    email: user.email as string,
    noWa: user.no_wa as string,
    avatarUrl: (user.avatar_url as string | null) ?? null,
    createdAt: user.created_at as string,
    namaSekolah: (user.nama_sekolah as string | null) ?? null,
    provinsiId: (user.provinsi_id as string | null) ?? null,
    provinsiNama: provinsi?.nama ?? null,
    tingkatKelas: (user.tingkat_kelas as string | null) ?? null,
    subStatus: (user.sub_status as string | null) ?? null,
    mapelTersulit,
    mentorAsalPtn,
    mentorSemester,
    mentorJurusan,
    mentorSubtesDiampu,
    mentorStatus,
  };
}

export interface ProvinsiOption {
  id: string;
  nama: string;
}

export async function getProvinsiOptions(): Promise<ProvinsiOption[]> {
  const { data, error } = await supabaseServer
    .from("provinsi")
    .select("id, nama")
    .order("nama", { ascending: true });
  if (error) {
    console.error("[getProvinsiOptions] query failed:", error);
    return [];
  }
  return (data ?? []) as ProvinsiOption[];
}

/** Nama semua subtes (urut abjad) — dipakai opsi checklist Mapel Tersulit
 * (Student) maupun Subtes yang Diampu (Mentor), sama seperti resolusi di
 * app/api/auth/register/route.ts. */
export async function getSubtesNamaOptions(): Promise<string[]> {
  const { data, error } = await supabaseServer.from("subtes").select("nama").order("nama", { ascending: true });
  if (error) {
    console.error("[getSubtesNamaOptions] query failed:", error);
    return [];
  }
  return (data ?? []).map((row) => row.nama as string);
}
