import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer "Tukar Poin" (Siswa & Mentor, section di halaman Referral & Poin
 * / Honor) — PRD Bagian 7.2 (FR-G5) & Bagian 13 (reward_catalog,
 * reward_redemptions).
 */

export interface RewardCatalogItem {
  id: string;
  namaReward: string;
  biayaPoin: number;
}

/** Cuma reward dengan stok_atau_anggaran_tersisa > 0 (BR-13) yang bisa ditukar. */
export async function getAvailableRewardCatalog(): Promise<RewardCatalogItem[]> {
  const { data, error } = await supabaseServer
    .from("reward_catalog")
    .select("id, nama_reward, biaya_poin")
    .gt("stok_atau_anggaran_tersisa", 0)
    .order("biaya_poin", { ascending: true });

  if (error) {
    console.error("[getAvailableRewardCatalog] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    namaReward: row.nama_reward as string,
    biayaPoin: row.biaya_poin as number,
  }));
}

export interface RedemptionHistoryItem {
  id: string;
  namaReward: string;
  poinTerpakai: number;
  status: "diproses" | "selesai" | "gagal";
  tanggal: string;
}

export async function getRedemptionHistory(userId: string): Promise<RedemptionHistoryItem[]> {
  const { data, error } = await supabaseServer
    .from("reward_redemptions")
    .select("id, poin_terpakai, status, tanggal, reward:reward_catalog_id(nama_reward)")
    .eq("user_id", userId)
    .order("tanggal", { ascending: false });

  if (error) {
    console.error("[getRedemptionHistory] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  type Row = {
    id: string;
    poin_terpakai: number;
    status: "diproses" | "selesai" | "gagal";
    tanggal: string;
    reward: { nama_reward: string } | { nama_reward: string }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const reward = Array.isArray(row.reward) ? (row.reward[0] ?? null) : row.reward;
    return {
      id: row.id,
      namaReward: reward?.nama_reward ?? "-",
      poinTerpakai: row.poin_terpakai,
      status: row.status,
      tanggal: row.tanggal,
    };
  });
}
