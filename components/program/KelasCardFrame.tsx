import Link from "next/link";
import type { ReactNode } from "react";
import KelasCardVisual from "@/components/ui/KelasCardVisual";
import type { DiskonAktif } from "@/lib/dashboard/getProgramData";

/**
 * Frame card Kelas publik (dipakai app/program/page.tsx Template A/B/C +
 * app/program/[kategori]/page.tsx) — stack vertikal: ATAS KelasCardVisual
 * full-bleed (atas/kanan/kiri card), BAWAH slot `children` (konten card,
 * lihat components/program/KelasCardMeta.tsx). `overflow-hidden` di sini
 * WAJIB supaya visual full-bleed ikut kepotong rounded corner card.
 */

export interface KelasCardFrameProps {
  href: string;
  namaKelas: string;
  index: number;
  diskonAktif: DiskonAktif | null;
  sisaSlot: number;
  kapasitas: number;
  programKategori: string;
  tingkatKelas: string;
  subtesNama: string | null;
  className?: string;
  children: ReactNode;
}

export default function KelasCardFrame({
  href,
  namaKelas,
  index,
  diskonAktif,
  sisaSlot,
  kapasitas,
  programKategori,
  tingkatKelas,
  subtesNama,
  className,
  children,
}: KelasCardFrameProps) {
  return (
    <Link
      href={href}
      className={[
        "flex flex-col overflow-hidden rounded-[20px] bg-white transition-shadow",
        diskonAktif
          ? "border-2 border-[#DC2626] shadow-[0_0_0_3px_rgba(220,38,38,0.12),1px_2px_10px_0px_rgba(220,38,38,0.28)] hover:shadow-[0_0_0_3px_rgba(220,38,38,0.16),1px_2px_14px_0px_rgba(220,38,38,0.32)]"
          : "border-[0.8px] border-[#E3E3E3] shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] hover:shadow-[1px_2px_8px_0px_rgba(0,0,0,0.15)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <KelasCardVisual
        namaKelas={namaKelas}
        index={index}
        diskonAktif={diskonAktif}
        sisaSlot={sisaSlot}
        kapasitas={kapasitas}
        programKategori={programKategori}
        tingkatKelas={tingkatKelas}
        subtesNama={subtesNama}
      />

      <div className="flex min-w-0 flex-col gap-1.5 p-4">{children}</div>
    </Link>
  );
}
