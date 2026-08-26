import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer tab "Katalog Reward" (Admin, di halaman Kelola Konten) — PRD
 * Bagian 7.2 (FR-G5) & Bagian 13 (reward_catalog, reward_redemptions), BR-13
 * (anggaran/stok wajib ada cap).
 */

export interface RewardCatalogAdminItem {
  id: string;
  namaReward: string;
  biayaPoin: number;
  stokAtauAnggaranTersisa: number;
}

export async function getRewardCatalogAdminList(): Promise<RewardCatalogAdminItem[]> {
  const { data, error } = await supabaseServer
    .from("reward_catalog")
    .select("id, nama_reward, biaya_poin, stok_atau_anggaran_tersisa")
    .order("nama_reward", { ascending: true });

  if (error) {
    console.error("[getRewardCatalogAdminList] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    namaReward: row.nama_reward as string,
    biayaPoin: row.biaya_poin as number,
    stokAtauAnggaranTersisa: row.stok_atau_anggaran_tersisa as number,
  }));
}

export interface RedemptionRequestAdminItem {
  id: string;
  userNama: string;
  namaReward: string;
  poinTerpakai: number;
  tanggal: string;
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Antrean Admin — SEMUA reward_redemptions status='diproses', terlama duluan (FIFO). */
export async function getRedemptionRequestsAdmin(): Promise<RedemptionRequestAdminItem[]> {
  const { data, error } = await supabaseServer
    .from("reward_redemptions")
    .select("id, poin_terpakai, tanggal, user:user_id(nama), reward:reward_catalog_id(nama_reward)")
    .eq("status", "diproses")
    .order("tanggal", { ascending: true });

  if (error) {
    console.error("[getRedemptionRequestsAdmin] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  type Row = {
    id: string;
    poin_terpakai: number;
    tanggal: string;
    user: { nama: string } | { nama: string }[] | null;
    reward: { nama_reward: string } | { nama_reward: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    userNama: firstOrNull(row.user)?.nama ?? "-",
    namaReward: firstOrNull(row.reward)?.nama_reward ?? "-",
    poinTerpakai: row.poin_terpakai,
    tanggal: row.tanggal,
  }));
}
