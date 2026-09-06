// Client Supabase Auth (browser-only) — PAKAI HANYA untuk `supabase.auth.*`
// (Google OAuth via FR-1.14), TIDAK PERNAH untuk query tabel data (`.from(...)`).
// Data tabel tetap lewat lib/supabase/server.ts (service_role, server-only) sesuai
// CLAUDE.md — anon key di sini tidak dipakai bypass RLS, cuma untuk handshake OAuth
// Supabase Auth (yang punya skema `auth.*` sendiri, terpisah total dari `public.users`
// custom kita). Begitu email Google didapat, sesi Supabase Auth ini langsung dibuang
// (signOut) — identitas aplikasi SELALU dari cookie session custom kita sendiri
// (lib/auth/session.ts), bukan dari sesi Supabase Auth.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowserClient() cuma boleh dipanggil di browser (client component).");
  }
  if (!browserClient) {
    // flowType WAJIB 'pkce' eksplisit — default library adalah 'implicit' (lihat
    // DEFAULT_AUTH_OPTIONS di @supabase/supabase-js), yang bikin Google/Supabase
    // balikin access_token/refresh_token mentah di URL hash, bukan `?code=`.
    // app/auth/callback/page.tsx memanggil exchangeCodeForSession() yang MEMBUTUHKAN
    // `code` + code_verifier PKCE — tanpa baris ini, exchange itu selalu gagal
    // dengan "both auth code and code verifier should be non-empty".
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: "pkce" },
    });
  }
  return browserClient;
}
