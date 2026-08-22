import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer "Siswa Saya" (Mentor) — PRD Bagian 7.5 & Bagian 13 (enrollments,
 * kelas, materi_progress, users). BR-7: seluruh query di sini scoped ke
 * kelas.mentor_id = mentor yang login — mentor cuma boleh lihat siswa di
 * kelas yang di-assign eksplisit ke dia.
 */

export interface SiswaBinaanItem {
  userId: string;
  nama: string;
  avatarUrl: string | null;
  progresPersen: number;
}

export interface SiswaBinaanGroup {
  kelasId: string;
  kelasNama: string;
  siswa: SiswaBinaanItem[];
}

export interface SiswaBinaanDetail {
  userId: string;
  nama: string;
  avatarUrl: string | null;
  kelasId: string;
  kelasNama: string;
  progresPersen: number;
}

export interface MateriProgressItem {
  id: string;
  judul: string;
  tipe: "video" | "dokumen" | "rangkuman_teks";
  selesai: boolean;
}

type UserJoin = { id: string; nama: string; avatar_url: string | null };

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Semua kelas mentor ini + siswa lunas per kelas (termasuk kelas yang belum
 * punya siswa sama sekali — array siswa kosong). Filtering search & pilih
 * kelas dilakukan di client (data siswa binaan mentor cukup kecil), supaya
 * interaksi instan tanpa round-trip — lihat components/mentor/SiswaBinaanList.tsx.
 */
export async function getSiswaBinaanGrouped(mentorId: string): Promise<SiswaBinaanGroup[]> {
  const { data: kelasList, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("id, nama")
    .eq("mentor_id", mentorId)
    .order("nama", { ascending: true });

  if (kelasError) {
    console.error("[getSiswaBinaanGrouped] query kelas failed:", kelasError);
    return [];
  }
  if (!kelasList || kelasList.length === 0) return [];

  const kelasIds = kelasList.map((k) => k.id as string);
  const { data: enrollmentRows, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("kelas_id, progres_persen, users:user_id(id, nama, avatar_url)")
    .in("kelas_id", kelasIds)
    .eq("status_pembayaran", "lunas");

  if (enrollmentError) {
    console.error("[getSiswaBinaanGrouped] query enrollments failed:", enrollmentError);
    // Tetap kembalikan struktur kelas kosong daripada gagal total.
    return kelasList.map((k) => ({ kelasId: k.id as string, kelasNama: k.nama as string, siswa: [] }));
  }

  type Row = { kelas_id: string; progres_persen: number; users: UserJoin | UserJoin[] | null };

  const byKelas = new Map<string, SiswaBinaanItem[]>();
  for (const row of (enrollmentRows ?? []) as unknown as Row[]) {
    const user = firstOrNull(row.users);
    if (!user) continue;
    const list = byKelas.get(row.kelas_id) ?? [];
    list.push({ userId: user.id, nama: user.nama, avatarUrl: user.avatar_url, progresPersen: row.progres_persen });
    byKelas.set(row.kelas_id, list);
  }

  return kelasList.map((k) => ({
    kelasId: k.id as string,
    kelasNama: k.nama as string,
    siswa: byKelas.get(k.id as string) ?? [],
  }));
}

/**
 * Guard + data detail satu siswa DI SATU kelas spesifik — BR-7. Cuma valid
 * kalau: (1) enrollment user_id+kelas_id ini benar-benar ada & lunas, DAN
 * (2) kelas itu di-assign ke mentorId ini. Salah satu tidak terpenuhi = null,
 * page.tsx WAJIB redirect (jangan pernah render data siswa yang bukan
 * binaan mentor ini, termasuk kombinasi userId benar tapi kelasId salah).
 */
export async function getSiswaBinaanDetail(
  mentorId: string,
  siswaUserId: string,
  kelasId: string,
): Promise<SiswaBinaanDetail | null> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("progres_persen, kelas:kelas_id(id, nama, mentor_id), users:user_id(id, nama, avatar_url)")
    .eq("user_id", siswaUserId)
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas")
    .maybeSingle();

  if (error) {
    console.error("[getSiswaBinaanDetail] query failed:", error);
    return null;
  }
  if (!data) return null;

  type KelasJoin = { id: string; nama: string; mentor_id: string | null };
  const kelas = firstOrNull(data.kelas as KelasJoin | KelasJoin[] | null);
  const user = firstOrNull(data.users as UserJoin | UserJoin[] | null);
  if (!kelas || !user) return null;
  if (kelas.mentor_id !== mentorId) return null;

  return {
    userId: user.id,
    nama: user.nama,
    avatarUrl: user.avatar_url,
    kelasId: kelas.id,
    kelasNama: kelas.nama,
    progresPersen: data.progres_persen as number,
  };
}

/** Materi published kelas ini + status selesai/belum SATU siswa (read-only untuk mentor). */
export async function getMateriWithProgressForSiswa(
  kelasId: string,
  siswaUserId: string,
): Promise<MateriProgressItem[]> {
  const { data: materiRows, error } = await supabaseServer
    .from("materi")
    .select("id, judul, tipe")
    .eq("kelas_id", kelasId)
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getMateriWithProgressForSiswa] query materi failed:", error);
    return [];
  }

  const rows = materiRows ?? [];
  if (rows.length === 0) return [];

  const { data: progressRows, error: progressError } = await supabaseServer
    .from("materi_progress")
    .select("materi_id, selesai")
    .eq("user_id", siswaUserId)
    .in(
      "materi_id",
      rows.map((r) => r.id as string),
    );

  if (progressError) {
    console.error("[getMateriWithProgressForSiswa] query materi_progress failed:", progressError);
  }

  const selesaiMap = new Map((progressRows ?? []).map((r) => [r.materi_id as string, r.selesai as boolean]));

  return rows.map((r) => ({
    id: r.id as string,
    judul: r.judul as string,
    tipe: r.tipe as MateriProgressItem["tipe"],
    selesai: selesaiMap.get(r.id as string) ?? false,
  }));
}
