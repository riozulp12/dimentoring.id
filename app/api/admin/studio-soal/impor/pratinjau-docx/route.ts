import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { gagalReferensi, responsPratinjau, siapkanMasukanDocx, susunImporDariDb } from "@/lib/admin/studioSoalImpor";

export const runtime = "nodejs";
// Unduh Word dari Storage + unggah sampai 60 gambar bisa melebihi batas waktu bawaan fungsi.
export const maxDuration = 60;

/**
 * Pratinjau unggah soal Buatan Sendiri dari Word (.docx) — TANPA menyimpan apa pun.
 * POST { path } = berkas di bucket impor-staging (lihat siapkan-unggah). Teks diurai jadi baris
 * perantara lalu divalidasi susunImpor() yang sama dengan jalur CSV. Gambar hanya diperiksa dan
 * dihitung, tidak disimpan. Persamaan Word dan gambar yang tidak didukung ditolak.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const docx = await siapkanMasukanDocx(request, auth.adminId);
  if (!docx.ok) return docx.respons;

  const susun = await susunImporDariDb(docx.data.masukan);
  if (!susun.ok) return gagalReferensi();
  return responsPratinjau(susun.hasil);
}
