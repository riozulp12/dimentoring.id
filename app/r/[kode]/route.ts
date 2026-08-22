import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Tracking klik link referral — PRD Bagian 7.1 (FR-R3). Route publik, TIDAK
 * perlu login (link ini yang dibagikan siswa/mentor ke calon referee lewat
 * chat/sosmed). Kode tidak ketemu (salah ketik/kadaluarsa) tetap redirect
 * normal ke /daftar tanpa parameter — bukan error 500, supaya link rusak
 * tidak mem-block calon siswa daftar biasa.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  const daftarUrl = new URL("/daftar", request.url);

  const { data: referrer, error } = await supabaseServer
    .from("users")
    .select("id, referral_click_count")
    .eq("kode_referral", kode)
    .maybeSingle();

  if (error) {
    console.error("[r/[kode]] query kode_referral failed:", error);
    return NextResponse.redirect(daftarUrl, 302);
  }
  if (!referrer) {
    return NextResponse.redirect(daftarUrl, 302);
  }

  const { error: updateError } = await supabaseServer
    .from("users")
    .update({ referral_click_count: (referrer.referral_click_count as number) + 1 })
    .eq("id", referrer.id);

  if (updateError) {
    // Gagal update counter TIDAK boleh menghalangi calon siswa lanjut ke
    // form daftar — kode referral tetap diteruskan di bawah.
    console.error("[r/[kode]] update referral_click_count failed:", updateError);
  }

  const redirectUrl = new URL("/daftar", request.url);
  redirectUrl.searchParams.set("ref", kode);
  return NextResponse.redirect(redirectUrl, 302);
}
