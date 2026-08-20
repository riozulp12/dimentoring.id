import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

export type MentorRoleStatus = "active" | "pending" | "rejected" | null;

/**
 * BR-27: status UserRole Mentor (bukan status_verifikasi_akun) yang menentukan
 * badge "On Review" + kunci fitur mengajar. cache() supaya layout & page.tsx
 * yang sama-sama butuh nilai ini dalam satu request tidak query dua kali.
 */
export const getMentorRoleStatus = cache(async (userId: string): Promise<MentorRoleStatus> => {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select("status")
    .eq("user_id", userId)
    .eq("role_type", "mentor")
    .maybeSingle();

  if (error) {
    console.error("[getMentorRoleStatus] query failed:", error);
    return null;
  }

  return (data?.status as MentorRoleStatus) ?? null;
});
