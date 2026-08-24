import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validatePengeluaranInput, type PengeluaranInputBody } from "@/lib/admin/validatePengeluaranInput";

/** Tambah Pengeluaran — PRD Bagian 13 (pengeluaran_bisnis, Analytics). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mencatat pengeluaran.", 403);
  }

  let body: PengeluaranInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = validatePengeluaranInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { data, error: insertError } = await supabaseServer
    .from("pengeluaran_bisnis")
    .insert({ ...result.data, dibuat_oleh_id: session.userId })
    .select("id")
    .single();

  if (insertError) {
    console.error("[analytics/pengeluaran POST] insert failed:", insertError);
    return errorResponse("Gagal menyimpan pengeluaran. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
