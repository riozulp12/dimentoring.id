import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { KATEGORI_SUBTES_SNBT } from "@/lib/shared/studio-soal/tipe";
import { urutkanSubtes, type PenugasanRow } from "@/lib/shared/studio-soal/penugasan";

/**
 * Data halaman Admin "Penugasan Studio Soal" (PR 3a, revisi K2).
 *
 * - Daftar mentor: SEMUA mentor aktif, plus mentor nonaktif yang masih punya
 *   baris penugasan (supaya Admin bisa mencabutnya).
 * - subtesProfil: isi mentor_subtes_diampu ("mengajar subtes ini") — HANYA
 *   petunjuk baca-saja, tidak memberi hak dan tidak diubah fitur ini.
 * - Penugasan: studio_soal_penugasan (sumber hak menulis/meninjau).
 */

export interface MentorPenugasanItem {
  id: string;
  nama: string;
  asalPtn: string | null;
  aktif: boolean;
  /** Subtes SNBT yang dicantumkan mentor di profil mengajarnya. */
  subtesProfil: string[];
}

export interface PenugasanStudioSoalData {
  subtes: { id: string; nama: string }[];
  mentor: MentorPenugasanItem[];
  penugasan: PenugasanRow[];
}

type Join<T> = T | T[] | null;
function first<T>(value: Join<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getPenugasanStudioSoalData(): Promise<PenugasanStudioSoalData | "gagal"> {
  const [subtesRes, roleRes, penugasanRes] = await Promise.all([
    supabaseServer.from("subtes").select("id, nama").in("kategori", [...KATEGORI_SUBTES_SNBT]),
    supabaseServer.from("user_roles").select("user_id, status, users:user_id(nama)").eq("role_type", "mentor"),
    supabaseServer.from("studio_soal_penugasan").select("mentor_id, subtes_id"),
  ]);
  if (subtesRes.error || roleRes.error || penugasanRes.error) {
    console.error("[getPenugasanStudioSoalData] query failed:", subtesRes.error ?? roleRes.error ?? penugasanRes.error);
    return "gagal";
  }

  const subtes = urutkanSubtes((subtesRes.data ?? []).map((s) => ({ id: s.id as string, nama: s.nama as string })));
  const subtesIds = new Set(subtes.map((s) => s.id));
  const penugasan: PenugasanRow[] = (penugasanRes.data ?? []).map((p) => ({
    mentorId: p.mentor_id as string,
    subtesId: p.subtes_id as string,
  }));
  const punyaPenugasan = new Set(penugasan.map((p) => p.mentorId));

  type RoleRow = { user_id: string; status: string; users: Join<{ nama: string }> };
  const roles = ((roleRes.data ?? []) as unknown as RoleRow[]).filter(
    (r) => r.status === "active" || punyaPenugasan.has(r.user_id),
  );
  const mentorIds = roles.map((r) => r.user_id);

  const profil = new Map<string, { asalPtn: string | null; subtes: string[] }>();
  if (mentorIds.length > 0) {
    const { data, error } = await supabaseServer
      .from("mentor_profiles")
      .select("user_id, asal_ptn, mentor_subtes_diampu(subtes_id)")
      .in("user_id", mentorIds);
    if (error) {
      console.error("[getPenugasanStudioSoalData] query mentor_profiles failed:", error);
      return "gagal";
    }
    type ProfilRow = { user_id: string; asal_ptn: string | null; mentor_subtes_diampu: { subtes_id: string }[] | null };
    for (const row of (data ?? []) as unknown as ProfilRow[]) {
      profil.set(row.user_id, {
        asalPtn: row.asal_ptn,
        subtes: (row.mentor_subtes_diampu ?? []).map((d) => d.subtes_id).filter((id) => subtesIds.has(id)),
      });
    }
  }

  const mentor = roles
    .map((r) => ({
      id: r.user_id,
      nama: first(r.users)?.nama ?? "(tanpa nama)",
      asalPtn: profil.get(r.user_id)?.asalPtn ?? null,
      aktif: r.status === "active",
      subtesProfil: profil.get(r.user_id)?.subtes ?? [],
    }))
    .sort((a, b) => Number(b.aktif) - Number(a.aktif) || a.nama.localeCompare(b.nama, "id"));

  return { subtes, mentor, penugasan: penugasan.filter((p) => subtesIds.has(p.subtesId)) };
}
