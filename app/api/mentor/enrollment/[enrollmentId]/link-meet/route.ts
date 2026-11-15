import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getAksesMentorEnrollment } from "@/lib/mentor/aksesMentor";
import { getMentorBerhakLinkMeet } from "@/lib/mentor/linkMeetSiswa";
import { notifyLinkMeetSiswa } from "@/lib/notifikasi/notify";
import { isKelasPrivate, isValidLinkUrl } from "@/lib/shared/linkMeet";

/**
 * Isi link Meet PER SISWA (Mentor) — khusus kelas PRIVATE (lib/shared/linkMeet.ts). Peran & mentorId
 * dari cookie sesi, bukan body. Otorisasi berlapis: (1) mentor Active, (2) terkait enrollment ini
 * (getAksesMentorEnrollment), (3) penjaga penerimaan siswa (belum diterima = ditolak, data gagal dibaca
 * = 503, fail-closed), (4) benar-benar termasuk mentor yang SAAT INI berhak atas siswa ini — sama dengan
 * dasar "link masih berlaku", supaya link yang tersimpan tidak pernah langsung tak berlaku. Admin menimpa
 * lewat /api/kelola-kelas/[kelasId]/pendaftar/[enrollmentId]/link-meet.
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

const MAKS_PANJANG_LINK = 2000;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ enrollmentId: string }> }) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "mentor") return errorResponse("Cuma Mentor yang bisa mengisi link Meet siswa.", 403);
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    return errorResponse("Fitur mengajar terkunci selama akun kamu masih 'On Review'.", 403);
  }

  let body: { linkMeet?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }
  const linkMeet = typeof body?.linkMeet === "string" ? body.linkMeet.trim() : "";
  if (!linkMeet || linkMeet.length > MAKS_PANJANG_LINK || !isValidLinkUrl(linkMeet)) {
    return errorResponse("Link Meet harus berupa URL yang valid (diawali http:// atau https://).", 400);
  }

  const { enrollmentId } = await params;
  const akses = await getAksesMentorEnrollment(session.userId, enrollmentId);
  if (akses === "gagal") return errorResponse("Gagal memuat data siswa. Coba lagi nanti.", 500);
  // Enrollment tidak ada ATAU mentor tidak terkait: pesan sama (tidak membocorkan kelas mentor lain).
  if (!akses) return errorResponse("Siswa ini bukan bagian dari kelas yang kamu ampu.", 403);

  if (!isKelasPrivate(akses.kelas.tipeKelas)) {
    return errorResponse("Kelas ini memakai link Meet kelas, bukan link per siswa.", 422);
  }

  if (!akses.penerimaan.boleh) {
    if (akses.penerimaan.alasan === "data_gagal") return errorResponse("Coba lagi sebentar.", 503);
    return errorResponse("Siswa ini belum kamu terima. Terima siswa ini lebih dulu di halaman kelas.", 403);
  }

  const berhak = await getMentorBerhakLinkMeet(akses.enrollment.kelasId, [enrollmentId]);
  if (berhak === "gagal") return errorResponse("Coba lagi sebentar.", 503);
  if (!(berhak.get(enrollmentId) ?? []).includes(session.userId)) {
    return errorResponse("Cuma mentor yang menerima siswa ini yang bisa mengisi link Meet-nya.", 403);
  }

  const { data: sebelum, error: sebelumError } = await supabaseServer
    .from("enrollments")
    .select("link_meet, link_meet_oleh")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (sebelumError) {
    console.error("[mentor/link-meet] query enrollments failed:", sebelumError);
    return errorResponse("Gagal memuat data siswa. Coba lagi nanti.", 500);
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("enrollments")
    .update({ link_meet: linkMeet, link_meet_oleh: session.userId })
    .eq("id", enrollmentId)
    .eq("status_pembayaran", "lunas")
    .select("id")
    .maybeSingle();
  if (updateError) {
    console.error("[mentor/link-meet] update enrollments failed:", updateError);
    return errorResponse("Gagal menyimpan link Meet. Coba lagi nanti.", 500);
  }
  if (!updated) return errorResponse("Pendaftaran siswa tidak ditemukan atau belum lunas.", 404);

  // Lonceng ke siswa hanya saat link PERTAMA kali terisi / berpindah pengisi (bukan tiap suntingan).
  // Gagal kirim tidak membatalkan penyimpanan.
  if (!sebelum?.link_meet || sebelum.link_meet_oleh !== session.userId) {
    try {
      await notifyLinkMeetSiswa(akses.enrollment.userId, akses.enrollment.kelasId, akses.kelas.nama);
    } catch (error) {
      console.error("[mentor/link-meet] notifikasi siswa gagal:", error);
    }
  }

  return NextResponse.json({ success: true, linkMeet });
}
