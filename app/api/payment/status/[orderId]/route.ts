import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getPaymentStatusForUser } from "@/lib/payment/getPaymentStatus";

/**
 * Dipoll dari halaman "Menunggu Konfirmasi" tiap beberapa detik — PRD Bagian
 * 13 (payments.status). Endpoint ringan, cuma baca, selalu scoped ke session
 * user (jangan sampai order orang lain bisa diintip lewat order_id di URL).
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }

  const { orderId } = await params;
  const payment = await getPaymentStatusForUser(orderId, session.userId);
  if (!payment) {
    return errorResponse("Transaksi tidak ditemukan.", 404);
  }

  return NextResponse.json({
    success: true,
    status: payment.status,
    itemId: payment.itemId,
    kelasNama: payment.kelasNama,
  });
}
