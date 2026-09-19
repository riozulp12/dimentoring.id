import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Generate baris sesi_kelas (PRD 7.5.5, Bagian 13 — SesiKelas) untuk satu
 * enrollment baru — nomor_sesi 1..jumlahSesi, tanggal_dilaksanakan NULL dulu
 * (diisi mentor waktu sesi itu benar-benar ditandai selesai). Dipanggil dari
 * app/api/payment/webhook/route.ts TEPAT SETELAH enrollment 'lunas' dibuat.
 *
 * Idempotent: cek dulu apakah enrollment ini sudah punya baris sesi_kelas
 * (mis. retry webhook yang lolos idempotency check gateway_reference tapi
 * entah kenapa terpanggil dua kali) — kalau sudah ada, TIDAK generate ulang,
 * supaya tidak melanggar UNIQUE(enrollment_id, nomor_sesi) atau menduplikasi
 * progress absensi yang sudah berjalan.
 */
export async function generateSesiKelasUntukEnrollment(enrollmentId: string, jumlahSesi: number): Promise<void> {
  const { count, error: countError } = await supabaseServer
    .from("sesi_kelas")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId);

  if (countError) {
    console.error("[generateSesiKelasUntukEnrollment] query existing failed:", countError);
    return;
  }
  if ((count ?? 0) > 0) return;

  const rows = Array.from({ length: jumlahSesi }, (_, i) => ({
    enrollment_id: enrollmentId,
    nomor_sesi: i + 1,
  }));

  const { error: insertError } = await supabaseServer.from("sesi_kelas").insert(rows);
  if (insertError) {
    console.error("[generateSesiKelasUntukEnrollment] insert failed:", insertError);
  }
}
