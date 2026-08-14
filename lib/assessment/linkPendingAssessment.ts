import "server-only";

import { supabaseServer } from "@/lib/supabase/server";

/**
 * PRD Bagian 7.4.1b: begitu assessment anonim (trial) ditautkan ke akun lewat
 * Register/Login, `assessments.user_id` diisi & `anonymous_trial_id` di-NULL-kan.
 *
 * BR-5: hanya boleh ditautkan kalau trial ID pemanggil (dari cookie request
 * saat ini) memang cocok dengan `anonymous_trial_id` assessment tsb — supaya
 * orang lain tidak bisa mengklaim hasil assessment anonim milik browser lain
 * cuma dengan mengirim/menebak id assessment.
 *
 * Dipakai di app/api/auth/register/route.ts (link langsung setelah akun baru
 * dibuat) dan app/api/auth/login/route.ts (link setelah kredensial valid) —
 * kedua rute checklist PRD eksplisit minta ditangani.
 *
 * @returns id assessment yang berhasil ditautkan/sudah dimiliki user ini
 *          (dipakai untuk redirect ke /assessment/hasil/[id]), atau null
 *          kalau tidak ada yang cocok/berhasil ditautkan (redirect normal).
 */
export async function linkPendingAssessment(
  pendingAssessmentId: string | undefined | null,
  trialId: string | undefined | null,
  userId: string,
): Promise<string | null> {
  if (!pendingAssessmentId) return null;

  if (trialId) {
    const { data: linked, error: linkError } = await supabaseServer
      .from("assessments")
      .update({ user_id: userId, anonymous_trial_id: null })
      .eq("id", pendingAssessmentId)
      .eq("anonymous_trial_id", trialId)
      .is("user_id", null)
      .select("id")
      .maybeSingle();

    if (linkError) {
      console.error("[linkPendingAssessment] update failed:", linkError);
    } else if (linked) {
      return linked.id as string;
    }
  }

  // Belum/tidak cocok lewat trial cookie di atas — cek kemungkinan sudah
  // ditautkan sebelumnya ke user yang sekarang login (mis. Register sempat
  // me-link-nya, lalu user ini lanjut Login terpisah) supaya tetap diarahkan
  // ke halaman hasil tanpa perlu link ulang.
  const { data: existing } = await supabaseServer
    .from("assessments")
    .select("id")
    .eq("id", pendingAssessmentId)
    .eq("user_id", userId)
    .maybeSingle();

  return existing ? (existing.id as string) : null;
}
