import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { notifyAdminSesiDisangkal } from "@/lib/notifikasi/notify";
import { BATAS_RESPONS_JAM, hitungStatusSesi } from "@/lib/shared/statusSesi";

/**
 * Konfirmasi balik Siswa atas sesi yang ditandai Mentor — PRD Bagian 7.5.5
 * FR-A2, BR-34 (konfirmasi DUA ARAH, bukan klaim sepihak mentor). "Tidak"
 * menandai perlu_review_admin=true DAN memberitahu Admin — TIDAK otomatis
 * dianggap tidak sah, menunggu keputusan Admin (lihat app/api/admin/sesi-review).
 *
 * Jendela jawab 24 jam sejak mentor menandai (lib/shared/statusSesi.ts) —
 * sesudahnya sesi sudah terkonfirmasi otomatis dan endpoint menolak (409).
 */

interface KonfirmasiSesiBody {
  sesiId?: string;
  konfirmasi?: boolean;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "student") return errorResponse("Cuma Siswa yang bisa konfirmasi sesi.", 403);

  let body: KonfirmasiSesiBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const sesiId = body.sesiId;
  if (!sesiId || typeof sesiId !== "string") return errorResponse("Sesi tidak valid.", 400);
  if (typeof body.konfirmasi !== "boolean") return errorResponse("Field konfirmasi wajib diisi.", 400);

  const { data: sesi, error: sesiError } = await supabaseServer
    .from("sesi_kelas")
    .select(
      "id, nomor_sesi, dikonfirmasi_mentor, dikonfirmasi_mentor_pada, status_siswa, dikonfirmasi_siswa_pada, enrollment:enrollment_id(user_id, kelas_id, kelas:kelas_id(nama))",
    )
    .eq("id", sesiId)
    .maybeSingle();

  if (sesiError) {
    console.error("[siswa/sesi] query sesi_kelas failed:", sesiError);
    return errorResponse("Gagal memuat sesi. Coba lagi nanti.", 500);
  }

  type KelasJoin = { nama: string } | { nama: string }[] | null;
  type EnrollmentJoin = { user_id: string; kelas_id: string; kelas: KelasJoin } | { user_id: string; kelas_id: string; kelas: KelasJoin }[] | null;
  const enrollmentJoin = sesi?.enrollment as EnrollmentJoin;
  const enrollment = Array.isArray(enrollmentJoin) ? (enrollmentJoin[0] ?? null) : enrollmentJoin;

  // BR-7 setara: sesi tidak ada, ATAU ada tapi bukan enrollment siswa ini —
  // dua-duanya ditolak dengan pesan sama.
  if (!sesi || !enrollment || enrollment.user_id !== session.userId) {
    return errorResponse("Sesi tidak ditemukan.", 404);
  }
  const now = new Date();
  const statusSesi = hitungStatusSesi(sesi, now).status;
  if (statusSesi === "terkonfirmasi_otomatis") {
    return errorResponse(
      `Batas ${BATAS_RESPONS_JAM} jam untuk menjawab sudah lewat, jadi sesi ini sudah terkonfirmasi otomatis. Kalau sesi ini sebenarnya tidak terjadi, hubungi Admin.`,
      409,
    );
  }
  if (statusSesi !== "menunggu_siswa") {
    return errorResponse("Sesi ini sudah tidak menunggu konfirmasi kamu.", 409);
  }

  const update = body.konfirmasi
    ? { status_siswa: "dikonfirmasi" as const, dikonfirmasi_siswa_pada: now.toISOString() }
    : {
        status_siswa: "disangkal" as const,
        dikonfirmasi_siswa_pada: now.toISOString(),
        perlu_review_admin: true,
      };

  // Kondisional: cuma baris yang MASIH 'belum' — dua klik/tab bersamaan
  // tidak bisa menimpa jawaban pertama (atau mengirim notif Admin dua kali).
  const { data: updatedRows, error: updateError } = await supabaseServer
    .from("sesi_kelas")
    .update(update)
    .eq("id", sesiId)
    .eq("status_siswa", "belum")
    .select("id");
  if (updateError) {
    console.error("[siswa/sesi] update sesi_kelas failed:", updateError);
    return errorResponse("Gagal menyimpan konfirmasi. Coba lagi nanti.", 500);
  }
  if (!updatedRows || updatedRows.length === 0) {
    return errorResponse("Sesi ini sudah tidak menunggu konfirmasi kamu.", 409);
  }

  if (!body.konfirmasi) {
    const kelasJoin = enrollment.kelas;
    const kelasNama = (Array.isArray(kelasJoin) ? kelasJoin[0]?.nama : kelasJoin?.nama) ?? "kelas ini";
    await notifyAdminSesiDisangkal(kelasNama, sesi.nomor_sesi as number);
  }

  return NextResponse.json({ success: true });
}
