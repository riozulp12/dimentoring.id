import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * List Notifikasi + Unread Count — PRD Bagian 8 (dropdown bell Navbar/Header).
 * List dibatasi 10 terbaru; unreadCount dihitung TERPISAH (bukan cuma dari
 * 10 item yang dikembalikan) supaya badge tetap akurat walau ada > 10
 * notifikasi belum dibaca.
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);

  const [listRes, countRes] = await Promise.all([
    supabaseServer
      .from("notifikasi")
      .select("id, tipe, judul, pesan, link_tujuan, dibaca, created_at")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseServer
      .from("notifikasi")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.userId)
      .eq("dibaca", false),
  ]);

  if (listRes.error) {
    console.error("[notifikasi GET] query list failed:", listRes.error);
    return errorResponse("Gagal memuat notifikasi. Coba lagi nanti.", 500);
  }
  if (countRes.error) {
    console.error("[notifikasi GET] query unread count failed:", countRes.error);
    return errorResponse("Gagal memuat notifikasi. Coba lagi nanti.", 500);
  }

  return NextResponse.json({
    success: true,
    notifications: listRes.data ?? [],
    unreadCount: countRes.count ?? 0,
  });
}
