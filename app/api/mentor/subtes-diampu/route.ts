import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { rencanakanUbahSubtes, terapkanUbahSubtes } from "@/lib/mentor/ubahSubtesMentor";

/**
 * Ubah "Subtes yang Diampu" dari kartu Info Mengajar (halaman Profil).
 * Body: { subtesDiampu: string[] } — daftar NAMA subtes LENGKAP yang diinginkan.
 *
 * - Otorisasi di server: mentorId SELALU dari sesi. Role harus mentor. Body yang
 *   menyebut mentor lain (mentorUserId) ditolak 403 — tidak ada jalur Admin (tidak
 *   ada halaman Admin untuk ini).
 * - Penjaga dan penulisan diff: lib/mentor/ubahSubtesMentor.ts (aturan murni di
 *   lib/shared/ubahSubtesMentor.ts). 409 = masih dipakai di kelas / pendaftaran offline.
 */

function errorResponse(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "mentor") return errorResponse("Hanya Mentor yang bisa mengubah Subtes yang Diampu.", 403);

  let body: { subtesDiampu?: unknown; mentorUserId?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }
  if (body === null || typeof body !== "object") return errorResponse("Body request harus JSON yang valid.", 400);

  if (body.mentorUserId !== undefined && body.mentorUserId !== session.userId) {
    return errorResponse("Kamu hanya bisa mengubah Subtes yang Diampu milikmu sendiri.", 403);
  }

  const rencana = await rencanakanUbahSubtes(session.userId, body.subtesDiampu);
  if (!rencana.ok) {
    return errorResponse(rencana.error, rencana.status, rencana.tertahan ? { tertahan: rencana.tertahan } : undefined);
  }

  const hasil = await terapkanUbahSubtes(rencana);
  if (!hasil.ok) return errorResponse(hasil.error, 500);

  return NextResponse.json({ success: true, subtesDiampu: body.subtesDiampu });
}
