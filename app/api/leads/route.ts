import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { TRIAL_COOKIE_NAME } from "@/lib/assessment/trial";
import { bacaAtribusi } from "@/lib/shared/atribusi";
import { normalisasiNoWa } from "@/lib/shared/noWa";
import {
  CONSENT_VERSI,
  LEAD_NAMA_MAX,
  LEAD_RATE_LIMIT_PER_IP,
  LEAD_RATE_LIMIT_PER_TRIAL,
  type LeadSumber,
} from "@/lib/shared/leadConsent";

/**
 * POST /api/leads — Lead Capture dari halaman hasil Assessment (PRD 7.4.6,
 * BR-38). Publik (tanpa login).
 *
 * - Persetujuan wajib `consent: true`; versi teks persetujuan SELALU dari
 *   konstanta server (CONSENT_VERSI), bukan dari body.
 * - Honeypot `website`: terisi = bot -> balas sukses tanpa menyimpan apa pun.
 * - Rate limit per trial ID & per IP (IP disimpan sebagai HMAC, bukan mentah).
 * - assessmentId cuma diterima kalau milik pemanggil (cookie trial yang sama
 *   untuk hasil anonim, atau user login yang sama).
 * - Atribusi dari cookie dm_attr di server, bukan dari body.
 * - Respons sukses selalu sama — tidak membocorkan apakah nomor sudah ada.
 */

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_SIMPAN_MS = 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUMBER: LeadSumber = "assessment_snbp";
const PESAN_SUKSES = "Terima kasih! Tim Dimentoring akan menghubungi kamu lewat WhatsApp.";

interface LeadBody {
  noWa?: unknown;
  nama?: unknown;
  consent?: unknown;
  assessmentId?: unknown;
  website?: unknown;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function suksesResponse() {
  return NextResponse.json({ success: true, message: PESAN_SUKSES }, { status: 200 });
}

function ambilIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

function hashIp(ip: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "dm-leads").update(ip).digest("hex");
}

/** Catat percobaan ini, lalu cek apakah melewati batas. true = boleh lanjut. */
async function cekRateLimit(kunci: { kunci: string; batas: number }[]): Promise<boolean | "gagal"> {
  const sejak = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  for (const { kunci: k, batas } of kunci) {
    const { count, error } = await supabaseServer
      .from("lead_rate_limit")
      .select("id", { count: "exact", head: true })
      .eq("kunci", k)
      .gt("created_at", sejak);
    if (error) {
      console.error("[leads] hitung rate limit gagal:", error);
      return "gagal";
    }
    if ((count ?? 0) >= batas) return false;
  }

  const { error: insertError } = await supabaseServer
    .from("lead_rate_limit")
    .insert(kunci.map(({ kunci: k }) => ({ kunci: k })));
  if (insertError) {
    console.error("[leads] catat rate limit gagal:", insertError);
    return "gagal";
  }

  // Bersihkan catatan lama; gagal di sini tidak menggagalkan request.
  const batasSimpan = new Date(Date.now() - RATE_SIMPAN_MS).toISOString();
  const { error: hapusError } = await supabaseServer.from("lead_rate_limit").delete().lt("created_at", batasSimpan);
  if (hapusError) console.error("[leads] bersihkan rate limit gagal:", hapusError);

  return true;
}

export async function POST(request: NextRequest) {
  let body: LeadBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }
  if (!body || typeof body !== "object") return errorResponse("Body request tidak valid.", 400);

  // Honeypot: manusia tidak pernah melihat field ini.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return suksesResponse();
  }

  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const trialRaw = request.cookies.get(TRIAL_COOKIE_NAME)?.value ?? null;
  const trialId = trialRaw && UUID_RE.test(trialRaw) ? trialRaw : null;

  const ip = ambilIp(request);
  const kunciRate = [
    ...(trialId ? [{ kunci: `trial:${trialId}`, batas: LEAD_RATE_LIMIT_PER_TRIAL }] : []),
    { kunci: `ip:${hashIp(ip ?? "tidak-diketahui")}`, batas: LEAD_RATE_LIMIT_PER_IP },
  ];
  const rate = await cekRateLimit(kunciRate);
  if (rate === "gagal") return errorResponse("Gagal memproses. Coba lagi nanti.", 500);
  if (!rate) return errorResponse("Terlalu banyak percobaan. Coba lagi dalam satu jam.", 429);

  if (body.consent !== true) {
    return errorResponse("Centang persetujuan dulu supaya kami boleh menghubungi kamu lewat WhatsApp.", 400);
  }

  const noWa = normalisasiNoWa(body.noWa);
  if (!noWa) return errorResponse("Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.", 400);

  let nama: string | null = null;
  if (body.nama !== undefined && body.nama !== null) {
    if (typeof body.nama !== "string") return errorResponse("Nama tidak valid.", 400);
    nama = body.nama.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim() || null;
    if (nama && [...nama].length > LEAD_NAMA_MAX) {
      return errorResponse(`Nama maksimal ${LEAD_NAMA_MAX} karakter.`, 400);
    }
  }

  let assessmentId: string | null = null;
  if (body.assessmentId !== undefined && body.assessmentId !== null && body.assessmentId !== "") {
    if (typeof body.assessmentId !== "string" || !UUID_RE.test(body.assessmentId)) {
      return errorResponse("Hasil Assessment tidak valid.", 400);
    }
    const { data: assessment, error } = await supabaseServer
      .from("assessments")
      .select("id, user_id, anonymous_trial_id")
      .eq("id", body.assessmentId)
      .maybeSingle();
    if (error) {
      console.error("[leads] query assessments gagal:", error);
      return errorResponse("Gagal memproses. Coba lagi nanti.", 500);
    }
    const milikUser = Boolean(session && assessment?.user_id && assessment.user_id === session.userId);
    const milikTamu = Boolean(
      assessment && !assessment.user_id && trialId && assessment.anonymous_trial_id === trialId,
    );
    if (!milikUser && !milikTamu) {
      return errorResponse("Hasil Assessment ini bukan milikmu.", 403);
    }
    assessmentId = assessment!.id as string;
  }

  const atribusi = bacaAtribusi(request.cookies);
  const { error: rpcError } = await supabaseServer.rpc("simpan_lead", {
    p_no_wa: noWa,
    p_nama: nama,
    p_sumber: SUMBER,
    p_assessment_id: assessmentId,
    p_anonymous_trial_id: trialId,
    p_user_id: session?.userId ?? null,
    p_utm_source: atribusi?.utm_source ?? null,
    p_utm_medium: atribusi?.utm_medium ?? null,
    p_utm_campaign: atribusi?.utm_campaign ?? null,
    p_utm_content: atribusi?.utm_content ?? null,
    p_fbclid: atribusi?.fbclid ?? null,
    p_consent_versi: CONSENT_VERSI,
  });
  if (rpcError) {
    console.error("[leads] simpan_lead gagal:", rpcError);
    return errorResponse("Gagal menyimpan. Coba lagi nanti.", 500);
  }

  return suksesResponse();
}
