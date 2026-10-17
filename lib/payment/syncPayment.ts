import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payment/provider";
import { checkAmount, decideRecheckAction, type MayarStatus } from "@/lib/payment/mayarLogic";
import { tandaiLunasDanProses } from "@/lib/payment/fulfillPayment";

/**
 * Cocokkan satu baris payments dengan status ASLI di gateway (GET ke API,
 * bukan isi payload webhook) — dipakai webhook Mayar & recheck Admin.
 * Lunas HANYA kalau gateway bilang paid DAN nominal cocok dengan tagihan
 * yang kita kirim (payments.jumlah).
 */

export const SYNC_PAYMENT_COLUMNS = "id, order_id, status, jumlah, gateway_reference, dibuat_pada";

export interface SyncablePayment {
  id: string;
  order_id: string;
  status: string;
  jumlah: number | string;
  gateway_reference: string;
  dibuat_pada: string;
}

export type SyncOutcome =
  | "lunas_diproses"
  | "sudah_lunas"
  | "menunggu"
  | "ditandai_gagal"
  | "nominal_tidak_cocok"
  | "nominal_ragu"
  | "bukan_menunggu";

export interface SyncResult {
  outcome: SyncOutcome;
  mayarStatus: MayarStatus;
  rawStatus: string | null;
}

export async function syncPaymentDariGateway(
  payment: SyncablePayment,
  opts: { bolehTandaiGagal: boolean; now?: Date },
): Promise<SyncResult> {
  const gateway = await getPaymentProvider().getPaymentStatus(payment.gateway_reference);
  const base = { mayarStatus: gateway.status, rawStatus: gateway.rawStatus };

  if (gateway.status === "paid") {
    const amount = checkAmount({
      expected: Number(payment.jumlah),
      actual: gateway.amount,
      feeBorneByCustomer: gateway.feeBorneByCustomer,
    });
    if (amount !== "cocok") {
      // TIDAK dilunasi otomatis — perlu dicek manual oleh Admin.
      console.error(
        `[syncPayment] nominal ${amount} untuk order ${payment.order_id}: tagihan=${Number(payment.jumlah)} gateway=${gateway.amount} biayaDitanggungPembeli=${gateway.feeBorneByCustomer}`,
      );
      return { ...base, outcome: amount === "ragu" ? "nominal_ragu" : "nominal_tidak_cocok" };
    }

    const outcome = await tandaiLunasDanProses(payment.id, { metode: gateway.metode });
    if (outcome === "diproses") return { ...base, outcome: "lunas_diproses" };
    if (outcome === "sudah_lunas") return { ...base, outcome: "sudah_lunas" };
    console.error(`[syncPayment] gateway paid tapi payment order ${payment.order_id} tidak 'menunggu' — cek manual.`);
    return { ...base, outcome: "bukan_menunggu" };
  }

  if (opts.bolehTandaiGagal && payment.status === "menunggu") {
    const action = decideRecheckAction({
      mayarStatus: gateway.status,
      createdAt: new Date(payment.dibuat_pada),
      now: opts.now ?? new Date(),
    });
    if (action === "gagal") {
      // Cuma menunggu -> gagal; status 'berhasil' tidak pernah ditimpa.
      const { error } = await supabaseServer
        .from("payments")
        .update({ status: "gagal" })
        .eq("id", payment.id)
        .eq("status", "menunggu");
      if (error) throw new Error(`update payments gagal (kode ${error.code ?? "?"})`);
      return { ...base, outcome: "ditandai_gagal" };
    }
  }

  return { ...base, outcome: payment.status === "menunggu" ? "menunggu" : "bukan_menunggu" };
}
