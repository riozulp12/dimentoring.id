import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer "Approval Mentor" (Admin) — PRD Bagian 5 (User Roles), Bagian 8
 * BR-2 (approval Admin wajib sebelum Mentor aktif), Bagian 13 (users,
 * user_roles, mentor_profiles, mentor_subtes_diampu).
 */

export type ApprovalMentorStatus = "pending" | "active" | "rejected";

export interface ApprovalMentorItem {
  userRoleId: string;
  nama: string;
  email: string;
  noWa: string;
  asalPtn: string | null;
  jurusan: string | null;
  semester: number | null;
  subtesDiampu: string[];
  tanggalDaftar: string;
  direviewOlehNama: string | null;
  tanggalReview: string | null;
  alasanTolak: string | null;
}

type NamaOnly = { nama: string };

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface MentorProfileJoin {
  asal_ptn: string;
  semester: number;
  jurusan: string;
  mentor_subtes_diampu: { subtes: NamaOnly | NamaOnly[] | null }[] | null;
}

interface UserJoin {
  nama: string;
  email: string;
  no_wa: string;
  mentor_profiles: MentorProfileJoin | MentorProfileJoin[] | null;
}

interface Row {
  id: string;
  created_at: string;
  tanggal_review: string | null;
  alasan_tolak: string | null;
  direview_oleh: NamaOnly | NamaOnly[] | null;
  user: UserJoin | UserJoin[] | null;
}

/** Satu tab (Menunggu/Disetujui/Ditolak) — urut FIFO untuk antrian pending, terbaru-dulu untuk yang sudah direview. */
export async function getApprovalMentorList(status: ApprovalMentorStatus): Promise<ApprovalMentorItem[]> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select(
      `id, created_at, tanggal_review, alasan_tolak,
       direview_oleh:direview_oleh_id(nama),
       user:user_id(
         nama, email, no_wa,
         mentor_profiles(
           asal_ptn, semester, jurusan,
           mentor_subtes_diampu(subtes:subtes_id(nama))
         )
       )`,
    )
    .eq("role_type", "mentor")
    .eq("status", status)
    .order("created_at", { ascending: status === "pending" });

  if (error) {
    console.error("[getApprovalMentorList] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as Row[])
    .map((row) => mapRowToItem(row))
    .filter((item): item is ApprovalMentorItem => item !== null);
}

function mapRowToItem(row: Row): ApprovalMentorItem | null {
  const user = firstOrNull(row.user);
  if (!user) return null;
  const profile = firstOrNull(user.mentor_profiles);
  const subtesDiampu = (profile?.mentor_subtes_diampu ?? [])
    .map((r) => firstOrNull(r.subtes)?.nama)
    .filter((nama): nama is string => Boolean(nama));

  return {
    userRoleId: row.id,
    nama: user.nama,
    email: user.email,
    noWa: user.no_wa,
    asalPtn: profile?.asal_ptn ?? null,
    jurusan: profile?.jurusan ?? null,
    semester: profile?.semester ?? null,
    subtesDiampu,
    tanggalDaftar: row.created_at,
    direviewOlehNama: firstOrNull(row.direview_oleh)?.nama ?? null,
    tanggalReview: row.tanggal_review,
    alasanTolak: row.alasan_tolak,
  };
}

/**
 * Peta mentor_id -> Set distinct user_id siswa binaan (enrollments lunas di
 * kelas mentor itu) lintas SEMUA kelas — sama definisi dengan getMentorDetail,
 * tapi diagregasi sekali untuk semua mentor sekaligus (hindari N+1 query).
 */
async function getSiswaBinaanByMentor(): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select("mentor_id, enrollments(user_id, status_pembayaran)");

  if (error) {
    console.error("[getSiswaBinaanByMentor] query failed:", JSON.stringify(error, null, 2));
    return new Map();
  }

  type KelasRow = {
    mentor_id: string | null;
    enrollments: { user_id: string; status_pembayaran: string }[] | null;
  };

  const map = new Map<string, Set<string>>();
  for (const kelas of (data ?? []) as unknown as KelasRow[]) {
    if (!kelas.mentor_id) continue;
    const set = map.get(kelas.mentor_id) ?? new Set<string>();
    for (const e of kelas.enrollments ?? []) {
      if (e.status_pembayaran === "lunas") set.add(e.user_id);
    }
    map.set(kelas.mentor_id, set);
  }
  return map;
}

/**
 * Tab "Aktif"/"Pasif" (Manajemen Mentor) — subset dari mentor status='active',
 * dipecah berdasarkan ADA/TIDAKNYA minimal 1 siswa binaan.
 */
export async function getMentorActivityLists(): Promise<{
  aktif: ApprovalMentorItem[];
  pasif: ApprovalMentorItem[];
}> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select(
      `id, created_at, tanggal_review, alasan_tolak,
       direview_oleh:direview_oleh_id(nama),
       user:user_id(
         id, nama, email, no_wa,
         mentor_profiles(
           asal_ptn, semester, jurusan,
           mentor_subtes_diampu(subtes:subtes_id(nama))
         )
       )`,
    )
    .eq("role_type", "mentor")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMentorActivityLists] query failed:", error);
    return { aktif: [], pasif: [] };
  }

  const siswaBinaanByMentor = await getSiswaBinaanByMentor();

  const aktif: ApprovalMentorItem[] = [];
  const pasif: ApprovalMentorItem[] = [];

  for (const row of (data ?? []) as unknown as Row[]) {
    const user = firstOrNull(row.user) as unknown as (UserJoin & { id: string }) | null;
    const item = mapRowToItem(row);
    if (!user || !item) continue;
    const jumlahSiswaBinaan = siswaBinaanByMentor.get(user.id)?.size ?? 0;
    (jumlahSiswaBinaan > 0 ? aktif : pasif).push(item);
  }

  return { aktif, pasif };
}

export interface CalonMentorItem {
  userId: string;
  nama: string;
  email: string;
  /**
   * Belum ada kolom di skema yang mencatat tanggal transisi sub_status
   * ke 'mahasiswa' (lihat db/schema.sql tabel users) — pakai created_at
   * (tanggal daftar akun) sebagai proxy terbaik yang tersedia saat ini.
   */
  tanggalDaftar: string;
}

interface CalonMentorRow {
  id: string;
  nama: string;
  email: string;
  created_at: string;
}

/**
 * Tab "Calon Mentor" — siswa alumni (sub_status='mahasiswa') yang BELUM
 * PERNAH punya baris user_roles role_type='mentor' sama sekali (status
 * apapun: pending/active/rejected). Sumber data tabel users, bukan mentor.
 */
export async function getCalonMentorList(): Promise<CalonMentorItem[]> {
  const { data: alumniRows, error } = await supabaseServer
    .from("users")
    .select(
      `id, nama, email, created_at,
       user_roles!user_roles_user_id_fkey!inner(role_type)`,
    )
    .eq("sub_status", "mahasiswa")
    .eq("user_roles.role_type", "student")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getCalonMentorList] query alumni failed:", JSON.stringify(error, null, 2));
    return [];
  }

  const alumni = (alumniRows ?? []) as unknown as CalonMentorRow[];
  if (alumni.length === 0) return [];

  const { data: mentorRoleRows, error: mentorError } = await supabaseServer
    .from("user_roles")
    .select("user_id")
    .eq("role_type", "mentor")
    .in(
      "user_id",
      alumni.map((a) => a.id),
    );

  if (mentorError) {
    console.error("[getCalonMentorList] query mentor roles failed:", JSON.stringify(mentorError, null, 2));
    return [];
  }

  const everAppliedMentorIds = new Set((mentorRoleRows ?? []).map((r) => r.user_id as string));

  return alumni
    .filter((a) => !everAppliedMentorIds.has(a.id))
    .map((a) => ({ userId: a.id, nama: a.nama, email: a.email, tanggalDaftar: a.created_at }));
}

export interface MentorDetailKelasItem {
  id: string;
  nama: string;
  /** enrollments status_pembayaran='lunas' di kelas ini — sama definisi "siswa binaan" dengan lib/mentor/getSiswaBinaanData.ts. */
  jumlahSiswa: number;
}

export interface MentorDetail extends ApprovalMentorItem {
  status: ApprovalMentorStatus;
  /** users.id mentor ini — dipakai lookup kelas.mentor_id (beda dari userRoleId = user_roles.id). */
  mentorUserId: string;
  kelasDiampu: MentorDetailKelasItem[];
  /** COUNT DISTINCT enrollments.user_id (lunas) lintas semua kelasDiampu. */
  totalSiswaBinaan: number;
}

/** Detail satu pengajuan/akun Mentor (halaman /approval-mentor/[mentorId]) — mentorId di sini = user_roles.id, sama identifier dengan yang dipakai app/api/approval-mentor/route.ts. */
export async function getMentorDetail(userRoleId: string): Promise<MentorDetail | null> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select(
      `id, created_at, tanggal_review, alasan_tolak, status,
       direview_oleh:direview_oleh_id(nama),
       user:user_id(
         id, nama, email, no_wa,
         mentor_profiles(
           asal_ptn, semester, jurusan,
           mentor_subtes_diampu(subtes:subtes_id(nama))
         )
       )`,
    )
    .eq("id", userRoleId)
    .eq("role_type", "mentor")
    .maybeSingle();

  if (error) {
    console.error("[getMentorDetail] query user_roles failed:", JSON.stringify(error, null, 2));
    return null;
  }
  if (!data) return null;

  const row = data as unknown as Row & { status: ApprovalMentorStatus };
  const user = firstOrNull(row.user) as unknown as (UserJoin & { id: string }) | null;
  if (!user) return null;

  const profile = firstOrNull(user.mentor_profiles);
  const subtesDiampu = (profile?.mentor_subtes_diampu ?? [])
    .map((r) => firstOrNull(r.subtes)?.nama)
    .filter((nama): nama is string => Boolean(nama));

  const { data: kelasRows, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("id, nama, enrollments(user_id, status_pembayaran)")
    .eq("mentor_id", user.id)
    .order("nama", { ascending: true });

  if (kelasError) {
    console.error("[getMentorDetail] query kelas failed:", JSON.stringify(kelasError, null, 2));
  }

  type KelasRow = { id: string; nama: string; enrollments: { user_id: string; status_pembayaran: string }[] | null };
  const kelasDiampu: MentorDetailKelasItem[] = [];
  const siswaBinaanIds = new Set<string>();

  for (const kelas of ((kelasRows ?? []) as unknown as KelasRow[])) {
    const lunasSiswa = (kelas.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas");
    lunasSiswa.forEach((e) => siswaBinaanIds.add(e.user_id));
    kelasDiampu.push({ id: kelas.id, nama: kelas.nama, jumlahSiswa: lunasSiswa.length });
  }

  return {
    userRoleId: row.id,
    nama: user.nama,
    email: user.email,
    noWa: user.no_wa,
    asalPtn: profile?.asal_ptn ?? null,
    jurusan: profile?.jurusan ?? null,
    semester: profile?.semester ?? null,
    subtesDiampu,
    tanggalDaftar: row.created_at,
    direviewOlehNama: firstOrNull(row.direview_oleh)?.nama ?? null,
    tanggalReview: row.tanggal_review,
    alasanTolak: row.alasan_tolak,
    status: row.status,
    mentorUserId: user.id,
    kelasDiampu,
    totalSiswaBinaan: siswaBinaanIds.size,
  };
}
