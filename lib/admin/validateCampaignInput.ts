import "server-only";

/**
 * Validasi body request Tambah Campaign Iklan — PRD Bagian 13 (iklan_campaign
 * — BARU), dipakai app/api/analytics/campaign/route.ts.
 */

const VALID_PLATFORM = ["meta", "google", "tiktok", "lainnya"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface CampaignInputBody {
  namaCampaign?: string;
  platform?: string;
  budget?: number | string;
  tanggalMulai?: string;
  tanggalSelesai?: string;
  utmCampaignTag?: string;
  catatan?: string;
}

export interface ValidatedCampaignInput {
  nama_campaign: string;
  platform: string;
  budget: number | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  utm_campaign_tag: string | null;
  catatan: string | null;
}

export type ValidateCampaignResult =
  | { ok: true; data: ValidatedCampaignInput }
  | { ok: false; error: string };

export function validateCampaignInput(body: CampaignInputBody): ValidateCampaignResult {
  const namaCampaign = typeof body.namaCampaign === "string" ? body.namaCampaign.trim() : "";
  if (!namaCampaign) return { ok: false, error: "Nama Campaign wajib diisi." };

  if (!body.platform || !VALID_PLATFORM.includes(body.platform)) {
    return { ok: false, error: "Platform tidak valid." };
  }

  let budget: number | null = null;
  if (body.budget !== undefined && body.budget !== null && body.budget !== "") {
    const parsed = Number(body.budget);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, error: "Budget tidak valid." };
    }
    budget = parsed;
  }

  let tanggalMulai: string | null = null;
  if (typeof body.tanggalMulai === "string" && body.tanggalMulai) {
    if (!DATE_REGEX.test(body.tanggalMulai)) return { ok: false, error: "Tanggal Mulai tidak valid." };
    tanggalMulai = body.tanggalMulai;
  }

  let tanggalSelesai: string | null = null;
  if (typeof body.tanggalSelesai === "string" && body.tanggalSelesai) {
    if (!DATE_REGEX.test(body.tanggalSelesai)) return { ok: false, error: "Tanggal Selesai tidak valid." };
    tanggalSelesai = body.tanggalSelesai;
  }

  if (tanggalMulai && tanggalSelesai && tanggalMulai > tanggalSelesai) {
    return { ok: false, error: "Tanggal Mulai tidak boleh setelah Tanggal Selesai." };
  }

  const utmCampaignTag =
    typeof body.utmCampaignTag === "string" && body.utmCampaignTag.trim() ? body.utmCampaignTag.trim() : null;
  const catatan = typeof body.catatan === "string" && body.catatan.trim() ? body.catatan.trim() : null;

  return {
    ok: true,
    data: {
      nama_campaign: namaCampaign,
      platform: body.platform,
      budget,
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
      utm_campaign_tag: utmCampaignTag,
      catatan,
    },
  };
}
