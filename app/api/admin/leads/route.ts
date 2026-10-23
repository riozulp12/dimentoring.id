import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { getLeadCampaignOptions, getLeads, parseLeadFilter } from "@/lib/admin/leads";

/**
 * GET /api/admin/leads — daftar lead terbaru + filter (PRD 7.4.6, BR-38).
 * Peran Admin dicek dari session ter-signed + user_roles di DB, bukan body.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const filter = parseLeadFilter(request.nextUrl.searchParams);
  const [leads, campaignOptions] = await Promise.all([getLeads(filter), getLeadCampaignOptions()]);
  if (leads === "gagal") {
    return NextResponse.json({ success: false, error: "Gagal memuat leads. Coba lagi nanti." }, { status: 500 });
  }
  return NextResponse.json({ success: true, leads, campaignOptions });
}
