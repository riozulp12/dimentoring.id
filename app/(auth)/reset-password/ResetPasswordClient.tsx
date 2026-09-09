"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Mascot from "@/components/ui/Mascot";

/**
 * Form ganti password (STEP 2 alur Lupa Password) — dipisah dari page.tsx
 * (Server Component) karena butuh interaktivitas (useState/fetch), pola sama
 * dengan app/(auth)/verifikasi/VerifikasiClient.tsx.
 *
 * SENGAJA TIDAK auto-login setelah sukses — user diarahkan ke /login supaya
 * memverifikasi sendiri password barunya benar-benar jalan.
 */

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#F9FAFF] px-5 py-6 sm:px-8 md:px-10 lg:px-16 lg:py-8">
      <div className="flex w-full max-w-[500px] flex-col items-center gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-6 py-8 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:rounded-[24px] sm:px-8 lg:gap-6 lg:rounded-[28px] lg:px-10">
        {children}
      </div>
    </main>
  );
}

export default function ResetPasswordClient({
  token,
  initialError,
}: {
  token: string;
  initialError: string | null;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (initialError) {
    return (
      <CardShell>
        <Mascot variant="Confuse" alt="Maskot Dimentoring bingung" className="h-32 w-auto" priority />
        <div className="flex w-full flex-col items-center gap-2 text-center">
          <h1 className="text-xl leading-[1.5] font-semibold tracking-[-0.02em] text-black sm:text-2xl">
            Link Tidak Bisa Dipakai
          </h1>
          <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C] sm:text-base">{initialError}</p>
        </div>
        <Link href="/forgot-password" className="w-full">
          <Button type="button" variant="primary" size="md" className="w-full">
            Minta Link Baru
          </Button>
        </Link>
      </CardShell>
    );
  }

  if (isSuccess) {
    return (
      <CardShell>
        <Mascot variant="Happy1" alt="Maskot Dimentoring senang" className="h-32 w-auto" priority />
        <div className="flex w-full flex-col items-center gap-2 text-center">
          <h1 className="text-xl leading-[1.5] font-semibold tracking-[-0.02em] text-black sm:text-2xl">
            Password Berhasil Diganti
          </h1>
          <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C] sm:text-base">
            Silakan login pakai password barumu.
          </p>
        </div>
        <Link href="/login" className="w-full">
          <Button type="button" variant="primary" size="md" className="w-full">
            Ke Halaman Login
          </Button>
        </Link>
      </CardShell>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Konfirmasi password tidak sama.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal mengganti password. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      setIsSuccess(true);
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <CardShell>
      <Mascot variant="Guidance" alt="Maskot Dimentoring siap membantu" className="h-32 w-auto" priority />

      <div className="flex w-full flex-col items-center gap-2 text-center">
        <h1 className="text-xl leading-[1.5] font-semibold tracking-[-0.02em] text-black sm:text-2xl">
          Buat Password Baru
        </h1>
        <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C] sm:text-base">
          Minimal 8 karakter. Jangan pakai password yang sama dengan akun lain.
        </p>
      </div>

      <form className="flex w-full flex-col items-start gap-4" onSubmit={handleSubmit}>
        <div className="flex w-full flex-col items-start gap-1.5">
          <label
            htmlFor="reset-password-new"
            className="w-full text-sm leading-[1.5] font-medium tracking-[-0.28px] text-black sm:text-base"
          >
            Password Baru
          </label>
          <InputField
            type="password"
            size="md"
            id="reset-password-new"
            name="password"
            placeholder="Password baru"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => {
              setSubmitError(null);
              setPassword(event.target.value);
            }}
          />
        </div>

        <div className="flex w-full flex-col items-start gap-1.5">
          <label
            htmlFor="reset-password-confirm"
            className="w-full text-sm leading-[1.5] font-medium tracking-[-0.28px] text-black sm:text-base"
          >
            Konfirmasi Password Baru
          </label>
          <InputField
            type="password"
            size="md"
            id="reset-password-confirm"
            name="confirmPassword"
            placeholder="Ulangi password baru"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => {
              setSubmitError(null);
              setConfirmPassword(event.target.value);
            }}
          />
        </div>

        {submitError ? (
          <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#E70A0A] sm:text-sm">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="md" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan..." : "Simpan Password Baru"}
        </Button>
      </form>
    </CardShell>
  );
}
