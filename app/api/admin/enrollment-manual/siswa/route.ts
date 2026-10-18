import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, cariSiswaAktif, requireAdminAktif } from "@/lib/admin/enrollmentManual";

/** Cari siswa aktif (nama/email) untuk form Daftarkan Siswa Manual — PRD 7.5.9. */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const hasil = await cariSiswaAktif(q.slice(0, 100));
  if (hasil === "gagal") {
    return NextResponse.json({ success: false, error: "Gagal mencari siswa. Coba lagi nanti." }, { status: 500 });
  }
  return NextResponse.json({ success: true, siswa: hasil });
}
