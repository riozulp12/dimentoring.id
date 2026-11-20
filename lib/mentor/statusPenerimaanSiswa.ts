import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { statusPenerimaanSubtes, type SubtesSiswaPenerimaan } from "@/lib/shared/penerimaanSiswa";

/**
 * Pembantu bersama penjaga presensi & daftar "Menunggu diterima": membaca status
 * penerimaan per subtes untuk SATU atau BANYAK enrollment sekaligus.
 *
 * Maks. 4 query per panggilan (bukan per siswa):
 *   1. enrollments           (id, kelas_id, tanggal_daftar)
 *   2. enrollment_subtes     (id, enrollment_id, subtes_id, mentor_id)
 *   3. kelas_subtes_mentor   (pemegang subtes per kelas, + nama subtes)
 *   4. user_roles            (pemegang yang AKTIF)
 * (query 3-4 dilewati bila tidak ada baris enrollment_subtes.)
 *
 * Status memakai statusPenerimaanSubtes (lib/shared/penerimaanSiswa.ts) — dihitung
 * saat baca, tanpa hook pembayaran. Galat database apa pun → "gagal" (sudah di-log);
 * pemanggil WAJIB memperlakukannya sebagai DITOLAK (fail-closed).
 */

export interface SubtesSiswaDetail extends SubtesSiswaPenerimaan {
  enrollmentSubtesId: string;
  subtesId: string;
  /** Kosong bila subtes tidak punya pasangan mentor di kelas itu. */
  subtesNama: string;
  /** Mentor AKTIF pemegang subtes ini di kelas ini (semua mentor, bukan hanya yang bertanya). */
  mentorAktifSubtes: string[];
  /** enrollment_subtes.kuota_sesi (sesi pilihan siswa); null = tanpa batas per subtes. */
  kuotaSesi?: number | null;
}

export async function getPenerimaanSubtesSiswa(
  mentorId: string,
  enrollmentIds: string[],
): Promise<Map<string, SubtesSiswaDetail[]> | "gagal"> {
  const ids = Array.from(new Set(enrollmentIds.filter((id) => id)));
  const hasil = new Map<string, SubtesSiswaDetail[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return hasil;

  const [enrollmentRes, subtesRes] = await Promise.all([
    supabaseServer.from("enrollments").select("id, kelas_id, tanggal_daftar").in("id", ids),
    supabaseServer.from("enrollment_subtes").select("id, enrollment_id, subtes_id, mentor_id, kuota_sesi").in("enrollment_id", ids),
  ]);
  if (enrollmentRes.error || subtesRes.error) {
    console.error("[getPenerimaanSubtesSiswa] query enrollment/enrollment_subtes failed:", enrollmentRes.error ?? subtesRes.error);
    return "gagal";
  }
  const subtesRows = subtesRes.data ?? [];
  if (subtesRows.length === 0) return hasil;

  const enrollmentById = new Map(
    (enrollmentRes.data ?? []).map((row) => [row.id as string, { kelasId: row.kelas_id as string, tanggalDaftar: (row.tanggal_daftar as string | null) ?? null }]),
  );
  const kelasIds = Array.from(new Set(Array.from(enrollmentById.values()).map((e) => e.kelasId)));

  const { data: pasanganRows, error: pasanganError } = await supabaseServer
    .from("kelas_subtes_mentor")
    .select("kelas_id, subtes_id, mentor_id, subtes:subtes_id(nama)")
    .in("kelas_id", kelasIds);
  if (pasanganError) {
    console.error("[getPenerimaanSubtesSiswa] query kelas_subtes_mentor failed:", pasanganError);
    return "gagal";
  }
  type SubtesJoin = { nama: string } | { nama: string }[] | null;
  const pasangan = ((pasanganRows ?? []) as unknown as { kelas_id: string; subtes_id: string; mentor_id: string; subtes: SubtesJoin }[]).map((row) => ({
    kelasId: row.kelas_id,
    subtesId: row.subtes_id,
    mentorId: row.mentor_id,
    subtesNama: (Array.isArray(row.subtes) ? row.subtes[0]?.nama : row.subtes?.nama) ?? "",
  }));

  const pemegangIds = Array.from(new Set(pasangan.map((p) => p.mentorId)));
  const aktifIds = new Set<string>();
  if (pemegangIds.length > 0) {
    const { data: roleRows, error: roleError } = await supabaseServer
      .from("user_roles")
      .select("user_id")
      .in("user_id", pemegangIds)
      .eq("role_type", "mentor")
      .eq("status", "active");
    if (roleError) {
      console.error("[getPenerimaanSubtesSiswa] query user_roles failed:", roleError);
      return "gagal";
    }
    for (const row of roleRows ?? []) aktifIds.add(row.user_id as string);
  }

  for (const row of subtesRows) {
    const enrollment = enrollmentById.get(row.enrollment_id as string);
    if (!enrollment) continue;
    const pasanganSubtes = pasangan.filter((p) => p.kelasId === enrollment.kelasId && p.subtesId === row.subtes_id);
    const mentorAktifSubtes = Array.from(new Set(pasanganSubtes.filter((p) => aktifIds.has(p.mentorId)).map((p) => p.mentorId)));
    const mentorIdPenerima = (row.mentor_id as string | null) ?? null;
    const daftar = hasil.get(row.enrollment_id as string) ?? [];
    daftar.push({
      enrollmentSubtesId: row.id as string,
      subtesId: row.subtes_id as string,
      subtesNama: pasanganSubtes[0]?.subtesNama ?? "",
      status: statusPenerimaanSubtes({ mentorIdPenerima, mentorAktifSubtes, tanggalDaftar: enrollment.tanggalDaftar }),
      mentorMemegang: mentorAktifSubtes.includes(mentorId),
      mentorIdPenerima,
      kuotaSesi: typeof row.kuota_sesi === "number" ? (row.kuota_sesi as number) : null,
      mentorAktifSubtes,
    });
    hasil.set(row.enrollment_id as string, daftar);
  }
  return hasil;
}
