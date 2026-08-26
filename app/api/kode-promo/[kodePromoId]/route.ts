import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateKodePromoInput, type KodePromoInputBody } from "@/lib/admin/validateKodePromoInput";

/** Edit/Hapus Kode Promo — PRD Bagian 13 (kode_promo). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function requireAdmin(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return { session: null, error: errorResponse("Belum login.", 401) };
  if (session.role !== "admin") {
    return { session: null, error: errorResponse("Cuma Admin yang bisa mengelola kode promo.", 403) };
  }
  return { session, error: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ kodePromoId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { kodePromoId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("kode_promo")
    .select("id")
    .eq("id", kodePromoId)
    .maybeSingle();
  if (existingError) {
    console.error("[kode-promo PATCH] query existing failed:", existingError);
    return errorResponse("Gagal memuat kode promo. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Kode promo tidak ditemukan.", 404);
  }

  let body: KodePromoInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = await validateKodePromoInput(body, kodePromoId);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { kelas_ids: kelasIds, ...kodePromoData } = result.data;

  const { error: updateError } = await supabaseServer.from("kode_promo").update(kodePromoData).eq("id", kodePromoId);

  if (updateError) {
    console.error("[kode-promo PATCH] update failed:", updateError);
    if (updateError.code === "23505") {
      return errorResponse(`Kode promo "${result.data.kode}" sudah dipakai. Gunakan kode lain.`, 409);
    }
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  // Replace penuh baris kode_promo_kelas — bukan tambah terus-menerus, jadi hapus
  // dulu baris lama sebelum insert baris baru (juga dijalankan kalau toggle
  // berlaku_semua_kelas dinyalakan, supaya baris scoping lama tidak nyangkut).
  const { error: kelasDeleteError } = await supabaseServer
    .from("kode_promo_kelas")
    .delete()
    .eq("kode_promo_id", kodePromoId);
  if (kelasDeleteError) {
    console.error("[kode-promo PATCH] delete kode_promo_kelas failed:", kelasDeleteError);
    return errorResponse("Kode promo tersimpan, tapi gagal memperbarui scoping Kelas. Coba edit ulang.", 500);
  }

  if (!kodePromoData.berlaku_semua_kelas && kelasIds.length > 0) {
    const { error: kelasInsertError } = await supabaseServer
      .from("kode_promo_kelas")
      .insert(kelasIds.map((kelasId) => ({ kode_promo_id: kodePromoId, kelas_id: kelasId })));
    if (kelasInsertError) {
      console.error("[kode-promo PATCH] insert kode_promo_kelas failed:", kelasInsertError);
      return errorResponse("Kode promo tersimpan, tapi gagal menyimpan scoping Kelas. Coba edit ulang.", 500);
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ kodePromoId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { kodePromoId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("kode_promo")
    .select("id")
    .eq("id", kodePromoId)
    .maybeSingle();
  if (existingError) {
    console.error("[kode-promo DELETE] query existing failed:", existingError);
    return errorResponse("Gagal memuat kode promo. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Kode promo tidak ditemukan.", 404);
  }

  const { error: deleteError } = await supabaseServer.from("kode_promo").delete().eq("id", kodePromoId);

  if (deleteError) {
    console.error("[kode-promo DELETE] delete failed:", deleteError);
    return errorResponse("Gagal menghapus kode promo. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
