import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer halaman Pengaturan — SATU halaman untuk semua role (PRD 8
 * BR-14, BR-25; Bagian 13: users.notif_email, notif_wa,
 * permintaan_hapus_akun, alasan_hapus_akun, tanggal_permintaan_hapus).
 */

export interface PengaturanData {
  notifEmail: boolean;
  notifWa: boolean;
  optOutLeaderboard: boolean;
  consentLeaderboardLokasi: boolean;
  permintaanHapusAkun: boolean;
  tanggalPermintaanHapus: string | null;
}

export async function getPengaturanData(userId: string): Promise<PengaturanData | null> {
  const { data, error } = await supabaseServer
    .from("users")
    .select(
      "notif_email, notif_wa, opt_out_leaderboard, consent_leaderboard_lokasi, permintaan_hapus_akun, tanggal_permintaan_hapus",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    console.error("[getPengaturanData] query failed:", error);
    return null;
  }

  return {
    notifEmail: data.notif_email as boolean,
    notifWa: data.notif_wa as boolean,
    optOutLeaderboard: data.opt_out_leaderboard as boolean,
    consentLeaderboardLokasi: data.consent_leaderboard_lokasi as boolean,
    permintaanHapusAkun: data.permintaan_hapus_akun as boolean,
    tanggalPermintaanHapus: (data.tanggal_permintaan_hapus as string | null) ?? null,
  };
}
