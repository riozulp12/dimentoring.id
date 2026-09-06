// Client Supabase Auth (browser-only) — PAKAI HANYA untuk `supabase.auth.*`
// (Google OAuth via FR-1.14), TIDAK PERNAH untuk query tabel data (`.from(...)`).
// Data tabel tetap lewat lib/supabase/server.ts (service_role, server-only) sesuai
// CLAUDE.md — anon key di sini tidak dipakai bypass RLS, cuma untuk handshake OAuth
// Supabase Auth (yang punya skema `auth.*` sendiri, terpisah total dari `public.users`
// custom kita). Begitu email Google didapat, sesi Supabase Auth ini langsung dibuang
// (signOut) — identitas aplikasi SELALU dari cookie session custom kita sendiri
// (lib/auth/session.ts), bukan dari sesi Supabase Auth.
//
// createBrowserClient dari @supabase/ssr (bukan createClient dari @supabase/supabase-js
// langsung) — nyimpen code_verifier PKCE di cookie first-party, bukan localStorage.
// Lebih tahan banting untuk skenario umum (mis. localStorage yang dibersihkan browser),
// meski BUKAN ini akar masalah bug production "PKCE code verifier not found in storage"
// yang sempat muncul (root cause aslinya ada di detectSessionInUrl, lihat di bawah).
//
// detectSessionInUrl: false WAJIB. Defaultnya true di GoTrueClient — begitu client ini
// dibuat DAN URL saat itu punya `?code=...`, GoTrueClient._initialize() OTOMATIS
// menjalankan exchange sendiri di background (menghabiskan code_verifier sekali-pakai),
// SEBELUM app/auth/callback/page.tsx sempat manggil exchangeCodeForSession() secara
// eksplisit. Manual call itu lalu selalu gagal "code verifier not found in storage"
// karena verifier-nya sudah lebih dulu dipakai & dihapus oleh proses auto-detect ini —
// balapan (race), sama sekali bukan soal localStorage vs cookie. Arsitektur project ini
// sengaja full-manual (baca komentar app/auth/callback/page.tsx), jadi auto-detect ini
// harus dimatikan.
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowserClient() cuma boleh dipanggil di browser (client component).");
  }
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: { detectSessionInUrl: false },
    });
  }
  return browserClient;
}
