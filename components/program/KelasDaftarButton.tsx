"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import type { SessionRole } from "@/lib/auth/session";

/**
 * Tombol "Daftar Sekarang" di card Kelas publik (PRD 7.5 poin 10). Card
 * pembungkusnya (KelasCardFrame) adalah <Link> ke halaman detail — tombol
 * ini WAJIB stopPropagation supaya klik tombol langsung ke checkout/Lynk.id,
 * bukan ikut ke-trigger navigasi Link detail kelas.
 *
 * Logic REUSE persis dari app/program/kelas/[kelasId]/page.tsx: kalau
 * NEXT_PUBLIC_PENDAFTARAN_MANUAL aktif -> buka kelas.link_lynkid di tab baru
 * (TANPA gating login/role, Payment otomatis belum aktif jadi tidak ada alur
 * internal untuk digating) kalau link-nya sudah diisi Admin, atau nonaktif
 * dengan keterangan kalau belum; kalau mode manual TIDAK aktif -> logic lama:
 * belum login -> /login, login role Siswa -> /checkout/[kelasId], login role
 * lain -> nonaktif (kelas cuma untuk Siswa). "Kelas Penuh" tetap prioritas
 * tertinggi di kedua mode.
 */

const IS_PENDAFTARAN_MANUAL = process.env.NEXT_PUBLIC_PENDAFTARAN_MANUAL === "true";

export interface KelasDaftarButtonProps {
  kelasId: string;
  sisaSlot: number;
  sessionRole: SessionRole | null;
  /** SEMENTARA (PRD 7.5) — dipakai cuma kalau NEXT_PUBLIC_PENDAFTARAN_MANUAL aktif. */
  linkLynkid: string | null;
  /** Card dirender 2 kolom di mobile (grid /program) — padding tombol
   * dikecilkan & label panjang dipendekkan HANYA di breakpoint dasar supaya
   * teks `whitespace-nowrap` tidak keluar dari card. Mulai `sm:` kembali
   * normal, jadi tablet/desktop tidak berubah. */
  compact?: boolean;
}

export default function KelasDaftarButton({
  kelasId,
  sisaSlot,
  sessionRole,
  linkLynkid,
  compact = false,
}: KelasDaftarButtonProps) {
  const router = useRouter();
  const isPenuh = sisaSlot <= 0;
  const isRoleLain = sessionRole !== null && sessionRole !== "student";
  const buttonClass = compact ? "w-full px-3 sm:px-5" : "w-full";

  if (isPenuh) {
    return (
      <Button
        type="button"
        variant="primary"
        size="sm"
        className={buttonClass}
        disabled
        onMouseDown={(event) => event.stopPropagation()}
      >
        Kelas Penuh
      </Button>
    );
  }

  if (IS_PENDAFTARAN_MANUAL) {
    if (!linkLynkid) {
      return (
        <Button
          type="button"
          variant="primary"
          size="sm"
          className={buttonClass}
          disabled
          onMouseDown={(event) => event.stopPropagation()}
          title="Link pendaftaran kelas ini belum diisi Admin"
        >
          {compact ? (
            <>
              <span className="sm:hidden">Belum Tersedia</span>
              <span className="hidden sm:inline">Link Pendaftaran Belum Tersedia</span>
            </>
          ) : (
            "Link Pendaftaran Belum Tersedia"
          )}
        </Button>
      );
    }

    function handleLynkidClick(event: MouseEvent<HTMLButtonElement>) {
      event.preventDefault();
      event.stopPropagation();
      window.open(linkLynkid as string, "_blank", "noopener,noreferrer");
    }

    return (
      <Button
        type="button"
        variant="primary"
        size="sm"
        className={buttonClass}
        onClick={handleLynkidClick}
        onMouseDown={(event) => event.stopPropagation()}
      >
        Daftar Sekarang
      </Button>
    );
  }

  const disabled = isRoleLain;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    if (sessionRole === "student") {
      router.push(`/checkout/${kelasId}`);
      return;
    }
    // Belum login — sama dengan tombol di halaman detail: `returnTo` dibawa ke
    // Login supaya siswa mendarat balik di detail kelas ini setelah login
    // (Mentor/Admin mengabaikannya, lihat app/(auth)/login/page.tsx).
    router.push(`/login?returnTo=${encodeURIComponent(`/program/kelas/${kelasId}`)}`);
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      className={buttonClass}
      disabled={disabled}
      onClick={handleClick}
      onMouseDown={(event) => event.stopPropagation()}
      title={isRoleLain ? "Pendaftaran kelas hanya untuk akun Siswa" : undefined}
    >
      Daftar Sekarang
    </Button>
  );
}
