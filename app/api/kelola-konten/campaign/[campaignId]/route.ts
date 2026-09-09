import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateLandingCampaignInput, type LandingCampaignInputBody } from "@/lib/admin/validateLandingCampaignInput";

/** Edit/Hapus Banner Campaign — PRD Bagian 13 (landing_campaign — BARU). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function requireAdmin(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return { session: null, error: errorResponse("Belum login.", 401) };
  if (session.role !== "admin") {
    return { session: null, error: errorResponse("Cuma Admin yang bisa mengelola campaign.", 403) };
  }
  return { session, error: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { campaignId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("landing_campaign")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-konten/campaign PATCH] query existing failed:", JSON.stringify(existingError, null, 2));
    return errorResponse("Gagal memuat campaign. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Campaign tidak ditemukan.", 404);
  }

  let body: LandingCampaignInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = validateLandingCampaignInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { error: updateError } = await supabaseServer
    .from("landing_campaign")
    .update(result.data)
    .eq("id", campaignId);

  if (updateError) {
    console.error("[kelola-konten/campaign PATCH] update failed:", JSON.stringify(updateError, null, 2));
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { campaignId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("landing_campaign")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-konten/campaign DELETE] query existing failed:", JSON.stringify(existingError, null, 2));
    return errorResponse("Gagal memuat campaign. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Campaign tidak ditemukan.", 404);
  }

  const { error: deleteError } = await supabaseServer.from("landing_campaign").delete().eq("id", campaignId);

  if (deleteError) {
    console.error("[kelola-konten/campaign DELETE] delete failed:", JSON.stringify(deleteError, null, 2));
    return errorResponse("Gagal menghapus campaign. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
