import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateKontenInfoInput, type KontenInfoInputBody } from "@/lib/admin/validateKontenInfoInput";

/** Edit/Hapus Info Beasiswa/Internship/Event — PRD Bagian 13 (konten_info). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function requireAdmin(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return { session: null, error: errorResponse("Belum login.", 401) };
  if (session.role !== "admin") {
    return { session: null, error: errorResponse("Cuma Admin yang bisa mengelola konten.", 403) };
  }
  return { session, error: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ infoId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { infoId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("konten_info")
    .select("id")
    .eq("id", infoId)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-konten/info PATCH] query existing failed:", JSON.stringify(existingError, null, 2));
    return errorResponse("Gagal memuat info. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Info tidak ditemukan.", 404);
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

  const { error: updateError } = await supabaseServer.from("konten_info").update(result.data).eq("id", infoId);

  if (updateError) {
    console.error("[kelola-konten/info PATCH] update failed:", JSON.stringify(updateError, null, 2));
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ infoId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { infoId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("konten_info")
    .select("id")
    .eq("id", infoId)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-konten/info DELETE] query existing failed:", JSON.stringify(existingError, null, 2));
    return errorResponse("Gagal memuat info. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Info tidak ditemukan.", 404);
  }

  const { error: deleteError } = await supabaseServer.from("konten_info").delete().eq("id", infoId);

  if (deleteError) {
    console.error("[kelola-konten/info DELETE] delete failed:", JSON.stringify(deleteError, null, 2));
    return errorResponse("Gagal menghapus info. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
