"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Mascot from "@/components/ui/Mascot";

/**
 * Lupa Password — PRD Bagian 7.0.3 lanjutan. Style card sama dengan
 * app/(auth)/login/page.tsx supaya konsisten. Response sukses SELALU generik
 * ("kalau email terdaftar...") — anti-enumeration, lihat
 * app/api/auth/forgot-password/route.ts.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Lupa Password | Dimentoring.id";
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal memproses permintaan. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(json.message ?? "Kalau email itu terdaftar, link reset password sudah kami kirim.");
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#F9FAFF] px-5 py-6 sm:px-8 md:px-10 lg:px-16 lg:py-8">
      <div className="flex w-full max-w-[500px] flex-col items-center gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-6 py-8 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:rounded-[24px] sm:px-8 lg:gap-6 lg:rounded-[28px] lg:px-10">
        <Mascot variant="Guidance" alt="Maskot Dimentoring siap membantu" className="h-32 w-auto" priority />

        <div className="flex w-full flex-col items-center gap-2 text-center">
          <h1 className="text-xl leading-[1.5] font-semibold tracking-[-0.02em] text-black sm:text-2xl lg:text-3xl">
            Lupa Password?
          </h1>
          <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C] sm:text-base">
            Masukkan email akun kamu, kami kirim link buat bikin password baru.
          </p>
        </div>

        {successMessage ? (
          <div className="flex w-full flex-col items-center gap-4">
            <p className="w-full rounded-[16px] bg-[#F9FAFF] px-4 py-3 text-center text-sm leading-[1.5] tracking-[-0.28px] text-[#081EEA] sm:text-base">
              {successMessage}
            </p>
            <p className="text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#7E7C7C] sm:text-sm">
              Tidak ketemu di inbox? Cek juga folder Spam.
            </p>
            <Link href="/login" className="text-sm leading-[1.5] font-medium tracking-[-0.28px] text-[#081EEA]">
              Kembali ke Login
            </Link>
          </div>
        ) : (
          <form className="flex w-full flex-col items-start gap-4" onSubmit={handleSubmit}>
            <div className="flex w-full flex-col items-start gap-1.5">
              <label
                htmlFor="forgot-password-email"
                className="w-full text-sm leading-[1.5] font-medium tracking-[-0.28px] text-black sm:text-base"
              >
                Email
              </label>
              <InputField
                type="text"
                size="md"
                id="forgot-password-email"
                name="email"
                placeholder="Email akun kamu"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setSubmitError(null);
                  setEmail(event.target.value);
                }}
              />
            </div>

            {submitError ? (
              <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#E70A0A] sm:text-sm">
                {submitError}
              </p>
            ) : null}

            <Button type="submit" variant="primary" size="md" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Mengirim..." : "Kirim Link Reset"}
            </Button>

            <Link
              href="/login"
              className="w-full text-center text-sm leading-[1.5] font-medium tracking-[-0.28px] text-[#081EEA]"
            >
              Kembali ke Login
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
