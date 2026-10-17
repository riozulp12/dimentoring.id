import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payment/provider";
import { MayarError } from "@/lib/payment/mayar";
import { PascaLunasError } from "@/lib/payment/fulfillPayment";
import { SYNC_PAYMENT_COLUMNS, syncPaymentDariGateway, type SyncablePayment } from "@/lib/payment/syncPayment";

/**
 * Webhook Mayar — PRD Bagian 8 BR-19. Payload TIDAK dipercaya: id di payload
 * cuma dipakai mencari baris payments (productId -> id -> transactionId
 * dicocokkan ke gateway_reference), lalu status ASLI diambil lewat GET ke API
 * Mayar memakai gateway_reference milik KITA. Keaslian webhook = hasil GET itu,
 * bukan signature. Idempotent lewat update bersyarat di lib/payment/fulfillPayment.ts.
 *
 * Langkah pasca-lunas gagal -> HTTP 500 supaya Mayar mengirim ulang.
 */

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: "Body request harus JSON yang valid." }, 400);
  }

  const refs = getPaymentProvider().handleNotification(payload);
  if (refs.length === 0) {
    console.warn("[payment/webhook/mayar] payload tanpa productId/id/transactionId — diabaikan.");
    return json({ success: true, message: "Diabaikan." });
  }

  let payment: SyncablePayment | null = null;
  for (const ref of refs) {
    const { data, error } = await supabaseServer
      .from("payments")
      .select(SYNC_PAYMENT_COLUMNS)
      .eq("gateway_reference", ref.value)
      .maybeSingle();
    if (error) {
      console.error("[payment/webhook/mayar] query payments failed:", error.code);
      return json({ success: false, error: "Gagal memproses notifikasi." }, 500);
    }
    if (data) {
      // Dicatat untuk uji sandbox: field payload mana yang sama dengan id payment request.
      console.info(`[payment/webhook/mayar] cocok lewat field data.${ref.field}`);
      payment = data as SyncablePayment;
      break;
    }
  }

  if (!payment) {
    console.warn(
      `[payment/webhook/mayar] tidak ada payment cocok (dicoba: ${refs.map((r) => `data.${r.field}`).join(", ")}) — diabaikan.`,
    );
    return json({ success: true, message: "Diabaikan." });
  }

  try {
    const result = await syncPaymentDariGateway(payment, { bolehTandaiGagal: false });
    console.info(`[payment/webhook/mayar] order ${payment.order_id}: ${result.outcome} (mayar=${result.rawStatus ?? "?"})`);
    return json({ success: true, outcome: result.outcome });
  } catch (error) {
    if (error instanceof MayarError && error.httpStatus === 404) {
      console.warn(`[payment/webhook/mayar] order ${payment.order_id}: id tidak dikenal Mayar — diabaikan.`);
      return json({ success: true, message: "Diabaikan." });
    }
    const label = error instanceof PascaLunasError || error instanceof MayarError ? error.message : "error tak terduga";
    console.error(`[payment/webhook/mayar] order ${payment.order_id} gagal diproses, minta Mayar kirim ulang: ${label}`);
    return json({ success: false, error: "Gagal memproses notifikasi." }, 500);
  }
}
