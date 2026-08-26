import "server-only";
import midtransClient from "midtrans-client";

/**
 * Instance Snap client Midtrans — dipakai app/api/payment/create/route.ts.
 * SERVER_KEY tidak boleh pernah bocor ke client (dipakai juga di webhook untuk
 * verifikasi signature, lihat lib/payment/verifyWebhookSignature.ts).
 */
export const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY!,
});
