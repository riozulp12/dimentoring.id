import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validatePtnJurusanInput, type PtnJurusanInputBody } from "@/lib/admin/validatePtnJurusanInput";

/** Edit data PTN (ptn_jurusan) — PRD Bagian 7.4.2/BR-28, Bagian 13 (Admin, Kelola Assessment). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const DUPLICATE_ERROR_MESSAGE =
  "Data untuk kombinasi ini sudah ada, edit yang sudah ada alih-alih tambah baru.";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mengelola data PTN.", 403);
  }

  const { id } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("ptn_jurusan")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-assessment PATCH] query existing failed:", existingError);
    return errorResponse("Gagal memuat data PTN. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Data PTN tidak ditemukan.", 404);
  }

  let body: PtnJurusanInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = await validatePtnJurusanInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { error: updateError } = await supabaseServer.from("ptn_jurusan").update(result.data).eq("id", id);

  if (updateError) {
    if (updateError.code === "23505") {
      return errorResponse(DUPLICATE_ERROR_MESSAGE, 409);
    }
    console.error("[kelola-assessment PATCH] update failed:", updateError);
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
