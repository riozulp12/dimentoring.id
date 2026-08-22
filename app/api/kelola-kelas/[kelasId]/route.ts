import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { validateKelasInput, type KelasInputBody } from "@/lib/admin/validateKelasInput";

/** Edit/Hapus Kelas — PRD Bagian 7.5 & 7.5.3 (Admin, Kelola Kelas). */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function requireAdmin(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return { session: null, error: errorResponse("Belum login.", 401) };
  if (session.role !== "admin") {
    return { session: null, error: errorResponse("Cuma Admin yang bisa mengelola kelas.", 403) };
  }
  return { session, error: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ kelasId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { kelasId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("kelas")
    .select("id")
    .eq("id", kelasId)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-kelas PATCH] query existing failed:", existingError);
    return errorResponse("Gagal memuat kelas. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Kelas tidak ditemukan.", 404);
  }

  let body: KelasInputBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const result = await validateKelasInput(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
  }

  const { error: updateError } = await supabaseServer.from("kelas").update(result.data).eq("id", kelasId);

  if (updateError) {
    console.error("[kelola-kelas PATCH] update failed:", updateError);
    return errorResponse("Gagal menyimpan perubahan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ kelasId: string }> }) {
  const { error: authError } = requireAdmin(request);
  if (authError) return authError;

  const { kelasId } = await params;

  const { data: existing, error: existingError } = await supabaseServer
    .from("kelas")
    .select("id")
    .eq("id", kelasId)
    .maybeSingle();
  if (existingError) {
    console.error("[kelola-kelas DELETE] query existing failed:", existingError);
    return errorResponse("Gagal memuat kelas. Coba lagi nanti.", 500);
  }
  if (!existing) {
    return errorResponse("Kelas tidak ditemukan.", 404);
  }

  // Cek enrollments (SEMUA status, bukan cuma lunas — siswa yang masih
  // 'menunggu' pembayaran juga kehilangan pendaftarannya kalau kelas dihapus)
  // SEBELUM benar-benar hapus — jangan biarkan kelas dengan siswa aktif
  // hilang begitu saja tanpa peringatan.
  const { count: enrollmentCount, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("kelas_id", kelasId);

  if (enrollmentError) {
    console.error("[kelola-kelas DELETE] query enrollments failed:", enrollmentError);
    return errorResponse("Gagal memeriksa siswa terdaftar. Coba lagi nanti.", 500);
  }
  if ((enrollmentCount ?? 0) > 0) {
    return errorResponse(
      `Kelas ini masih punya ${enrollmentCount} siswa terdaftar (termasuk yang menunggu pembayaran). Pindahkan atau batalkan pendaftaran siswa itu dulu sebelum menghapus kelas.`,
      409,
    );
  }

  const { error: deleteError } = await supabaseServer.from("kelas").delete().eq("id", kelasId);

  if (deleteError) {
    console.error("[kelola-kelas DELETE] delete failed:", deleteError);
    // Kemungkinan masih ada materi/referensi lain yang terikat ke kelas ini.
    return errorResponse(
      "Gagal menghapus kelas — kemungkinan masih ada materi atau data lain yang terikat ke kelas ini.",
      409,
    );
  }

  return NextResponse.json({ success: true });
}
