import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Permintaan Hapus Akun — PRD 8 Section 4b (Pengaturan). BUKAN hapus
 * instan: cuma menandai users.permintaan_hapus_akun=true untuk diproses
 * manual Admin lewat Table Editor Supabase (belum ada UI Admin khusus di
 * fase ini). Akun TETAP AKTIF — endpoint ini tidak menyentuh session cookie.
 */

interface HapusAkunBody {
  alasan?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);

  let body: HapusAkunBody = {};
  try {
    body = await request.json();
  } catch {
    // Alasan opsional — body kosong/tidak valid tetap diperlakukan sebagai "tanpa alasan".
  }

  const { data: existing, error: existingError } = await supabaseServer
    .from("users")
    .select("permintaan_hapus_akun")
    .eq("id", session.userId)
    .maybeSingle();

  if (existingError || !existing) {
    console.error("[pengaturan/hapus-akun] query users failed:", existingError);
    return errorResponse("Gagal memuat akun kamu. Coba lagi nanti.", 500);
  }
  // Cegah double request (test #9) — permintaan yang sudah ada tidak boleh ditimpa ulang.
  if (existing.permintaan_hapus_akun) {
    return errorResponse("Kamu sudah pernah mengirim permintaan hapus akun.", 409);
  }

  const alasan = typeof body.alasan === "string" && body.alasan.trim() ? body.alasan.trim() : null;

  const { error: updateError } = await supabaseServer
    .from("users")
    .update({
      permintaan_hapus_akun: true,
      alasan_hapus_akun: alasan,
      tanggal_permintaan_hapus: new Date().toISOString(),
    })
    .eq("id", session.userId);

  if (updateError) {
    console.error("[pengaturan/hapus-akun] update failed:", updateError);
    return errorResponse("Gagal mengirim permintaan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
