import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Approve/Reject pengajuan Mentor — PRD Bagian 8 BR-2 (approval Admin wajib
 * sebelum akun Mentor aktif & bisa mengajar).
 */

type Action = "setujui" | "tolak";

interface ApprovalMentorBody {
  userRoleId: string;
  action: Action;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa approve/reject Mentor.", 403);
  }

  let body: ApprovalMentorBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  if (body.action !== "setujui" && body.action !== "tolak") {
    return errorResponse("action harus 'setujui' atau 'tolak'.", 400);
  }
  if (!body.userRoleId) {
    return errorResponse("userRoleId wajib diisi.", 400);
  }

  const { data: role, error: roleError } = await supabaseServer
    .from("user_roles")
    .select("id, role_type, status")
    .eq("id", body.userRoleId)
    .maybeSingle();

  if (roleError || !role) {
    return errorResponse("Pengajuan tidak ditemukan.", 404);
  }
  if (role.role_type !== "mentor") {
    return errorResponse("Pengajuan ini bukan pengajuan Mentor.", 400);
  }
  if (role.status !== "pending") {
    return errorResponse("Pengajuan ini sudah diproses sebelumnya.", 409);
  }

  const { error: updateError } = await supabaseServer
    .from("user_roles")
    .update({ status: body.action === "setujui" ? "active" : "rejected" })
    .eq("id", body.userRoleId);

  if (updateError) {
    console.error("[approval-mentor] update failed:", updateError);
    return errorResponse("Gagal menyimpan keputusan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
