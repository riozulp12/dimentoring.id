import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { hariIniWib, kontenMasihBuka } from "@/lib/shared/kontenInfoTerbuka";

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

const SEMUA_TIPE_KONTEN = ["beasiswa", "internship", "webinar", "workshop", "event"];

/**
 * Konten yang MASIH BUKA (status 'aktif' dan deadline belum lewat, lihat lib/shared/kontenInfoTerbuka.ts) —
 * dipakai preview Beasiswa & Event di /program dan "Program lainnya" di detail event. Urutan: deadline terdekat
 * dulu, tanpa deadline paling akhir, lalu (deadline sama) yang terakhir dibuat dulu; filter di JS menjaga urutan
 * (stabil). Hanya kolom publik yang sama dengan daftar /beasiswa-event.
 */
export async function getKontenInfoTerbuka(
  opsi: { limit?: number; kecualiId?: string } = {},
): Promise<KontenInfoListItem[]> {
  let query = supabaseServer
    .from("konten_info")
    .select("id, tipe, judul, deskripsi, deadline, status")
    .in("tipe", SEMUA_TIPE_KONTEN)
    .eq("status", "aktif")
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (opsi.kecualiId) query = query.neq("id", opsi.kecualiId);

  const { data, error } = await query;

  if (error) {
    console.error("[getKontenInfoTerbuka] query failed:", error);
    return [];
  }

  const hariIni = hariIniWib();
  const terbuka = ((data ?? []) as KontenInfoListItem[]).filter(
    (item) => item.id !== opsi.kecualiId && kontenMasihBuka(item, hariIni),
  );
  return opsi.limit ? terbuka.slice(0, opsi.limit) : terbuka;
}

/**
 * "Program lainnya" di detail event: konten dari SEMUA jenis (beasiswa, internship, event, webinar, workshop) selain
 * yang sedang dibuka, hanya yang masih buka, maksimal `limit`. Satu kueri (tanpa langkah acuan), jadi halaman cukup
 * menaruhnya di Promise.all bersama kueri halaman — tidak menambah kedalaman.
 */
export async function getKontenInfoLainnya(id: string, limit = 3): Promise<KontenInfoListItem[]> {
  return getKontenInfoTerbuka({ kecualiId: id, limit });
}
