"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Mascot from "@/components/ui/Mascot";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // PRD Bagian 7.4.1b: kalau login dipicu dari alur "submit ke-3+ assessment
  // anonim", teruskan id ini ke API supaya assessment ditautkan ke akun & login
  // redirect langsung ke halaman hasil, bukan ke Dashboard biasa.
  const pendingAssessmentId = searchParams.get("pending_assessment");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Login | Dimentoring.id";
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          pendingAssessmentId: pendingAssessmentId || undefined,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal login. Coba lagi nanti.");
        setIsSubmitting(false);
        if (json.redirectTo) {
          router.push(json.redirectTo);
        }
        return;
      }

      router.push(json.redirectTo);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#F9FAFF] px-5 py-6 sm:px-8 md:px-10 lg:px-16 lg:py-8 xl:h-dvh xl:overflow-hidden">
      <div className="flex w-full max-w-[1150px] items-center justify-center gap-10 xl:justify-between xl:gap-14">
        <div className="relative hidden shrink-0 items-center justify-center xl:flex xl:h-[560px] xl:w-[560px]">
          <div className="absolute inset-0 rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[9%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[18%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[27%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />

          <div className="absolute top-[8%] right-[8%] w-[210px] translate-x-[20px]">
            <img src="/images/login-haii.svg" alt="" className="h-auto w-full" />
          </div>

          <Mascot
            variant="Happy2"
            alt="Maskot Dimentoring menyambut Anda"
            className="relative h-[440px] w-auto -translate-x-[72px]"
            priority
          />
        </div>

        <div className="flex w-full max-w-[500px] flex-col items-center gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-6 py-6 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:rounded-[24px] sm:px-8 lg:gap-6 lg:rounded-[28px] lg:px-10 lg:py-6">
          <div className="flex w-full flex-col items-center gap-2 text-center">
            <div className="flex flex-nowrap items-center justify-center gap-2 sm:gap-3">
              <span className="inline-flex items-center rounded-[12px] bg-[#081EEA] px-3 py-1 text-xl leading-[1.5] font-semibold tracking-[-0.4px] whitespace-nowrap text-white drop-shadow-[2px_2px_0px_black] sm:px-4 sm:text-2xl sm:tracking-[-0.48px] lg:px-5 lg:py-1.5 lg:text-3xl lg:tracking-[-0.6px]">
                Selamat
              </span>
              <span className="text-xl leading-[1.5] font-normal tracking-[-0.4px] whitespace-nowrap text-black sm:text-2xl sm:tracking-[-0.48px] lg:text-3xl lg:tracking-[-0.6px]">
                Datang Kembali
              </span>
            </div>
            <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C] sm:text-base lg:text-lg">
              Yuk Lanjutkan belajarmu dan capai tujuanmu
            </p>
          </div>

          <form
            className="flex w-full flex-col items-start gap-4"
            onSubmit={handleSubmit}
          >
            <div className="flex w-full flex-col items-start gap-3">
              <div className="flex w-full flex-col items-start gap-1.5">
                <label
                  htmlFor="login-email"
                  className="w-full text-sm leading-[1.5] font-medium tracking-[-0.28px] text-black sm:text-base lg:text-lg"
                >
                  Email/Username
                </label>
                <InputField
                  type="text"
                  size="md"
                  id="login-email"
                  name="email"
                  placeholder="Email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => {
                    setSubmitError(null);
                    setEmail(event.target.value);
                  }}
                />
              </div>

              <div className="flex w-full flex-col items-start gap-1.5">
                <label
                  htmlFor="login-password"
                  className="w-full text-sm leading-[1.5] font-medium tracking-[-0.28px] text-black sm:text-base lg:text-lg"
                >
                  Password
                </label>
                <div className="flex w-full flex-col items-start gap-1.5">
                  <InputField
                    type="password"
                    size="md"
                    id="login-password"
                    name="password"
                    placeholder="Password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => {
                      setSubmitError(null);
                      setPassword(event.target.value);
                    }}
                  />
                  <Link
                    href="/forgot-password"
                    className="w-full text-sm leading-[1.5] tracking-[-0.28px] text-[#081EEA]"
                  >
                    Lupa Password?
                  </Link>
                </div>
              </div>
            </div>

            {submitError ? (
              <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#E70A0A] sm:text-sm sm:tracking-[-0.28px]">
                {submitError}
              </p>
            ) : null}

            <div className="flex w-full flex-col items-start gap-3">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Memproses..." : "Login"}
              </Button>

              <div className="flex w-full items-center justify-center gap-3 sm:gap-4">
                <div className="h-px flex-1 bg-[#E3E3E3]" />
                <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C]">
                  Atau
                </p>
                <div className="h-px flex-1 bg-[#E3E3E3]" />
              </div>

              <Button
                type="button"
                variant="secondary"
                size="md"
                className="flex w-full items-center justify-center gap-2"
              >
                <img src="/icons/login-google.svg" alt="" className="h-5 w-5" />
                Login dengan Google
              </Button>
            </div>

            <div className="flex w-full flex-wrap items-center justify-center gap-1.5 text-center text-sm leading-[1.5] tracking-[-0.28px]">
              <span className="text-black">Belum Punya Akun?</span>
              <Link href="/daftar" className="font-medium text-[#081EEA]">
                Buat Akun Sekarang
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
