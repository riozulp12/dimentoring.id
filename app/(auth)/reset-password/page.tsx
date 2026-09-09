import type { Metadata } from "next";
import { validatePasswordResetToken } from "@/lib/auth/passwordResetToken";
import ResetPasswordClient from "./ResetPasswordClient";

export const metadata: Metadata = {
  title: "Reset Password | Dimentoring.id",
};

/**
 * Reset Password — PRD Bagian 7.0.3 lanjutan. Token divalidasi SERVER-SIDE
 * di sini (pola sama dengan app/(auth)/verifikasi/page.tsx: Server Component
 * baca searchParams, render Client Component buat interaktivitas form) supaya
 * link basi/invalid ketahuan SEBELUM user sempat isi form — TANPA
 * mengonsumsi token (cuma cek, bukan tandai used_at, itu baru terjadi saat
 * submit berhasil lewat app/api/auth/reset-password/route.ts).
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";

  const validation = await validatePasswordResetToken(token);

  return <ResetPasswordClient token={token} initialError={validation.ok ? null : validation.error} />;
}
