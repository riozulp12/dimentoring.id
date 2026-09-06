// Client Supabase Auth (browser-only) — PAKAI HANYA untuk `supabase.auth.*`
// (Google OAuth via FR-1.14), TIDAK PERNAH untuk query tabel data (`.from(...)`).
// Data tabel tetap lewat lib/supabase/server.ts (service_role, server-only) sesuai
// CLAUDE.md — anon key di sini tidak dipakai bypass RLS, cuma untuk handshake OAuth
// Supabase Auth (yang punya skema `auth.*` sendiri, terpisah total dari `public.users`
// custom kita). Begitu email Google didapat, sesi Supabase Auth ini langsung dibuang
// (signOut) — identitas aplikasi SELALU dari cookie session custom kita sendiri
// (lib/auth/session.ts), bukan dari sesi Supabase Auth.
//
// PAKAI createBrowserClient dari @supabase/ssr (BUKAN createClient dari
// @supabase/supabase-js langsung) — ini menyimpan code_verifier PKCE di COOKIE
// first-party, bukan localStorage. Terbukti dari bug production: alur redirect
// dimentoring.id -> accounts.google.com -> *.supabase.co -> dimentoring.id kena
// proteksi anti-bounce-tracking browser modern yang membersihkan localStorage
// origin asal setelah pola redirect lintas domain seperti ini (tidak kejadian di
// localhost, makanya cuma muncul di production) — persis skenario yang membuat
// exchangeCodeForSession() gagal dengan AuthPKCECodeVerifierMissingError.
// createBrowserClient juga selalu memaksa flowType 'pkce' secara internal,
// jadi tidak perlu di-set manual lagi di sini.
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowserClient() cuma boleh dipanggil di browser (client component).");
  }
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}
