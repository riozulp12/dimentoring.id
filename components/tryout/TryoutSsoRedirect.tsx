"use client";

import { useEffect } from "react";
import MaskotLoading from "@/components/ui/MaskotLoading";

const SSO_REDIRECT_URL = "/api/agensoal/sso-redirect";

/**
 * Layar transisi bermerek Dimentoring selama /api/agensoal/sso-redirect
 * memproses (query user + generate token) sebelum browser pindah ke domain
 * Agensoal. Navigasi lewat window.location (bukan next/navigation redirect())
 * supaya layar ini benar-benar sempat tampil — redirect() server-side di
 * page.tsx sebelumnya lolos begitu cepat sehingga jeda ini tidak kelihatan.
 * TIDAK bisa mengubah tampilan loading Agensoal sendiri setelah sampai di
 * domain mereka — ini cuma menutupi jeda di sisi kita sebelum redirect.
 */
export default function TryoutSsoRedirect() {
  useEffect(() => {
    window.location.href = SSO_REDIRECT_URL;
  }, []);

  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <MaskotLoading size="lg" label="Menyiapkan Try Out kamu..." />
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=${SSO_REDIRECT_URL}`} />
      </noscript>
    </div>
  );
}
