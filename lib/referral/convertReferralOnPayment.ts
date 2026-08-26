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
 * poin. Besarannya PROPORSIONAL ke nilai transaksi (bukan flat lagi) — sekian
 * persen dari payments.jumlah, dikonversi ke poin pakai kurs rupiah_per_100_poin,
 * lalu di-floor/cap ke poin_minimum/poin_maksimum masing-masing sisi. Semua
 * angka dibaca dari referral_reward_config (singleton id=1), bukan hardcode,
 * supaya Admin bisa ubah lewat Table Editor tanpa redeploy.
 */

interface RewardConfig {
  persenReferrer: number;
  persenReferee: number;
  poinMinimumReferrer: number;
  poinMaksimumReferrer: number;
  poinMinimumReferee: number;
  poinMaksimumReferee: number;
  rupiahPer100Poin: number;
}

/**
 * jumlah * (persen/100) -> nilai Rupiah reward, dibagi (rupiahPer100Poin/100)
 * -> Rupiah per 1 poin, hasilnya jumlah poin. Dibulatkan ke integer (kolom
 * gamifikasi_profiles.total_poin bertipe INT) sebelum di-clamp ke [min, max].
 */
function hitungPoin(jumlah: number, persen: number, poinMinimum: number, poinMaksimum: number, rupiahPer100Poin: number): number {
  const rawPoin = (jumlah * (persen / 100)) / (rupiahPer100Poin / 100);
  const dibulatkan = Math.round(rawPoin);
  return Math.min(Math.max(dibulatkan, poinMinimum), poinMaksimum);
}

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

  const { data: payment, error: paymentError } = await supabaseServer
    .from("payments")
    .select("jumlah")
    .eq("id", currentPaymentId)
    .maybeSingle();

  if (paymentError || !payment) {
    console.error("[convertReferralOnPayment] query payments failed:", paymentError);
    return;
  }
  const jumlahTransaksi = Number(payment.jumlah);

  const { data: configRow, error: configError } = await supabaseServer
    .from("referral_reward_config")
    .select(
      "persen_referrer, persen_referee, poin_minimum_referrer, poin_maksimum_referrer, poin_minimum_referee, poin_maksimum_referee, rupiah_per_100_poin",
    )
    .eq("id", 1)
    .maybeSingle();

  if (configError || !configRow) {
    console.error("[convertReferralOnPayment] query referral_reward_config failed:", configError);
    return;
  }
  const config: RewardConfig = {
    persenReferrer: Number(configRow.persen_referrer),
    persenReferee: Number(configRow.persen_referee),
    poinMinimumReferrer: Number(configRow.poin_minimum_referrer),
    poinMaksimumReferrer: Number(configRow.poin_maksimum_referrer),
    poinMinimumReferee: Number(configRow.poin_minimum_referee),
    poinMaksimumReferee: Number(configRow.poin_maksimum_referee),
    rupiahPer100Poin: Number(configRow.rupiah_per_100_poin),
  };

  const poinReferrer = hitungPoin(
    jumlahTransaksi,
    config.persenReferrer,
    config.poinMinimumReferrer,
    config.poinMaksimumReferrer,
    config.rupiahPer100Poin,
  );
  const poinReferee = hitungPoin(
    jumlahTransaksi,
    config.persenReferee,
    config.poinMinimumReferee,
    config.poinMaksimumReferee,
    config.rupiahPer100Poin,
  );

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
