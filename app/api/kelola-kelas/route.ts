import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateKelasInput, type KelasInputBody } from "@/lib/admin/validateKelasInput";

/** Tambah Kelas baru — PRD Bagian 7.5 & 7.5.3 (Admin, Kelola Kelas). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mengelola kelas.", 403);
  }

  let body: KelasInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = await validateKelasInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { mentor_ids: mentorIds, ...kelasData } = result.data;

  const { data, error: insertError } = await supabaseServer
    .from("kelas")
    .insert(kelasData)
    .select("id")
    .single();

  if (insertError) {
    console.error("[kelola-kelas POST] insert failed:", insertError);
    return errorResponse("Gagal menyimpan kelas. Coba lagi nanti.", 500);
  }

  if (mentorIds.length > 0) {
    const { error: mentorInsertError } = await supabaseServer
      .from("kelas_mentor")
      .insert(mentorIds.map((mentorId) => ({ kelas_id: data.id, mentor_id: mentorId })));
    if (mentorInsertError) {
      console.error("[kelola-kelas POST] insert kelas_mentor failed:", mentorInsertError);
      return errorResponse("Kelas tersimpan, tapi gagal menyimpan mentor. Coba edit kelas untuk atur ulang mentor.", 500);
    }
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
