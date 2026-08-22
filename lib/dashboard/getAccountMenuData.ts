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
  const [userRes, canApplyMentor] = await Promise.all([
    supabaseServer.from("users").select("nama, avatar_url").eq("id", userId).maybeSingle(),
    role === "student" ? getCanApplyMentor(userId) : Promise.resolve(false),
  ]);

  const nama = userRes.data?.nama ?? "";
  const firstName = nama.trim().split(/\s+/)[0] || "Pengguna";
  const fullName = nama.trim() || "Pengguna";

  return {
    firstName,
    fullName,
    avatarUrl: userRes.data?.avatar_url ?? null,
    canApplyMentor,
  };
}
