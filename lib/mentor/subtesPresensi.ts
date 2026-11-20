import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { kuotaSubtes, type SubtesPresensi } from "@/lib/shared/sesiEnrollment";

/**
 * Subtes siswa + kuota + sesi yang sudah ditandai per subtes, untuk penegakan kuota di route presensi
 * (lib/shared/sesiEnrollment.ts tentukanSubtesPresensi). "gagal" = error DB (sudah di-log; pemanggil menolak, fail-closed).
 * Sesi dihitung per sesi_kelas.subtes_id yang sudah ditandai mentor (dikonfirmasi_mentor = true).
 */
export async function getSubtesPresensiSiswa(enrollmentId: string): Promise<SubtesPresensi[] | "gagal"> {
  const [subtesRes, sesiRes] = await Promise.all([
    supabaseServer.from("enrollment_subtes").select("subtes_id, kuota_sesi, subtes:subtes_id(nama)").eq("enrollment_id", enrollmentId),
    supabaseServer.from("sesi_kelas").select("subtes_id").eq("enrollment_id", enrollmentId).eq("dikonfirmasi_mentor", true),
  ]);
  if (subtesRes.error || sesiRes.error) {
    console.error("[getSubtesPresensiSiswa] query failed:", subtesRes.error ?? sesiRes.error);
    return "gagal";
  }
  const terpakai = new Map<string, number>();
  for (const row of (sesiRes.data ?? []) as unknown as { subtes_id?: string | null }[]) {
    if (row.subtes_id) terpakai.set(row.subtes_id, (terpakai.get(row.subtes_id) ?? 0) + 1);
  }
  type Row = { subtes_id: string; kuota_sesi?: number | null; subtes?: { nama: string } | { nama: string }[] | null };
  return ((subtesRes.data ?? []) as unknown as Row[]).map((row) => {
    const subtes = Array.isArray(row.subtes) ? (row.subtes[0] ?? null) : (row.subtes ?? null);
    return {
      subtesId: row.subtes_id,
      nama: subtes?.nama ?? "subtes ini",
      kuota: kuotaSubtes(row),
      terpakai: terpakai.get(row.subtes_id) ?? 0,
    };
  });
}
