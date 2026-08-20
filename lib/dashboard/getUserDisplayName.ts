import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Nama singkat untuk greeting "Haloo [nama]" — dipakai lintas dashboard
 * (Siswa/Mentor/Admin). Pakai nama panggilan kalau ada, kalau tidak ambil
 * kata pertama dari nama lengkap.
 */
export async function getUserDisplayName(userId: string, fallback: string): Promise<string> {
  const { data } = await supabaseServer
    .from("users")
    .select("nama, nama_panggilan")
    .eq("id", userId)
    .maybeSingle();

  return data?.nama_panggilan || data?.nama?.split(" ")[0] || fallback;
}
