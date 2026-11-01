import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { hitungRataRataProgres } from "@/lib/shared/progresSesi";
import { getPendaftaranKeluar, getProgresSesiPerPendaftaran } from "@/lib/shared/progresSesiData";

/**
 * Data layer Dashboard Mentor — PRD Bagian 7.5.1/7.7 (revisi) & BR-7 (Mentor
 * cuma kelola kelas & siswa yang di-assign eksplisit Admin, sesuai Subtes
 * yang Diampu). Semua query di sini scoped ke mentor_id = user yang login.
 */

export interface MentorStats {
  kelasDiampu: number;
  siswaBinaan: number;
  /** null kalau belum ada siswa sama sekali (bukan 0%, supaya beda kasus "kosong" vs "0%"). */
  rataRataProgress: number | null;
  kontenMenungguReview: number;
}

export interface MentorKelasSiswaProgress {
  kelasId: string;
  kelasNama: string;
  siswa: { userId: string; nama: string; progresPersen: number }[];
}

export interface MentorKelasTerdaftar {
  id: string;
  nama: string;
  tingkatKelas: string;
  jadwal: unknown;
  subtesNama: string | null;
  jumlahSiswa: number;
}

interface EnrollmentRow {
  id: string;
  user_id: string;
  status_pembayaran: string;
  users: { nama: string; nama_panggilan: string | null } | null;
}

interface KelasWithEnrollments {
  id: string;
  nama: string;
  tingkat_kelas: string;
  jadwal: unknown;
  jumlah_sesi: number | null;
  subtes: { nama: string } | null;
  /** Hanya pendaftaran AKTIF: lunas dan belum keluar (tanggal_keluar kosong). */
  enrollments: EnrollmentRow[];
}

async function getMentorSubtesIds(userId: string): Promise<string[]> {
  const { data: profile } = await supabaseServer
    .from("mentor_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return [];

  const { data: rows } = await supabaseServer
    .from("mentor_subtes_diampu")
    .select("subtes_id")
    .eq("mentor_profile_id", profile.id);

  return (rows ?? []).map((r: { subtes_id: string }) => r.subtes_id);
}

/**
 * Kelas mentor + pendaftaran AKTIF-nya saja: status lunas (sama dengan halaman
 * Kelas Saya) dan belum resmi keluar (enrollments.tanggal_keluar kosong).
 * Siswa yang menunggu bayar / batal / sudah keluar tidak ikut hitungan
 * "Siswa Binaan", rata-rata progress, maupun daftar progress.
 */
async function getMentorKelasWithEnrollments(userId: string): Promise<KelasWithEnrollments[]> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      "id, nama, tingkat_kelas, jadwal, jumlah_sesi, subtes:subtes_id(nama), enrollments(id, user_id, status_pembayaran, users:user_id(nama, nama_panggilan))",
    )
    .eq("mentor_id", userId);

  if (error) {
    console.error("[getMentorKelasWithEnrollments] query failed:", error);
    return [];
  }

  const kelasList = (data ?? []) as unknown as KelasWithEnrollments[];
  const lunas = (k: KelasWithEnrollments) => (k.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas");
  const keluar = await getPendaftaranKeluar(kelasList.flatMap((k) => lunas(k).map((e) => e.id)));

  return kelasList.map((k) => ({ ...k, enrollments: lunas(k).filter((e) => !keluar.has(e.id)) }));
}

/** Persen Progress Kehadiran tiap pendaftaran aktif (enrollment id → persen). */
async function getPersenPerPendaftaran(kelasList: KelasWithEnrollments[]): Promise<Map<string, number>> {
  const progres = await getProgresSesiPerPendaftaran(
    kelasList.flatMap((k) => (k.enrollments ?? []).map((e) => ({ id: e.id, jumlahSesi: k.jumlah_sesi }))),
  );
  return new Map(Array.from(progres, ([id, p]) => [id, p.persen]));
}

/** Bagian 3: 4 stat card ("Kelas Diampu", "Siswa Binaan", "Rata-rata Progress", "Konten AI Menunggu Review"). */
export async function getMentorStats(userId: string): Promise<MentorStats> {
  const [kelasList, subtesIds] = await Promise.all([
    getMentorKelasWithEnrollments(userId),
    getMentorSubtesIds(userId),
  ]);

  const kelasDiampu = kelasList.length;
  const allEnrollments = kelasList.flatMap((k) => k.enrollments ?? []);
  const siswaIds = new Set(allEnrollments.map((e) => e.user_id));
  const siswaBinaan = siswaIds.size;
  // Rata-rata Progress Kehadiran (sesi terhitung / jumlah_sesi) pendaftaran aktif.
  const persenPerPendaftaran = await getPersenPerPendaftaran(kelasList);
  const rataRataProgress = hitungRataRataProgres(allEnrollments.map((e) => persenPerPendaftaran.get(e.id) ?? 0));

  let kontenMenungguReview = 0;
  if (subtesIds.length > 0) {
    const [soalRes, materiRes] = await Promise.all([
      supabaseServer
        .from("soal_ai")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft")
        .in("subtes_id", subtesIds),
      supabaseServer
        .from("materi")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft")
        .in("subtes_id", subtesIds),
    ]);
    kontenMenungguReview = (soalRes.count ?? 0) + (materiRes.count ?? 0);
  }

  return { kelasDiampu, siswaBinaan, rataRataProgress, kontenMenungguReview };
}

/** Card "Progress Siswa Binaan" — group by kelas, list siswa + progress bar. */
export async function getMentorProgressByKelas(userId: string): Promise<MentorKelasSiswaProgress[]> {
  const kelasList = await getMentorKelasWithEnrollments(userId);
  const persenPerPendaftaran = await getPersenPerPendaftaran(kelasList);

  return kelasList.map((k) => ({
    kelasId: k.id,
    kelasNama: k.nama,
    siswa: (k.enrollments ?? []).map((e) => ({
      userId: e.user_id,
      nama: e.users?.nama_panggilan || e.users?.nama || "Siswa",
      progresPersen: persenPerPendaftaran.get(e.id) ?? 0,
    })),
  }));
}

/** Card "Kelas Terdaftar" — list kelas + jadwal. */
export async function getMentorKelasTerdaftar(userId: string): Promise<MentorKelasTerdaftar[]> {
  const kelasList = await getMentorKelasWithEnrollments(userId);

  return kelasList.map((k) => ({
    id: k.id,
    nama: k.nama,
    tingkatKelas: k.tingkat_kelas,
    jadwal: k.jadwal,
    subtesNama: k.subtes?.nama ?? null,
    jumlahSiswa: (k.enrollments ?? []).length,
  }));
}
