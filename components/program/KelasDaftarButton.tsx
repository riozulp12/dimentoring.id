"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import type { SessionRole } from "@/lib/auth/session";

/**
 * Tombol "Daftar Sekarang" di card Kelas publik (PRD 7.5 poin 10). Card
 * pembungkusnya (KelasCardFrame) adalah <Link> ke halaman detail — tombol
 * ini WAJIB stopPropagation supaya klik tombol langsung ke checkout, bukan
 * ikut ke-trigger navigasi Link detail kelas.
 *
 * Logic tujuan REUSE persis dari app/program/kelas/[kelasId]/page.tsx (belum
 * ada toggle Lynk.id/NEXT_PUBLIC_PENDAFTARAN_MANUAL di kode manapun —
 * pendaftaran sepenuhnya di dalam web lewat /checkout/[kelasId]):
 * belum login -> /login, login role Siswa -> /checkout/[kelasId],
 * login role lain -> nonaktif (kelas cuma untuk Siswa).
 */

export interface KelasDaftarButtonProps {
  kelasId: string;
  sisaSlot: number;
  sessionRole: SessionRole | null;
}

export default function KelasDaftarButton({ kelasId, sisaSlot, sessionRole }: KelasDaftarButtonProps) {
  const router = useRouter();
  const isPenuh = sisaSlot <= 0;
  const isRoleLain = sessionRole !== null && sessionRole !== "student";
  const disabled = isPenuh || isRoleLain;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    router.push(sessionRole === "student" ? `/checkout/${kelasId}` : "/login");
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      className="w-full"
      disabled={disabled}
      onClick={handleClick}
      onMouseDown={(event) => event.stopPropagation()}
      title={isRoleLain ? "Pendaftaran kelas hanya untuk akun Siswa" : undefined}
    >
      {isPenuh ? "Kelas Penuh" : "Daftar Sekarang"}
    </Button>
  );
}
