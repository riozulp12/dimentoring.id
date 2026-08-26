import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/payment/verifyWebhookSignature";
import { convertReferralOnPayment } from "@/lib/referral/convertReferralOnPayment";
import { notifyPembayaranBerhasil } from "@/lib/notifikasi/notify";

/**
 * Webhook notifikasi Midtrans — PRD Bagian 8 BR-19 ("status pembayaran hanya
 * berubah lewat webhook gateway atau override manual Admin") & BR-10/BR-11
 * (konversi referral). WAJIB verifikasi signature dulu sebelum proses apa pun,
 * dan WAJIB idempotent (gateway bisa retry event yang sama).
 */

interface MidtransNotification {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  transaction_id?: string;
  payment_type?: string;
}

const FAILURE_STATUSES = new Set(["deny", "expire", "cancel"]);

export async function POST(request: NextRequest) {
  let body: MidtransNotification;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body request harus JSON yang valid." }, { status: 400 });
  }

  const { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signatureKey } = body;

  if (!orderId || !statusCode || !grossAmount || !signatureKey) {
    return NextResponse.json({ success: false, error: "Payload notifikasi tidak lengkap." }, { status: 400 });
  }

  // WAJIB paling pertama, sebelum sentuh DB sama sekali (BR-19).
  const signatureValid = verifyWebhookSignature({ orderId, statusCode, grossAmount, signatureKey });
  if (!signatureValid) {
    console.error("[payment/webhook] signature tidak valid untuk order_id:", orderId);
    return NextResponse.json({ success: false, error: "Signature tidak valid." }, { status: 401 });
  }

  const { data: payment, error: paymentError } = await supabaseServer
    .from("payments")
    .select("id, user_id, item_type, item_id, kode_promo_id, gateway_reference, status")
    .eq("order_id", orderId)
    .maybeSingle();

  if (paymentError) {
    console.error("[payment/webhook] query payments failed:", paymentError);
    return NextResponse.json({ success: false, error: "Gagal memproses notifikasi." }, { status: 500 });
  }
  if (!payment) {
    console.error("[payment/webhook] payment tidak ditemukan untuk order_id:", orderId);
    return NextResponse.json({ success: false, error: "Order tidak ditemukan." }, { status: 404 });
  }

  // Idempotency: gateway_reference sudah terisi -> webhook ini sudah pernah diproses sukses.
  if (payment.gateway_reference) {
    return NextResponse.json({ success: true, message: "Sudah diproses sebelumnya." });
  }

  const transactionStatus = body.transaction_status ?? "";
  const fraudStatus = body.fraud_status ?? null;

  const isSuccess =
    transactionStatus === "settlement" ||
    (transactionStatus === "capture" && (fraudStatus === null || fraudStatus === "accept"));

  if (isSuccess) {
    // Update kondisional (gateway_reference IS NULL) supaya aman kalau dua webhook
    // untuk order_id yang sama diproses hampir bersamaan (race condition) — cuma
    // salah satu yang berhasil meng-update, yang kalah dianggap "sudah diproses".
    const { data: updatedPayment, error: updateError } = await supabaseServer
      .from("payments")
      .update({
        status: "berhasil",
        gateway_reference: body.transaction_id ?? null,
        metode: body.payment_type ?? null,
        tanggal_lunas: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .is("gateway_reference", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[payment/webhook] update payments (berhasil) failed:", updateError);
      return NextResponse.json({ success: false, error: "Gagal memproses notifikasi." }, { status: 500 });
    }
    if (!updatedPayment) {
      // Kalah race terhadap webhook lain yang lebih dulu memproses order ini.
      return NextResponse.json({ success: true, message: "Sudah diproses sebelumnya." });
    }

    const kelasId = payment.item_id as string;

    if (payment.item_type === "kelas") {
      const { error: enrollmentError } = await supabaseServer
        .from("enrollments")
        .upsert(
          { user_id: payment.user_id, kelas_id: kelasId, status_pembayaran: "lunas" },
          { onConflict: "user_id,kelas_id" },
        );
      if (enrollmentError) {
        console.error("[payment/webhook] upsert enrollments failed:", enrollmentError);
      }
    }

    if (payment.kode_promo_id) {
      const { data: promo, error: promoFetchError } = await supabaseServer
        .from("kode_promo")
        .select("jumlah_terpakai")
        .eq("id", payment.kode_promo_id)
        .maybeSingle();

      if (promoFetchError) {
        console.error("[payment/webhook] query kode_promo failed:", promoFetchError);
      } else if (promo) {
        const { error: promoUpdateError } = await supabaseServer
          .from("kode_promo")
          .update({ jumlah_terpakai: (promo.jumlah_terpakai as number) + 1 })
          .eq("id", payment.kode_promo_id);
        if (promoUpdateError) {
          console.error("[payment/webhook] update kode_promo.jumlah_terpakai failed:", promoUpdateError);
        }
      }
    }

    await convertReferralOnPayment(payment.user_id as string, payment.id as string);

    if (payment.item_type === "kelas") {
      const { data: kelas } = await supabaseServer.from("kelas").select("nama").eq("id", kelasId).maybeSingle();
      await notifyPembayaranBerhasil(payment.user_id as string, kelasId, (kelas?.nama as string) ?? "kamu");
    }

    return NextResponse.json({ success: true });
  }

  if (FAILURE_STATUSES.has(transactionStatus)) {
    // Cuma downgrade dari 'menunggu' -> 'gagal'. Kalau status sudah 'berhasil'
    // (webhook sukses sempat lolos lebih dulu), JANGAN pernah ditimpa jadi gagal.
    const { error: failUpdateError } = await supabaseServer
      .from("payments")
      .update({ status: "gagal" })
      .eq("id", payment.id)
      .eq("status", "menunggu");

    if (failUpdateError) {
      console.error("[payment/webhook] update payments (gagal) failed:", failUpdateError);
      return NextResponse.json({ success: false, error: "Gagal memproses notifikasi." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // Status lain (pending, authorize, dst.) — belum final, tidak ada aksi.
  return NextResponse.json({ success: true, message: "Status belum final, tidak diproses." });
}
