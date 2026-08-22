import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Card "Info Beasiswa & Event" — dipakai Dashboard Siswa, Dashboard Mentor,
 * DAN section "Info Beasiswa & Internship" di landing page (PRD Bagian 4.3),
 * jadi query-nya sengaja ditaruh di satu tempat (bukan per-role/per-halaman)
 * supaya tidak ada kode duplikat. Konten tidak spesifik ke satu siswa/mentor.
 */

export interface BeasiswaEventItem {
  id: string;
  tipe: string;
  judul: string;
  deskripsi: string | null;
  deadline: string | null;
}

/** @param limit Batasi jumlah baris (mis. landing page cuma tampil 4 preview). Tanpa limit = semua data aktif (dashboard). */
export async function getInfoBeasiswaEvent(limit?: number): Promise<BeasiswaEventItem[]> {
  let query = supabaseServer
    .from("konten_info")
    .select("id, tipe, judul, deskripsi, deadline")
    .in("tipe", ["beasiswa", "internship", "event"])
    .eq("status", "aktif")
    .order("deadline", { ascending: true, nullsFirst: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error("[getInfoBeasiswaEvent] query failed:", error);
    return [];
  }

  return data ?? [];
}
