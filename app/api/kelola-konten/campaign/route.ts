import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateLandingCampaignInput, type LandingCampaignInputBody } from "@/lib/admin/validateLandingCampaignInput";

/** Tambah Banner Campaign baru — PRD Bagian 13 (landing_campaign — BARU). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mengelola campaign.", 403);
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

  const { data, error: insertError } = await supabaseServer
    .from("landing_campaign")
    .insert({ ...result.data, dibuat_oleh_id: session.userId })
    .select("id")
    .single();

  if (insertError) {
    console.error("[kelola-konten/campaign POST] insert failed:", JSON.stringify(insertError, null, 2));
    return errorResponse("Gagal menyimpan campaign. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
