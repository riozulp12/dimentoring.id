import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/** Tandai SEMUA notifikasi milik user sesi jadi dibaca. */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);

  const { error } = await supabaseServer
    .from("notifikasi")
    .update({ dibaca: true })
    .eq("user_id", session.userId)
    .eq("dibaca", false);

  if (error) {
    console.error("[notifikasi/baca-semua] update failed:", error);
    return errorResponse("Gagal menandai semua notifikasi. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
