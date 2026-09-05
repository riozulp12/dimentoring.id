import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Section Mentor (landing page) — PRD Bagian 4.3 #6. Cuma mentor role_type
 * 'mentor' status 'active' (BR-2, sudah di-approve Admin) DAN sudah upload
 * avatar_url (foto asli, bukan placeholder) yang tampil di sini. Section
 * disembunyikan total kalau yang qualify < MIN_MENTORS_TO_SHOW (app/page.tsx).
 */
const MIN_MENTORS_TO_SHOW = 3;
const MAX_MENTORS = 10;

export interface LandingMentorItem {
  id: string;
  nama: string;
  avatarUrl: string;
  asalPtn: string | null;
  jurusan: string | null;
  /** Subtes paling relevan (pertama dari mentor_subtes_diampu) untuk badge kecil di card. */
  subtesUtama: string | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface SubtesJoin {
  nama: string;
}

interface MentorProfileJoin {
  asal_ptn: string;
  jurusan: string;
  mentor_subtes_diampu: { subtes: SubtesJoin | SubtesJoin[] | null }[] | null;
}

interface Row {
  id: string;
  nama: string;
  avatar_url: string;
  created_at: string;
  mentor_profiles: MentorProfileJoin | MentorProfileJoin[] | null;
}

export async function getLandingMentors(): Promise<LandingMentorItem[]> {
  // FK disambiguation wajib: user_roles punya 2 FK ke users (user_id DAN
  // direview_oleh_id), jadi "user_roles!inner(...)" polos gagal dengan
  // PGRST201 "more than one relationship was found" (lihat pola sama di
  // lib/admin/dashboardData.ts & lib/admin/getManajemenSiswaData.ts).
  const { data, error } = await supabaseServer
    .from("users")
    .select(
      `id, nama, avatar_url, created_at,
       user_roles!user_roles_user_id_fkey!inner(role_type, status),
       mentor_profiles(
         asal_ptn, jurusan,
         mentor_subtes_diampu(subtes:subtes_id(nama))
       )`,
    )
    .eq("user_roles.role_type", "mentor")
    .eq("user_roles.status", "active")
    .not("avatar_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_MENTORS);

  if (error) {
    console.error("[getLandingMentors] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  const mentors = ((data ?? []) as unknown as Row[]).map((row): LandingMentorItem => {
    const profile = firstOrNull(row.mentor_profiles);
    const subtesNama = (profile?.mentor_subtes_diampu ?? [])
      .map((r) => firstOrNull(r.subtes)?.nama)
      .filter((nama): nama is string => Boolean(nama));

    return {
      id: row.id,
      nama: row.nama,
      avatarUrl: row.avatar_url,
      asalPtn: profile?.asal_ptn ?? null,
      jurusan: profile?.jurusan ?? null,
      subtesUtama: subtesNama[0] ?? null,
    };
  });

  // BR privasi/kualitas tampilan: jangan tampilkan carousel setengah kosong.
  if (mentors.length < MIN_MENTORS_TO_SHOW) return [];

  return mentors;
}
