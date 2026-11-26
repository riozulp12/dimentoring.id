import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { BUCKET_STAGING, hapusBerkas } from "@/lib/admin/mediaSoal";
import { gagalReferensi, simpanBatch, siapkanMasukanDocx, susunImporDariDb } from "@/lib/admin/studioSoalImpor";

export const runtime = "nodejs";

/**
 * Simpan soal Buatan Sendiri dari Word (.docx) sebagai DRAF (Admin).
 * POST { path, namaBerkas?, lewatiGalat? }. Berkas diunduh dari impor-staging, diurai &
 * divalidasi ULANG di server; hasil pratinjau klien tidak dipercaya. Berkas staging dihapus
 * setelah tersimpan (yang tertinggal dibersihkan tugas terjadwal, belum dibuat).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const docx = await siapkanMasukanDocx(request, auth.adminId);
  if (!docx.ok) return docx.respons;

  const susun = await susunImporDariDb(docx.data.masukan);
  if (!susun.ok) return gagalReferensi();
  const respons = await simpanBatch(auth.adminId, susun.hasil, docx.data.namaBerkas, docx.data.lewatiGalat, docx.data.gambar);
  if (respons.ok) await hapusBerkas(BUCKET_STAGING, [docx.data.path]);
  return respons;
}
