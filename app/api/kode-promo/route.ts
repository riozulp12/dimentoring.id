import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateKodePromoInput, type KodePromoInputBody } from "@/lib/admin/validateKodePromoInput";

/** Tambah Kode Promo baru — PRD Bagian 13 (kode_promo). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa mengelola kode promo.", 403);
  }

  let body: KodePromoInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = await validateKodePromoInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { kelas_ids: kelasIds, ...kodePromoData } = result.data;

  const { data, error: insertError } = await supabaseServer
    .from("kode_promo")
    .insert({ ...kodePromoData, dibuat_oleh_id: session.userId })
    .select("id")
    .single();

  if (insertError) {
    console.error("[kode-promo POST] insert failed:", insertError);
    // unique_violation (kode_promo.kode) — jaga-jaga kalau lolos precheck karena race condition.
    if (insertError.code === "23505") {
      return errorResponse(`Kode promo "${result.data.kode}" sudah dipakai. Gunakan kode lain.`, 409);
    }
    return errorResponse("Gagal menyimpan kode promo. Coba lagi nanti.", 500);
  }

  if (!kodePromoData.berlaku_semua_kelas && kelasIds.length > 0) {
    const { error: kelasInsertError } = await supabaseServer
      .from("kode_promo_kelas")
      .insert(kelasIds.map((kelasId) => ({ kode_promo_id: data.id, kelas_id: kelasId })));
    if (kelasInsertError) {
      console.error("[kode-promo POST] insert kode_promo_kelas failed:", kelasInsertError);
      return errorResponse("Kode promo tersimpan, tapi gagal menyimpan scoping Kelas. Coba edit ulang.", 500);
    }
  }

  return NextResponse.json({ success: true, id: data.id }, { status: 201 });
}
