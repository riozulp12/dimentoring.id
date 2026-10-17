import "server-only";
import {
  checkMayarBaseUrl,
  isProductionDeployment,
  isRedirectUrlRejected,
  mapMayarStatus,
  type MayarStatus,
  type WebhookRefField,
  extractWebhookRefs,
} from "@/lib/payment/mayarLogic";
import type { CreatePaymentInput, CreatePaymentResult, GatewayPaymentStatus, PaymentProvider } from "@/lib/payment/provider";

/**
 * Klien Mayar Request Payment (API v2) — dipakai lewat lib/payment/provider.ts.
 * MAYAR_API_KEY cuma dibaca di sini, di server; JANGAN pernah di-log, dikirim
 * ke client, atau ditulis ke file. Log error hanya berisi status HTTP & pesan
 * Mayar (tanpa data pribadi pembeli).
 */

const REQUEST_TIMEOUT_MS = 15_000;

export class MayarError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
    this.name = "MayarError";
  }
}

function getConfig(): { apiBaseUrl: string; apiKey: string } {
  const check = checkMayarBaseUrl({
    baseUrl: process.env.MAYAR_BASE_URL,
    isProductionEnv: isProductionDeployment({ NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV }),
    allowProdInPreview: process.env.MAYAR_ALLOW_PROD_IN_PREVIEW === "true",
  });
  if (!check.ok) {
    console.error(`[mayar] PERINGATAN konfigurasi ditolak: ${check.error}`);
    throw new MayarError(`Konfigurasi Mayar ditolak: ${check.error}`, null);
  }
  const apiKey = process.env.MAYAR_API_KEY?.trim();
  if (!apiKey) {
    console.error("[mayar] PERINGATAN: MAYAR_API_KEY belum diisi.");
    throw new MayarError("MAYAR_API_KEY belum diisi.", null);
  }
  return { apiBaseUrl: check.apiBaseUrl, apiKey };
}

/** Pesan dari envelope v2 ({ statusCode, messages, data }) — tanpa data pribadi. */
function mayarMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as { messages?: unknown; message?: unknown };
    const msg = b.messages ?? b.message;
    if (typeof msg === "string") return msg.slice(0, 300);
  }
  return "(tanpa pesan)";
}

async function mayarFetch(path: string, init: { method: "GET" | "POST"; body?: unknown }) {
  const { apiBaseUrl, apiKey } = getConfig();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new MayarError(`Gagal terhubung ke Mayar: ${(error as Error).message}`, null);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  // Sebagian endpoint v2 membalas HTTP 200 dengan statusCode non-200 di body —
  // statusCode di body yang dianggap otoritatif.
  const bodyStatus = (body as { statusCode?: unknown } | null)?.statusCode;
  const status = typeof bodyStatus === "number" && response.ok ? bodyStatus : response.status;
  return { status, body };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const baseBody = {
    name: input.title,
    amount: input.amount,
    email: input.email ?? undefined,
    description: input.description,
    expiredAt: input.expiredAt,
    extraData: { orderId: input.orderId },
  };

  let redirectUrlAccepted = false;
  let result = input.redirectUrl
    ? await mayarFetch("/payments/create", { method: "POST", body: { ...baseBody, redirectUrl: input.redirectUrl } })
    : null;

  if (result && result.status === 200) {
    redirectUrlAccepted = true;
  } else if (!result || isRedirectUrlRejected(result.status, result.body)) {
    if (result) console.warn("[mayar] redirectUrl ditolak Mayar, ulangi tanpa redirectUrl.");
    result = await mayarFetch("/payments/create", { method: "POST", body: baseBody });
  }

  if (result.status !== 200) {
    throw new MayarError(`Mayar create gagal (HTTP ${result.status}): ${mayarMessage(result.body)}`, result.status);
  }

  const data = asRecord((result.body as { data?: unknown }).data);
  const gatewayReference = pickString(data, ["id"]);
  const paymentUrl = pickString(data, ["link"]);
  if (!gatewayReference || !paymentUrl) {
    throw new MayarError("Respons create Mayar tidak berisi id/link.", result.status);
  }
  return {
    gatewayReference,
    transactionId: pickString(data, ["transactionId", "transaction_id"]),
    paymentUrl,
    redirectUrlAccepted,
  };
}

/** Bendera biaya ditanggung pembeli bisa muncul di root data atau di transaksi. */
function readFeeBorne(data: Record<string, unknown>, trx: Record<string, unknown> | null): boolean {
  const flags = ["isAdminFeeBorneByCustomer", "isChannelFeeBorneByCustomer"];
  return flags.some((flag) => data[flag] === true || trx?.[flag] === true);
}

/**
 * Status asli dari Mayar: GET /payments/{id}. Kalau paid, transaksinya
 * (transactions[0].id) dicek lagi lewat GET /transactions/{id} — nominal yang
 * BENAR-BENAR dibayar & metode bayar ada di sana (detail payment request cuma
 * memuat nominal tagihan). Transaksi tidak bisa dipastikan -> status "unknown"
 * (tidak pernah dilunasi).
 */
async function getPaymentStatus(gatewayReference: string): Promise<GatewayPaymentStatus> {
  const result = await mayarFetch(`/payments/${encodeURIComponent(gatewayReference)}`, { method: "GET" });
  if (result.status !== 200) {
    throw new MayarError(`Mayar detail gagal (HTTP ${result.status}): ${mayarMessage(result.body)}`, result.status);
  }
  const data = asRecord((result.body as { data?: unknown }).data);
  if (!data) throw new MayarError("Respons detail Mayar tidak berisi data.", result.status);

  const rawStatus = typeof data.status === "string" ? data.status : null;
  const status: MayarStatus = mapMayarStatus(data.status);
  const base = {
    gatewayReference: pickString(data, ["id"]) ?? gatewayReference,
    rawStatus,
    amount: typeof data.amount === "number" ? data.amount : Number(data.amount),
    feeBorneByCustomer: readFeeBorne(data, null),
    metode: null as string | null,
  };
  if (status !== "paid") return { ...base, status };

  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const transactionId = pickString(asRecord(transactions[0]), ["id"]);
  if (!transactionId) {
    console.error("[mayar] payment request paid tapi tanpa transactions[0].id — tidak dilunasi.");
    return { ...base, status: "unknown" };
  }
  const trxResult = await mayarFetch(`/transactions/${encodeURIComponent(transactionId)}`, { method: "GET" });
  if (trxResult.status !== 200) {
    throw new MayarError(`Mayar detail transaksi gagal (HTTP ${trxResult.status}): ${mayarMessage(trxResult.body)}`, trxResult.status);
  }
  const trx = asRecord((trxResult.body as { data?: unknown }).data);
  const trxLinkId = pickString(trx, ["paymentLinkId"]) ?? pickString(asRecord(trx?.paymentLink), ["id"]);
  if (!trx || mapMayarStatus(trx.status) !== "paid" || (trxLinkId && trxLinkId !== base.gatewayReference)) {
    console.error("[mayar] transaksi tidak cocok/belum paid untuk payment request ini — tidak dilunasi.");
    return { ...base, status: "unknown" };
  }
  return {
    ...base,
    status,
    amount: typeof trx.amount === "number" ? trx.amount : Number(trx.amount),
    feeBorneByCustomer: readFeeBorne(data, trx),
    metode: pickString(trx, ["paymentMethod"])?.toLowerCase() ?? null,
  };
}

function handleNotification(payload: unknown): { field: WebhookRefField; value: string }[] {
  return extractWebhookRefs(payload);
}

export const mayarProvider: PaymentProvider = {
  name: "mayar",
  createPayment,
  getPaymentStatus,
  handleNotification,
};
