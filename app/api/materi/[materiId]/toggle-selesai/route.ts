import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Toggle "Tandai Selesai" materi — PRD Bagian 7.5.1 & Bagian 13 (materi_progress).
 * Setiap toggle menghitung ulang enrollments.progres_persen dari COUNT
 * materi_progress selesai=true berbanding COUNT materi published di kelas
 * itu (bukan angka manual yang mengambang), lalu mengembalikan nilai terbaru
 * supaya UI bisa update tanpa reload.
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ materiId: string }> }) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "student") {
    return errorResponse("Cuma Siswa yang bisa menandai materi selesai.", 403);
  }

  const { materiId } = await params;

  const { data: materi, error: materiError } = await supabaseServer
    .from("materi")
    .select("id, kelas_id, status")
    .eq("id", materiId)
    .maybeSingle();

  if (materiError) {
    console.error("[toggle-selesai] query materi failed:", materiError);
    return errorResponse("Gagal memuat materi. Coba lagi nanti.", 500);
  }
  if (!materi || materi.status !== "published") {
    return errorResponse("Materi tidak ditemukan.", 404);
  }

  const kelasId = materi.kelas_id as string;

  // BR-6: akses materi (termasuk tandai selesai) cuma untuk siswa yang sudah lunas.
  const { data: enrollment, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("id, status_pembayaran")
    .eq("user_id", session.userId)
    .eq("kelas_id", kelasId)
    .maybeSingle();

  if (enrollmentError) {
    console.error("[toggle-selesai] query enrollment failed:", enrollmentError);
    return errorResponse("Gagal memuat status kelas. Coba lagi nanti.", 500);
  }
  if (!enrollment || enrollment.status_pembayaran !== "lunas") {
    return errorResponse("Kamu belum terdaftar di kelas ini.", 403);
  }

  const { data: existingProgress, error: existingError } = await supabaseServer
    .from("materi_progress")
    .select("selesai")
    .eq("user_id", session.userId)
    .eq("materi_id", materiId)
    .maybeSingle();

  if (existingError) {
    console.error("[toggle-selesai] query materi_progress failed:", existingError);
    return errorResponse("Gagal memuat progress. Coba lagi nanti.", 500);
  }

  const newSelesai = !(existingProgress?.selesai ?? false);

  const { error: upsertError } = await supabaseServer.from("materi_progress").upsert(
    {
      user_id: session.userId,
      materi_id: materiId,
      selesai: newSelesai,
      tanggal_selesai: newSelesai ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,materi_id" },
  );

  if (upsertError) {
    console.error("[toggle-selesai] upsert materi_progress failed:", upsertError);
    return errorResponse("Gagal menyimpan progress. Coba lagi nanti.", 500);
  }

  // ---- Hitung ulang enrollments.progres_persen (hindari divide by zero) ----
  const { data: publishedMateri, error: publishedError } = await supabaseServer
    .from("materi")
    .select("id")
    .eq("kelas_id", kelasId)
    .eq("status", "published");

  if (publishedError) {
    console.error("[toggle-selesai] query published materi failed:", publishedError);
    return errorResponse("Gagal menghitung progress. Coba lagi nanti.", 500);
  }

  const publishedIds = (publishedMateri ?? []).map((row) => row.id as string);
  let progresPersen = 0;

  if (publishedIds.length > 0) {
    const { count, error: countError } = await supabaseServer
      .from("materi_progress")
      .select("*", { count: "exact", head: true })
      .eq("user_id", session.userId)
      .eq("selesai", true)
      .in("materi_id", publishedIds);

    if (countError) {
      console.error("[toggle-selesai] count materi_progress failed:", countError);
      return errorResponse("Gagal menghitung progress. Coba lagi nanti.", 500);
    }

    progresPersen = Math.round(((count ?? 0) / publishedIds.length) * 100);
  }

  const { error: updateEnrollmentError } = await supabaseServer
    .from("enrollments")
    .update({ progres_persen: progresPersen })
    .eq("id", enrollment.id);

  if (updateEnrollmentError) {
    console.error("[toggle-selesai] update enrollments failed:", updateEnrollmentError);
    return errorResponse("Gagal menyimpan progress kelas. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true, selesai: newSelesai, progresPersen });
}
