import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { gagalReferensi, parseBodyImpor, responsPratinjau, susunImporDariDb } from "@/lib/admin/studioSoalImpor";

/**
 * Pratinjau unggah soal Buatan Sendiri dari CSV (Admin) — parse + validasi saja, TANPA menyimpan apa pun.
 * POST { soalCsv, bacaanCsv? }
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
  return responsPratinjau(susun.hasil);
}
