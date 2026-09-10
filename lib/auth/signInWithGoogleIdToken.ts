import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bridge ID token dari Google Identity Services -> sesi aplikasi kita.
 * Dipakai bareng components/auth/GoogleSignInButton.tsx dari /login & /daftar.
 *
 * BEDA dari alur lama (app/auth/callback/page.tsx, authorization code + PKCE):
 * signInWithIdToken() memverifikasi ID token Google LANGSUNG (JWT signature,
 * audience = client_id, issuer, expiry) tanpa exchange code/flow_state di
 * server Supabase sama sekali -> tidak kena bug "flow_state_not_found". Tidak
 * ada redirect, jadi tidak perlu halaman perantara /auth/callback untuk alur ini.
 *
 * Setelah sesi Supabase Auth didapat (email sudah diverifikasi Google), POST
 * ke /api/auth/google-callback yang SAMA dengan alur lama — endpoint itu generik,
 * cuma butuh email terverifikasi + nama, tidak peduli mekanisme OAuth di baliknya.
 * Sesi Supabase Auth dibuang (signOut) setelahnya, sama seperti alur lama:
 * identitas aplikasi SELALU dari cookie session sendiri (lib/auth/session.ts).
 */

interface SignInWithGoogleIdTokenParams {
  supabase: SupabaseClient;
  idToken: string;
  pendingAssessmentId?: string;
  utmSource?: string;
  utmCampaign?: string;
}

interface SignInWithGoogleIdTokenResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
}

export async function signInWithGoogleIdToken({
  supabase,
  idToken,
  pendingAssessmentId,
  utmSource,
  utmCampaign,
}: SignInWithGoogleIdTokenParams): Promise<SignInWithGoogleIdTokenResult> {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });

  if (error || !data.session?.user.email) {
    console.error("[signInWithGoogleIdToken] signInWithIdToken gagal:", error);
    return { success: false, error: "Gagal login dengan Google. Coba lagi nanti." };
  }

  const email = data.session.user.email;
  const nama =
    (data.session.user.user_metadata?.full_name as string | undefined) ??
    (data.session.user.user_metadata?.name as string | undefined) ??
    null;

  let json: { success: boolean; error?: string; redirectTo?: string };
  try {
    const response = await fetch("/api/auth/google-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nama, pendingAssessmentId, utmSource, utmCampaign }),
    });
    json = await response.json();
  } catch (postError) {
    console.error("[signInWithGoogleIdToken] POST /api/auth/google-callback gagal:", postError);
    await supabase.auth.signOut();
    return { success: false, error: "Gagal terhubung ke server. Periksa koneksi internet kamu." };
  }

  // Sesi Supabase Auth sudah tidak diperlukan lagi setelah titik ini.
  await supabase.auth.signOut();

  if (!json.success || !json.redirectTo) {
    return { success: false, error: json.error ?? "Gagal login dengan Google. Coba lagi nanti." };
  }

  return { success: true, redirectTo: json.redirectTo };
}
