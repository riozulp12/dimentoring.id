"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

/**
 * Tombol resmi Google Identity Services (GIS) — dipakai /login & /daftar.
 * Alur ID token, BUKAN authorization code redirect: initialize() lalu
 * renderButton() menaruh tombol Google asli (bukan tombol custom kita) di
 * dalam container ini; callback initialize() menerima ID token JWT langsung
 * di browser, TIDAK ADA redirect ke /auth/callback sama sekali di jalur ini.
 * Business logic (signInWithIdToken + POST /api/auth/google-callback) ada di
 * pemanggil lewat prop onCredential, supaya komponen ini murni render tombol.
 *
 * client_id di sini HARUS OAuth Client ID (bukan secret) yang SAMA dengan yang
 * sudah dikonfigurasi Supabase Auth provider Google — nilainya publik/aman
 * ditaruh di NEXT_PUBLIC_GOOGLE_CLIENT_ID. Domain (dimentoring.id, plus origin
 * dev) wajib terdaftar di "Authorized JavaScript origins" OAuth Client itu di
 * Google Cloud Console (BUKAN "Authorized redirect URIs" — itu punya alur lama).
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number;
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GIS_MAX_BUTTON_WIDTH = 400; // batas resmi renderButton() dari Google

interface GoogleSignInButtonProps {
  text: "signin_with" | "signup_with";
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}

export default function GoogleSignInButton({ text, onCredential, disabled }: GoogleSignInButtonProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  // Ref supaya effect render tombol di bawah tidak perlu re-run tiap kali
  // onCredential (closure baru tiap render) berubah — cukup initialize() sekali.
  const onCredentialRef = useRef(onCredential);
  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!scriptLoaded || !GOOGLE_CLIENT_ID || !window.google || !wrapperRef.current || !buttonRef.current) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => onCredentialRef.current(response.credential),
      cancel_on_tap_outside: true,
    });

    function render() {
      if (!wrapperRef.current || !buttonRef.current || !window.google) return;
      const width = Math.min(GIS_MAX_BUTTON_WIDTH, Math.round(wrapperRef.current.offsetWidth));
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text,
        shape: "rectangular",
        logo_alignment: "left",
        width,
        locale: "id",
      });
    }

    render();
    // Tombol Google berukuran fixed-px (bukan CSS width: 100%) — render ulang
    // saat container berubah lebar (resize window, breakpoint) biar tetap pas.
    const observer = new ResizeObserver(render);
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [scriptLoaded, text]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#E70A0A] sm:text-sm">
        Login Google belum dikonfigurasi (env NEXT_PUBLIC_GOOGLE_CLIENT_ID kosong).
      </p>
    );
  }

  return (
    <div ref={wrapperRef} className="w-full">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div
        ref={buttonRef}
        className={`flex w-full justify-center ${disabled ? "pointer-events-none opacity-50" : ""}`}
      />
    </div>
  );
}
