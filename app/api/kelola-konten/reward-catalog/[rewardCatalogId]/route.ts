import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateRewardCatalogInput, type RewardCatalogInputBody } from "@/lib/admin/validateRewardCatalogInput";

/** Edit/Hapus Katalog Reward — PRD Bagian 13 (reward_catalog), BR-13. */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function requireAdmin(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return { session: null, error: errorResponse("Belum login.", 401) };
  if (session.role !== "admin") {
    return { session: null, error: errorResponse("Cuma Admin yang bisa mengelola katalog reward.", 403) };
  }
  return { session, error: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ rewardCatalogId: string }> }) {
  const { session, error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { rewardCatalogId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("reward_catalog")
    .select("id")
    .eq("id", rewardCatalogId)
    .maybeSingle();
  if (existingError) {
    console.error("[reward-catalog PATCH] query existing failed:", JSON.stringify(existingError, null, 2));
    return errorResponse("Gagal memuat reward. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Reward tidak ditemukan.", 404);
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

  const { error: updateError } = await supabaseServer
    .from("reward_catalog")
    .update({ ...result.data, dikelola_oleh_admin_id: session!.userId })
    .eq("id", rewardCatalogId);

  if (updateError) {
    console.error("[reward-catalog PATCH] update failed:", JSON.stringify(updateError, null, 2));
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ rewardCatalogId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { rewardCatalogId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("reward_catalog")
    .select("id")
    .eq("id", rewardCatalogId)
    .maybeSingle();
  if (existingError) {
    console.error("[reward-catalog DELETE] query existing failed:", JSON.stringify(existingError, null, 2));
    return errorResponse("Gagal memuat reward. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Reward tidak ditemukan.", 404);
  }

  const { error: deleteError } = await supabaseServer.from("reward_catalog").delete().eq("id", rewardCatalogId);

  if (deleteError) {
    // foreign_key_violation — reward_redemptions.reward_catalog_id masih merujuk ke baris ini.
    if (deleteError.code === "23503") {
      return errorResponse("Reward ini sudah punya riwayat penukaran, tidak bisa dihapus.", 409);
    }
    console.error("[reward-catalog DELETE] delete failed:", JSON.stringify(deleteError, null, 2));
    return errorResponse("Gagal menghapus reward. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
