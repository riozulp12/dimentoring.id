import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { labelMentorSesi } from "@/lib/shared/statusSesi";

/**
 * Data layer "Sesi Perlu Ditinjau" (Admin) — PRD Bagian 7.5.5 FR-A3, BR-34.
 * List sesi_kelas yang disangkal siswa (perlu_review_admin=true), Admin
 * putuskan Setujui (valid) atau Batalkan (sesi kembali "belum terjadi").
 */

export interface SesiReviewItem {
  id: string;
  nomorSesi: number;
  tanggalDilaksanakan: string | null;
  dikonfirmasiMentorPada: string | null;
  dikonfirmasiSiswaPada: string | null;
  siswaNama: string;
  kelasId: string;
  kelasNama: string;
  /** Mentor kelas (kelas.mentor_id, kolom lama) — fallback untuk sesi lama. */
  mentorNama: string | null;
  /** "Nama Mentor — Mapel" dari mentor yang MENANDAI sesi ini — null untuk
   * sesi lama (mentor_id NULL). */
  mentorSesiLabel: string | null;
}

type NamaJoin = { nama: string } | { nama: string }[] | null;

function firstNama(value: NamaJoin): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.nama ?? null;
}

interface KelasJoin {
  id: string;
  nama: string;
  mentor: NamaJoin;
}

interface EnrollmentJoin {
  users: NamaJoin;
  kelas: KelasJoin | KelasJoin[] | null;
}

interface SesiReviewRow {
  id: string;
  nomor_sesi: number;
  tanggal_dilaksanakan: string | null;
  dikonfirmasi_mentor_pada: string | null;
  dikonfirmasi_siswa_pada: string | null;
  nama_mapel: string | null;
  mentor_sesi: NamaJoin;
  enrollment: EnrollmentJoin | EnrollmentJoin[] | null;
}

export async function getSesiPerluReview(): Promise<SesiReviewItem[]> {
  const { data, error } = await supabaseServer
    .from("sesi_kelas")
    .select(
      "id, nomor_sesi, tanggal_dilaksanakan, dikonfirmasi_mentor_pada, dikonfirmasi_siswa_pada, nama_mapel, mentor_sesi:mentor_id(nama), enrollment:enrollment_id(users:user_id(nama), kelas:kelas_id(id, nama, mentor:mentor_id(nama)))",
    )
    .eq("perlu_review_admin", true)
    .order("dikonfirmasi_siswa_pada", { ascending: true });

  if (error) {
    console.error("[getSesiPerluReview] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as SesiReviewRow[])
    .map((row) => {
      const enrollment = Array.isArray(row.enrollment) ? (row.enrollment[0] ?? null) : row.enrollment;
      if (!enrollment) return null;
      const kelas = Array.isArray(enrollment.kelas) ? (enrollment.kelas[0] ?? null) : enrollment.kelas;
      if (!kelas) return null;
      return {
        id: row.id,
        nomorSesi: row.nomor_sesi,
        tanggalDilaksanakan: row.tanggal_dilaksanakan,
        dikonfirmasiMentorPada: row.dikonfirmasi_mentor_pada,
        dikonfirmasiSiswaPada: row.dikonfirmasi_siswa_pada,
        siswaNama: firstNama(enrollment.users) ?? "-",
        kelasId: kelas.id,
        kelasNama: kelas.nama,
        mentorNama: firstNama(kelas.mentor),
        mentorSesiLabel: labelMentorSesi(firstNama(row.mentor_sesi), row.nama_mapel),
      };
    })
    .filter((item): item is SesiReviewItem => item !== null);
}
