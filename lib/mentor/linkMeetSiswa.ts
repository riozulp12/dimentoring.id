import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { getPenerimaanSubtesSiswa } from "@/lib/mentor/statusPenerimaanSiswa";
import { mentorBerhakDariSubtes } from "@/lib/shared/linkMeet";

/**
 * Pembaca server untuk Link Meet per siswa (kelas private): mentor yang SAAT INI berhak
 * atas tiap enrollment (lib/shared/linkMeet.ts → mentorBerhakDariSubtes). Dasarnya sama
 * dengan penjaga presensi (lib/mentor/statusPenerimaanSiswa.ts), jadi "boleh mengisi link"
 * dan "link masih berlaku" selalu sejalan.
 *
 * Query: status penerimaan (maks. 4, untuk BANYAK enrollment sekaligus) + — hanya bila ada
 * siswa tanpa pemegang subtes aktif — mentor tingkat kelas (3 query). "gagal" = galat database
 * (sudah di-log); pemanggil memperlakukannya sebagai TIDAK ADA mentor berhak (fail-closed).
 */
export async function getMentorBerhakLinkMeet(
  kelasId: string,
  enrollmentIds: string[],
): Promise<Map<string, string[]> | "gagal"> {
  const penerimaan = await getPenerimaanSubtesSiswa("", enrollmentIds);
  if (penerimaan === "gagal") return "gagal";

  const perluFallback = enrollmentIds.some((id) => {
    const daftar = penerimaan.get(id) ?? [];
    return daftar.length === 0 || daftar.some((s) => s.status === "tidak_perlu_klaim" && s.mentorAktifSubtes.length === 0);
  });

  let mentorKelasIds: string[] = [];
  if (perluFallback) {
    const [kelasRes, kelasMentorRes] = await Promise.all([
      supabaseServer.from("kelas").select("mentor_id").eq("id", kelasId).maybeSingle(),
      supabaseServer.from("kelas_mentor").select("mentor_id").eq("kelas_id", kelasId),
    ]);
    if (kelasRes.error || kelasMentorRes.error) {
      console.error("[getMentorBerhakLinkMeet] query kelas/kelas_mentor failed:", kelasRes.error ?? kelasMentorRes.error);
      return "gagal";
    }
    const kandidat = Array.from(
      new Set([
        ...((kelasRes.data?.mentor_id as string | null | undefined) ? [kelasRes.data!.mentor_id as string] : []),
        ...(kelasMentorRes.data ?? []).map((row) => row.mentor_id as string),
      ]),
    );
    if (kandidat.length > 0) {
      const { data: roleRows, error: roleError } = await supabaseServer
        .from("user_roles")
        .select("user_id")
        .in("user_id", kandidat)
        .eq("role_type", "mentor")
        .eq("status", "active");
      if (roleError) {
        console.error("[getMentorBerhakLinkMeet] query user_roles failed:", roleError);
        return "gagal";
      }
      mentorKelasIds = (roleRows ?? []).map((row) => row.user_id as string);
    }
  }

  const hasil = new Map<string, string[]>();
  for (const id of enrollmentIds) {
    hasil.set(id, mentorBerhakDariSubtes(penerimaan.get(id) ?? [], mentorKelasIds));
  }
  return hasil;
}
