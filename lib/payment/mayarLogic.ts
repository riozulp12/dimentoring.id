/**
 * Logika MURNI integrasi Mayar (Request Payment, API v2) — tanpa I/O, tanpa
 * env langsung, supaya bisa dites (tests/payment-mayar.test.ts). Pemanggil
 * (lib/payment/mayar.ts, route webhook/recheck) yang membaca env & database.
 */

export type PaymentProviderName = "mayar";

/**
 * PAYMENT_PROVIDER — default "mayar" kalau kosong/tidak dikenali. Midtrans
 * sengaja TIDAK dikenali lagi di sini (dormant, lihat lib/payment/midtransSnap.ts).
 */
export function resolvePaymentProvider(value: string | undefined): PaymentProviderName {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "mayar") return "mayar";
  return "mayar";
}

export const MAYAR_SANDBOX_HOST = "api.mayar.io";
export const MAYAR_PRODUCTION_HOST = "api.mayar.id";

export type BaseUrlCheck = { ok: true; apiBaseUrl: string } | { ok: false; error: string };

/**
 * Guard base URL Mayar — key sandbox cuma untuk api.mayar.io, key production
 * cuma untuk api.mayar.id. `isProductionEnv` = deployment Production sungguhan
 * (lihat isProductionDeployment di bawah — BUKAN sekadar NODE_ENV, karena
 * Vercel Preview juga berjalan dengan NODE_ENV=production).
 *
 * - Production + api.mayar.io (sandbox) -> ditolak (pembayaran "simulasi" bisa
 *   membuka kelas gratis di Production).
 * - Bukan Production + api.mayar.id (uang sungguhan) -> ditolak, kecuali
 *   MAYAR_ALLOW_PROD_IN_PREVIEW=true.
 * - Host selain dua di atas -> ditolak (jangan kirim API key ke host lain).
 *
 * Path di MAYAR_BASE_URL diabaikan; selalu dipakai `${origin}/hl/v2`.
 */
export function checkMayarBaseUrl(params: {
  baseUrl: string | undefined;
  isProductionEnv: boolean;
  allowProdInPreview: boolean;
}): BaseUrlCheck {
  const raw = params.baseUrl?.trim();
  if (!raw) return { ok: false, error: "MAYAR_BASE_URL belum diisi." };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "MAYAR_BASE_URL bukan URL yang valid." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "MAYAR_BASE_URL wajib https." };
  }

  const host = url.hostname.toLowerCase();
  if (host !== MAYAR_SANDBOX_HOST && host !== MAYAR_PRODUCTION_HOST) {
    return { ok: false, error: `Host MAYAR_BASE_URL tidak dikenal (${host}). Pakai ${MAYAR_SANDBOX_HOST} atau ${MAYAR_PRODUCTION_HOST}.` };
  }
  if (params.isProductionEnv && host === MAYAR_SANDBOX_HOST) {
    return { ok: false, error: `Production tidak boleh memakai Mayar sandbox (${MAYAR_SANDBOX_HOST}).` };
  }
  if (!params.isProductionEnv && host === MAYAR_PRODUCTION_HOST && !params.allowProdInPreview) {
    return {
      ok: false,
      error: `Non-production tidak boleh memakai Mayar production (${MAYAR_PRODUCTION_HOST}) kecuali MAYAR_ALLOW_PROD_IN_PREVIEW=true.`,
    };
  }
  return { ok: true, apiBaseUrl: `${url.origin}/hl/v2` };
}

/**
 * Production sungguhan? VERCEL_ENV (production/preview/development) diutamakan
 * kalau ada; di luar Vercel jatuh ke NODE_ENV.
 */
export function isProductionDeployment(env: { NODE_ENV?: string; VERCEL_ENV?: string }): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

/** Masa berlaku link pembayaran — SAMA dengan batas recheck (lihat decideRecheckAction). */
export const PAYMENT_EXPIRY_HOURS = 24;

export function computeExpiredAt(now: Date, hours: number = PAYMENT_EXPIRY_HOURS): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export type MayarStatus = "paid" | "unpaid" | "closed" | "unknown";

/**
 * Status payment request Mayar (GET /payments/{id}) -> status internal.
 * Docs v2 menyebut `unpaid`, `paid`, `closed`. "expired" diperlakukan sama
 * dengan closed (link sudah tidak bisa dibayar). Apa pun selain itu ->
 * "unknown" (tidak pernah dianggap lunas maupun gagal).
 */
export function mapMayarStatus(raw: unknown): MayarStatus {
  if (typeof raw !== "string") return "unknown";
  const value = raw.trim().toLowerCase();
  if (value === "paid") return "paid";
  if (value === "unpaid") return "unpaid";
  if (value === "closed" || value === "expired") return "closed";
  return "unknown";
}

export type AmountCheck = "cocok" | "tidak_cocok" | "ragu";

/**
 * Bandingkan nominal di Mayar dengan payments.jumlah (tagihan yang KITA kirim).
 * Kalau beda tapi biaya admin/channel ditanggung pembeli -> "ragu" (bisa jadi
 * nominal sudah termasuk biaya) — pemanggil WAJIB tidak melunasi otomatis,
 * cukup catat ke log untuk dicek manual.
 */
export function checkAmount(params: {
  expected: number;
  actual: unknown;
  feeBorneByCustomer: boolean;
}): AmountCheck {
  const actual = typeof params.actual === "string" ? Number(params.actual) : params.actual;
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    return params.feeBorneByCustomer ? "ragu" : "tidak_cocok";
  }
  if (Math.round(actual) === Math.round(params.expected)) return "cocok";
  return params.feeBorneByCustomer ? "ragu" : "tidak_cocok";
}

/**
 * Jumlah tagihan ke Mayar = harga final (setelah diskon/promo), dibulatkan
 * ke Rupiah. PAYMENT_FEE_BORNE_BY_CUSTOMER=true TIDAK menambah apa pun:
 * docs Mayar menyatakan pengaturan biaya ditanggung pembeli tidak berlaku
 * untuk fitur Request Payment, dan tarif potongan per channel tidak tersedia
 * lewat API — lihat docs/Checklist_Fitur_Dimentoring.md.
 */
export function computeTagihan(totalFinal: number): number {
  return Math.round(totalFinal);
}

export function parseFeeBorneByCustomer(value: string | undefined): boolean {
  return value === "true";
}

export type RecheckAction = "lunas" | "gagal" | "tunggu";

/**
 * Aturan recheck Admin:
 * - paid -> "lunas" (nominal tetap dicek terpisah lewat checkAmount).
 * - Ditandai "gagal" HANYA kalau Mayar menyatakan BELUM dibayar DAN (status
 *   closed ATAU sudah lewat PAYMENT_EXPIRY_HOURS sejak dibuat). Tidak pernah
 *   gagal hanya karena waktu kalau status Mayar tidak dikenal.
 */
export function decideRecheckAction(params: { mayarStatus: MayarStatus; createdAt: Date; now: Date }): RecheckAction {
  if (params.mayarStatus === "paid") return "lunas";
  if (params.mayarStatus === "closed") return "gagal";
  if (params.mayarStatus === "unpaid") {
    const ageMs = params.now.getTime() - params.createdAt.getTime();
    return ageMs > PAYMENT_EXPIRY_HOURS * 60 * 60 * 1000 ? "gagal" : "tunggu";
  }
  return "tunggu";
}

export type WebhookRefField = "productId" | "id" | "transactionId";
export const WEBHOOK_REF_FIELDS: readonly WebhookRefField[] = ["productId", "id", "transactionId"];

/**
 * Kandidat id dari payload webhook (TIDAK dipercaya — cuma untuk mencari baris
 * payments; status asli tetap diambil lewat GET ke API Mayar). Urutan coba:
 * data.productId, data.id, data.transactionId.
 */
export function extractWebhookRefs(payload: unknown): { field: WebhookRefField; value: string }[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return [];
  const refs: { field: WebhookRefField; value: string }[] = [];
  for (const field of WEBHOOK_REF_FIELDS) {
    const value = (data as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim() && value.length <= 200) {
      refs.push({ field, value: value.trim() });
    }
  }
  return refs;
}

/** Pesan 400 Mayar kalau redirectUrl tidak bisa disimpan di payment request. */
export function isRedirectUrlRejected(status: number, body: unknown): boolean {
  if (status !== 400) return false;
  const text = JSON.stringify(body ?? "").toLowerCase();
  return text.includes("redirecturl") && text.includes("not supported");
}

/** APP_BASE_URL (env server) diutamakan; cadangan origin request (Preview). */
export function resolveAppBaseUrl(envValue: string | undefined, requestOrigin: string): string {
  const raw = envValue?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // env tidak valid -> jatuh ke origin request
    }
  }
  return requestOrigin;
}
