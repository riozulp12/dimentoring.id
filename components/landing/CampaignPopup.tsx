"use client";

import Mascot from "@/components/ui/Mascot";
import Button from "@/components/ui/Button";

/**
 * STEP 1 dari alur bertahap popup-lalu-banner (PRD Bagian 13 landing_campaign
 * — BARU). Muncul otomatis begitu CampaignChrome memutuskan step="popup".
 * Overlay + stopPropagation pola sama dengan components/ui/Modal.tsx, tapi
 * dibuat komponen terpisah (bukan reuse Modal) karena kontennya spesifik:
 * judul font besar + maskot dekoratif + SATU CTA besar ke link_tujuan, beda
 * dari isi form-form Modal generik lainnya.
 */

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export interface CampaignPopupProps {
  judul: string;
  linkTujuan: string;
  onClose: () => void;
}

export default function CampaignPopup({ judul, linkTujuan, onClose }: CampaignPopupProps) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className="modal-content-scrollable relative flex max-h-[85vh] w-full max-w-md flex-col items-center gap-5 overflow-y-auto rounded-[24px] bg-white p-6 text-center shadow-[0_8px_32px_rgba(0,0,0,0.25)] sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-[#7E7C7C] hover:bg-gray-100"
        >
          <CloseIcon />
        </button>

        <Mascot variant="Happy" alt="" loading="eager" className="h-28 w-auto select-none sm:h-32" />

        <h2 className="text-xl leading-[1.3] font-extrabold tracking-[-0.4px] text-black sm:text-2xl">{judul}</h2>

        <a href={linkTujuan} className="w-full">
          <Button type="button" variant="primary" size="lg" className="w-full">
            Lihat Sekarang
          </Button>
        </a>
      </div>
    </div>
  );
}
