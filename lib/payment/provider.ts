import "server-only";
import { resolvePaymentProvider, type MayarStatus, type PaymentProviderName, type WebhookRefField } from "@/lib/payment/mayarLogic";
import { mayarProvider } from "@/lib/payment/mayar";

/**
 * Abstraksi provider pembayaran — alur utama (create, webhook, recheck Admin)
 * HANYA bicara ke interface ini. Saat ini cuma Mayar; PAYMENT_PROVIDER kosong
 * atau tidak dikenali -> Mayar. Kode Midtrans lama dormant (tidak dipanggil
 * dari sini), lihat lib/payment/midtransSnap.ts.
 */

export interface CreatePaymentInput {
  orderId: string;
  /** Harga final (setelah promo), Rupiah bulat. */
  amount: number;
  /** Judul tagihan yang tampil di halaman pembayaran (nama kelas). */
  title: string;
  email: string | null;
  description: string;
  redirectUrl: string | null;
  expiredAt: string;
}

export interface CreatePaymentResult {
  /** Disimpan ke payments.gateway_reference. Mayar: data.id (id payment request). */
  gatewayReference: string;
  transactionId: string | null;
  /** Halaman pembayaran gateway — frontend redirect ke sini (bukan popup). */
  paymentUrl: string;
  redirectUrlAccepted: boolean;
}

export interface GatewayPaymentStatus {
  gatewayReference: string;
  status: MayarStatus;
  rawStatus: string | null;
  amount: number;
  feeBorneByCustomer: boolean;
  metode: string | null;
}

export interface PaymentProvider {
  name: PaymentProviderName;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Sumber kebenaran status — dipanggil webhook & recheck, payload webhook tidak dipercaya. */
  getPaymentStatus(gatewayReference: string): Promise<GatewayPaymentStatus>;
  /** Ambil kandidat id dari payload webhook (cuma untuk mencari baris payments). */
  handleNotification(payload: unknown): { field: WebhookRefField; value: string }[];
}

const PROVIDERS: Record<PaymentProviderName, PaymentProvider> = {
  mayar: mayarProvider,
};

export function getPaymentProvider(): PaymentProvider {
  return PROVIDERS[resolvePaymentProvider(process.env.PAYMENT_PROVIDER)];
}
