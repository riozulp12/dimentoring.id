import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Keputusan Admin atas sesi yang disangkal siswa — PRD Bagian 7.5.5 FR-A3.
 * "setujui": sesi dianggap valid (masuk progress kehadiran). "batalkan":
 * sesi dikembalikan ke kondisi "belum terjadi" sama sekali (mentor bisa
 * menandai ulang dari awal lewat alur normal).
 *
 * Setiap keputusan WAJIB tercatat di sesi_review_log (admin, keputusan,
 * snapshot baris sebelum diubah, alasan — wajib untuk "batalkan"). Keputusan
 * + log dijalankan dalam SATU transaksi lewat fungsi DB putuskan_sesi_review
 * (db/add_sesi_review_log.sql): log gagal = keputusan ikut batal, dan dua
 * Admin yang klik bersamaan tidak bisa sama-sama memutuskan.
 */

const ALASAN_MAKS = 1000;

interface SesiReviewBody {
  sesiId?: string;
  action?: "setujui" | "batalkan";
  alasan?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "admin") return errorResponse("Cuma Admin yang bisa meninjau sesi.", 403);

  let body: SesiReviewBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const sesiId = body.sesiId;
  if (!sesiId || typeof sesiId !== "string") return errorResponse("Sesi tidak valid.", 400);
  if (body.action !== "setujui" && body.action !== "batalkan") {
    return errorResponse("Aksi tidak valid.", 400);
  }
  if (body.alasan !== undefined && typeof body.alasan !== "string") {
    return errorResponse("Alasan tidak valid.", 400);
  }
  const alasan = body.alasan?.trim() ?? "";
  if (body.action === "batalkan" && !alasan) {
    return errorResponse("Alasan wajib diisi untuk membatalkan sesi.", 400);
  }
  if (alasan.length > ALASAN_MAKS) {
    return errorResponse(`Alasan maksimal ${ALASAN_MAKS} karakter.`, 400);
  }

  const { data: diputuskan, error: rpcError } = await supabaseServer.rpc("putuskan_sesi_review", {
    p_sesi_id: sesiId,
    p_admin_id: session.userId,
    p_keputusan: body.action,
    p_alasan: alasan || null,
  });

  if (rpcError) {
    console.error("[admin/sesi-review] putuskan_sesi_review failed:", rpcError);
    return errorResponse("Gagal menyimpan keputusan. Coba lagi nanti.", 500);
  }
  if (diputuskan !== true) {
    return errorResponse("Sesi tidak ditemukan atau sudah tidak menunggu review.", 404);
  }

  return NextResponse.json({ success: true });
}
