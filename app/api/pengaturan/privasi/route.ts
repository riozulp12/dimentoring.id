import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Notifikasi + Privasi — SATU endpoint dipakai Section 2 (Notifikasi) DAN
 * Section 3 (Privasi) halaman Pengaturan (PRD 8 BR-14, BR-25). Tiap toggle
 * di UI PATCH field-nya sendiri langsung saat diklik (bukan submit form
 * batch) — cuma field yang dikirim di body yang di-update, field lain tidak
 * tersentuh.
 */

interface PrivasiBody {
  notifEmail?: boolean;
  notifWa?: boolean;
  /** Kebalikan dari users.opt_out_leaderboard — UI-nya "Tampilkan di leaderboard". */
  tampilkanDiLeaderboard?: boolean;
  consentLeaderboardLokasi?: boolean;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);

  let body: PrivasiBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const update: Record<string, unknown> = {};
  if (typeof body.notifEmail === "boolean") update.notif_email = body.notifEmail;
  if (typeof body.notifWa === "boolean") update.notif_wa = body.notifWa;
  if (typeof body.tampilkanDiLeaderboard === "boolean") {
    update.opt_out_leaderboard = !body.tampilkanDiLeaderboard;
  }
  if (typeof body.consentLeaderboardLokasi === "boolean") {
    update.consent_leaderboard_lokasi = body.consentLeaderboardLokasi;
  }

  if (Object.keys(update).length === 0) {
    return errorResponse("Tidak ada perubahan yang dikirim.", 400);
  }

  const { error } = await supabaseServer.from("users").update(update).eq("id", session.userId);
  if (error) {
    console.error("[pengaturan/privasi] update failed:", error);
    return errorResponse("Gagal menyimpan pengaturan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
