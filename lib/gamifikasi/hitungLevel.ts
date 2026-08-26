import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * FR-G2 (PRD Bagian 7.2) & Bagian 13 (gamifikasi_level_tier — BARU): level
 * SELALU dihitung ulang dari total_poin terkini + tabel tier (bukan diubah
 * manual di tempat lain) — dipanggil dari SETIAP titik yang mengubah
 * gamifikasi_profiles.total_poin (lib/referral/convertReferralOnPayment.ts,
 * app/api/reward/tukar/route.ts) supaya level naik MAUPUN turun otomatis
 * mengikuti poin saat ini, tidak pernah nyangkut di level lama.
 */
export async function hitungDanUpdateLevel(userId: string): Promise<void> {
  const { data: profile, error: profileError } = await supabaseServer
    .from("gamifikasi_profiles")
    .select("total_poin")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[hitungDanUpdateLevel] query gamifikasi_profiles failed:", profileError);
    return;
  }
  if (!profile) return; // belum punya profil gamifikasi, tidak ada apa-apa untuk dihitung

  const totalPoin = profile.total_poin as number;

  const { data: tiers, error: tierError } = await supabaseServer
    .from("gamifikasi_level_tier")
    .select("nama_level, poin_minimum")
    .order("poin_minimum", { ascending: false });

  if (tierError) {
    console.error("[hitungDanUpdateLevel] query gamifikasi_level_tier failed:", tierError);
    return;
  }
  if (!tiers || tiers.length === 0) return;

  const tierSekarang = tiers.find((tier) => (tier.poin_minimum as number) <= totalPoin);
  if (!tierSekarang) return; // seharusnya tidak terjadi (selalu ada tier poin_minimum=0)

  const { error: updateError } = await supabaseServer
    .from("gamifikasi_profiles")
    .update({ level: tierSekarang.nama_level })
    .eq("user_id", userId);

  if (updateError) {
    console.error("[hitungDanUpdateLevel] update gamifikasi_profiles.level failed:", updateError);
  }
}
