import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { notifySesiDitandaiMentor } from "@/lib/notifikasi/notify";

/**
 * "Tandai Sesi Hari Ini Selesai" (Mentor) — PRD Bagian 7.5.5 FR-A1. Selalu
 * menandai nomor_sesi PALING KECIL yang belum ditandai (urut, tidak bisa
 * loncat) — dikonfirmasi_mentor=true, tanggal_dilaksanakan=hari ini. BR-7:
 * cuma mentor yang di-assign ke kelas enrollment ini yang boleh menandai.
 */

interface TandaiSesiBody {
  enrollmentId?: string;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "mentor") return errorResponse("Cuma Mentor yang bisa menandai sesi.", 403);

  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    return errorResponse("Fitur mengajar terkunci selama akun kamu masih 'On Review'.", 403);
  }

  let body: TandaiSesiBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const enrollmentId = body.enrollmentId;
  if (!enrollmentId || typeof enrollmentId !== "string") {
    return errorResponse("Siswa/kelas tidak valid.", 400);
  }

  const { data: enrollment, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("id, user_id, kelas_id, kelas:kelas_id(mentor_id, nama)")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (enrollmentError) {
    console.error("[mentor/sesi] query enrollment failed:", enrollmentError);
    return errorResponse("Gagal memuat data siswa. Coba lagi nanti.", 500);
  }

  type KelasJoin = { mentor_id: string | null; nama: string } | { mentor_id: string | null; nama: string }[] | null;
  const kelasJoin = enrollment?.kelas as KelasJoin;
  const kelas = Array.isArray(kelasJoin) ? (kelasJoin[0] ?? null) : kelasJoin;

  // BR-7: dua-duanya (enrollment tidak ada, ATAU ada tapi bukan kelas mentor
  // ini) ditolak dengan pesan sama supaya tidak bocorkan kelas mentor lain.
  if (!enrollment || !kelas || kelas.mentor_id !== session.userId) {
    return errorResponse("Siswa ini bukan bagian dari kelas yang kamu ampu.", 403);
  }

  const { data: nextSesi, error: nextSesiError } = await supabaseServer
    .from("sesi_kelas")
    .select("id, nomor_sesi")
    .eq("enrollment_id", enrollmentId)
    .eq("dikonfirmasi_mentor", false)
    .order("nomor_sesi", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextSesiError) {
    console.error("[mentor/sesi] query sesi_kelas failed:", nextSesiError);
    return errorResponse("Gagal memuat sesi. Coba lagi nanti.", 500);
  }
  if (!nextSesi) {
    return errorResponse("Semua sesi kelas ini sudah ditandai selesai.", 400);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const { error: updateError } = await supabaseServer
    .from("sesi_kelas")
    .update({
      dikonfirmasi_mentor: true,
      dikonfirmasi_mentor_pada: new Date().toISOString(),
      tanggal_dilaksanakan: todayIso,
    })
    .eq("id", nextSesi.id);

  if (updateError) {
    console.error("[mentor/sesi] update sesi_kelas failed:", updateError);
    return errorResponse("Gagal menandai sesi. Coba lagi nanti.", 500);
  }

  await notifySesiDitandaiMentor(
    enrollment.user_id as string,
    enrollment.kelas_id as string,
    kelas.nama,
    nextSesi.nomor_sesi as number,
  );

  return NextResponse.json({ success: true, nomorSesi: nextSesi.nomor_sesi });
}
