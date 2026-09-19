import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Keputusan Admin atas sesi yang disangkal siswa — PRD Bagian 7.5.5 FR-A3.
 * "setujui": sesi dianggap valid (masuk progress kehadiran). "batalkan":
 * sesi dikembalikan ke kondisi "belum terjadi" sama sekali (mentor bisa
 * menandai ulang dari awal lewat alur normal).
 */

interface SesiReviewBody {
  sesiId?: string;
  action?: "setujui" | "batalkan";
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

  const { data: sesi, error: sesiError } = await supabaseServer
    .from("sesi_kelas")
    .select("id")
    .eq("id", sesiId)
    .eq("perlu_review_admin", true)
    .maybeSingle();

  if (sesiError) {
    console.error("[admin/sesi-review] query sesi_kelas failed:", sesiError);
    return errorResponse("Gagal memuat sesi. Coba lagi nanti.", 500);
  }
  if (!sesi) {
    return errorResponse("Sesi tidak ditemukan atau sudah tidak menunggu review.", 404);
  }

  const update =
    body.action === "setujui"
      ? { status_siswa: "dikonfirmasi" as const, perlu_review_admin: false }
      : {
          dikonfirmasi_mentor: false,
          dikonfirmasi_mentor_pada: null,
          tanggal_dilaksanakan: null,
          status_siswa: "belum" as const,
          dikonfirmasi_siswa_pada: null,
          perlu_review_admin: false,
        };

  const { error: updateError } = await supabaseServer.from("sesi_kelas").update(update).eq("id", sesiId);
  if (updateError) {
    console.error("[admin/sesi-review] update sesi_kelas failed:", updateError);
    return errorResponse("Gagal menyimpan keputusan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
