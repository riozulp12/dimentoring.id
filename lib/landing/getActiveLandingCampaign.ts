import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Campaign aktif landing page (PRD Bagian 13 landing_campaign — BARU, alur
 * bertahap popup dulu baru banner). Cari 1 landing_campaign status='aktif'
 * yang tanggal_mulai/tanggal_selesai-nya (kalau diisi) mencakup hari ini,
 * terbaru dibuat duluan kalau ada lebih dari satu yang valid bersamaan.
 * Kalau tidak ada campaign valid, TIDAK ADA popup maupun banner sama sekali
 * (dipakai app/page.tsx untuk memutuskan render CampaignChrome atau tidak).
 */

export interface ActiveLandingCampaign {
  judul: string;
  linkTujuan: string;
}

export async function getActiveLandingCampaign(): Promise<ActiveLandingCampaign | null> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabaseServer
    .from("landing_campaign")
    .select("judul, link_tujuan")
    .eq("status", "aktif")
    .or(`tanggal_mulai.is.null,tanggal_mulai.lte.${today}`)
    .or(`tanggal_selesai.is.null,tanggal_selesai.gte.${today}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[getActiveLandingCampaign] query failed:", JSON.stringify(error, null, 2));
    return null;
  }
  if (!data) return null;

  return {
    judul: data.judul as string,
    linkTujuan: data.link_tujuan as string,
  };
}
