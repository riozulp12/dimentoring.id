import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * BR-10/BR-11 (PRD Bagian 8): reward referral cair setelah pembayaran PERTAMA
 * referee terkonfirmasi sukses. Dipanggil dari app/api/payment/webhook/route.ts
 * TEPAT SETELAH payments.status di-set 'berhasil' untuk payment yang baru
 * diproses (paymentId dikecualikan saat cek "pembayaran pertama" supaya tidak
 * menghitung dirinya sendiri).
 *
 * Reward DUA SISI (PRD Bagian 13, referral_rewards.penerima) — referrer (yang
 * share kode) DAN referee (yang pakai kode, akun ini sendiri) sama-sama dapat
 * poin. Besarannya dibaca dari referral_reward_config (singleton id=1), bukan
 * hardcode, supaya Admin bisa ubah lewat Table Editor tanpa redeploy.
 */

async function addPoin(userId: string, amount: number): Promise<void> {
  const { data: profile, error: fetchError } = await supabaseServer
    .from("gamifikasi_profiles")
    .select("total_poin")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[convertReferralOnPayment] query gamifikasi_profiles failed:", fetchError);
    return;
  }

  if (!profile) {
    const { error: insertError } = await supabaseServer
      .from("gamifikasi_profiles")
      .insert({ user_id: userId, total_poin: amount });
    if (insertError) {
      console.error("[convertReferralOnPayment] insert gamifikasi_profiles failed:", insertError);
    }
    return;
  }

  const { error: updateError } = await supabaseServer
    .from("gamifikasi_profiles")
    .update({ total_poin: (profile.total_poin as number) + amount })
    .eq("user_id", userId);

  if (updateError) {
    console.error("[convertReferralOnPayment] update gamifikasi_profiles failed:", updateError);
  }
}

export async function convertReferralOnPayment(userId: string, currentPaymentId: string): Promise<void> {
  const { count: priorSuccessCount, error: countError } = await supabaseServer
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "berhasil")
    .neq("id", currentPaymentId);

  if (countError) {
    console.error("[convertReferralOnPayment] count prior payments failed:", countError);
    return;
  }
  if ((priorSuccessCount ?? 0) > 0) return; // bukan pembayaran pertama

  const { data: referral, error: referralError } = await supabaseServer
    .from("referrals")
    .select("id, referrer_id")
    .eq("referee_id", userId)
    .eq("status", "terdaftar")
    .maybeSingle();

  if (referralError) {
    console.error("[convertReferralOnPayment] query referrals failed:", referralError);
    return;
  }
  if (!referral) return; // user ini bukan referee, atau sudah pernah dikonversi

  const { data: config, error: configError } = await supabaseServer
    .from("referral_reward_config")
    .select("poin_referrer, poin_referee")
    .eq("id", 1)
    .maybeSingle();

  if (configError || !config) {
    console.error("[convertReferralOnPayment] query referral_reward_config failed:", configError);
    return;
  }
  const poinReferrer = Number(config.poin_referrer);
  const poinReferee = Number(config.poin_referee);

  const { error: updateReferralError } = await supabaseServer
    .from("referrals")
    .update({ status: "terkonversi", tanggal_konversi: new Date().toISOString() })
    .eq("id", referral.id);

  if (updateReferralError) {
    console.error("[convertReferralOnPayment] update referrals failed:", updateReferralError);
    return;
  }

  const { error: rewardError } = await supabaseServer.from("referral_rewards").insert([
    {
      referral_id: referral.id,
      penerima: "referrer",
      jenis_reward: "poin",
      nominal_atau_poin: poinReferrer,
      status_pencairan: "cair",
    },
    {
      referral_id: referral.id,
      penerima: "referee",
      jenis_reward: "poin",
      nominal_atau_poin: poinReferee,
      status_pencairan: "cair",
    },
  ]);

  if (rewardError) {
    console.error("[convertReferralOnPayment] insert referral_rewards failed:", rewardError);
  }

  const referrerId = referral.referrer_id as string;
  await addPoin(referrerId, poinReferrer);
  await addPoin(userId, poinReferee);
}
