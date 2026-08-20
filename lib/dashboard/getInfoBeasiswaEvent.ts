import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Card "Info Beasiswa & Event" — dipakai Dashboard Siswa DAN Dashboard Mentor,
 * jadi query-nya sengaja ditaruh di satu tempat (bukan per-role) supaya tidak
 * ada kode duplikat. Konten tidak spesifik ke satu siswa/mentor.
 */

export interface BeasiswaEventItem {
  id: string;
  tipe: string;
  judul: string;
  deskripsi: string | null;
  deadline: string | null;
}

export async function getInfoBeasiswaEvent(): Promise<BeasiswaEventItem[]> {
  const { data, error } = await supabaseServer
    .from("konten_info")
    .select("id, tipe, judul, deskripsi, deadline")
    .in("tipe", ["beasiswa", "event"])
    .eq("status", "aktif")
    .order("deadline", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[getInfoBeasiswaEvent] query failed:", error);
    return [];
  }

  return data ?? [];
}
