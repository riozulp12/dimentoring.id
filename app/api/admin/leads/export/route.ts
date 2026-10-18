import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { getLeadsUntukExport, leadsKeCsv, parseLeadFilter } from "@/lib/admin/leads";

/**
 * GET /api/admin/leads/export — CSV sesuai filter aktif (PRD 7.4.6, BR-38).
 * Sel diamankan dari CSV/formula injection (lib/shared/csv.ts); nomor
 * selalu format 628.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const leads = await getLeadsUntukExport(parseLeadFilter(request.nextUrl.searchParams));
  if (leads === "gagal") {
    return NextResponse.json({ success: false, error: "Gagal memuat leads. Coba lagi nanti." }, { status: 500 });
  }

  const tanggal = new Date().toISOString().slice(0, 10);
  return new NextResponse(leadsKeCsv(leads), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${tanggal}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
