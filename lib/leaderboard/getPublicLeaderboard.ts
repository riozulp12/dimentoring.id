import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { maskNama, type NamaJoin } from "@/lib/shared/maskNama";

/**
 * Leaderboard PUBLIK (PRD Bagian 7.1/7.2, BR-14) — app/leaderboard/page.tsx.
 * gamifikasi_profiles JOIN users, urutkan total_poin DESC, maksimal 50.
 *
 * DUA filter wajib SEBELUM limit diterapkan (keduanya bagian dari WHERE di
 * satu query PostgREST, bukan dipotong belakangan di JS):
 * - users.opt_out_leaderboard = false (BR-14 — siswa/mentor yang opt-out di
 *   Pengaturan TIDAK BOLEH muncul di sini sama sekali).
 * - total_poin > 0 — SETIAP akun otomatis dapat baris gamifikasi_profiles
 *   saat register (lihat app/api/auth/register/route.ts,
 *   app/api/auth/google-callback/route.ts) dengan total_poin=0 default.
 *   Tanpa filter ini, leaderboard bakal penuh akun yang belum pernah
 *   ngumpulin poin sama sekali — bukan "leaderboard", cuma daftar user.
 */

const LEADERBOARD_LIMIT = 50;

export interface LeaderboardEntry {
  rank: number;
  maskedNama: string;
  level: string;
  totalPoin: number;
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getPublicLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabaseServer
    .from("gamifikasi_profiles")
    .select("total_poin, level, users:user_id!inner(nama, nama_panggilan, opt_out_leaderboard)")
    .eq("users.opt_out_leaderboard", false)
    .gt("total_poin", 0)
    .order("total_poin", { ascending: false })
    .limit(LEADERBOARD_LIMIT);

  if (error) {
    console.error("[getPublicLeaderboard] query failed:", error);
    return [];
  }

  type UsersEmbed = NamaJoin & { opt_out_leaderboard: boolean };
  type Row = { total_poin: number; level: string; users: UsersEmbed | UsersEmbed[] | null };

  return ((data ?? []) as unknown as Row[]).map((row, index) => ({
    rank: index + 1,
    maskedNama: maskNama(firstOrNull(row.users)),
    level: row.level,
    totalPoin: row.total_poin,
  }));
}
