/**
 * Validasi body request Tambah/Edit Banner Campaign — dipakai bersama oleh
 * app/api/kelola-konten/campaign/route.ts (POST) dan
 * app/api/kelola-konten/campaign/[campaignId]/route.ts (PATCH), pola sama
 * dengan lib/admin/validateKontenInfoInput.ts. Tanpa "server-only" — validasi
 * murni (tidak ada query DB).
 */

const VALID_STATUS = ["aktif", "nonaktif"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface LandingCampaignInputBody {
  judul?: string;
  linkTujuan?: string;
  tanggalMulai?: string;
  tanggalSelesai?: string;
  status?: string;
}

export interface ValidatedLandingCampaignInput {
  judul: string;
  link_tujuan: string;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  status: string;
}

export type ValidateLandingCampaignResult =
  | { ok: true; data: ValidatedLandingCampaignInput }
  | { ok: false; error: string };

export function validateLandingCampaignInput(body: LandingCampaignInputBody): ValidateLandingCampaignResult {
  const judul = typeof body.judul === "string" ? body.judul.trim() : "";
  if (!judul) return { ok: false, error: "Judul wajib diisi." };

  const linkTujuan = typeof body.linkTujuan === "string" ? body.linkTujuan.trim() : "";
  if (!linkTujuan) return { ok: false, error: "Link Tujuan wajib diisi." };
  if (!isValidUrl(linkTujuan)) {
    return { ok: false, error: "Link Tujuan harus berupa URL yang valid (diawali http:// atau https://)." };
  }

  if (!body.status || !VALID_STATUS.includes(body.status)) {
    return { ok: false, error: "Status tidak valid." };
  }

  let tanggalMulai: string | null = null;
  if (typeof body.tanggalMulai === "string" && body.tanggalMulai.trim()) {
    const trimmed = body.tanggalMulai.trim();
    if (!DATE_REGEX.test(trimmed)) {
      return { ok: false, error: "Tanggal Mulai tidak valid." };
    }
    tanggalMulai = trimmed;
  }

  let tanggalSelesai: string | null = null;
  if (typeof body.tanggalSelesai === "string" && body.tanggalSelesai.trim()) {
    const trimmed = body.tanggalSelesai.trim();
    if (!DATE_REGEX.test(trimmed)) {
      return { ok: false, error: "Tanggal Selesai tidak valid." };
    }
    tanggalSelesai = trimmed;
  }

  if (tanggalMulai && tanggalSelesai && tanggalSelesai < tanggalMulai) {
    return { ok: false, error: "Tanggal Selesai tidak boleh sebelum Tanggal Mulai." };
  }

  return {
    ok: true,
    data: {
      judul,
      link_tujuan: linkTujuan,
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
      status: body.status,
    },
  };
}
