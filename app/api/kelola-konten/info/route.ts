import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateKontenInfoInput, type KontenInfoInputBody } from "@/lib/admin/validateKontenInfoInput";

/** Tambah Info Beasiswa/Internship/Event baru — PRD Bagian 13 (konten_info). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mengelola konten.", 403);
  }

  let body: KontenInfoInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = validateKontenInfoInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { data, error: insertError } = await supabaseServer
    .from("konten_info")
    .insert({ ...result.data, dibuat_oleh_admin_id: session.userId })
    .select("id")
    .single();

  if (insertError) {
    console.error("[kelola-konten/info POST] insert failed:", JSON.stringify(insertError, null, 2));
    return errorResponse("Gagal menyimpan info. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
