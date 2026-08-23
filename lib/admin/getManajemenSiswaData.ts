import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer "Manajemen Siswa" (Admin) — PRD Bagian 5 (User Roles) & Bagian
 * 13 (users, user_roles, enrollments, kelas, assessments). Query embed
 * users<->user_roles WAJIB disambiguasi lewat nama constraint eksplisit
 * (user_roles!user_roles_user_id_fkey) — user_roles punya 2 FK ke users
 * (user_id DAN direview_oleh_id), embed polos "user_roles!inner(...)" gagal
 * dengan PGRST201 "more than one relationship was found".
 */

export interface SiswaListItem {
  id: string;
  nama: string;
  email: string;
  namaSekolah: string | null;
  tingkatKelas: string | null;
  subStatus: string | null;
  createdAt: string;
  /** enrollments status_pembayaran='lunas' milik siswa ini. */
  jumlahKelas: number;
}

interface SiswaListRow {
  id: string;
  nama: string;
  email: string;
  nama_sekolah: string | null;
  tingkat_kelas: string | null;
  sub_status: string | null;
  created_at: string;
  enrollments: { status_pembayaran: string }[] | null;
}

/** Semua siswa terdaftar (role_type='student'), diurutkan terbaru daftar duluan. */
export async function getSiswaList(): Promise<SiswaListItem[]> {
  const { data, error } = await supabaseServer
    .from("users")
    .select(
      `id, nama, email, nama_sekolah, tingkat_kelas, sub_status, created_at,
       user_roles!user_roles_user_id_fkey!inner(role_type),
       enrollments(status_pembayaran)`,
    )
    .eq("user_roles.role_type", "student")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getSiswaList] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  return ((data ?? []) as unknown as SiswaListRow[]).map((row) => ({
    id: row.id,
    nama: row.nama,
    email: row.email,
    namaSekolah: row.nama_sekolah,
    tingkatKelas: row.tingkat_kelas,
    subStatus: row.sub_status,
    createdAt: row.created_at,
    jumlahKelas: (row.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas").length,
  }));
}

/** Guard halaman detail — pastikan id ini benar akun Student (bukan Mentor/Admin, dan bukan id acak). */
export async function verifyStudentExists(userId: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_type", "student")
    .maybeSingle();

  if (error) {
    console.error("[verifyStudentExists] query failed:", JSON.stringify(error, null, 2));
    return false;
  }
  return data !== null;
}

export interface SiswaKelasItem {
  id: string;
  kelasId: string;
  nama: string;
  statusPembayaran: "menunggu" | "lunas" | "batal";
  progresPersen: number;
}

interface SiswaKelasRow {
  id: string;
  status_pembayaran: SiswaKelasItem["statusPembayaran"];
  progres_persen: number;
  kelas: { id: string; nama: string } | { id: string; nama: string }[] | null;
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Section "Kelas Diikuti" — SEMUA enrollment siswa ini (bukan cuma lunas), Admin perlu lihat status pembayaran juga. */
export async function getSiswaKelasDiikuti(userId: string): Promise<SiswaKelasItem[]> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("id, status_pembayaran, progres_persen, kelas:kelas_id(id, nama)")
    .eq("user_id", userId)
    .order("tanggal_daftar", { ascending: false });

  if (error) {
    console.error("[getSiswaKelasDiikuti] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  return ((data ?? []) as unknown as SiswaKelasRow[])
    .map((row) => {
      const kelas = firstOrNull(row.kelas);
      if (!kelas) return null;
      return {
        id: row.id,
        kelasId: kelas.id,
        nama: kelas.nama,
        statusPembayaran: row.status_pembayaran,
        progresPersen: row.progres_persen,
      };
    })
    .filter((item): item is SiswaKelasItem => item !== null);
}

export interface SiswaAssessmentItem {
  id: string;
  jalur: string;
  nilaiAkhir: number | null;
  nilaiAkhirLabel: string | null;
  createdAt: string;
}

/** Section "Riwayat Assessment" — ORDER BY created_at DESC (terbaru duluan). */
export async function getSiswaAssessmentHistory(userId: string): Promise<SiswaAssessmentItem[]> {
  const { data, error } = await supabaseServer
    .from("assessments")
    .select("id, jalur, nilai_akhir, nilai_akhir_label, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getSiswaAssessmentHistory] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    jalur: row.jalur as string,
    nilaiAkhir: row.nilai_akhir === null ? null : Number(row.nilai_akhir),
    nilaiAkhirLabel: row.nilai_akhir_label as string | null,
    createdAt: row.created_at as string,
  }));
}
