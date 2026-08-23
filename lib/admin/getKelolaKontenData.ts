import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { extractSubtesNama, type ReviewKontenItem } from "@/lib/mentor/reviewKonten";

/**
 * Data layer "Kelola Konten" (Admin) — PRD Bagian 13 (konten_info, soal_ai,
 * materi), Bagian 7.7, BR-31.
 */

export interface KontenInfoAdminItem {
  id: string;
  tipe: string;
  judul: string;
  deskripsi: string | null;
  deskripsiLengkap: string | null;
  linkPendaftaran: string | null;
  deadline: string | null;
  status: string;
}

/** Tab "Info Beasiswa & Event" — SEMUA baris konten_info, terbaru dibuat duluan (search/filter di client). */
export async function getKontenInfoAdminList(): Promise<KontenInfoAdminItem[]> {
  const { data, error } = await supabaseServer
    .from("konten_info")
    .select("id, tipe, judul, deskripsi, deskripsi_lengkap, link_pendaftaran, deadline, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getKontenInfoAdminList] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    tipe: row.tipe as string,
    judul: row.judul as string,
    deskripsi: row.deskripsi as string | null,
    deskripsiLengkap: row.deskripsi_lengkap as string | null,
    linkPendaftaran: row.link_pendaftaran as string | null,
    deadline: row.deadline as string | null,
    status: row.status as string,
  }));
}

function extractNama(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return (row as { nama?: string } | null)?.nama ?? null;
}

/**
 * Tab "Review Konten AI" versi Admin — PRD 7.7/BR-31. BEDA dari versi Mentor
 * (lib/mentor/reviewKonten.ts): TANPA filter subtes_id sama sekali (Admin
 * lihat SEMUA draft lintas subtes/mentor manapun), dan tiap item menyertakan
 * nama mentor pemicu (dibuat_oleh_id) kalau ada.
 */
export async function getAdminReviewKontenQueue(): Promise<ReviewKontenItem[]> {
  const [materiRes, soalRes] = await Promise.all([
    supabaseServer
      .from("materi")
      .select("id, judul, sumber, created_at, subtes:subtes_id(nama), dibuat_oleh:dibuat_oleh_id(nama)")
      .eq("status", "draft"),
    supabaseServer
      .from("soal_ai")
      .select("id, redaksi, sumber, created_at, subtes:subtes_id(nama), dibuat_oleh:dibuat_oleh_id(nama)")
      .eq("status", "draft"),
  ]);

  if (materiRes.error) {
    console.error("[getAdminReviewKontenQueue] query materi failed:", JSON.stringify(materiRes.error, null, 2));
  }
  if (soalRes.error) {
    console.error("[getAdminReviewKontenQueue] query soal_ai failed:", JSON.stringify(soalRes.error, null, 2));
  }

  const materiItems: ReviewKontenItem[] = (materiRes.data ?? []).map((m) => ({
    id: m.id as string,
    jenis: "materi",
    judul: m.judul as string,
    subtesNama: extractSubtesNama(m.subtes),
    createdAt: m.created_at as string,
    sumber: m.sumber as string,
    mentorNama: extractNama(m.dibuat_oleh),
  }));

  const soalItems: ReviewKontenItem[] = (soalRes.data ?? []).map((s) => {
    const redaksi = s.redaksi as string;
    return {
      id: s.id as string,
      jenis: "soal",
      judul: redaksi.length > 120 ? `${redaksi.slice(0, 120)}…` : redaksi,
      subtesNama: extractSubtesNama(s.subtes),
      createdAt: s.created_at as string,
      sumber: s.sumber as string,
      mentorNama: extractNama(s.dibuat_oleh),
    };
  });

  return [...materiItems, ...soalItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
