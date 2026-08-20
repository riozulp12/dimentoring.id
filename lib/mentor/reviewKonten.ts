import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

export interface ReviewKontenItem {
  id: string;
  jenis: "materi" | "soal";
  judul: string;
  subtesNama: string;
  createdAt: string;
  sumber: string;
}

function extractSubtesNama(subtes: unknown): string {
  if (Array.isArray(subtes)) return (subtes[0] as { nama?: string } | undefined)?.nama ?? "-";
  return (subtes as { nama?: string } | null)?.nama ?? "-";
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

/** PRD 7.7 revisi (FR-M3): antrian gabungan Materi AI + Soal AI berstatus draft, sesuai Subtes yang Diampu. */
export async function getReviewKontenQueue(userId: string): Promise<ReviewKontenItem[]> {
  const subtesIds = await getMentorSubtesIds(userId);
  if (subtesIds.length === 0) return [];

  const [materiRes, soalRes] = await Promise.all([
    supabaseServer
      .from("materi")
      .select("id, judul, sumber, created_at, subtes:subtes_id(nama)")
      .eq("status", "draft")
      .in("subtes_id", subtesIds),
    supabaseServer
      .from("soal_ai")
      .select("id, redaksi, sumber, created_at, subtes:subtes_id(nama)")
      .eq("status", "draft")
      .in("subtes_id", subtesIds),
  ]);

  const materiItems: ReviewKontenItem[] = (materiRes.data ?? []).map((m) => ({
    id: m.id as string,
    jenis: "materi",
    judul: m.judul as string,
    subtesNama: extractSubtesNama(m.subtes),
    createdAt: m.created_at as string,
    sumber: m.sumber as string,
  }));

  const soalItems: ReviewKontenItem[] = (soalRes.data ?? []).map((s) => {
    const redaksi = s.redaksi as string;
    return {
      id: s.id as string,
      jenis: "soal",
      judul: redaksi.length > 120 ? `${redaksi.slice(0, 120)}…` : redaksi,
      subtesNama: extractSubtesNama(s.subtes),
      createdAt: s.created_at as string,
      sumber: s.sumber as string,
    };
  });

  return [...materiItems, ...soalItems].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
