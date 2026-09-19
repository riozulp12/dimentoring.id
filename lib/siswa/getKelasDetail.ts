import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { formatJadwal } from "@/lib/shared/formatJadwal";

/**
 * Data layer halaman Detail Kelas — PRD Bagian 7.5.1 (Materi) & Bagian 13
 * (kelas, enrollments, materi, materi_progress).
 */

export type MateriTipe = "video" | "dokumen" | "rangkuman_teks";

export interface KelasDetailData {
  id: string;
  nama: string;
  mentorNama: string | null;
  jadwal: string;
  linkMeet: string | null;
  subtesNama: string | null;
  deskripsi: string | null;
  modePembelajaran: string;
  jumlahSesi: number;
}

export interface MateriItem {
  id: string;
  judul: string;
  tipe: MateriTipe;
  konten: string;
  selesai: boolean;
  /** Nama Subtes materi ini (materi.subtes_id) — null kalau materi umum,
   * tidak terikat subtes tertentu. */
  subtesNama: string | null;
}

export interface MateriPreviewItem {
  id: string;
  judul: string;
  tipe: MateriTipe;
}

type NamaJoin = { nama: string } | { nama: string }[] | null;

function firstNama(value: NamaJoin): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.nama ?? null;
}

export async function getKelasDetail(kelasId: string): Promise<KelasDetailData | null> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      "id, nama, jadwal, link_meet, deskripsi, mode_pembelajaran, jumlah_sesi, mentor:mentor_id(nama), subtes:subtes_id(nama)",
    )
    .eq("id", kelasId)
    .maybeSingle();

  if (error) {
    console.error("[getKelasDetail] query failed:", error);
    return null;
  }
  if (!data) return null;

  type Row = {
    id: string;
    nama: string;
    jadwal: unknown;
    link_meet: string | null;
    deskripsi: string | null;
    mode_pembelajaran: string;
    jumlah_sesi: number;
    mentor: NamaJoin;
    subtes: NamaJoin;
  };
  const row = data as unknown as Row;

  return {
    id: row.id,
    nama: row.nama,
    mentorNama: firstNama(row.mentor),
    jadwal: formatJadwal(row.jadwal),
    linkMeet: row.link_meet,
    subtesNama: firstNama(row.subtes),
    deskripsi: row.deskripsi,
    modePembelajaran: row.mode_pembelajaran,
    jumlahSesi: row.jumlah_sesi,
  };
}

export async function getEnrollmentStatus(
  userId: string,
  kelasId: string,
): Promise<{
  enrollmentId: string | null;
  statusPembayaran: "menunggu" | "lunas" | "batal" | null;
  progresPersen: number;
}> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("id, status_pembayaran, progres_persen")
    .eq("user_id", userId)
    .eq("kelas_id", kelasId)
    .maybeSingle();

  if (error) {
    console.error("[getEnrollmentStatus] query failed:", error);
    return { enrollmentId: null, statusPembayaran: null, progresPersen: 0 };
  }
  if (!data) return { enrollmentId: null, statusPembayaran: null, progresPersen: 0 };

  return {
    enrollmentId: data.id as string,
    statusPembayaran: data.status_pembayaran as "menunggu" | "lunas" | "batal",
    progresPersen: data.progres_persen as number,
  };
}

export interface SesiPending {
  id: string;
  nomorSesi: number;
}

export interface SesiKehadiran {
  /** COUNT sesi_kelas WHERE dikonfirmasi_mentor=true AND status_siswa != 'disangkal' (BR-34/FR-A4). */
  validCount: number;
  /** Sesi paling awal yang ditandai mentor tapi BELUM direspons siswa — null
   * kalau tidak ada yang menunggu konfirmasi. */
  pending: SesiPending | null;
}

/** Absensi (PRD 7.5.5) — dasar progress "X dari Y sesi" + prompt konfirmasi
 * di halaman Detail Kelas Siswa. */
export async function getSesiKehadiran(enrollmentId: string): Promise<SesiKehadiran> {
  const { data, error } = await supabaseServer
    .from("sesi_kelas")
    .select("id, nomor_sesi, dikonfirmasi_mentor, status_siswa")
    .eq("enrollment_id", enrollmentId)
    .order("nomor_sesi", { ascending: true });

  if (error) {
    console.error("[getSesiKehadiran] query failed:", error);
    return { validCount: 0, pending: null };
  }

  const rows = (data ?? []) as { id: string; nomor_sesi: number; dikonfirmasi_mentor: boolean; status_siswa: string }[];
  const validCount = rows.filter((r) => r.dikonfirmasi_mentor && r.status_siswa !== "disangkal").length;
  const pendingRow = rows.find((r) => r.dikonfirmasi_mentor && r.status_siswa === "belum");

  return {
    validCount,
    pending: pendingRow ? { id: pendingRow.id, nomorSesi: pendingRow.nomor_sesi } : null,
  };
}

/**
 * Dipakai kalau siswa sudah lunas — seluruh materi published + status
 * "selesai" per-user, DIFILTER cuma materi dari Subtes yang dipilih siswa
 * ini di enrollment_subtes (kelas paket) — materi umum (subtes_id NULL)
 * selalu tampil untuk semua siswa terlepas dari pilihannya. Kalau siswa ini
 * TIDAK punya baris enrollment_subtes sama sekali (kelas tanpa subtes
 * tertentu, mis. Konsultasi/Pendampingan Mahasiswa, atau kelas lama sebelum
 * fitur paket ada), tidak ada filter yang diterapkan — tampilkan semua.
 */
export async function getMateriFull(kelasId: string, userId: string): Promise<MateriItem[]> {
  const { data: materiRows, error } = await supabaseServer
    .from("materi")
    .select("id, judul, tipe, konten, subtes_id, subtes:subtes_id(nama)")
    .eq("kelas_id", kelasId)
    .eq("status", "published")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getMateriFull] query materi failed:", error);
    return [];
  }

  const rows = materiRows ?? [];
  if (rows.length === 0) return [];

  const { data: enrollmentRow, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("kelas_id", kelasId)
    .maybeSingle();
  if (enrollmentError) {
    console.error("[getMateriFull] query enrollments failed:", enrollmentError);
  }

  let pilihanSubtesIds: Set<string> | null = null;
  if (enrollmentRow?.id) {
    const { data: subtesRows, error: subtesError } = await supabaseServer
      .from("enrollment_subtes")
      .select("subtes_id")
      .eq("enrollment_id", enrollmentRow.id);
    if (subtesError) {
      console.error("[getMateriFull] query enrollment_subtes failed:", subtesError);
    } else if (subtesRows && subtesRows.length > 0) {
      pilihanSubtesIds = new Set(subtesRows.map((r) => r.subtes_id as string));
    }
  }

  const { data: progressRows, error: progressError } = await supabaseServer
    .from("materi_progress")
    .select("materi_id, selesai")
    .eq("user_id", userId)
    .in(
      "materi_id",
      rows.map((r) => r.id as string),
    );

  if (progressError) {
    console.error("[getMateriFull] query materi_progress failed:", progressError);
  }

  const selesaiMap = new Map((progressRows ?? []).map((r) => [r.materi_id as string, r.selesai as boolean]));

  type Row = { id: string; judul: string; tipe: string; konten: string; subtes_id: string | null; subtes: NamaJoin };

  return (rows as unknown as Row[])
    .filter((r) => !pilihanSubtesIds || !r.subtes_id || pilihanSubtesIds.has(r.subtes_id))
    .map((r) => ({
      id: r.id,
      judul: r.judul,
      tipe: r.tipe as MateriTipe,
      konten: r.konten,
      selesai: selesaiMap.get(r.id) ?? false,
      subtesNama: firstNama(r.subtes),
    }));
}

/** Dipakai kalau siswa BELUM lunas/daftar — cuma judul + tipe, maksimal 3 item. */
export async function getMateriPreview(kelasId: string): Promise<MateriPreviewItem[]> {
  const { data, error } = await supabaseServer
    .from("materi")
    .select("id, judul, tipe")
    .eq("kelas_id", kelasId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(3);

  if (error) {
    console.error("[getMateriPreview] query failed:", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    judul: r.judul as string,
    tipe: r.tipe as MateriTipe,
  }));
}
