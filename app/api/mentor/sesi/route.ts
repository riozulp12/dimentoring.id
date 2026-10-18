import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getAksesMentorEnrollment } from "@/lib/mentor/aksesMentor";
import { notifySesiDitandaiMentor } from "@/lib/notifikasi/notify";
import { rentangHariWib, tanggalWib } from "@/lib/shared/hariWib";

/**
 * "Tandai Sesi Hari Ini Selesai" (Mentor) — PRD Bagian 7.5.5 FR-A1. Selalu
 * menandai nomor_sesi PALING KECIL yang belum ditandai (urut, tidak bisa
 * loncat) — dikonfirmasi_mentor=true, tanggal_dilaksanakan=hari ini. BR-7:
 * cuma mentor yang terkait enrollment ini (kelas.mentor_id, kelas_mentor,
 * atau enrollments.mentor_offline_id — lib/mentor/aksesMentor.ts) yang boleh.
 * Maksimal SATU penandaan per enrollment per hari kalender WIB (Asia/Jakarta)
 * — lebih dari itu 409. tanggal_dilaksanakan juga tanggal WIB, bukan UTC.
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

  const akses = await getAksesMentorEnrollment(session.userId, enrollmentId);
  if (akses === "gagal") {
    return errorResponse("Gagal memuat data siswa. Coba lagi nanti.", 500);
  }
  // BR-7: dua-duanya (enrollment tidak ada, ATAU ada tapi mentor ini tidak
  // terkait) ditolak dengan pesan sama supaya tidak bocorkan kelas mentor lain.
  if (!akses) {
    return errorResponse("Siswa ini bukan bagian dari kelas yang kamu ampu.", 403);
  }
  const { enrollment, kelas } = akses;

  const now = new Date();
  const hariIni = rentangHariWib(now);
  // Sesi yang dibatalkan Admin (dikonfirmasi_mentor_pada di-reset NULL) tidak
  // ikut terhitung, jadi mentor tetap bisa menandai ulang di hari yang sama.
  const { count: ditandaiHariIni, error: hariIniError } = await supabaseServer
    .from("sesi_kelas")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("dikonfirmasi_mentor", true)
    .gte("dikonfirmasi_mentor_pada", hariIni.mulai)
    .lt("dikonfirmasi_mentor_pada", hariIni.akhir);

  if (hariIniError) {
    console.error("[mentor/sesi] query penandaan hari ini failed:", hariIniError);
    return errorResponse("Gagal memuat sesi. Coba lagi nanti.", 500);
  }
  if ((ditandaiHariIni ?? 0) > 0) {
    return errorResponse(
      "Sesi siswa ini sudah ditandai hari ini. Maksimal satu sesi per hari — tandai sesi berikutnya besok.",
      409,
    );
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

  // Kondisional/atomik: cuma baris yang MASIH belum ditandai. Dua request
  // bersamaan (klik dobel, dua tab) memilih baris yang sama — yang kalah
  // mengubah 0 baris dan TIDAK mengirim notifikasi.
  const { data: updatedRows, error: updateError } = await supabaseServer
    .from("sesi_kelas")
    .update({
      dikonfirmasi_mentor: true,
      dikonfirmasi_mentor_pada: now.toISOString(),
      tanggal_dilaksanakan: tanggalWib(now),
    })
    .eq("id", nextSesi.id)
    .eq("dikonfirmasi_mentor", false)
    .select("id");

  if (updateError) {
    console.error("[mentor/sesi] update sesi_kelas failed:", updateError);
    return errorResponse("Gagal menandai sesi. Coba lagi nanti.", 500);
  }
  if (!updatedRows || updatedRows.length === 0) {
    return errorResponse("Sesi ini baru saja ditandai (mungkin dari tab lain). Muat ulang halaman.", 409);
  }

  await notifySesiDitandaiMentor(
    enrollment.userId,
    enrollment.kelasId,
    kelas.nama,
    nextSesi.nomor_sesi as number,
  );

  return NextResponse.json({ success: true, nomorSesi: nextSesi.nomor_sesi });
}
