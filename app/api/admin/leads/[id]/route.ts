import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { ubahLead, type UbahLeadInput } from "@/lib/admin/leads";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/admin/leads/[id] — ubah status dan/atau catatan lead
 * (PRD 7.4.6, BR-38). Perubahan status tercatat di lead_status_log.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ success: false, error: "Lead tidak ditemukan." }, { status: 404 });

  let body: UbahLeadInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body request harus JSON yang valid." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Body request tidak valid." }, { status: 400 });
  }

  const hasil = await ubahLead(id, auth.adminId, { status: body.status, catatan: body.catatan });
  if (!hasil.ok) return NextResponse.json({ success: false, error: hasil.error }, { status: hasil.status });
  return NextResponse.json({ success: true, lead: hasil.lead });
}
