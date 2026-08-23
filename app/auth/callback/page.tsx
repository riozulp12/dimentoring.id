"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = getSupabaseBrowserClient();

      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        window.location.href,
      );

      if (exchangeError || !data.session?.user.email) {
        if (!cancelled) setError("Gagal login dengan Google. Coba lagi dari halaman Login.");
        return;
      }

      const email = data.session.user.email;
      const nama =
        (data.session.user.user_metadata?.full_name as string | undefined) ??
        (data.session.user.user_metadata?.name as string | undefined) ??
        null;

      const params = new URLSearchParams(window.location.search);
      const pendingAssessmentId = params.get("pending_assessment") ?? undefined;

      let json: { success: boolean; error?: string; redirectTo?: string };
      try {
        const response = await fetch("/api/auth/google-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, nama, pendingAssessmentId }),
        });
        json = await response.json();
      } catch {
        await supabase.auth.signOut();
        if (!cancelled) setError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
        return;
      }

      // Sesi Supabase Auth sudah tidak diperlukan lagi setelah titik ini.
      await supabase.auth.signOut();

      if (cancelled) return;

      if (!json.success || !json.redirectTo) {
        setError(json.error ?? "Gagal login dengan Google. Coba lagi dari halaman Login.");
        return;
      }

      router.replace(json.redirectTo);
    }

    run();

    return () => {
      cancelled = true;
    };
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
