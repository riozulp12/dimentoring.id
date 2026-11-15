import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { bolehKelolaLinkMeetKelas } from "@/lib/mentor/aksesMentor";
import { isValidLinkUrl } from "@/lib/shared/linkMeet";

/**
 * Update kelas.link_meet — PRD Bagian 7.5.2 (link recurring statis per Kelas).
 * BR-7: cuma mentor yang terkait kelas ini yang boleh mengubahnya — kelas.mentor_id (kolom lama),
 * kelas_mentor, atau kelas_subtes_mentor (lib/mentor/aksesMentor.ts bolehKelolaLinkMeetKelas) — dan
 * cuma kalau statusnya sudah Active (BR-27). Kelas PRIVATE memakai link per siswa
 * (lib/shared/linkMeet.ts), bukan link kelas ini.
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ kelasId: string }> }) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "mentor") {
    return errorResponse("Cuma Mentor yang bisa mengubah Link Meet.", 403);
  }
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    return errorResponse("Akun kamu masih menunggu approval Admin.", 403);
  }

  let body: { linkMeet?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const linkMeet = body.linkMeet?.trim() ?? "";
  if (!isValidLinkUrl(linkMeet)) {
    return errorResponse("Link Meet harus berupa URL yang valid (diawali http:// atau https://).", 400);
  }

  const { kelasId } = await params;

  // BR-7: mentor cuma boleh ubah kelas yang terkait dengannya (mentor_id lama, kelas_mentor, atau kelas_subtes_mentor).
  const boleh = await bolehKelolaLinkMeetKelas(session.userId, kelasId);
  if (boleh === "gagal") return errorResponse("Gagal memuat kelas. Coba lagi nanti.", 500);
  if (!boleh) return errorResponse("Kelas tidak ditemukan atau bukan kelas yang kamu ampu.", 403);

  const { error: updateError } = await supabaseServer
    .from("kelas")
    .update({ link_meet: linkMeet })
    .eq("id", kelasId);

  if (updateError) {
    console.error("[link-meet] update failed:", updateError);
    return errorResponse("Gagal menyimpan Link Meet. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, linkMeet });
}
