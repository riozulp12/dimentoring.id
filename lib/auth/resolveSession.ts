import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { ROLE_DASHBOARD_PATH, type SessionRole } from "@/lib/auth/session";
import { linkPendingAssessment } from "@/lib/assessment/linkPendingAssessment";

/**
 * Logic "sudah tervalidasi identitasnya (password ATAU Google), sekarang mau
 * ke mana" — SATU tempat dipakai oleh app/api/auth/login/route.ts (setelah
 * password cocok) dan app/api/auth/google-callback/route.ts (setelah email
 * Google ditemukan di tabel users), supaya aturan profiling gate (FR-1.15),
 * "Mentor Pending tetap bisa login" (BR-27), dan linking assessment anonim
 * (PRD 7.4.1b) tidak diimplementasikan dua kali secara terpisah.
 */

export interface ResolveSessionParams {
  userId: string;
  profilingSelesai: boolean;
  /** Role dari session SEBELUMNYA (kalau ada & valid) — preferensi "role terakhir dipakai". */
  previousSessionUserId: string | null;
  previousSessionRole: SessionRole | null;
  pendingAssessmentId?: string;
  trialId?: string | null;
}

export type ResolveSessionResult =
  | { ok: true; role: SessionRole; redirectTo: string; mentorStatus?: "pending" }
  | { ok: false; error: string; status: number; reason?: string };

function pickActiveRole(
  activeRoles: SessionRole[],
  lastUsedRole: SessionRole | null,
): SessionRole {
  if (lastUsedRole && activeRoles.includes(lastUsedRole)) return lastUsedRole;
  if (activeRoles.includes("student")) return "student";
  return activeRoles[0];
}

export async function resolveSessionForUser(params: ResolveSessionParams): Promise<ResolveSessionResult> {
  const { userId, profilingSelesai, pendingAssessmentId, trialId } = params;

  // FR-1.15: profiling belum selesai -> paksa /lengkapi-profil, jangan cek
  // user_roles sama sekali (memang belum ada baris role apa pun di titik ini).
  if (!profilingSelesai) {
    return { ok: true, role: "unassigned", redirectTo: ROLE_DASHBOARD_PATH.unassigned };
  }

  const { data: roleRows, error: roleError } = await supabaseServer
    .from("user_roles")
    .select("role_type, status")
    .eq("user_id", userId);

  if (roleError) {
    console.error("[resolveSessionForUser] query user_roles failed:", roleError);
    return { ok: false, error: "Gagal memproses login. Coba lagi nanti.", status: 500 };
  }

  const activeRoles = (roleRows ?? [])
    .filter((row) => row.status === "active")
    .map((row) => row.role_type as SessionRole);

  // BR-27: Mentor 'pending' tetap boleh login (mode "On Review"), meski belum
  // punya role aktif lain.
  const pendingMentor = (roleRows ?? []).find(
    (row) => row.role_type === "mentor" && row.status === "pending",
  );

  let activeRole: SessionRole;
  let mentorStatus: "pending" | undefined;

  if (activeRoles.length > 0) {
    const lastUsedRole =
      params.previousSessionUserId === userId ? params.previousSessionRole : null;
    activeRole = pickActiveRole(activeRoles, lastUsedRole);
  } else if (pendingMentor) {
    activeRole = "mentor";
    mentorStatus = "pending";
  } else {
    return {
      ok: false,
      error: "Akun kamu masih menunggu approval Admin.",
      status: 403,
      reason: "no_active_role",
    };
  }

  let redirectTo: string = ROLE_DASHBOARD_PATH[activeRole];
  const linkedAssessmentId = await linkPendingAssessment(pendingAssessmentId, trialId, userId);
  if (linkedAssessmentId) {
    redirectTo = `/assessment/hasil/${linkedAssessmentId}`;
  }

  return { ok: true, role: activeRole, redirectTo, mentorStatus };
}
