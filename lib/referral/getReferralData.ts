import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer Referral & Poin — PRD Bagian 7.1 & Bagian 13 (referrals,
 * referral_rewards, gamifikasi_profiles, users.kode_referral). Role-agnostic
 * secara sengaja (FR-R1: berlaku sama untuk Student MAUPUN Mentor) — dipakai
 * ulang oleh halaman Referral Siswa dan halaman Honor Mentor, jangan
 * duplikasi query ini per role.
 */

export interface ReferralStats {
  kodeReferral: string | null;
  totalKlik: number;
  totalPendaftaran: number;
  totalTerkonversi: number;
  totalPoin: number;
}

export type ReferralStatus = "terdaftar" | "dalam_proses" | "terkonversi" | "tidak_valid";

export interface ReferralHistoryItem {
  id: string;
  refereeNama: string;
  tanggalDaftar: string;
  status: ReferralStatus;
}

export interface RewardHistoryItem {
  id: string;
  refereeNama: string;
  jenisReward: string;
  nominalAtauPoin: number;
  statusPencairan: "tertunda" | "cair" | "ditahan";
  tanggal: string;
}

type NamaJoin = { nama: string; nama_panggilan: string | null };

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Alias privasi referee — pola sama seperti Leaderboard/Testimonial landing
 * page ("S***", "N***"): nama_panggilan kalau ada, kalau tidak huruf
 * pertama nama + "***". BR-12: default alias, bukan nama asli penuh.
 */
function maskNama(referee: NamaJoin | null): string {
  if (!referee) return "***";
  if (referee.nama_panggilan && referee.nama_panggilan.trim()) return referee.nama_panggilan.trim();
  const source = referee.nama.trim();
  if (!source) return "***";
  return `${source[0].toUpperCase()}***`;
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const [userRes, pendaftaranRes, terkonversiRes, gamifikasiRes] = await Promise.all([
    supabaseServer.from("users").select("kode_referral, referral_click_count").eq("id", userId).maybeSingle(),
    supabaseServer.from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", userId),
    supabaseServer
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", userId)
      .eq("status", "terkonversi"),
    supabaseServer.from("gamifikasi_profiles").select("total_poin").eq("user_id", userId).maybeSingle(),
  ]);

  return {
    kodeReferral: (userRes.data?.kode_referral as string | null) ?? null,
    totalKlik: (userRes.data?.referral_click_count as number | undefined) ?? 0,
    totalPendaftaran: pendaftaranRes.count ?? 0,
    totalTerkonversi: terkonversiRes.count ?? 0,
    totalPoin: (gamifikasiRes.data?.total_poin as number | undefined) ?? 0,
  };
}

/** Riwayat Referral — FR-R4 (Terdaftar/Dalam Proses/Terkonversi/Tidak Valid). */
export async function getReferralHistory(userId: string): Promise<ReferralHistoryItem[]> {
  const { data, error } = await supabaseServer
    .from("referrals")
    .select("id, status, tanggal_daftar, referee:referee_id(nama, nama_panggilan)")
    .eq("referrer_id", userId)
    .order("tanggal_daftar", { ascending: false });

  if (error) {
    console.error("[getReferralHistory] query failed:", error);
    return [];
  }

  type Row = { id: string; status: ReferralStatus; tanggal_daftar: string; referee: NamaJoin | NamaJoin[] | null };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    refereeNama: maskNama(firstOrNull(row.referee)),
    tanggalDaftar: row.tanggal_daftar,
    status: row.status,
  }));
}

/** Riwayat Reward — FR-R7 (terpisah dari riwayat referral). */
export async function getRewardHistory(userId: string): Promise<RewardHistoryItem[]> {
  const { data: referralRows, error: referralError } = await supabaseServer
    .from("referrals")
    .select("id, referee:referee_id(nama, nama_panggilan)")
    .eq("referrer_id", userId);

  if (referralError) {
    console.error("[getRewardHistory] query referrals failed:", referralError);
    return [];
  }

  type ReferralRow = { id: string; referee: NamaJoin | NamaJoin[] | null };
  const referralRowsTyped = (referralRows ?? []) as unknown as ReferralRow[];
  const referralIds = referralRowsTyped.map((r) => r.id);
  if (referralIds.length === 0) return [];

  const refereeByReferralId = new Map(referralRowsTyped.map((r) => [r.id, maskNama(firstOrNull(r.referee))]));

  const { data: rewardRows, error: rewardError } = await supabaseServer
    .from("referral_rewards")
    .select("id, referral_id, jenis_reward, nominal_atau_poin, status_pencairan, tanggal")
    .in("referral_id", referralIds)
    .order("tanggal", { ascending: false });

  if (rewardError) {
    console.error("[getRewardHistory] query referral_rewards failed:", rewardError);
    return [];
  }

  return (rewardRows ?? []).map((row) => ({
    id: row.id as string,
    refereeNama: refereeByReferralId.get(row.referral_id as string) ?? "***",
    jenisReward: row.jenis_reward as string,
    nominalAtauPoin: Number(row.nominal_atau_poin),
    statusPencairan: row.status_pencairan as RewardHistoryItem["statusPencairan"],
    tanggal: row.tanggal as string,
  }));
}
