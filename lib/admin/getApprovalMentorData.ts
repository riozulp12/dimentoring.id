import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer "Approval Mentor" (Admin) — PRD Bagian 5 (User Roles), Bagian 8
 * BR-2 (approval Admin wajib sebelum Mentor aktif), Bagian 13 (users,
 * user_roles, mentor_profiles, mentor_subtes_diampu).
 */

export type ApprovalMentorStatus = "pending" | "active" | "rejected";

export interface ApprovalMentorItem {
  userRoleId: string;
  nama: string;
  email: string;
  noWa: string;
  asalPtn: string | null;
  jurusan: string | null;
  semester: number | null;
  subtesDiampu: string[];
  tanggalDaftar: string;
  direviewOlehNama: string | null;
  tanggalReview: string | null;
  alasanTolak: string | null;
}

type NamaOnly = { nama: string };

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface MentorProfileJoin {
  asal_ptn: string;
  semester: number;
  jurusan: string;
  mentor_subtes_diampu: { subtes: NamaOnly | NamaOnly[] | null }[] | null;
}

interface UserJoin {
  nama: string;
  email: string;
  no_wa: string;
  mentor_profiles: MentorProfileJoin | MentorProfileJoin[] | null;
}

interface Row {
  id: string;
  created_at: string;
  tanggal_review: string | null;
  alasan_tolak: string | null;
  direview_oleh: NamaOnly | NamaOnly[] | null;
  user: UserJoin | UserJoin[] | null;
}

/** Satu tab (Menunggu/Disetujui/Ditolak) — urut FIFO untuk antrian pending, terbaru-dulu untuk yang sudah direview. */
export async function getApprovalMentorList(status: ApprovalMentorStatus): Promise<ApprovalMentorItem[]> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select(
      `id, created_at, tanggal_review, alasan_tolak,
       direview_oleh:direview_oleh_id(nama),
       user:user_id(
         nama, email, no_wa,
         mentor_profiles(
           asal_ptn, semester, jurusan,
           mentor_subtes_diampu(subtes:subtes_id(nama))
         )
       )`,
    )
    .eq("role_type", "mentor")
    .eq("status", status)
    .order("created_at", { ascending: status === "pending" });

  if (error) {
    console.error("[getApprovalMentorList] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as Row[])
    .map((row) => {
      const user = firstOrNull(row.user);
      if (!user) return null;
      const profile = firstOrNull(user.mentor_profiles);
      const subtesDiampu = (profile?.mentor_subtes_diampu ?? [])
        .map((r) => firstOrNull(r.subtes)?.nama)
        .filter((nama): nama is string => Boolean(nama));

      return {
        userRoleId: row.id,
        nama: user.nama,
        email: user.email,
        noWa: user.no_wa,
        asalPtn: profile?.asal_ptn ?? null,
        jurusan: profile?.jurusan ?? null,
        semester: profile?.semester ?? null,
        subtesDiampu,
        tanggalDaftar: row.created_at,
        direviewOlehNama: firstOrNull(row.direview_oleh)?.nama ?? null,
        tanggalReview: row.tanggal_review,
        alasanTolak: row.alasan_tolak,
      };
    })
    .filter((item): item is ApprovalMentorItem => item !== null);
}
