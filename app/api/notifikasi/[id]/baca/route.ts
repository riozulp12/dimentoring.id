import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/** Tandai SATU notifikasi dibaca — scoped ke user_id sesi supaya user tidak
 * bisa menandai/menyentuh notifikasi milik orang lain lewat manipulasi id. */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);

  const { id } = await params;

  const { error } = await supabaseServer
    .from("notifikasi")
    .update({ dibaca: true })
    .eq("id", id)
    .eq("user_id", session.userId);

  if (error) {
    console.error("[notifikasi/[id]/baca] update failed:", error);
    return errorResponse("Gagal menandai notifikasi. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
