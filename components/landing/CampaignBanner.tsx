"use client";

import { useEffect, useRef } from "react";

/**
 * STEP 2 dari alur bertahap popup-lalu-banner (PRD Bagian 13 landing_campaign
 * — BARU). Muncul HANYA setelah CampaignPopup ditutup di sesi ini. Menempel
 * fixed di atas Navbar (z-[60], lebih tinggi dari Navbar z-50) — tinggi
 * banner diukur lewat ResizeObserver & dilaporkan ke CampaignChrome lewat
 * onHeightChange supaya Navbar bisa digeser turun sejumlah itu (prop
 * topOffsetPx), pola sama dengan spacer auto-height Navbar sendiri
 * (components/ui/Navbar.tsx, barRef/spacerHeight).
 */

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export interface CampaignBannerProps {
  judul: string;
  linkTujuan: string;
  onClose: () => void;
  onHeightChange: (height: number) => void;
}

export default function CampaignBanner({ judul, linkTujuan, onClose, onHeightChange }: CampaignBannerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => onHeightChange(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <div ref={rootRef} className="fixed inset-x-0 top-0 z-[60] bg-[#081EEA] text-white">
      <a
        href={linkTujuan}
        className="flex w-full items-center justify-center gap-2 px-10 py-2.5 text-center transition-colors hover:bg-[#0a24ff] sm:px-12"
      >
        <p className="line-clamp-1 text-xs font-medium sm:text-sm">{judul}</p>
        <ArrowIcon />
      </a>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup banner"
        className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white hover:bg-white/20 sm:right-4"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
