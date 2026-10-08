import Link from "next/link";
import Button from "@/components/ui/Button";
import { buttonClassName } from "@/components/ui/buttonClassName";
import type { SessionRole } from "@/lib/auth/session";
import { resolveKelasDaftarAction } from "@/lib/shared/kelasDaftarTarget";

/**
 * Tombol "Daftar Sekarang" kelas — dipakai card /program (+ Rekomendasi Kelas,
 * lewat KelasCardMeta) DAN halaman detail publik app/program/kelas/[kelasId]/page.tsx.
 * Aturan tujuannya ada di SATU tempat: lib/shared/kelasDaftarTarget.ts.
 *
 * Dirender sebagai <a>/<Link> dengan href asli (bukan router.push di onClick)
 * supaya bisa dibuka di tab baru dan cocok dengan pola stretched-link
 * KelasCardFrame — tombol ini BUKAN anak dari Link kartu, cuma ditumpuk di
 * atasnya (lihat KelasCardFrame.tsx), jadi klik tombol tidak pernah ikut ke
 * halaman detail.
 */

const IS_PENDAFTARAN_MANUAL = process.env.NEXT_PUBLIC_PENDAFTARAN_MANUAL === "true";

export interface KelasDaftarButtonProps {
  kelasId: string;
  sisaSlot: number;
  sessionRole: SessionRole | null;
  /** Kolom kelas.link_lynkid ("Input Link Pendaftaran" di Kelola Kelas). */
  linkLynkid: string | null;
  /** "card" = tombol kecil di card listing; "detail" = tombol besar full-width
   * di halaman detail, dengan keterangan di bawahnya saat disabled. */
  variant?: "card" | "detail";
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
  variant = "card",
  compact = false,
}: KelasDaftarButtonProps) {
  const action = resolveKelasDaftarAction({
    kelasId,
    sisaSlot,
    linkPendaftaran: linkLynkid,
    sessionRole,
    isPendaftaranManual: IS_PENDAFTARAN_MANUAL,
  });

  const isDetail = variant === "detail";
  const size = isDetail ? "lg" : "sm";
  const widthClass = isDetail ? "w-full" : compact ? "w-full px-3 sm:px-5" : "w-full";

  if (action.kind === "disabled") {
    const label =
      compact && action.labelCompact !== action.label ? (
        <>
          <span className="sm:hidden">{action.labelCompact}</span>
          <span className="hidden sm:inline">{action.label}</span>
        </>
      ) : (
        action.label
      );

    const button = (
      <Button type="button" variant="primary" size={size} className={widthClass} disabled title={action.keterangan}>
        {label}
      </Button>
    );

    if (!isDetail) return button;
    return (
      <>
        {button}
        <p className="text-center text-sm text-[#7E7C7C]">{action.keterangan}</p>
      </>
    );
  }

  const className = buttonClassName({ variant: "primary", size, className: widthClass });

  if (action.kind === "external") {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={className}>
        Daftar Sekarang
      </a>
    );
  }

  return (
    <Link href={action.href} className={className}>
      Daftar Sekarang
    </Link>
  );
}
