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
      "id, nama, tingkat_kelas, jadwal, kapasitas, link_meet, subtes:subtes_id(nama), enrollments(status_pembayaran)",
    )
    .eq("mentor_id", userId);

  if (error) {
    console.error("[getMentorKelasSaya] query failed:", error);
    return [];
  }

  type Row = {
    id: string;
    nama: string;
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
      "id, nama, mentor_id, tingkat_kelas, link_meet, subtes:subtes_id(nama), enrollments(status_pembayaran)",
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
  };
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
