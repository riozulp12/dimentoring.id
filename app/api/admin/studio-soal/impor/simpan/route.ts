import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { gagalReferensi, parseBodyImpor, simpanBatch, susunImporDariDb } from "@/lib/admin/studioSoalImpor";

/**
 * Simpan soal Buatan Sendiri dari CSV sebagai DRAF (Admin). Validasi disusun ULANG di server —
 * hasil pratinjau klien tidak dipercaya. Satu transaksi lewat RPC studio_soal_impor_admin
 * (db/add_impor_soal.sql): semua-atau-tidak.
 *
 * POST { soalCsv, bacaanCsv?, namaBerkas?, lewatiGalat? }
 *   lewatiGalat=true (opsi eksplisit, bawaan mati): baris galat dilewati, hanya baris lolos disimpan.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body request harus JSON yang valid." }, { status: 400 });
  }
  const parsed = parseBodyImpor(body);
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

  const susun = await susunImporDariDb(parsed.data);
  if (!susun.ok) return gagalReferensi();
  return simpanBatch(auth.adminId, susun.hasil, parsed.data.namaBerkas, parsed.data.lewatiGalat);
}
