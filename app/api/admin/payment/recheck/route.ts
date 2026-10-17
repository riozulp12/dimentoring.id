import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { MayarError } from "@/lib/payment/mayar";
import { SYNC_PAYMENT_COLUMNS, syncPaymentDariGateway, type SyncablePayment } from "@/lib/payment/syncPayment";

/**
 * Recheck pembayaran Mayar (khusus Admin) — cocokkan payments ke status ASLI
 * di API Mayar. Body opsional { orderId }: satu order (status apa pun, mis.
 * untuk melengkapi langkah pasca-lunas yang sempat gagal); tanpa orderId:
 * semua payment Mayar yang masih 'menunggu' (gateway_reference terisi sejak
 * dibuat — beda dengan baris Midtrans lama yang baru terisi saat lunas).
 *
 * Gagal HANYA kalau Mayar menyatakan belum dibayar DAN (closed ATAU > 24 jam
 * sejak dibuat) — lihat decideRecheckAction di lib/payment/mayarLogic.ts.
 */

const MAX_BATCH = 50;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return errorResponse("Belum login.", 401);
  }
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa recheck pembayaran.", 403);
  }

  let body: { orderId?: unknown } = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  let query = supabaseServer.from("payments").select(SYNC_PAYMENT_COLUMNS).not("gateway_reference", "is", null);
  if (body.orderId !== undefined) {
    if (typeof body.orderId !== "string" || !body.orderId.trim()) {
      return errorResponse("orderId tidak valid.", 400);
    }
    query = query.eq("order_id", body.orderId.trim());
  } else {
    query = query.eq("status", "menunggu").order("dibuat_pada", { ascending: true }).limit(MAX_BATCH);
  }

  const { data: payments, error } = await query;
  if (error) {
    console.error("[admin/payment/recheck] query payments failed:", error.code);
    return errorResponse("Gagal memuat pembayaran. Coba lagi nanti.", 500);
  }
  if (body.orderId !== undefined && (payments ?? []).length === 0) {
    return errorResponse("Order tidak ditemukan (atau bukan pembayaran Mayar).", 404);
  }

  console.info(`[admin/payment/recheck] dijalankan oleh admin ${session.userId} untuk ${(payments ?? []).length} payment.`);

  const hasil: { orderId: string; outcome: string; mayarStatus?: string; error?: string }[] = [];
  for (const payment of (payments ?? []) as SyncablePayment[]) {
    try {
      const result = await syncPaymentDariGateway(payment, { bolehTandaiGagal: true });
      hasil.push({ orderId: payment.order_id, outcome: result.outcome, mayarStatus: result.rawStatus ?? result.mayarStatus });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "error tak terduga";
      console.error(`[admin/payment/recheck] order ${payment.order_id} gagal dicek: ${message}`);
      hasil.push({
        orderId: payment.order_id,
        outcome: "error",
        error: syncError instanceof MayarError ? message : "Gagal memproses, lihat log server.",
      });
    }
  }

  return NextResponse.json({ success: true, hasil });
}
