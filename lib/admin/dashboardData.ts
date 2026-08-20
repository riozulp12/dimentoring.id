import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer Dashboard Admin — PRD Bagian 5 (User Roles), Bagian 8 BR-2
 * (approval mentor) & BR-31 (review konten AI), Bagian 13 (Data Model).
 */

export interface AdminStats {
  siswaTerdaftar: number;
  mentorAktif: number;
  mentorMenungguApproval: number;
  kontenMenungguReview: number;
}

export interface MentorPengajuan {
  userRoleId: string;
  nama: string;
  asalPtn: string | null;
  jurusan: string | null;
  tanggalDaftar: string;
}

export interface SiswaTerbaru {
  nama: string;
  tanggalDaftar: string;
}

export interface KontenAiPreviewItem {
  id: string;
  jenis: "materi" | "soal";
  judul: string;
  subtesNama: string;
  createdAt: string;
}

function extractSubtesNama(subtes: unknown): string {
  if (Array.isArray(subtes)) return (subtes[0] as { nama?: string } | undefined)?.nama ?? "-";
  return (subtes as { nama?: string } | null)?.nama ?? "-";
}

/** 4 stat card Dashboard Admin. */
export async function getAdminStats(): Promise<AdminStats> {
  const [siswaRes, mentorAktifRes, mentorPendingRes, soalRes, materiRes] = await Promise.all([
    supabaseServer
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role_type", "student")
      .eq("status", "active"),
    supabaseServer
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role_type", "mentor")
      .eq("status", "active"),
    supabaseServer
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role_type", "mentor")
      .eq("status", "pending"),
    supabaseServer.from("soal_ai").select("*", { count: "exact", head: true }).eq("status", "draft"),
    supabaseServer.from("materi").select("*", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  return {
    siswaTerdaftar: siswaRes.count ?? 0,
    mentorAktif: mentorAktifRes.count ?? 0,
    mentorMenungguApproval: mentorPendingRes.count ?? 0,
    kontenMenungguReview: (soalRes.count ?? 0) + (materiRes.count ?? 0),
  };
}

/** Card "Antrian Approval Mentor" — pengajuan mentor pending, tertua duluan. */
export async function getMentorPengajuanQueue(): Promise<MentorPengajuan[]> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select("id, created_at, users:user_id(nama, mentor_profiles(asal_ptn, jurusan))")
    .eq("role_type", "mentor")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getMentorPengajuanQueue] query failed:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const user = row.users as unknown as {
      nama: string;
      mentor_profiles: { asal_ptn: string; jurusan: string } | { asal_ptn: string; jurusan: string }[] | null;
    } | null;
    const profile = Array.isArray(user?.mentor_profiles) ? user?.mentor_profiles[0] : user?.mentor_profiles;

    return {
      userRoleId: row.id as string,
      nama: user?.nama ?? "-",
      asalPtn: profile?.asal_ptn ?? null,
      jurusan: profile?.jurusan ?? null,
      tanggalDaftar: row.created_at as string,
    };
  });
}

/** Card "Pendaftaran Siswa Terbaru" — 5 siswa paling baru daftar. */
export async function getSiswaTerbaru(): Promise<SiswaTerbaru[]> {
  const { data, error } = await supabaseServer
    .from("users")
    .select("nama, created_at, user_roles!inner(role_type)")
    .eq("user_roles.role_type", "student")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[getSiswaTerbaru] query failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    nama: row.nama as string,
    tanggalDaftar: row.created_at as string,
  }));
}

/** Card "Konten AI Menunggu Review" — preview 5 item terlama, Admin lihat SEMUA subtes (beda dari versi Mentor). */
export async function getKontenAiPreview(): Promise<KontenAiPreviewItem[]> {
  const [materiRes, soalRes] = await Promise.all([
    supabaseServer
      .from("materi")
      .select("id, judul, created_at, subtes:subtes_id(nama)")
      .eq("status", "draft")
      .order("created_at", { ascending: true })
      .limit(5),
    supabaseServer
      .from("soal_ai")
      .select("id, redaksi, created_at, subtes:subtes_id(nama)")
      .eq("status", "draft")
      .order("created_at", { ascending: true })
      .limit(5),
  ]);

  const materiItems: KontenAiPreviewItem[] = (materiRes.data ?? []).map((m) => ({
    id: m.id as string,
    jenis: "materi",
    judul: m.judul as string,
    subtesNama: extractSubtesNama(m.subtes),
    createdAt: m.created_at as string,
  }));

  const soalItems: KontenAiPreviewItem[] = (soalRes.data ?? []).map((s) => {
    const redaksi = s.redaksi as string;
    return {
      id: s.id as string,
      jenis: "soal",
      judul: redaksi.length > 100 ? `${redaksi.slice(0, 100)}…` : redaksi,
      subtesNama: extractSubtesNama(s.subtes),
      createdAt: s.created_at as string,
    };
  });

  return [...materiItems, ...soalItems]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 5);
}
