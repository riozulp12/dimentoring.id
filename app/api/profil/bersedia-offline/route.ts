import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Toggle "Bersedia Mengajar Tatap Muka (Offline)" — halaman Profil Mentor.
 * Menyalakan toggle WAJIB disertai lokasi GPS (navigator.geolocation di
 * client) — tanpa lokasi, mentor tidak bisa di-matching jarak terdekat saat
 * siswa checkout kelas offline, jadi endpoint ini MENOLAK bisaOffline=true
 * tanpa lat/lng valid (jangan percaya client skip validasi ini).
 */

interface BersediaOfflineBody {
  bisaOffline?: boolean;
  lat?: number;
  lng?: number;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "mentor") return errorResponse("Cuma Mentor yang punya pengaturan ini.", 403);

  let body: BersediaOfflineBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  if (typeof body.bisaOffline !== "boolean") {
    return errorResponse("Field bisaOffline wajib diisi.", 400);
  }

  const update: Record<string, unknown> = { bisa_offline: body.bisaOffline };

  if (body.bisaOffline) {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return errorResponse("Lokasi tidak valid. Izinkan akses lokasi lalu coba lagi.", 400);
    }
    update.lokasi_lat = lat;
    update.lokasi_lng = lng;
  }

  const { error } = await supabaseServer.from("mentor_profiles").update(update).eq("user_id", session.userId);
  if (error) {
    console.error("[profil/bersedia-offline] update failed:", error);
    return errorResponse("Gagal menyimpan pengaturan. Coba lagi nanti.", 500);
  }

  return NextResponse.json({ success: true });
}
