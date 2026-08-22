import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { TIPE_KELAS_LABEL } from "@/lib/shared/kelasLabels";

/**
 * Data layer "Honor" (Mentor) — PRD Bagian 7.5.3 (rumus resmi) & Bagian 13
 * (kelas.tipe_kelas, honor_persentase_config, enrollments).
 */

export { TIPE_KELAS_LABEL };

export interface HonorKelasBreakdown {
  kelasId: string;
  kelasNama: string;
  tipeKelas: string;
  jumlahSiswaLunas: number;
  persentase: number;
  subtotal: number;
}

export interface HonorSummary {
  totalHonor: number;
  breakdown: HonorKelasBreakdown[];
}

/** [awal bulan berjalan, awal bulan depan) — dipakai filter enrollments.tanggal_daftar. */
function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Total Honor Bulan Ini — Rumus (7.5.3): Harga Kelas × Persentase
 * (sesuai tipe_kelas) / 100, DIHITUNG PER SISWA lunas (bukan flat per kelas
 * — kelas grouping isi 5 siswa = 5x hitungan, bukan 1x). Baru benar-benar
 * > 0 setelah Payment aktif (status 'lunas' cuma tercapai lewat webhook
 * Payment yang belum dibangun) — Rp0 di titik ini bukan bug.
 */
export async function getHonorBulanIni(mentorId: string): Promise<HonorSummary> {
  const { data: kelasList, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("id, nama, tipe_kelas, harga")
    .eq("mentor_id", mentorId);

  if (kelasError) {
    console.error("[getHonorBulanIni] query kelas failed:", kelasError);
    return { totalHonor: 0, breakdown: [] };
  }
  if (!kelasList || kelasList.length === 0) return { totalHonor: 0, breakdown: [] };

  const kelasIds = kelasList.map((k) => k.id as string);
  const { start, end } = getCurrentMonthRange();

  const [enrollmentRes, configRes] = await Promise.all([
    supabaseServer
      .from("enrollments")
      .select("kelas_id")
      .in("kelas_id", kelasIds)
      .eq("status_pembayaran", "lunas")
      .gte("tanggal_daftar", start)
      .lt("tanggal_daftar", end),
    supabaseServer.from("honor_persentase_config").select("tipe_kelas, persentase"),
  ]);

  if (enrollmentRes.error) {
    console.error("[getHonorBulanIni] query enrollments failed:", enrollmentRes.error);
    return { totalHonor: 0, breakdown: [] };
  }
  if (configRes.error) {
    console.error("[getHonorBulanIni] query honor_persentase_config failed:", configRes.error);
  }

  const persentaseByTipe = new Map(
    (configRes.data ?? []).map((row) => [row.tipe_kelas as string, Number(row.persentase)]),
  );

  const jumlahSiswaByKelas = new Map<string, number>();
  for (const row of enrollmentRes.data ?? []) {
    const id = row.kelas_id as string;
    jumlahSiswaByKelas.set(id, (jumlahSiswaByKelas.get(id) ?? 0) + 1);
  }

  let totalHonor = 0;
  const breakdown: HonorKelasBreakdown[] = kelasList.map((k) => {
    const kelasId = k.id as string;
    const tipeKelas = k.tipe_kelas as string;
    const jumlahSiswaLunas = jumlahSiswaByKelas.get(kelasId) ?? 0;
    const persentase = persentaseByTipe.get(tipeKelas) ?? 0;
    const harga = Number(k.harga);
    const subtotal = (jumlahSiswaLunas * harga * persentase) / 100;
    totalHonor += subtotal;

    return {
      kelasId,
      kelasNama: k.nama as string,
      tipeKelas,
      jumlahSiswaLunas,
      persentase,
      subtotal,
    };
  });

  return { totalHonor, breakdown };
}
