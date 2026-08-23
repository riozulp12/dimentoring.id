import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * "Simpan" / "Tandai Tertarik" di halaman detail publik /beasiswa-event/[id]
 * — PRD Bagian 13 (konten_info_interactions). Insert idempotent lewat
 * ignoreDuplicates: unique index (user_id, konten_info_id, jenis) di skema
 * sudah mencegah baris ganda kalau user klik berkali-kali.
 */

const VALID_JENIS = new Set(["disimpan", "tertarik"]);

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kontenInfoId: string }> },
) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }

  const { kontenInfoId } = await params;

  let body: { jenis?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request tidak valid.", 400);
  }

  const jenis = body.jenis;
  if (!jenis || !VALID_JENIS.has(jenis)) {
    return errorResponse("Jenis interaksi tidak valid.", 400);
  }

  const { data: konten, error: kontenError } = await supabaseServer
    .from("konten_info")
    .select("id")
    .eq("id", kontenInfoId)
    .maybeSingle();

  if (kontenError) {
    console.error("[konten-info/interaksi] query konten_info failed:", kontenError);
    return errorResponse("Gagal memuat konten. Coba lagi nanti.", 500);
  }
  if (!konten) {
    return errorResponse("Konten tidak ditemukan.", 404);
  }

  const { error: insertError } = await supabaseServer.from("konten_info_interactions").upsert(
    {
      user_id: session.userId,
      konten_info_id: kontenInfoId,
      jenis,
    },
    { onConflict: "user_id,konten_info_id,jenis", ignoreDuplicates: true },
  );

  if (insertError) {
    console.error("[konten-info/interaksi] insert failed:", insertError);
    return errorResponse("Gagal menyimpan interaksi. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
