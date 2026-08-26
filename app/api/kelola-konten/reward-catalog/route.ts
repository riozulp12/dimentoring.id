import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateRewardCatalogInput, type RewardCatalogInputBody } from "@/lib/admin/validateRewardCatalogInput";

/** Tambah Katalog Reward baru — PRD Bagian 13 (reward_catalog), BR-13. */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mengelola katalog reward.", 403);
  }

  let body: RewardCatalogInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = validateRewardCatalogInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { data, error: insertError } = await supabaseServer
    .from("reward_catalog")
    .insert({ ...result.data, dikelola_oleh_admin_id: session.userId })
    .select("id")
    .single();

  if (insertError) {
    console.error("[reward-catalog POST] insert failed:", JSON.stringify(insertError, null, 2));
    return errorResponse("Gagal menyimpan reward. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
