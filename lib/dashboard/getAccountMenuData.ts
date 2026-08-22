import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { SessionRole } from "@/lib/auth/session";

/**
 * Data untuk area akun (avatar+nama+dropdown) — dipakai Navbar landing page
 * DAN Header dashboard, lewat satu fungsi yang sama (PRD Bagian 7.0.6/12.1).
 */

export interface AccountMenuData {
  firstName: string;
  /** Nama lengkap — dipakai item "Profil" di dropdown akun (beda dari firstName di label navbar). */
  fullName: string;
  avatarUrl: string | null;
  /** Cuma relevan untuk role 'student' — lihat FR-1.9. */
  canApplyMentor: boolean;
  /** Level gamifikasi referral (gamifikasi_profiles.level, mis. "Rookie Referrer") —
   * role-agnostic (Student maupun Mentor), ditampilkan di item "Profil" dropdown akun.
   * null kalau baris gamifikasi_profiles belum pernah ke-generate untuk user ini. */
  referralLevel: string | null;
}

/** FR-1.9: siswa boleh ajukan jadi Mentor kalau belum punya UserRole Mentor
 * berstatus 'pending'/'active' — 'rejected' boleh ajukan ulang, belum
 * pernah ajukan sama sekali juga boleh. */
async function getCanApplyMentor(userId: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("user_roles")
    .select("status")
    .eq("user_id", userId)
    .eq("role_type", "mentor")
    .maybeSingle();

  if (!data) return true;
  return data.status !== "pending" && data.status !== "active";
}

export async function getAccountMenuData(userId: string, role: SessionRole): Promise<AccountMenuData> {
  const [userRes, canApplyMentor, gamifikasiRes] = await Promise.all([
    supabaseServer.from("users").select("nama, avatar_url").eq("id", userId).maybeSingle(),
    role === "student" ? getCanApplyMentor(userId) : Promise.resolve(false),
    supabaseServer.from("gamifikasi_profiles").select("level").eq("user_id", userId).maybeSingle(),
  ]);

  const nama = userRes.data?.nama ?? "";
  const firstName = nama.trim().split(/\s+/)[0] || "Pengguna";
  const fullName = nama.trim() || "Pengguna";

  return {
    firstName,
    fullName,
    avatarUrl: userRes.data?.avatar_url ?? null,
    canApplyMentor,
    referralLevel: (gamifikasiRes.data?.level as string | undefined) ?? null,
  };
}
