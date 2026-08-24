"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Mascot from "@/components/ui/Mascot";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Register — SEKARANG cuma 1 langkah (PRD Bagian 7.0.2 DIREVISI TOTAL, Agustus
 * 2026): Email, Nama Lengkap, Password, Kode Referral (opsional), atau "Daftar
 * dengan Google". Wizard profiling (role/kelas/mapel/PTN/dst) PINDAH ke
 * /lengkapi-profil, dikerjakan SETELAH auto-login di sini, bukan di halaman ini.
 */

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // PRD Bagian 7.4.1b: kalau register dipicu dari alur "submit ke-3+ assessment
  // anonim" (redirect dari /assessment ke /daftar?pending_assessment=[id]),
  // teruskan id ini ke API supaya assessment ditautkan ke akun baru.
  const pendingAssessmentId = searchParams.get("pending_assessment") ?? undefined;
  // FR-R2/PRD 7.1: klik link referral (/r/[kode]) redirect ke sini dengan
  // ?ref=[kode] — pre-fill field Kode Referral, tetap bisa diedit/dihapus user.
  // PRD Bagian 13 (BARU): ?utm_source=.../?utm_campaign=... dari link iklan
  // (Meta/TikTok/dst) — ditangkap di sini, TIDAK ditampilkan ke user, cuma
  // diteruskan apa adanya ke API saat akun dibuat. Tidak ada = tetap undefined
  // (biarkan NULL di database, jangan dipaksa "organic").
  const utmSource = searchParams.get("utm_source")?.trim() || undefined;
  const utmCampaign = searchParams.get("utm_campaign")?.trim() || undefined;
  const [email, setEmail] = useState("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [password, setPassword] = useState("");
  const [kodeReferral, setKodeReferral] = useState(() => searchParams.get("ref")?.trim() ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Daftar | Dimentoring.id";
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!isValidEmail(email)) {
      setSubmitError("Email tidak valid.");
      return;
    }
    if (!namaLengkap.trim()) {
      setSubmitError("Nama lengkap wajib diisi.");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password minimal 8 karakter.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          namaLengkap,
          password,
          kodeReferral: kodeReferral.trim() || undefined,
          pendingAssessmentId,
          utmSource,
          utmCampaign,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal mendaftar. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      // Auto-login (PRD 7.0.2) — session sudah aktif dari respons di atas,
      // langsung lanjut ke wizard profiling, TIDAK perlu login manual lagi.
      router.push(json.redirectTo ?? "/lengkapi-profil");
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  async function handleGoogleRegister() {
    setSubmitError(null);
    setIsGoogleLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = new URL("/auth/callback", window.location.origin);
      if (pendingAssessmentId) {
        redirectTo.searchParams.set("pending_assessment", pendingAssessmentId);
      }
      // Teruskan UTM lewat redirectTo — begitu balik dari Google, query string
      // /daftar yang asli sudah hilang, jadi harus dibawa manual sampai ke
      // /auth/callback supaya masih bisa dipakai saat POST ke google-callback.
      if (utmSource) redirectTo.searchParams.set("utm_source", utmSource);
      if (utmCampaign) redirectTo.searchParams.set("utm_campaign", utmCampaign);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo.toString() },
      });
      if (error) {
        setSubmitError("Gagal membuka login Google. Coba lagi nanti.");
        setIsGoogleLoading(false);
      }
      // Sukses: browser langsung di-redirect ke Google, tidak ada kode lanjutan di sini.
    } catch {
      setSubmitError("Gagal membuka login Google. Coba lagi nanti.");
      setIsGoogleLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#F9FAFF] px-5 py-6 sm:px-8 md:px-10 lg:px-16 lg:py-8">
      <div className="flex w-full max-w-[1150px] items-center justify-center gap-10 xl:justify-between xl:gap-14">
        <div className="relative hidden shrink-0 items-center justify-center xl:flex xl:h-[560px] xl:w-[560px]">
          <div className="absolute inset-0 rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[9%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[18%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[27%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />

          <div className="absolute top-[8%] right-[4%] z-10 w-[300px] xl:w-[340px]">
            <img src="/images/daftar-nah-terakhir.svg" alt="Buat Akun" className="h-auto w-full" />
          </div>

          <Mascot
            variant="Happy1"
            alt="Maskot Dimentoring menyambut Anda"
            className="relative h-[440px] w-auto -translate-x-12"
            priority
          />
        </div>

        <div className="flex w-full max-w-[500px] flex-col items-center gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:gap-5 sm:rounded-[24px] sm:px-8 sm:py-7 lg:gap-6 lg:rounded-[28px] lg:px-10 lg:py-8">
          <div className="flex w-full flex-col items-center gap-1 text-center">
            <h1 className="w-full text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl lg:text-2xl">
              Buat Akun Dimentoring
            </h1>
            <p className="text-xs leading-[1.5] tracking-[-0.24px] text-[#7E7C7C] sm:text-sm sm:tracking-[-0.28px]">
              Cuma butuh email & password — sisanya nanti aja
            </p>
          </div>

          <form className="flex w-full flex-col items-center gap-3 sm:gap-4" onSubmit={handleSubmit}>
            <div className="flex w-full flex-col gap-2.5 sm:gap-3 lg:gap-4">
              <div className="flex w-full flex-col gap-1.5">
                <label htmlFor="daftar-email" className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
                  Email
                </label>
                <InputField
                  type="text"
                  size="md"
                  id="daftar-email"
                  inputMode="email"
                  placeholder="Email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="flex w-full flex-col gap-1.5">
                <label htmlFor="daftar-nama" className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
                  Nama Lengkap
                </label>
                <InputField
                  type="text"
                  size="md"
                  id="daftar-nama"
                  placeholder="Nama Lengkap"
                  value={namaLengkap}
                  onChange={(event) => setNamaLengkap(event.target.value)}
                />
              </div>
              <div className="flex w-full flex-col gap-1.5">
                <label htmlFor="daftar-password" className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
                  Password
                </label>
                <InputField
                  type="password"
                  size="md"
                  id="daftar-password"
                  placeholder="Password (min. 8 karakter)"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="flex w-full flex-col gap-1.5">
                <label htmlFor="daftar-referral" className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
                  Kode Referral (Opsional)
                </label>
                <InputField
                  type="text"
                  size="md"
                  id="daftar-referral"
                  placeholder="Masukkan kode referral temenmu kalo punya"
                  value={kodeReferral}
                  onChange={(event) => setKodeReferral(event.target.value)}
                />
              </div>
            </div>

            {submitError ? (
              <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#E70A0A] sm:text-sm sm:tracking-[-0.28px]">
                {submitError}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              disabled={isSubmitting || isGoogleLoading}
            >
              {isSubmitting ? "Memproses..." : "Daftar"}
            </Button>

            <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#7E7C7C] sm:text-sm sm:tracking-[-0.28px]">
              Dengan mendaftar, kamu menyetujui{" "}
              <Link
                href="/kebijakan-privasi"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#081EEA]"
              >
                Kebijakan Privasi
              </Link>{" "}
              kami
            </p>

            <div className="flex w-full items-center justify-center gap-3 sm:gap-4">
              <div className="h-px flex-1 bg-[#E3E3E3]" />
              <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#7E7C7C]">Atau</p>
              <div className="h-px flex-1 bg-[#E3E3E3]" />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex w-full items-center justify-center gap-2"
              onClick={handleGoogleRegister}
              disabled={isSubmitting || isGoogleLoading}
            >
              <img src="/icons/login-google.svg" alt="" className="h-5 w-5" />
              {isGoogleLoading ? "Membuka Google..." : "Daftar dengan Google"}
            </Button>

            <p className="flex w-full flex-wrap items-center justify-center gap-1.5 text-center text-xs leading-[1.5] tracking-[-0.24px] sm:text-sm sm:tracking-[-0.28px]">
              <span className="text-black">Sudah Punya Akun?</span>
              <Link href="/login" className="font-medium text-[#081EEA]">
                Login
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  );
}
