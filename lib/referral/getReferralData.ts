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
  level: string | null;
}

export type ReferralStatus = "terdaftar" | "dalam_proses" | "terkonversi" | "tidak_valid";

export interface ReferralHistoryItem {
  id: string;
  refereeNama: string;
  tanggalDaftar: string;
  status: ReferralStatus;
}

export type RewardPeran = "referrer" | "referee";

export interface RewardHistoryItem {
  id: string;
  /** 'referrer' = reward krn share kode (counterpartNama = nama/alias referee yg dirujuk).
   *  'referee' = reward krn user ini SENDIRI daftar pakai kode referral orang lain. */
  peran: RewardPeran;
  counterpartNama: string | null;
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
    supabaseServer.from("gamifikasi_profiles").select("total_poin, level").eq("user_id", userId).maybeSingle(),
  ]);

  return {
    kodeReferral: (userRes.data?.kode_referral as string | null) ?? null,
    totalKlik: (userRes.data?.referral_click_count as number | undefined) ?? 0,
    totalPendaftaran: pendaftaranRes.count ?? 0,
    totalTerkonversi: terkonversiRes.count ?? 0,
    totalPoin: (gamifikasiRes.data?.total_poin as number | undefined) ?? 0,
    level: (gamifikasiRes.data?.level as string | null | undefined) ?? null,
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

type RewardRow = {
  id: string;
  referral_id: string;
  jenis_reward: string;
  nominal_atau_poin: number;
  status_pencairan: RewardHistoryItem["statusPencairan"];
  tanggal: string;
};

/**
 * Riwayat Reward — FR-R7 (terpisah dari riwayat referral). PRD Bagian 13
 * (referral_rewards.penerima BARU, reward dua sisi): gabungan reward yang
 * user ini terima SEBAGAI REFERRER (dari referral yang dia rujuk) DAN
 * SEBAGAI REFEREE (kalau dia sendiri dulu daftar pakai kode referral orang
 * lain) — dua query terpisah karena sumber baris `referrals`-nya beda arah.
 */
export async function getRewardHistory(userId: string): Promise<RewardHistoryItem[]> {
  const [asReferrer, asReferee] = await Promise.all([
    getRewardHistoryAsReferrer(userId),
    getRewardHistoryAsReferee(userId),
  ]);

  return [...asReferrer, ...asReferee].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
}

async function getRewardHistoryAsReferrer(userId: string): Promise<RewardHistoryItem[]> {
  const { data: referralRows, error: referralError } = await supabaseServer
    .from("referrals")
    .select("id, referee:referee_id(nama, nama_panggilan)")
    .eq("referrer_id", userId);

  if (referralError) {
    console.error("[getRewardHistoryAsReferrer] query referrals failed:", referralError);
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
    .eq("penerima", "referrer")
    .order("tanggal", { ascending: false });

  if (rewardError) {
    console.error("[getRewardHistoryAsReferrer] query referral_rewards failed:", rewardError);
    return [];
  }

  return ((rewardRows ?? []) as RewardRow[]).map((row) => ({
    id: row.id,
    peran: "referrer" as const,
    counterpartNama: refereeByReferralId.get(row.referral_id) ?? "***",
    jenisReward: row.jenis_reward,
    nominalAtauPoin: Number(row.nominal_atau_poin),
    statusPencairan: row.status_pencairan,
    tanggal: row.tanggal,
  }));
}

async function getRewardHistoryAsReferee(userId: string): Promise<RewardHistoryItem[]> {
  const { data: referral, error: referralError } = await supabaseServer
    .from("referrals")
    .select("id")
    .eq("referee_id", userId)
    .maybeSingle();

  if (referralError) {
    console.error("[getRewardHistoryAsReferee] query referrals failed:", referralError);
    return [];
  }
  if (!referral) return []; // user ini tidak pernah daftar pakai kode referral siapa pun

  const { data: rewardRows, error: rewardError } = await supabaseServer
    .from("referral_rewards")
    .select("id, referral_id, jenis_reward, nominal_atau_poin, status_pencairan, tanggal")
    .eq("referral_id", referral.id)
    .eq("penerima", "referee")
    .order("tanggal", { ascending: false });

  if (rewardError) {
    console.error("[getRewardHistoryAsReferee] query referral_rewards failed:", rewardError);
    return [];
  }

  return ((rewardRows ?? []) as RewardRow[]).map((row) => ({
    id: row.id,
    peran: "referee" as const,
    counterpartNama: null,
    jenisReward: row.jenis_reward,
    nominalAtauPoin: Number(row.nominal_atau_poin),
    statusPencairan: row.status_pencairan,
    tanggal: row.tanggal,
  }));
}
