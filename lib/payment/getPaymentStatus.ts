import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer halaman "Menunggu Konfirmasi" — PRD Bagian 13 (payments.status,
 * order_id). Dipakai bareng oleh page.tsx (fetch awal, server-side) dan
 * app/api/payment/status/[orderId]/route.ts (polling client) — SATU query,
 * SELALU scoped ke user_id supaya user tidak bisa intip status order orang
 * lain lewat tebak-tebakan order_id di URL.
 *
 * item_id bersifat polymorphic (kelas.id ATAU tryouts.id, tidak ada FK asli
 * di skema) — jadi JOIN kelas dilakukan manual di query terpisah, bukan lewat
 * embed relasi PostgREST (yang butuh FK sungguhan).
 */

export interface PaymentStatusData {
  orderId: string;
  status: "menunggu" | "berhasil" | "gagal" | "refunded";
  itemId: string;
  kelasNama: string | null;
}

export async function getPaymentStatusForUser(orderId: string, userId: string): Promise<PaymentStatusData | null> {
  const { data: payment, error } = await supabaseServer
    .from("payments")
    .select("order_id, status, item_id, item_type")
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[getPaymentStatusForUser] query payments failed:", error);
    return null;
  }
  if (!payment) return null;

  let kelasNama: string | null = null;
  if (payment.item_type === "kelas") {
    const { data: kelas } = await supabaseServer
      .from("kelas")
      .select("nama")
      .eq("id", payment.item_id)
      .maybeSingle();
    kelasNama = (kelas?.nama as string | undefined) ?? null;
  }

  return {
    orderId: payment.order_id as string,
    status: payment.status as PaymentStatusData["status"],
    itemId: payment.item_id as string,
    kelasNama,
  };
}
