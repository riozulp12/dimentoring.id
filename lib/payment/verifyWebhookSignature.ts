import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * DEPRECATED: dihapus setelah Mayar stabil di Production.
 *
 * Verifikasi signature_key webhook Midtrans — WAJIB dipanggil SEBELUM proses
 * apa pun (PRD Bagian 8 BR-19). Formula resmi Midtrans:
 * SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY).
 */
export function verifyWebhookSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}): boolean {
  const { orderId, statusCode, grossAmount, signatureKey } = params;
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  // Tanpa server key, signature bisa dihitung siapa pun (key "undefined") —
  // tolak semua. Env Midtrans memang sudah tidak dipasang sejak pindah ke Mayar.
  if (!serverKey) return false;
  const expected = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureKey);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
