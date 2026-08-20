import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";

/**
 * Approve/Reject konten AI (Materi & Soal) — PRD Bagian 7.7 revisi & BR-31.
 * Cuma Mentor berstatus Active yang boleh review (BR-27: fitur mengajar
 * terkunci selama Pending), dan cuma untuk item yang subtes-nya termasuk
 * Subtes yang Diampu mentor tsb (BR-7).
 */

type Jenis = "materi" | "soal";
type Action = "setujui" | "tolak";

interface ReviewKontenBody {
  jenis: Jenis;
  id: string;
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
  if (session.role !== "mentor") {
    return errorResponse("Cuma Mentor yang bisa review konten.", 403);
  }
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    return errorResponse("Akun kamu masih menunggu approval Admin.", 403);
  }

  let body: ReviewKontenBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  if (body.jenis !== "materi" && body.jenis !== "soal") {
    return errorResponse("jenis harus 'materi' atau 'soal'.", 400);
  }
  if (body.action !== "setujui" && body.action !== "tolak") {
    return errorResponse("action harus 'setujui' atau 'tolak'.", 400);
  }
  if (!body.id) {
    return errorResponse("id wajib diisi.", 400);
  }

  const table = body.jenis === "materi" ? "materi" : "soal_ai";

  // BR-7: pastikan item ini termasuk Subtes yang Diampu mentor ini.
  const { data: profile } = await supabaseServer
    .from("mentor_profiles")
    .select("id")
    .eq("user_id", session.userId)
    .maybeSingle();
  if (!profile) {
    return errorResponse("Profil mentor tidak ditemukan.", 403);
  }
  const { data: subtesRows } = await supabaseServer
    .from("mentor_subtes_diampu")
    .select("subtes_id")
    .eq("mentor_profile_id", profile.id);
  const subtesIds = (subtesRows ?? []).map((r: { subtes_id: string }) => r.subtes_id);

  const { data: item, error: itemError } = await supabaseServer
    .from(table)
    .select("id, subtes_id, status")
    .eq("id", body.id)
    .maybeSingle();

  if (itemError || !item) {
    return errorResponse("Konten tidak ditemukan.", 404);
  }
  if (!subtesIds.includes(item.subtes_id)) {
    return errorResponse("Konten ini di luar Subtes yang kamu ampu.", 403);
  }
  if (item.status !== "draft") {
    return errorResponse("Konten ini sudah direview sebelumnya.", 409);
  }

  const { error: updateError } = await supabaseServer
    .from(table)
    .update({
      status: body.action === "setujui" ? "published" : "ditolak",
      direview_oleh_id: session.userId,
      tanggal_review: new Date().toISOString(),
    })
    .eq("id", body.id);

  if (updateError) {
    console.error("[review-konten] update failed:", updateError);
    return errorResponse("Gagal menyimpan hasil review. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
