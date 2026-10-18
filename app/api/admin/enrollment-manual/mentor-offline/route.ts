import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  getMentorOfflineKandidat,
  parseLokasi,
  requireAdminAktif,
} from "@/lib/admin/enrollmentManual";
import { getKelasSubtesOptions } from "@/lib/payment/getKelasForCheckout";

/**
 * Kandidat mentor tatap muka untuk satu kelas offline — PRD 7.5.9. Dipakai
 * form Daftarkan Siswa Manual dan aksi Ubah Mentor. lat/lng opsional (cuma
 * untuk urutan jarak).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const params = request.nextUrl.searchParams;
  const kelasId = params.get("kelasId") ?? "";
  if (!kelasId) return NextResponse.json({ success: false, error: "Kelas tidak valid." }, { status: 400 });
  const lokasi = parseLokasi(params.get("lat"), params.get("lng"));
  if (!lokasi.ok) return NextResponse.json({ success: false, error: "Koordinat tidak valid." }, { status: 400 });

  const subtesId = (await getKelasSubtesOptions(kelasId))[0]?.id;
  if (!subtesId) return NextResponse.json({ success: true, mentor: [] });

  const kandidat = await getMentorOfflineKandidat(subtesId, lokasi.value);
  if (kandidat === "gagal") {
    return NextResponse.json({ success: false, error: "Gagal memuat mentor. Coba lagi nanti." }, { status: 500 });
  }
  return NextResponse.json({ success: true, mentor: kandidat });
}
