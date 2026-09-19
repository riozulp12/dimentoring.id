import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getKelasForCheckout, getKelasSubtesOptions } from "@/lib/payment/getKelasForCheckout";
import { getOfflineMentorOptions } from "@/lib/payment/getOfflineMentorOptions";

/**
 * Cari Mentor Offline terdekat (Haversine) — dipanggil dari halaman Checkout
 * SETELAH browser siswa memberi izin lokasi (navigator.geolocation), karena
 * lokasi cuma bisa didapat di client. Endpoint ini CUMA baca (tidak menyimpan
 * apa pun) — lokasi siswa baru benar-benar disimpan di app/api/payment/create
 * setelah siswa pilih mentor & lanjut bayar.
 */

interface OfflineMentorsBody {
  kelasId?: string;
  lat?: number;
  lng?: number;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "student") return errorResponse("Cuma Siswa yang bisa checkout kelas.", 403);

  let body: OfflineMentorsBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const kelasId = body.kelasId;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!kelasId || typeof kelasId !== "string") return errorResponse("Kelas tidak valid.", 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return errorResponse("Lokasi tidak valid.", 400);
  }

  const kelas = await getKelasForCheckout(kelasId);
  if (!kelas) return errorResponse("Kelas tidak ditemukan.", 404);
  if (kelas.modePembelajaran !== "offline") {
    return errorResponse("Kelas ini bukan kelas tatap muka (offline).", 400);
  }

  const subtesOptions = await getKelasSubtesOptions(kelasId);
  const subtesId = subtesOptions[0]?.id;
  if (!subtesId) {
    return errorResponse("Kelas ini belum punya Subtes yang diatur. Hubungi Admin.", 400);
  }

  const mentors = await getOfflineMentorOptions(subtesId, lat, lng);

  return NextResponse.json({ success: true, mentors });
}
