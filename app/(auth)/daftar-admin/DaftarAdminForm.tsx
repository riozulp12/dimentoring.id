"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";

/**
 * Form pendaftaran Admin — SEDERHANA (bukan wizard multi-langkah seperti
 * Siswa/Mentor, Admin tidak perlu progressive profiling), PRD Bagian 8 BR-3.
 * Token sudah divalidasi server di page.tsx sebelum komponen ini dirender;
 * server tetap validasi ULANG saat submit (app/api/auth/daftar-admin).
 */
export default function DaftarAdminForm({ token }: { token: string }) {
  const router = useRouter();
  const [namaLengkap, setNamaLengkap] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/daftar-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, namaLengkap, email, whatsapp, password }),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal mendaftar. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      const params = new URLSearchParams({
        message: "Akun Admin berhasil dibuat, silakan login",
        email,
      });
      router.push(`/login?${params.toString()}`);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex w-full flex-col items-center gap-1 text-center">
        <h1 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl lg:text-2xl">
          Buat Akun Admin
        </h1>
        <p className="text-xs leading-[1.5] tracking-[-0.24px] text-[#7E7C7C] sm:text-sm sm:tracking-[-0.28px]">
          Kamu diundang jadi Admin Dimentoring — lengkapi data di bawah ini
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col items-start gap-4">
        <div className="flex w-full flex-col items-start gap-3">
          <div className="flex w-full flex-col gap-1.5">
            <label className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
              Nama Lengkap
            </label>
            <InputField
              type="text"
              size="md"
              placeholder="Nama Lengkap"
              required
              value={namaLengkap}
              onChange={(event) => setNamaLengkap(event.target.value)}
            />
          </div>

          <div className="flex w-full flex-col gap-1.5">
            <label className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
              Email
            </label>
            <InputField
              type="text"
              size="md"
              inputMode="email"
              placeholder="Email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="flex w-full flex-col gap-1.5">
            <label className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
              Nomor WhatsApp
            </label>
            <InputField
              type="text"
              size="md"
              inputMode="numeric"
              placeholder="08xxxxxxxxxx"
              required
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>

          <div className="flex w-full flex-col gap-1.5">
            <label className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
              Password
            </label>
            <InputField
              type="password"
              size="md"
              placeholder="Password (min. 8 karakter)"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {submitError ? (
          <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#E70A0A] sm:text-sm sm:tracking-[-0.28px]">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="md" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Memproses..." : "Daftar sebagai Admin"}
        </Button>

        <p className="flex w-full flex-wrap items-center justify-center gap-1.5 text-center text-xs leading-[1.5] tracking-[-0.24px] sm:text-sm sm:tracking-[-0.28px]">
          <span className="text-black">Sudah Punya Akun?</span>
          <Link href="/login" className="font-medium text-[#081EEA]">
            Login
          </Link>
        </p>
      </form>
    </>
  );
}
