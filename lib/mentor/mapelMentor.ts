import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Mapel (nama Subtes) yang diajar seorang mentor untuk satu siswa di satu
 * kelas — disimpan sebagai SNAPSHOT sesi_kelas.nama_mapel saat mentor
 * menandai sesi (PRD 7.5.5 multi-mentor).
 *
 * Sumber: kelas_subtes_mentor ("di kelas ini, Subtes X diajar Mentor Y").
 * kelas_mentor TIDAK punya kolom mapel. Kelas tanpa pasangan sama sekali
 * (kelas offline, atau kelas satu subtes lama) memakai subtes kelas itu
 * (kelas.subtes_id); kelas tanpa subtes (Konsultasi/Pendampingan) → null.
 */

export interface PasanganSubtesMentor {
  mentorId: string;
  subtesId: string;
  subtesNama: string;
}

export interface InputNamaMapel {
  mentorId: string;
  /** SEMUA pasangan kelas_subtes_mentor kelas ini (semua mentor). */
  pasanganKelas: PasanganSubtesMentor[];
  /** enrollment_subtes siswa (kelas paket — siswa pilih maks. 3); kosong = tidak memilih. */
  subtesSiswaIds: string[];
  /** Nama subtes kelas (kelas.subtes_id) — dipakai kalau kelas tidak punya pasangan. */
  subtesKelasNama: string | null;
}

/**
 * Murni (tanpa DB). Mentor dengan >1 subtes di kelas ini: dipersempit ke
 * subtes yang dipilih siswa; kalau masih >1 (atau siswa tidak memilih),
 * semua nama digabung urut abjad ("A, B") — snapshot apa adanya, bukan tebakan.
 */
export function tentukanNamaMapel(input: InputNamaMapel): string | null {
  if (input.pasanganKelas.length === 0) return input.subtesKelasNama;

  const milikMentor = input.pasanganKelas.filter((p) => p.mentorId === input.mentorId);
  if (milikMentor.length === 0) return null;

  const dipilihSiswa = milikMentor.filter((p) => input.subtesSiswaIds.includes(p.subtesId));
  const dipakai = dipilihSiswa.length > 0 ? dipilihSiswa : milikMentor;
  const nama = Array.from(new Set(dipakai.map((p) => p.subtesNama))).sort((a, b) => a.localeCompare(b, "id"));
  return nama.join(", ");
}

type Join<T> = T | T[] | null;
function first<T>(value: Join<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** "gagal" = error DB (sudah di-log). */
export async function getNamaMapelMentor(
  mentorId: string,
  kelas: { id: string; subtesNama: string | null },
  enrollmentId: string,
): Promise<string | null | "gagal"> {
  const [pasanganRes, pilihanRes] = await Promise.all([
    supabaseServer.from("kelas_subtes_mentor").select("mentor_id, subtes_id, subtes:subtes_id(nama)").eq("kelas_id", kelas.id),
    supabaseServer.from("enrollment_subtes").select("subtes_id").eq("enrollment_id", enrollmentId),
  ]);
  if (pasanganRes.error || pilihanRes.error) {
    console.error("[getNamaMapelMentor] query failed:", pasanganRes.error ?? pilihanRes.error);
    return "gagal";
  }

  type PasanganRow = { mentor_id: string; subtes_id: string; subtes: Join<{ nama: string }> };
  const pasanganKelas = ((pasanganRes.data ?? []) as unknown as PasanganRow[])
    .map((r) => ({ mentorId: r.mentor_id, subtesId: r.subtes_id, subtesNama: first(r.subtes)?.nama ?? "" }))
    .filter((p) => p.subtesNama !== "");

  return tentukanNamaMapel({
    mentorId,
    pasanganKelas,
    subtesSiswaIds: (pilihanRes.data ?? []).map((r) => r.subtes_id as string),
    subtesKelasNama: kelas.subtesNama,
  });
}
