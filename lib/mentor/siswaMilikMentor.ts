import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { siswaMilikMentor, type SubtesKepemilikan } from "@/lib/shared/siswaMentor";
import { getPenerimaanSubtesSiswa, type SubtesSiswaDetail } from "@/lib/mentor/statusPenerimaanSiswa";

/**
 * Pembaca server untuk aturan kepemilikan siswa (lib/shared/siswaMentor.ts — SATU-SATUNYA tempat aturannya).
 * Dipakai profil/detail mentor di Admin, dashboard mentor, Siswa Binaan, dan Kelas Saya supaya semua halaman
 * menampilkan jumlah & daftar siswa yang SAMA.
 *
 * Kandidat kelas = kelas yang terkait mentor lewat kelas.mentor_id, kelas_mentor, atau penugasan tatap muka
 * (enrollments.mentor_offline_id) — himpunan yang sama dengan lib/mentor/aksesMentor.ts (Kelas Saya).
 * Hanya enrollment LUNAS. Pendaftar yang sudah resmi keluar TIDAK disaring di sini (kebijakan tiap halaman).
 *
 * Jumlah query tidak bergantung pada jumlah siswa per kelas: ~6 query tetap + 4 per 100 enrollment
 * (getPenerimaanSubtesSiswa). Galat database mana pun → "gagal" (sudah di-log); pemanggil menentukan
 * (tampilan mentor: kosong + log; tidak pernah menampilkan siswa yang bukan miliknya).
 */

export interface KepemilikanSiswa {
  mentorId: string;
  enrollmentId: string;
  userId: string;
  kelasId: string;
}

const UKURAN_BATCH = 100;

function bagi<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

/**
 * Siswa (enrollment lunas) milik tiap mentor. `mentorIds = null` → semua mentor (daftar Admin);
 * selain itu hanya mentor yang disebut. Satu baris per pasangan (mentor, enrollment).
 */
export async function getKepemilikanSiswa(mentorIds: string[] | null): Promise<KepemilikanSiswa[] | "gagal"> {
  const filterMentor = mentorIds ? new Set(mentorIds.filter((id) => id)) : null;
  if (filterMentor && filterMentor.size === 0) return [];

  // 1. Kelas kandidat.
  const kelasIds = new Set<string>();
  if (filterMentor) {
    const ids = Array.from(filterMentor);
    const [utamaRes, kelasMentorRes, offlineRes] = await Promise.all([
      supabaseServer.from("kelas").select("id").in("mentor_id", ids),
      supabaseServer.from("kelas_mentor").select("kelas_id").in("mentor_id", ids),
      supabaseServer.from("enrollments").select("kelas_id").in("mentor_offline_id", ids).eq("status_pembayaran", "lunas"),
    ]);
    const galat = utamaRes.error ?? kelasMentorRes.error ?? offlineRes.error;
    if (galat) {
      console.error("[getKepemilikanSiswa] query kelas kandidat gagal:", galat);
      return "gagal";
    }
    for (const row of utamaRes.data ?? []) kelasIds.add(row.id as string);
    for (const row of kelasMentorRes.data ?? []) kelasIds.add(row.kelas_id as string);
    for (const row of offlineRes.data ?? []) kelasIds.add(row.kelas_id as string);
  } else {
    const { data, error } = await supabaseServer.from("kelas").select("id");
    if (error) {
      console.error("[getKepemilikanSiswa] query kelas gagal:", error);
      return "gagal";
    }
    for (const row of data ?? []) kelasIds.add(row.id as string);
  }
  if (kelasIds.size === 0) return [];
  const daftarKelas = Array.from(kelasIds);

  // 2. Relasi kelas (kelas.mentor_id + kelas_mentor) dan enrollment lunas kelas-kelas itu.
  const [kelasRes, kelasMentorRes, enrollmentRes] = await Promise.all([
    supabaseServer.from("kelas").select("id, mentor_id").in("id", daftarKelas),
    supabaseServer.from("kelas_mentor").select("kelas_id, mentor_id").in("kelas_id", daftarKelas),
    supabaseServer
      .from("enrollments")
      .select("id, user_id, kelas_id, tanggal_daftar, mentor_offline_id")
      .in("kelas_id", daftarKelas)
      .eq("status_pembayaran", "lunas"),
  ]);
  const galat = kelasRes.error ?? kelasMentorRes.error ?? enrollmentRes.error;
  if (galat) {
    console.error("[getKepemilikanSiswa] query relasi kelas/enrollment gagal:", galat);
    return "gagal";
  }

  const terkaitPerKelas = new Map<string, Set<string>>();
  const tambahRelasi = (kelasId: string, mentorId: string | null) => {
    if (!mentorId) return;
    const set = terkaitPerKelas.get(kelasId) ?? new Set<string>();
    set.add(mentorId);
    terkaitPerKelas.set(kelasId, set);
  };
  for (const row of kelasRes.data ?? []) tambahRelasi(row.id as string, (row.mentor_id as string | null) ?? null);
  for (const row of kelasMentorRes.data ?? []) tambahRelasi(row.kelas_id as string, row.mentor_id as string);

  const enrollments = (enrollmentRes.data ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    kelasId: row.kelas_id as string,
    tanggalDaftar: (row.tanggal_daftar as string | null) ?? null,
    mentorOfflineId: (row.mentor_offline_id as string | null) ?? null,
  }));

  // 3. Penerima & pemegang aktif per subtes (pembantu bersama penjaga presensi) — per batch.
  const subtesPerEnrollment = new Map<string, SubtesKepemilikan[]>();
  for (const batch of bagi(enrollments.map((e) => e.id), UKURAN_BATCH)) {
    const detail = await getPenerimaanSubtesSiswa("", batch);
    if (detail === "gagal") return "gagal";
    for (const [enrollmentId, daftar] of detail) {
      subtesPerEnrollment.set(
        enrollmentId,
        daftar.map((s) => ({ mentorIdPenerima: s.mentorIdPenerima, mentorAktifSubtes: s.mentorAktifSubtes })),
      );
    }
  }

  // 4. Terapkan SATU aturan untuk tiap mentor yang terkait kelas (atau ditugaskan tatap muka).
  const hasil: KepemilikanSiswa[] = [];
  for (const enrollment of enrollments) {
    const terkait = terkaitPerKelas.get(enrollment.kelasId) ?? new Set<string>();
    const kandidat = new Set<string>(terkait);
    if (enrollment.mentorOfflineId) kandidat.add(enrollment.mentorOfflineId);
    for (const mentorId of kandidat) {
      if (filterMentor && !filterMentor.has(mentorId)) continue;
      const milik = siswaMilikMentor({
        mentorId,
        tanggalDaftar: enrollment.tanggalDaftar,
        mentorOfflineId: enrollment.mentorOfflineId,
        terkaitKelas: terkait.has(mentorId),
        subtes: subtesPerEnrollment.get(enrollment.id) ?? [],
      });
      if (milik) hasil.push({ mentorId, enrollmentId: enrollment.id, userId: enrollment.userId, kelasId: enrollment.kelasId });
    }
  }
  return hasil;
}

/** Enrollment id milik SATU mentor (kosong bila galat — sudah di-log; jangan pernah menampilkan yang bukan miliknya). */
export async function getEnrollmentMilikMentor(mentorId: string): Promise<Set<string>> {
  const hasil = await getKepemilikanSiswa([mentorId]);
  if (hasil === "gagal") return new Set();
  return new Set(hasil.map((row) => row.enrollmentId));
}

/**
 * Aturan yang SAMA (siswaMilikMentor) untuk pemanggil yang SUDAH memegang data penerimaan per subtes
 * (SubtesSiswaDetail dari getPenerimaanSubtesSiswa) — mis. detail Kelas Saya — supaya tidak membaca dua kali.
 */
export function milikDariPenerimaan(input: {
  mentorId: string;
  tanggalDaftar: string | Date | null | undefined;
  mentorOfflineId: string | null | undefined;
  terkaitKelas: boolean;
  subtes: SubtesSiswaDetail[];
}): boolean {
  return siswaMilikMentor({
    ...input,
    subtes: input.subtes.map((s) => ({ mentorIdPenerima: s.mentorIdPenerima, mentorAktifSubtes: s.mentorAktifSubtes })),
  });
}
