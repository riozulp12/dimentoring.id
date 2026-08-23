import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * "Batalkan" undangan Admin yang masih "Menunggu" — PRD Bagian 8 BR-3. Cara
 * paling simpel buat invalidate: set expired_at=now(), jadi otomatis kebaca
 * "Kadaluarsa" oleh computeStatus() di lib/admin/adminInvitations.ts dan
 * ditolak validateAdminInvitationToken() kalau linknya masih dicoba dibuka.
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mengelola undangan Admin.", 403);
  }

  const { invitationId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("admin_invitations")
    .select("id, used_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (existingError) {
    console.error("[batalkan-undangan] query existing failed:", JSON.stringify(existingError, null, 2));
    return errorResponse("Gagal memuat undangan. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Undangan tidak ditemukan.", 404);
  }
  if (existing.used_at) {
    return errorResponse("Undangan ini sudah dipakai, tidak bisa dibatalkan.", 409);
  }

  const { error: updateError } = await supabaseServer
    .from("admin_invitations")
    .update({ expired_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (updateError) {
    console.error("[batalkan-undangan] update failed:", JSON.stringify(updateError, null, 2));
    return errorResponse("Gagal membatalkan undangan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
