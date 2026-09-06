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

    async function run() {
      const supabase = getSupabaseBrowserClient();

      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        window.location.href,
      );

      if (exchangeError || !data.session?.user.email) {
        // DEBUG SEMENTARA (ronde 2) — fix flowType:'pkce' sudah bikin `code` muncul
        // di URL, tapi masih gagal; perlu lihat alasan PERSIS exchange ini gagal.
        console.error("[DEBUG PROD] exchangeCodeForSession gagal. error:", exchangeError, "data:", data);
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
        // DEBUG SEMENTARA (ronde 2) — HAPUS setelah root cause ronde 2 ketemu.
        console.log("[DEBUG PROD] POST /api/auth/google-callback status:", response.status, "body:", json);
      } catch (postError) {
        console.error("[DEBUG PROD] POST /api/auth/google-callback lempar exception:", postError);
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
