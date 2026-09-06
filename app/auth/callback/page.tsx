"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Mascot from "@/components/ui/Mascot";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Halaman perantara OAuth Google (FR-1.14) — tujuan `redirectTo` dari
 * signInWithOAuth() di /daftar & /login (lib/supabase/client.ts). Alurnya:
 *   1. exchangeCodeForSession() DI BROWSER (bukan server) — code verifier PKCE
 *      cuma ada di localStorage browser yang sama yang memulai signInWithOAuth.
 *   2. Ambil email (sudah diverifikasi Google) dari sesi Supabase Auth itu.
 *   3. POST ke app/api/auth/google-callback/route.ts — di situ baru dicek/
 *      dibuat baris `public.users` & di-set session cookie custom kita.
 *   4. Buang sesi Supabase Auth (signOut) — identitas aplikasi SELALU dari
 *      cookie session sendiri (lib/auth/session.ts), Supabase Auth cuma dipakai
 *      sekali pakai untuk verifikasi identitas Google di titik ini.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Guard terhadap React Strict Mode yang me-mount efek ini 2x di development.
  // exchangeCodeForSession() memakai PKCE code_verifier sekali-pakai (dihapus dari
  // localStorage setelah dipakai) — kalau effect ini jalan dua kali, panggilan kedua
  // akan gagal dengan "both auth code and code verifier should be non-empty".
  // Sengaja TIDAK pakai pola cleanup `cancelled` di sini: cleanup sintetis dari
  // Strict Mode akan jalan di antara kedua invocation, sehingga bisa menandai
  // panggilan PERTAMA (yang sukses) sebagai "cancelled" dan diam-diam membatalkan
  // redirect-nya. Untuk halaman callback sekali-pakai ini, unmount di tengah proses
  // bukan skenario nyata yang perlu ditangani.
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) {
      console.warn(
        "[auth/callback] Duplicate exchangeCodeForSession() call diblokir (Strict Mode double-invoke di dev).",
      );
      return;
    }
    hasRunRef.current = true;

    // ===== DEBUG SEMENTARA — bug "code_verifier" hilang di PRODUCTION =====
    // Log ini muncul di BROWSER DEVTOOLS CONSOLE, BUKAN Vercel Runtime Logs —
    // exchangeCodeForSession() jalan di client component ini (bukan server).
    // HAPUS seluruh blok ini setelah root cause ketemu.
    try {
      const debugAuthTokenKey = Object.keys(window.localStorage).find((k) => k.endsWith("-auth-token"));
      const debugVerifierKey = debugAuthTokenKey ? `${debugAuthTokenKey}-code-verifier` : null;
      const debugVerifier = debugVerifierKey ? window.localStorage.getItem(debugVerifierKey) : null;
      const debugCallCount =
        Number(window.sessionStorage.getItem("__debug_auth_callback_count") ?? "0") + 1;
      window.sessionStorage.setItem("__debug_auth_callback_count", String(debugCallCount));

      console.log("[DEBUG PROD] window.location.href:", window.location.href);
      console.log("[DEBUG PROD] window.location.origin:", window.location.origin);
      console.log("[DEBUG PROD] document.referrer:", document.referrer);
      console.log("[DEBUG PROD] code dari URL:", new URLSearchParams(window.location.search).get("code"));
      console.log("[DEBUG PROD] localStorage auth-token key:", debugAuthTokenKey);
      console.log("[DEBUG PROD] code_verifier key dicek:", debugVerifierKey);
      console.log("[DEBUG PROD] code_verifier ditemukan:", debugVerifier);
      console.log(
        "[DEBUG PROD] semua key localStorage berprefix sb-:",
        Object.keys(window.localStorage).filter((k) => k.startsWith("sb-")),
      );
      console.log("[DEBUG PROD] Callback dipanggil ke-berapa kali (survive full reload via sessionStorage):", debugCallCount);
    } catch (debugLogError) {
      console.warn("[DEBUG PROD] Gagal membaca info debug:", debugLogError);
    }
    // ===== END DEBUG SEMENTARA =====

    async function run() {
      const supabase = getSupabaseBrowserClient();

      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        window.location.href,
      );

      if (exchangeError || !data.session?.user.email) {
        // DEBUG SEMENTARA — lihat pesan error persis dari Supabase. HAPUS setelah root cause ketemu.
        console.error("[DEBUG PROD] exchangeCodeForSession gagal:", exchangeError);
        setError("Gagal login dengan Google. Coba lagi dari halaman Login.");
        return;
      }

      const email = data.session.user.email;
      const nama =
        (data.session.user.user_metadata?.full_name as string | undefined) ??
        (data.session.user.user_metadata?.name as string | undefined) ??
        null;

      const params = new URLSearchParams(window.location.search);
      const pendingAssessmentId = params.get("pending_assessment") ?? undefined;
      // PRD Bagian 13 (BARU) — dititipkan lewat redirectTo di /daftar
      // (handleGoogleRegister) supaya masih ada begitu balik dari Google.
      const utmSource = params.get("utm_source") ?? undefined;
      const utmCampaign = params.get("utm_campaign") ?? undefined;

      let json: { success: boolean; error?: string; redirectTo?: string };
      try {
        const response = await fetch("/api/auth/google-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, nama, pendingAssessmentId, utmSource, utmCampaign }),
        });
        json = await response.json();
      } catch {
        await supabase.auth.signOut();
        setError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
        return;
      }

      // Sesi Supabase Auth sudah tidak diperlukan lagi setelah titik ini.
      await supabase.auth.signOut();

      if (!json.success || !json.redirectTo) {
        setError(json.error ?? "Gagal login dengan Google. Coba lagi dari halaman Login.");
        return;
      }

      router.replace(json.redirectTo);
    }

    run();
  }, [router]);

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-[#F9FAFF] px-5 py-6 text-center">
      <Mascot variant="Happy1" alt="Maskot Dimentoring" className="h-40 w-auto" priority />
      {error ? (
        <div className="flex flex-col items-center gap-3">
          <p className="max-w-sm text-sm leading-[1.5] text-[#E70A0A] sm:text-base">{error}</p>
          <Link href="/login" className="text-sm font-medium text-[#081EEA] sm:text-base">
            Kembali ke Login
          </Link>
        </div>
      ) : (
        <p className="text-sm leading-[1.5] text-[#7E7C7C] sm:text-base">Menghubungkan akun Google kamu...</p>
      )}
    </main>
  );
}
