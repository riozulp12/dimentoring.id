import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { formatJadwal } from "@/lib/shared/formatJadwal";

/**
 * Data layer "Kelola Kelas" (Admin) — PRD Bagian 7.5, 7.5.3 (tipe_kelas &
 * honor), Bagian 13 (kelas, subtes, users/mentor).
 */

export interface JadwalEntry {
  hari: string;
  jamMulai: string;
}

export interface KelasListItem {
  id: string;
  nama: string;
  tingkatKelas: string;
  tipeKelas: string;
  subtesId: string;
  subtesNama: string;
  mentorId: string | null;
  mentorNama: string | null;
  kapasitas: number;
  jumlahSiswa: number;
  harga: number;
  /** Dipakai untuk prefill form edit (picker hari+jam). */
  jadwalEntries: JadwalEntry[];
  /** Dipakai untuk tampilan read-only (list/detail) — reuse formatJadwal yang
   * sama dengan halaman Siswa/Mentor. */
  jadwalDisplay: string;
  linkMeet: string | null;
  deskripsi: string | null;
}

export interface SubtesOption {
  id: string;
  nama: string;
}

export interface MentorOption {
  id: string;
  nama: string;
  subtesIds: string[];
}

type NamaOnly = { nama: string };

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Ambil jadwal (JSONB array {hari, jam_mulai}) jadi shape form. Entri lama
 * yang belum berupa {hari, jam_mulai} lengkap (mis. teks bebas) dilewati —
 * tampilan read-only tetap benar lewat formatJadwal(), form edit tinggal
 * minta admin isi ulang jadwalnya lewat picker baru. */
function extractJadwalEntries(jadwal: unknown): JadwalEntry[] {
  if (!jadwal) return [];
  const entries = Array.isArray(jadwal) ? jadwal : [jadwal];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const hari = typeof obj.hari === "string" ? obj.hari : "";
      const jamMulai = typeof obj.jam_mulai === "string" ? obj.jam_mulai : "";
      if (!hari || !jamMulai) return null;
      return { hari, jamMulai };
    })
    .filter((e): e is JadwalEntry => e !== null);
}

interface KelasRow {
  id: string;
  nama: string;
  tingkat_kelas: string;
  tipe_kelas: string;
  subtes_id: string;
  mentor_id: string | null;
  kapasitas: number;
  harga: number;
  jadwal: unknown;
  link_meet: string | null;
  deskripsi: string | null;
  subtes: NamaOnly | NamaOnly[] | null;
  mentor: NamaOnly | NamaOnly[] | null;
  enrollments: { status_pembayaran: string }[] | null;
}

/** List semua kelas — dipakai halaman Kelola Kelas. */
export async function getKelasList(): Promise<KelasListItem[]> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      `id, nama, tingkat_kelas, tipe_kelas, subtes_id, mentor_id, kapasitas, harga, jadwal, link_meet, deskripsi,
       subtes:subtes_id(nama),
       mentor:mentor_id(nama),
       enrollments(status_pembayaran)`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getKelasList] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as KelasRow[]).map((row) => {
    const subtes = firstOrNull(row.subtes);
    const mentor = firstOrNull(row.mentor);
    const jumlahSiswa = (row.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas").length;

    return {
      id: row.id,
      nama: row.nama,
      tingkatKelas: row.tingkat_kelas,
      tipeKelas: row.tipe_kelas,
      subtesId: row.subtes_id,
      subtesNama: subtes?.nama ?? "-",
      mentorId: row.mentor_id,
      mentorNama: mentor?.nama ?? null,
      kapasitas: row.kapasitas,
      jumlahSiswa,
      harga: Number(row.harga),
      jadwalEntries: extractJadwalEntries(row.jadwal),
      jadwalDisplay: formatJadwal(row.jadwal),
      linkMeet: row.link_meet,
      deskripsi: row.deskripsi,
    };
  });
}

/** Opsi dropdown Subtes — semua subtes yang ada. */
export async function getSubtesOptions(): Promise<SubtesOption[]> {
  const { data, error } = await supabaseServer.from("subtes").select("id, nama").order("nama", { ascending: true });

  if (error) {
    console.error("[getSubtesOptions] query failed:", error);
    return [];
  }
  return (data ?? []).map((row) => ({ id: row.id as string, nama: row.nama as string }));
}

interface MentorSubtesRow {
  user_id: string;
  users: {
    nama: string;
    mentor_profiles: { mentor_subtes_diampu: { subtes_id: string }[] | null } | { mentor_subtes_diampu: { subtes_id: string }[] | null }[] | null;
  } | {
    nama: string;
    mentor_profiles: { mentor_subtes_diampu: { subtes_id: string }[] | null } | { mentor_subtes_diampu: { subtes_id: string }[] | null }[] | null;
  }[] | null;
}

/**
 * Opsi dropdown Mentor — HANYA mentor role_type='mentor' status='active',
 * masing-masing dilengkapi daftar subtesIds yang diampunya. Filter "subtes
 * cocok" dilakukan di client (dinamis, tanpa round-trip tiap ganti pilihan).
 */
export async function getActiveMentorsWithSubtes(): Promise<MentorOption[]> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select("user_id, users:user_id(nama, mentor_profiles(mentor_subtes_diampu(subtes_id)))")
    .eq("role_type", "mentor")
    .eq("status", "active");

  if (error) {
    console.error("[getActiveMentorsWithSubtes] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as MentorSubtesRow[])
    .map((row) => {
      const user = firstOrNull(row.users);
      if (!user) return null;
      const profile = firstOrNull(user.mentor_profiles);
      const subtesIds = (profile?.mentor_subtes_diampu ?? []).map((r) => r.subtes_id);
      return { id: row.user_id, nama: user.nama, subtesIds };
    })
    .filter((m): m is MentorOption => m !== null)
    .sort((a, b) => a.nama.localeCompare(b.nama));
}
