import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { getInfoBeasiswaEvent } from "@/lib/dashboard/getInfoBeasiswaEvent";
import { formatJadwal } from "@/lib/shared/formatJadwal";
import { formatDeadline } from "@/lib/shared/formatDeadline";
import type {
  InfoBeasiswaItem,
  KelasTerdaftarItem,
  ProgressBelajarItem,
} from "@/components/dashboard/DashboardOverview";

/**
 * Data layer Dashboard Siswa — PRD Bagian 7.4 (Assessment) & Bagian 13 (Data
 * Model). Satu fungsi ambil semua data yang dibutuhkan page.tsx sekaligus,
 * supaya tidak banyak round-trip terpisah dari Server Component.
 */

export interface TargetPtnData {
  targetJenjang: string;
  targetJurusan: string;
  targetUniversitas: string;
  /** Persis dari database, sudah diformat jadi string tampilan (mis. "2,32%"). */
  keketatanScore: string;
  /** Persis dari database (mis. "Sangat Ketat"), teksnya TIDAK diubah. */
  keketatanLabel: string;
}

export interface SiswaDashboardData {
  targetPtn: TargetPtnData | null;
  jumlahKelas: number;
  badgeKelas: string | null;
  nilaiTryoutTertinggi: number | null;
  tryoutSubtes: string | null;
  badgeTryout: string | null;
  totalPoin: number;
  level: string | null;
  progressBelajar: ProgressBelajarItem[];
  kelasTerdaftar: KelasTerdaftarItem[];
  infoBeasiswa: InfoBeasiswaItem[];
}

/**
 * PLACEHOLDER tier badge "Kelasmu" — belum ada aturan bisnis resmi, cuma
 * ambang batas sementara supaya card tidak kosong. Ganti kalau tim produk
 * sudah tetapkan rumus/tier final.
 */
export function getBadgeKelas(jumlahKelas: number): string | null {
  if (jumlahKelas <= 0) return null;
  if (jumlahKelas <= 3) return "Mulai Bagus";
  if (jumlahKelas <= 7) return "Konsisten";
  return "Fantastis";
}

/**
 * PLACEHOLDER tier badge "Tryout Terbaikmu" — sama seperti getBadgeKelas,
 * ambang skor di bawah ini SEMENTARA (belum ada skala resmi dari tim produk).
 */
export function getBadgeTryout(skor: number): string {
  if (skor < 500) return "Terus Berlatih!";
  if (skor < 800) return "Lumayan!";
  return "Skor Impresif!";
}

function formatKeketatanScore(score: number): string {
  return `${score.toFixed(2).replace(".", ",")}%`;
}

/** 1. Target PTN — dari pilihan urutan_pilihan=1 di assessment TERBARU siswa. */
async function getTargetPtn(userId: string): Promise<TargetPtnData | null> {
  const { data: assessment } = await supabaseServer
    .from("assessments")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assessment) return null;

  const { data: pilihan } = await supabaseServer
    .from("assessment_pilihan")
    .select(
      "keketatan_score, keketatan_label, ptn_jurusan:ptn_jurusan_id(nama_universitas, nama_jurusan, jenjang)",
    )
    .eq("assessment_id", assessment.id)
    .eq("urutan_pilihan", 1)
    .eq("is_rekomendasi", false)
    .maybeSingle();

  if (!pilihan) return null;

  const ptnJurusan = pilihan.ptn_jurusan as unknown as {
    nama_universitas: string;
    nama_jurusan: string;
    jenjang: string;
  } | null;
  if (!ptnJurusan) return null;

  return {
    targetJenjang: ptnJurusan.jenjang,
    targetJurusan: ptnJurusan.nama_jurusan,
    targetUniversitas: ptnJurusan.nama_universitas,
    keketatanScore: formatKeketatanScore(Number(pilihan.keketatan_score)),
    keketatanLabel: pilihan.keketatan_label as string,
  };
}

/** 2. Jumlah kelas yang sudah lunas + badge tier-nya. */
async function getJumlahKelas(userId: string): Promise<{ jumlahKelas: number; badgeKelas: string | null }> {
  const { count } = await supabaseServer
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status_pembayaran", "lunas");

  const jumlahKelas = count ?? 0;
  return { jumlahKelas, badgeKelas: getBadgeKelas(jumlahKelas) };
}

/** 3. Skor tryout tertinggi + kategori tryout terkait. */
async function getNilaiTryoutTertinggi(userId: string): Promise<{
  nilaiTryoutTertinggi: number | null;
  tryoutSubtes: string | null;
  badgeTryout: string | null;
}> {
  const { data } = await supabaseServer
    .from("tryout_attempts")
    .select("skor, tryouts:tryout_id(kategori)")
    .eq("user_id", userId)
    .not("skor", "is", null)
    .order("skor", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data || data.skor === null) {
    return { nilaiTryoutTertinggi: null, tryoutSubtes: null, badgeTryout: null };
  }

  const tryout = data.tryouts as unknown as { kategori: string } | null;
  const skor = Number(data.skor);

  return {
    nilaiTryoutTertinggi: skor,
    tryoutSubtes: tryout?.kategori ? tryout.kategori.toUpperCase() : null,
    badgeTryout: getBadgeTryout(skor),
  };
}

/** 4. Poin & level gamifikasi — 0/null kalau baris gamifikasi_profiles belum pernah ke-generate. */
async function getPoinReferral(userId: string): Promise<{ totalPoin: number; level: string | null }> {
  const { data } = await supabaseServer
    .from("gamifikasi_profiles")
    .select("total_poin, level")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return { totalPoin: 0, level: null };
  return { totalPoin: data.total_poin, level: data.level };
}

/** 5 & 6. Progress Belajar + Kelas Terdaftar — sumbernya sama (enrollments JOIN kelas), satu query. */
async function getEnrollmentsWithKelas(userId: string): Promise<{
  progressBelajar: ProgressBelajarItem[];
  kelasTerdaftar: KelasTerdaftarItem[];
}> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("progres_persen, kelas:kelas_id(nama, jadwal)")
    .eq("user_id", userId);

  if (error) {
    console.error("[getEnrollmentsWithKelas] query failed:", error);
    return { progressBelajar: [], kelasTerdaftar: [] };
  }

  const rows = (data ?? []) as unknown as {
    progres_persen: number;
    kelas: { nama: string; jadwal: unknown } | null;
  }[];

  const progressBelajar: ProgressBelajarItem[] = rows
    .filter((r) => r.kelas)
    .map((r) => ({ subtes: r.kelas!.nama, persen: r.progres_persen }));

  const kelasTerdaftar: KelasTerdaftarItem[] = rows
    .filter((r) => r.kelas)
    .map((r) => ({ nama: r.kelas!.nama, jadwal: formatJadwal(r.kelas!.jadwal) }));

  return { progressBelajar, kelasTerdaftar };
}

/** 7. Info Beasiswa & Event — reuse query shared dengan Dashboard Mentor. */
async function getInfoBeasiswa(): Promise<InfoBeasiswaItem[]> {
  const items = await getInfoBeasiswaEvent();
  return items.map((item) => ({ nama: item.judul, tanggal: formatDeadline(item.deadline) }));
}

export async function getSiswaDashboardData(userId: string): Promise<SiswaDashboardData> {
  const [targetPtn, kelasInfo, tryoutInfo, referralInfo, enrollmentInfo, infoBeasiswa] = await Promise.all([
    getTargetPtn(userId),
    getJumlahKelas(userId),
    getNilaiTryoutTertinggi(userId),
    getPoinReferral(userId),
    getEnrollmentsWithKelas(userId),
    getInfoBeasiswa(),
  ]);

  return {
    targetPtn,
    jumlahKelas: kelasInfo.jumlahKelas,
    badgeKelas: kelasInfo.badgeKelas,
    nilaiTryoutTertinggi: tryoutInfo.nilaiTryoutTertinggi,
    tryoutSubtes: tryoutInfo.tryoutSubtes,
    badgeTryout: tryoutInfo.badgeTryout,
    totalPoin: referralInfo.totalPoin,
    level: referralInfo.level,
    progressBelajar: enrollmentInfo.progressBelajar,
    kelasTerdaftar: enrollmentInfo.kelasTerdaftar,
    infoBeasiswa,
  };
}
