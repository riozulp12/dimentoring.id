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

export interface KontenInfoListItem extends BeasiswaEventItem {
  status: string;
}

/**
 * Halaman publik /beasiswa-event (list) — REUSE query dasar di atas tapi
 * SEMUA baris (termasuk status='ditutup') dan tanpa limit, supaya siswa/mentor
 * bisa lihat riwayat konten yang sudah ditutup juga. Diurutkan status ASC
 * ('aktif' dideklarasikan sebelum 'ditutup' di enum konten_info_status,
 * jadi ascending = konten yang masih buka tampil duluan), lalu deadline ASC
 * per kelompok status (nulls di akhir kelompoknya).
 */
export async function getKontenInfoList(): Promise<KontenInfoListItem[]> {
  const { data, error } = await supabaseServer
    .from("konten_info")
    .select("id, tipe, judul, deskripsi, deadline, status")
    .in("tipe", ["beasiswa", "internship", "webinar", "workshop", "event"])
    .order("status", { ascending: true })
    .order("deadline", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[getKontenInfoList] query failed:", error);
    return [];
  }

  return data ?? [];
}
