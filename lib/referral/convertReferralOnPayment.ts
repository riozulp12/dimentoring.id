import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * BR-10/BR-11 (PRD Bagian 8): reward referral cair setelah pembayaran PERTAMA
 * referee terkonfirmasi sukses. Dipanggil dari app/api/payment/webhook/route.ts
 * TEPAT SETELAH payments.status di-set 'berhasil' untuk payment yang baru
 * diproses (paymentId dikecualikan saat cek "pembayaran pertama" supaya tidak
 * menghitung dirinya sendiri).
 *
 * Besaran poin di bawah ini adalah nilai default hardcode (belum ada tabel
 * konfigurasi khusus reward referral di skema, beda dari honor_persentase_config
 * untuk honor mentor) — FR-R6 menyebut "Reward ditentukan Admin", jadi angka ini
 * kandidat kuat untuk dipindah ke tabel config kalau Admin butuh mengubahnya
 * tanpa redeploy.
 */
const REFERRAL_REWARD_POIN = 100;

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

  const { error: updateReferralError } = await supabaseServer
    .from("referrals")
    .update({ status: "terkonversi", tanggal_konversi: new Date().toISOString() })
    .eq("id", referral.id);

  if (updateReferralError) {
    console.error("[convertReferralOnPayment] update referrals failed:", updateReferralError);
    return;
  }

  const { error: rewardError } = await supabaseServer.from("referral_rewards").insert({
    referral_id: referral.id,
    jenis_reward: "poin",
    nominal_atau_poin: REFERRAL_REWARD_POIN,
    status_pencairan: "cair",
  });

  if (rewardError) {
    console.error("[convertReferralOnPayment] insert referral_rewards failed:", rewardError);
  }

  const referrerId = referral.referrer_id as string;
  const { data: gamifikasiProfile, error: gamifikasiFetchError } = await supabaseServer
    .from("gamifikasi_profiles")
    .select("total_poin")
    .eq("user_id", referrerId)
    .maybeSingle();

  if (gamifikasiFetchError) {
    console.error("[convertReferralOnPayment] query gamifikasi_profiles failed:", gamifikasiFetchError);
    return;
  }
  if (!gamifikasiProfile) return; // seharusnya selalu ada (dibuat saat register)

  const { error: gamifikasiUpdateError } = await supabaseServer
    .from("gamifikasi_profiles")
    .update({ total_poin: (gamifikasiProfile.total_poin as number) + REFERRAL_REWARD_POIN })
    .eq("user_id", referrerId);

  if (gamifikasiUpdateError) {
    console.error("[convertReferralOnPayment] update gamifikasi_profiles failed:", gamifikasiUpdateError);
  }
}
