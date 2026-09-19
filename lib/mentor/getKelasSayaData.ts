import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { TINGKAT_KELAS_LABEL } from "@/lib/shared/kelasLabels";
import { formatJadwal } from "@/lib/shared/formatJadwal";

/**
 * Data layer "Kelas Saya" (Mentor) — PRD Bagian 7.5 & Bagian 13 (kelas,
 * enrollments, materi). BR-7: mentor cuma boleh kelola kelas yang di-assign
 * eksplisit Admin (mentor_id = user ini) — seluruh query di sini scoped ke
 * mentor_id, dan detail page menambah guard eksplisit di server juga.
 */

export { TINGKAT_KELAS_LABEL };

export interface MentorKelasItem {
  id: string;
  nama: string;
  subtesNama: string | null;
  programKategori: string;
  tingkatKelas: string;
  tingkatKelasLabel: string;
  jadwal: string;
  jumlahSiswa: number;
  kapasitas: number;
  linkMeetBelumDiatur: boolean;
}

export interface MentorKelasDetail {
  id: string;
  nama: string;
  mentorId: string | null;
  subtesNama: string | null;
  tingkatKelasLabel: string;
  jumlahSiswa: number;
  linkMeet: string | null;
  jumlahSesi: number;
}

export interface MentorMateriItem {
  id: string;
  judul: string;
  tipe: "video" | "dokumen" | "rangkuman_teks";
  status: "draft" | "published" | "ditolak";
  sumber: "ai_generated" | "upload_mentor";
  createdAt: string;
}

type NamaJoin = { nama: string } | { nama: string }[] | null;

function firstNama(value: NamaJoin): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.nama ?? null;
}

/** Halaman list — semua kelas yang di-assign ke mentor ini. */
export async function getMentorKelasSaya(userId: string): Promise<MentorKelasItem[]> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      "id, nama, program_kategori, tingkat_kelas, jadwal, kapasitas, link_meet, subtes:subtes_id(nama), enrollments(status_pembayaran)",
    )
    .eq("mentor_id", userId);

  if (error) {
    console.error("[getMentorKelasSaya] query failed:", error);
    return [];
  }

  type Row = {
    id: string;
    nama: string;
    program_kategori: string;
    tingkat_kelas: string;
    jadwal: unknown;
    kapasitas: number;
    link_meet: string | null;
    subtes: NamaJoin;
    enrollments: { status_pembayaran: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    nama: row.nama,
    subtesNama: firstNama(row.subtes),
    programKategori: row.program_kategori,
    tingkatKelas: row.tingkat_kelas,
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[row.tingkat_kelas] ?? row.tingkat_kelas,
    jadwal: formatJadwal(row.jadwal),
    jumlahSiswa: (row.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas").length,
    kapasitas: row.kapasitas,
    linkMeetBelumDiatur: !row.link_meet,
  }));
}

/** Halaman detail — 1 kelas, plus data buat guard (mentorId). */
export async function getMentorKelasDetail(kelasId: string): Promise<MentorKelasDetail | null> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      "id, nama, mentor_id, tingkat_kelas, link_meet, jumlah_sesi, subtes:subtes_id(nama), enrollments(status_pembayaran)",
    )
    .eq("id", kelasId)
    .maybeSingle();

  if (error) {
    console.error("[getMentorKelasDetail] query failed:", error);
    return null;
  }
  if (!data) return null;

  type Row = {
    id: string;
    nama: string;
    mentor_id: string | null;
    tingkat_kelas: string;
    link_meet: string | null;
    jumlah_sesi: number;
    subtes: NamaJoin;
    enrollments: { status_pembayaran: string }[] | null;
  };
  const row = data as unknown as Row;

  return {
    id: row.id,
    nama: row.nama,
    mentorId: row.mentor_id,
    subtesNama: firstNama(row.subtes),
    tingkatKelasLabel: TINGKAT_KELAS_LABEL[row.tingkat_kelas] ?? row.tingkat_kelas,
    jumlahSiswa: (row.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas").length,
    linkMeet: row.link_meet,
    jumlahSesi: row.jumlah_sesi,
  };
}

export interface SesiSiswaItem {
  enrollmentId: string;
  userId: string;
  nama: string;
  avatarUrl: string | null;
  sesiValidCount: number;
  /** Nomor sesi paling kecil yang BELUM ditandai mentor — null kalau semua
   * sesi (1..jumlahSesi) sudah ditandai (tombol "Tandai Selesai" disembunyikan). */
  sesiBerikutnya: number | null;
}

type UserJoin = { id: string; nama: string; avatar_url: string | null } | { id: string; nama: string; avatar_url: string | null }[] | null;

function firstUser(value: UserJoin): { id: string; nama: string; avatar_url: string | null } | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Progress sesi (Absensi, PRD 7.5.5) per siswa lunas di kelas ini — dasar
 * tombol "Tandai Sesi Hari Ini Selesai" & progress "Sesi X dari Y" di halaman
 * Kelas Saya (Mentor). `sesiValidCount` = COUNT sesi_kelas WHERE
 * dikonfirmasi_mentor=true AND status_siswa != 'disangkal' (BR-34/FR-A4) —
 * sesi yang masih disangkal & menunggu review Admin TIDAK dihitung progress.
 */
export async function getSesiSiswaByKelasId(kelasId: string): Promise<SesiSiswaItem[]> {
  const { data: enrollmentRows, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("id, users:user_id(id, nama, avatar_url)")
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas");

  if (enrollmentError) {
    console.error("[getSesiSiswaByKelasId] query enrollments failed:", enrollmentError);
    return [];
  }
  if (!enrollmentRows || enrollmentRows.length === 0) return [];

  const enrollmentIds = enrollmentRows.map((r) => r.id as string);
  const { data: sesiRows, error: sesiError } = await supabaseServer
    .from("sesi_kelas")
    .select("enrollment_id, nomor_sesi, dikonfirmasi_mentor, status_siswa")
    .in("enrollment_id", enrollmentIds)
    .order("nomor_sesi", { ascending: true });

  if (sesiError) {
    console.error("[getSesiSiswaByKelasId] query sesi_kelas failed:", sesiError);
  }

  type SesiRow = { enrollment_id: string; nomor_sesi: number; dikonfirmasi_mentor: boolean; status_siswa: string };
  const sesiByEnrollment = new Map<string, SesiRow[]>();
  for (const row of (sesiRows ?? []) as unknown as SesiRow[]) {
    const list = sesiByEnrollment.get(row.enrollment_id) ?? [];
    list.push(row);
    sesiByEnrollment.set(row.enrollment_id, list);
  }

  return (enrollmentRows as unknown as { id: string; users: UserJoin }[])
    .map((row) => {
      const user = firstUser(row.users);
      if (!user) return null;
      const sesiList = sesiByEnrollment.get(row.id) ?? [];
      const sesiValidCount = sesiList.filter((s) => s.dikonfirmasi_mentor && s.status_siswa !== "disangkal").length;
      const sesiBerikutnya = sesiList.find((s) => !s.dikonfirmasi_mentor)?.nomor_sesi ?? null;
      return {
        enrollmentId: row.id,
        userId: user.id,
        nama: user.nama,
        avatarUrl: user.avatar_url,
        sesiValidCount,
        sesiBerikutnya,
      };
    })
    .filter((item): item is SesiSiswaItem => item !== null);
}

/** List materi SEMUA status (beda dari halaman Siswa yang cuma tampilkan published). */
export async function getMentorMateriList(kelasId: string): Promise<MentorMateriItem[]> {
  const { data, error } = await supabaseServer
    .from("materi")
    .select("id, judul, tipe, status, sumber, created_at")
    .eq("kelas_id", kelasId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMentorMateriList] query failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    judul: row.judul as string,
    tipe: row.tipe as MentorMateriItem["tipe"],
    status: row.status as MentorMateriItem["status"],
    sumber: row.sumber as MentorMateriItem["sumber"],
    createdAt: row.created_at as string,
  }));
}
