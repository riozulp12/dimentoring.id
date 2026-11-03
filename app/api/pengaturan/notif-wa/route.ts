import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { simpanNotifWaMentor } from "@/lib/pengaturan/notifWaMentor";

/**
 * Saklar "Kabari saya lewat WhatsApp saat ada siswa baru" — HANYA untuk Mentor.
 * Yang diubah selalu akun milik sesi (user id dari cookie bertanda tangan,
 * TIDAK PERNAH dari body), jadi tidak ada cara mengubah akun orang lain.
 * Menyalakan butuh nomor WA tersimpan yang valid (dicek di server).
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "mentor") return errorResponse("Pengaturan ini hanya untuk Mentor.", 403);

  let body: { setuju?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }
  if (typeof body.setuju !== "boolean") return errorResponse("Pilihan tidak valid.", 400);

  const hasil = await simpanNotifWaMentor(session.userId, body.setuju);
  switch (hasil) {
    case "ok":
      return NextResponse.json({ success: true, setuju: body.setuju });
    case "nomor_tidak_valid":
      return errorResponse("Nomor WhatsApp kamu belum terisi atau belum valid. Lengkapi dulu di Profil.", 400);
    case "kolom_belum_ada":
      return errorResponse("Fitur ini belum aktif. Coba lagi nanti ya.", 503);
    default:
      return errorResponse("Gagal menyimpan. Coba lagi nanti.", 500);
  }
}
