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
  /** Card dirender 2 kolom di breakpoint mobile (grid /program & /program/
   * [kategori]) — padding card & tipografi banner dikecilkan HANYA di
   * breakpoint dasar (<640px). Mulai `sm:` semuanya kembali ke ukuran
   * normal, jadi tablet/desktop identik dengan sebelumnya. Grid lain yang
   * masih 1 kolom di mobile (Kelas Saya, Rekomendasi Kelas) TIDAK mengirim
   * prop ini, jadi tampilannya tidak berubah. */
  compact?: boolean;
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
  compact = false,
  className,
  children,
}: KelasCardFrameProps) {
  // Pola "stretched link": kartu = <div>, Link ke detail menutupi SELURUH kartu
  // lewat elemen absolut (z-30, di atas badge KelasCardVisual yang z-10/z-20),
  // dan tombol di `children` ditumpuk di atasnya (relative z-40, lihat
  // KelasCardMeta.tsx) — tombol BUKAN anak dari Link, jadi klik tombol tidak
  // pernah ikut navigasi ke detail (tombol di dalam <a> = HTML tidak valid &
  // perilakunya beda-beda antar browser).
  return (
    <div
      className={[
        "relative flex flex-col overflow-hidden rounded-[20px] bg-white transition-shadow",
        diskonAktif
          ? "border-2 border-[#DC2626] shadow-[0_0_0_3px_rgba(220,38,38,0.12),1px_2px_10px_0px_rgba(220,38,38,0.28)] hover:shadow-[0_0_0_3px_rgba(220,38,38,0.16),1px_2px_14px_0px_rgba(220,38,38,0.32)]"
          : "border-[0.8px] border-[#E3E3E3] shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] hover:shadow-[1px_2px_8px_0px_rgba(0,0,0,0.15)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Link
        href={href}
        aria-label={namaKelas}
        className="absolute inset-0 z-30 rounded-[20px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#081EEA]"
      />
      <KelasCardVisual
        namaKelas={namaKelas}
        index={index}
        diskonAktif={diskonAktif}
        sisaSlot={sisaSlot}
        kapasitas={kapasitas}
        programKategori={programKategori}
        tingkatKelas={tingkatKelas}
        subtesNama={subtesNama}
        compact={compact}
      />

      <div className={`flex min-w-0 flex-col ${compact ? "gap-1 p-3 sm:gap-1.5 sm:p-4" : "gap-1.5 p-4"}`}>
        {children}
      </div>
    </div>
  );
}
