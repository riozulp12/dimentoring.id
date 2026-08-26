import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Proses Permintaan Penukaran Poin — PRD Bagian 13 (reward_redemptions).
 * "Tandai Selesai" (Admin sudah transfer manual di luar sistem) atau "Tolak"
 * (reward ternyata tidak bisa diberikan — poin WAJIB dikembalikan ke user
 * supaya tidak dirugikan). Update kondisional (WHERE status='diproses') jadi
 * guard idempotency sekaligus — klik dobel/retry tidak memicu refund dobel.
 */

interface RedemptionActionBody {
  status?: "selesai" | "gagal";
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ redemptionId: string }> }) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa memproses permintaan penukaran.", 403);
  }

  const { redemptionId } = await params;

  let body: RedemptionActionBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  if (body.status !== "selesai" && body.status !== "gagal") {
    return errorResponse("Status harus 'selesai' atau 'gagal'.", 400);
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("reward_redemptions")
    .update({ status: body.status })
    .eq("id", redemptionId)
    .eq("status", "diproses")
    .select("id, user_id, poin_terpakai")
    .maybeSingle();

  if (updateError) {
    console.error("[redemption PATCH] update failed:", JSON.stringify(updateError, null, 2));
    return errorResponse("Gagal memproses permintaan. Coba lagi nanti.", 500);
  }
  if (!updated) {
    return errorResponse("Permintaan tidak ditemukan atau sudah diproses sebelumnya.", 409);
  }

  if (body.status === "gagal") {
    const { data: profile, error: profileError } = await supabaseServer
      .from("gamifikasi_profiles")
      .select("total_poin")
      .eq("user_id", updated.user_id)
      .maybeSingle();

    if (profileError) {
      console.error("[redemption PATCH] query gamifikasi_profiles failed:", JSON.stringify(profileError, null, 2));
    } else if (profile) {
      const { error: refundError } = await supabaseServer
        .from("gamifikasi_profiles")
        .update({ total_poin: (profile.total_poin as number) + (updated.poin_terpakai as number) })
        .eq("user_id", updated.user_id);
      if (refundError) {
        console.error("[redemption PATCH] refund poin failed:", JSON.stringify(refundError, null, 2));
      }
    }
  }

  return NextResponse.json({ success: true });
}
