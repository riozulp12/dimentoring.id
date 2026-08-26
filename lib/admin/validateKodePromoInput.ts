import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Validasi body request Tambah/Edit Kode Promo — dipakai bersama oleh
 * app/api/kode-promo/route.ts (POST) dan
 * app/api/kode-promo/[kodePromoId]/route.ts (PATCH) supaya aturan sama persis
 * di kedua jalur. Kode selalu disimpan UPPERCASE (mis. "merdeka17" ->
 * "MERDEKA17") dan wajib unik — dicek di sini SEBELUM insert/update supaya
 * pesan error jelas, bukan cuma gagal karena unique constraint di DB.
 */

const VALID_TIPE_DISKON = ["persen", "nominal"];
const VALID_STATUS = ["aktif", "nonaktif"];

export interface KodePromoInputBody {
  kode?: string;
  tipeDiskon?: string;
  nilaiDiskon?: number | string;
  tanggalMulai?: string | null;
  tanggalSelesai?: string | null;
  kuotaPemakaian?: number | string | null;
  campaignTerkaitId?: string | null;
  status?: string;
  labelSekolah?: string | null;
  berlakuSemuaKelas?: boolean;
  kelasIds?: string[];
}

export interface ValidatedKodePromoInput {
  kode: string;
  tipe_diskon: string;
  nilai_diskon: number;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  kuota_pemakaian: number | null;
  campaign_terkait_id: string | null;
  status: string;
  label_sekolah: string | null;
  berlaku_semua_kelas: boolean;
  /** Bukan kolom kode_promo — dipakai caller (route.ts) buat replace baris kode_promo_kelas. */
  kelas_ids: string[];
}

export type ValidateKodePromoResult =
  | { ok: true; data: ValidatedKodePromoInput }
  | { ok: false; error: string };

/** excludeId dipakai pas edit — kode promo itu sendiri tidak dianggap duplikat. */
export async function validateKodePromoInput(
  body: KodePromoInputBody,
  excludeId?: string,
): Promise<ValidateKodePromoResult> {
  const kode = typeof body.kode === "string" ? body.kode.trim().toUpperCase() : "";
  if (!kode) return { ok: false, error: "Kode promo wajib diisi." };

  let dupQuery = supabaseServer.from("kode_promo").select("id").eq("kode", kode);
  if (excludeId) dupQuery = dupQuery.neq("id", excludeId);
  const { data: duplicate, error: dupError } = await dupQuery.maybeSingle();
  if (dupError) {
    console.error("[validateKodePromoInput] query duplicate failed:", dupError);
    return { ok: false, error: "Gagal memvalidasi kode promo. Coba lagi nanti." };
  }
  if (duplicate) {
    return { ok: false, error: `Kode promo "${kode}" sudah dipakai. Gunakan kode lain.` };
  }

  if (!body.tipeDiskon || !VALID_TIPE_DISKON.includes(body.tipeDiskon)) {
    return { ok: false, error: "Tipe Diskon wajib dipilih." };
  }

  const nilaiDiskon = Number(body.nilaiDiskon);
  if (!Number.isFinite(nilaiDiskon) || nilaiDiskon <= 0) {
    return { ok: false, error: "Nilai Diskon harus angka lebih dari 0." };
  }
  if (body.tipeDiskon === "persen" && nilaiDiskon > 100) {
    return { ok: false, error: "Nilai Diskon untuk tipe Persen maksimal 100." };
  }

  const tanggalMulai = typeof body.tanggalMulai === "string" && body.tanggalMulai ? body.tanggalMulai : null;
  const tanggalSelesai = typeof body.tanggalSelesai === "string" && body.tanggalSelesai ? body.tanggalSelesai : null;
  if (tanggalMulai && tanggalSelesai && new Date(tanggalMulai) > new Date(tanggalSelesai)) {
    return { ok: false, error: "Tanggal Mulai tidak boleh setelah Tanggal Selesai." };
  }

  let kuotaPemakaian: number | null = null;
  if (body.kuotaPemakaian !== undefined && body.kuotaPemakaian !== null && body.kuotaPemakaian !== "") {
    const parsed = Number(body.kuotaPemakaian);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, error: "Kuota Pemakaian harus angka bulat lebih dari 0 (kosongkan kalau tidak terbatas)." };
    }
    kuotaPemakaian = parsed;
  }

  let campaignTerkaitId: string | null = null;
  if (typeof body.campaignTerkaitId === "string" && body.campaignTerkaitId) {
    const { data: campaign, error: campaignError } = await supabaseServer
      .from("iklan_campaign")
      .select("id")
      .eq("id", body.campaignTerkaitId)
      .maybeSingle();
    if (campaignError) {
      console.error("[validateKodePromoInput] query campaign failed:", campaignError);
      return { ok: false, error: "Gagal memvalidasi campaign terkait. Coba lagi nanti." };
    }
    if (!campaign) return { ok: false, error: "Campaign terkait tidak ditemukan." };
    campaignTerkaitId = body.campaignTerkaitId;
  }

  const status = body.status && VALID_STATUS.includes(body.status) ? body.status : "aktif";

  const labelSekolah = typeof body.labelSekolah === "string" && body.labelSekolah.trim() ? body.labelSekolah.trim() : null;

  const berlakuSemuaKelas = body.berlakuSemuaKelas !== false;

  let kelasIds: string[] = [];
  if (!berlakuSemuaKelas) {
    const rawIds = Array.isArray(body.kelasIds) ? body.kelasIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
    kelasIds = Array.from(new Set(rawIds));
    if (kelasIds.length === 0) {
      return { ok: false, error: "Pilih minimal 1 Kelas kalau toggle \"Berlaku untuk Semua Kelas\" dimatikan." };
    }

    const { data: kelasRows, error: kelasError } = await supabaseServer.from("kelas").select("id").in("id", kelasIds);
    if (kelasError) {
      console.error("[validateKodePromoInput] query kelas failed:", kelasError);
      return { ok: false, error: "Gagal memvalidasi Kelas yang dipilih. Coba lagi nanti." };
    }
    if ((kelasRows ?? []).length !== kelasIds.length) {
      return { ok: false, error: "Salah satu Kelas yang dipilih tidak ditemukan." };
    }
  }

  return {
    ok: true,
    data: {
      kode,
      tipe_diskon: body.tipeDiskon,
      nilai_diskon: nilaiDiskon,
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
      kuota_pemakaian: kuotaPemakaian,
      campaign_terkait_id: campaignTerkaitId,
      status,
      label_sekolah: labelSekolah,
      berlaku_semua_kelas: berlakuSemuaKelas,
      kelas_ids: kelasIds,
    },
  };
}
