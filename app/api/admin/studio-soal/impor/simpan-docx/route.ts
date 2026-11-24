import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { gagalReferensi, simpanBatch, siapkanMasukanDocx, susunImporDariDb } from "@/lib/admin/studioSoalImpor";

export const runtime = "nodejs";

/**
 * Simpan soal Buatan Sendiri dari Word (.docx) sebagai DRAF (Admin).
 * POST multipart: berkas = satu .docx (maks. 5 MB), lewatiGalat = "true" (opsional, bawaan mati).
 * Berkas diurai & divalidasi ULANG di server; hasil pratinjau klien tidak dipercaya.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const docx = await siapkanMasukanDocx(request);
  if (!docx.ok) return docx.respons;

  const susun = await susunImporDariDb(docx.data.masukan);
  if (!susun.ok) return gagalReferensi();
  return simpanBatch(auth.adminId, susun.hasil, docx.data.namaBerkas, docx.data.lewatiGalat);
}
