import "server-only";

/**
 * Validasi body request Tambah/Edit Katalog Reward — dipakai bersama oleh
 * app/api/kelola-konten/reward-catalog/route.ts (POST) dan
 * .../[rewardCatalogId]/route.ts (PATCH). BR-13: stokAtauAnggaranTersisa
 * WAJIB diisi angka >= 0 (bukan nullable/tanpa batas seperti kuota kode
 * promo) — reward tidak boleh bisa ditukar tanpa batas anggaran.
 */

export interface RewardCatalogInputBody {
  namaReward?: string;
  biayaPoin?: number | string;
  stokAtauAnggaranTersisa?: number | string;
}

export interface ValidatedRewardCatalogInput {
  nama_reward: string;
  biaya_poin: number;
  stok_atau_anggaran_tersisa: number;
}

export type ValidateRewardCatalogResult =
  | { ok: true; data: ValidatedRewardCatalogInput }
  | { ok: false; error: string };

export function validateRewardCatalogInput(body: RewardCatalogInputBody): ValidateRewardCatalogResult {
  const namaReward = typeof body.namaReward === "string" ? body.namaReward.trim() : "";
  if (!namaReward) {
    return { ok: false, error: "Nama Reward wajib diisi." };
  }

  const biayaPoin = Number(body.biayaPoin);
  if (!Number.isInteger(biayaPoin) || biayaPoin <= 0) {
    return { ok: false, error: "Biaya Poin harus angka bulat lebih dari 0." };
  }

  const stok = Number(body.stokAtauAnggaranTersisa);
  if (!Number.isInteger(stok) || stok < 0) {
    return { ok: false, error: "Stok/Anggaran Tersisa harus angka bulat 0 atau lebih (wajib diisi, tidak boleh tanpa batas)." };
  }

  return {
    ok: true,
    data: { nama_reward: namaReward, biaya_poin: biayaPoin, stok_atau_anggaran_tersisa: stok },
  };
}
