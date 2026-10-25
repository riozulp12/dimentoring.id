import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { susunStudioSoalMentor, type SoalRingkas, type StudioSoalMentorView } from "@/lib/shared/studio-soal/studioMentor";

/**
 * Data halaman mentor "Studio Soal" (PR 3a): subtes yang DITUGASKAN Admin ke
 * mentor ini (studio_soal_penugasan) + soal tulisannya. Mentor hanya melihat
 * miliknya sendiri — semua query difilter mentorId dari session di server.
 * Cek status mentor 'active' dilakukan pemanggil (BR-27).
 */
export async function getStudioSoalMentor(mentorId: string): Promise<StudioSoalMentorView | "gagal"> {
  const [penugasanRes, soalRes] = await Promise.all([
    supabaseServer.from("studio_soal_penugasan").select("subtes_id, subtes:subtes_id(id, nama)").eq("mentor_id", mentorId),
    supabaseServer
      .from("soal_bank")
      .select("id, subtes_id, tipe, status, versi, redaksi, updated_at")
      .eq("penulis_id", mentorId)
      .order("updated_at", { ascending: false }),
  ]);
  if (penugasanRes.error || soalRes.error) {
    console.error("[getStudioSoalMentor] query failed:", penugasanRes.error ?? soalRes.error);
    return "gagal";
  }

  type SubtesJoin = { id: string; nama: string };
  const ditugaskan = (penugasanRes.data ?? [])
    .map((row) => {
      const s = row.subtes as unknown as SubtesJoin | SubtesJoin[] | null;
      return Array.isArray(s) ? (s[0] ?? null) : s;
    })
    .filter((s): s is SubtesJoin => s !== null);

  const soal: SoalRingkas[] = (soalRes.data ?? []).map((row) => ({
    id: row.id as string,
    subtesId: row.subtes_id as string,
    tipe: row.tipe as string,
    status: row.status as string,
    versi: row.versi as number,
    redaksi: (row.redaksi as string) ?? "",
    updatedAt: row.updated_at as string,
  }));

  // Nama subtes untuk soal di subtes yang penugasannya sudah dicabut.
  const namaSubtes = new Map(ditugaskan.map((s) => [s.id, s.nama]));
  const lainIds = [...new Set(soal.map((s) => s.subtesId))].filter((id) => !namaSubtes.has(id));
  if (lainIds.length > 0) {
    const { data, error } = await supabaseServer.from("subtes").select("id, nama").in("id", lainIds);
    if (error) {
      console.error("[getStudioSoalMentor] query subtes failed:", error);
      return "gagal";
    }
    for (const s of data ?? []) namaSubtes.set(s.id as string, s.nama as string);
  }

  return susunStudioSoalMentor(ditugaskan, soal, namaSubtes);
}
