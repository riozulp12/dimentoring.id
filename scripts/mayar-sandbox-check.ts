/**
 * Uji langsung Mayar SANDBOX (API v2) — BUKAN bagian aplikasi (tidak diimport
 * dari app/, jadi tidak ikut ter-bundle).
 *
 *   npx tsx scripts/mayar-sandbox-check.ts            # create (dengan & tanpa redirectUrl) + GET detail
 *   npx tsx scripts/mayar-sandbox-check.ts --id <id>  # GET detail saja (mis. setelah "simulasi bayar")
 *
 * --id juga memanggil GET /transactions/{transactions[0].id} (nominal dibayar &
 * metode bayar). Membaca .env.local. MAYAR_API_KEY TIDAK PERNAH dicetak (cuma panjang & 4
 * karakter terakhir). Menolak jalan kalau MAYAR_BASE_URL bukan api.mayar.io.
 * Output tidak memuat data pribadi: field bernama email/nama/telepon/customer
 * disembunyikan.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAYAR_SANDBOX_HOST, computeExpiredAt, isRedirectUrlRejected } from "../lib/payment/mayarLogic";

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const env = loadEnvLocal();
const apiKey = env.MAYAR_API_KEY ?? "";
const baseUrlRaw = env.MAYAR_BASE_URL ?? "";

if (!apiKey) {
  console.error("MAYAR_API_KEY tidak ada di .env.local.");
  process.exit(1);
}
let origin: string;
try {
  const url = new URL(baseUrlRaw);
  if (url.hostname !== MAYAR_SANDBOX_HOST) {
    console.error(`DITOLAK: skrip ini hanya untuk sandbox (${MAYAR_SANDBOX_HOST}), MAYAR_BASE_URL host = ${url.hostname}.`);
    process.exit(1);
  }
  origin = url.origin;
} catch {
  console.error("MAYAR_BASE_URL tidak valid.");
  process.exit(1);
}
const api = `${origin}/hl/v2`;
const appBaseUrl = (env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

console.log(`API: ${api}`);
console.log(`MAYAR_API_KEY terbaca: panjang ${apiKey.length}, akhiran ...${apiKey.slice(-4)}`);
console.log(`PAYMENT_PROVIDER: ${env.PAYMENT_PROVIDER || "(kosong -> mayar)"}`);

const PII_KEY = /email|mobile|phone|name|nama|customer|address|alamat/i;
const FLAG_KEY = /status|paymentMethod|isCrossSell|^is[A-Z]|test|sandbox|simulat|paid|type|mode|live|method|channel|fee|amount|expired|created|updated/i;

async function call(method: "GET" | "POST", path: string, body?: unknown) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  const bodyStatus = (json as { statusCode?: unknown } | null)?.statusCode;
  return { http: response.status, status: typeof bodyStatus === "number" ? bodyStatus : response.status, json };
}

function message(json: unknown): string {
  const j = json as { messages?: unknown; message?: unknown } | null;
  return String(j?.messages ?? j?.message ?? "(tanpa pesan)").slice(0, 300);
}

function describeShape(obj: unknown, prefix = "data", depth = 0): string[] {
  if (depth > 3 || obj === null || typeof obj !== "object") return [];
  const lines: string[] = [];
  if (Array.isArray(obj)) {
    lines.push(`${prefix}: array(${obj.length})`);
    if (obj.length > 0) lines.push(...describeShape(obj[0], `${prefix}[0]`, depth + 1));
    return lines;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = `${prefix}.${key}`;
    if (PII_KEY.test(key)) {
      lines.push(`${path}: <disembunyikan>`);
    } else if (value !== null && typeof value === "object") {
      if (!Array.isArray(value)) lines.push(`${path}: object`);
      lines.push(...describeShape(value, path, depth + 1));
    } else if (FLAG_KEY.test(key)) {
      lines.push(`${path}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${path}: ${value === null ? "null" : typeof value}`);
    }
  }
  return lines;
}

async function detail(id: string, label: string, resource = "/payments") {
  const res = await call("GET", `${resource}/${encodeURIComponent(id)}`);
  console.log(`\n== GET ${resource}/{${label}} -> HTTP ${res.http}, statusCode ${res.status}`);
  if (res.status !== 200) {
    console.log(`   pesan: ${message(res.json)}`);
    return null;
  }
  const data = (res.json as { data?: unknown }).data;
  for (const line of describeShape(data)) console.log(`   ${line}`);
  return data as Record<string, unknown>;
}

// Email & nominal dibedakan per panggilan: Mayar menolak create "duplikat"
// dalam 1 menit (HTTP 429) — lihat ringkasan di akhir.
async function create(withRedirect: boolean, tag: string, variant: number) {
  const body: Record<string, unknown> = {
    name: `SANDBOX CHECK ${tag}`,
    amount: 10000 + variant * 1000,
    email: `sandbox-check-${variant}@example.com`,
    description: `Uji sandbox ${tag}`,
    expiredAt: computeExpiredAt(new Date()),
    extraData: { orderId: tag },
  };
  if (withRedirect) body.redirectUrl = `${appBaseUrl}/payment-status/${tag}`;
  const res = await call("POST", "/payments/create", body);
  console.log(`\n== POST /payments/create ${withRedirect ? "DENGAN" : "TANPA"} redirectUrl -> HTTP ${res.http}, statusCode ${res.status}`);
  if (res.status !== 200) {
    console.log(`   pesan: ${message(res.json)}`);
    if (withRedirect) {
      console.log(`   redirectUrl ditolak (pesan "not supported"): ${isRedirectUrlRejected(res.status, res.json)}`);
    }
    return null;
  }
  const data = (res.json as { data?: Record<string, unknown> }).data ?? {};
  for (const line of describeShape(data)) console.log(`   ${line}`);
  console.log(`   data.id (gateway_reference): ${String(data.id ?? "")}`);
  console.log(`   data.link: ${String(data.link ?? "")}`);
  if (withRedirect) console.log(`   redirectUrl DITERIMA; data.redirectUrl dikembalikan: ${data.redirectUrl ? "ya" : "tidak"}`);
  return data;
}

async function main() {
  const idArgIndex = process.argv.indexOf("--id");
  if (idArgIndex > -1) {
    const id = process.argv[idArgIndex + 1];
    if (!id) throw new Error("--id butuh nilai");
    const data = await detail(id, "id");
    const trx0 = Array.isArray(data?.transactions) ? (data.transactions[0] as Record<string, unknown> | undefined) : undefined;
    if (trx0?.id) await detail(String(trx0.id), "transactions[0].id", "/transactions");
    return;
  }

  const tag = `SBX-${Date.now()}`;
  const withRedirect = await create(true, `${tag}-R`, 0);
  const withoutRedirect = await create(false, `${tag}-N`, 1);

  for (const created of [withRedirect, withoutRedirect]) {
    if (!created) continue;
    const id = String(created.id ?? "");
    const trxId = String(created.transactionId ?? created.transaction_id ?? "");
    const byId = await detail(id, "data.id");
    if (trxId) await detail(trxId, "data.transactionId");
    console.log("\n== Ringkasan id");
    console.log(`   data.id dipakai sebagai gateway_reference: ${byId ? "BISA (GET detail berhasil)" : "GAGAL"}`);
    console.log(`   data.id === GET.data.id: ${byId ? byId.id === id : "-"}`);
    console.log(`   create.paymentLinkId === data.id: ${created.paymentLinkId === id}`);
    const trx0 = Array.isArray(byId?.transactions) ? (byId.transactions[0] as Record<string, unknown>) : null;
    console.log(`   GET.transactions[0].id === create.transactionId: ${trx0 ? trx0.id === trxId : "-"}`);
    console.log(`   link slug di GET: ${byId ? String(byId.link ?? "") : "-"}`);
  }

  console.log(
    "\nLangkah lanjut: buka salah satu data.link di atas, klik \"simulasi bayar\", lalu jalankan\n" +
      "  npx tsx scripts/mayar-sandbox-check.ts --id <data.id>\n" +
      "untuk melihat field status/penanda setelah dibayar (bandingkan dengan output di atas).",
  );
}

main().catch((error) => {
  console.error(`Gagal: ${(error as Error).message}`);
  process.exit(1);
});
