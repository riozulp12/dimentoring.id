import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { isKelasPrivate, isValidLinkUrl } from "@/lib/shared/linkMeet";

/**
 * Admin menimpa/mengosongkan link Meet PER SISWA (kelas private) — halaman Pendaftar di Kelola Kelas.
 * Link yang diisi Admin disimpan dengan link_meet_oleh = NULL (tetap berlaku selama kosongnya
 * pengisi, lihat lib/shared/linkMeet.ts). `linkMeet` kosong/null = hapus link.
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const MAKS_PANJANG_LINK = 2000;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ kelasId: string; enrollmentId: string }> },
) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "admin") return errorResponse("Cuma Admin yang bisa mengubah link Meet dari sini.", 403);

  let body: { linkMeet?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }
  const mentah = typeof body?.linkMeet === "string" ? body.linkMeet.trim() : body?.linkMeet === null ? "" : undefined;
  if (mentah === undefined) return errorResponse("Link Meet tidak valid.", 400);
  if (mentah && (mentah.length > MAKS_PANJANG_LINK || !isValidLinkUrl(mentah))) {
    return errorResponse("Link Meet harus berupa URL yang valid (diawali http:// atau https://).", 400);
  }

  const { kelasId, enrollmentId } = await params;
  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("id, tipe_kelas")
    .eq("id", kelasId)
    .maybeSingle();
  if (kelasError) {
    console.error("[pendaftar/link-meet] query kelas failed:", kelasError);
    return errorResponse("Gagal memuat kelas. Coba lagi nanti.", 500);
  }
  if (!kelas) return errorResponse("Kelas tidak ditemukan.", 404);
  if (!isKelasPrivate(kelas.tipe_kelas as string | null)) {
    return errorResponse("Link Meet per siswa hanya untuk kelas private.", 422);
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("enrollments")
    .update({ link_meet: mentah || null, link_meet_oleh: null })
    .eq("id", enrollmentId)
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas")
    .select("id")
    .maybeSingle();
  if (updateError) {
    console.error("[pendaftar/link-meet] update enrollments failed:", updateError);
    return errorResponse("Gagal menyimpan link Meet. Coba lagi nanti.", 500);
  }
  if (!updated) return errorResponse("Pendaftar tidak ditemukan atau pembayarannya belum lunas.", 404);

  return NextResponse.json({ success: true, linkMeet: mentah || null });
}
