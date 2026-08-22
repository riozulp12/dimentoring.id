"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

/** `link` sudah lengkap (domain + /r/[kode]) — dihitung server-side di page.tsx
 * dari header `host` request, supaya tidak perlu window.location di client
 * (hindari hydration mismatch) dan tetap benar di domain manapun. */
export default function ReferralLinkCard({ kodeReferral, link }: { kodeReferral: string | null; link: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API bisa ditolak browser (permission/context tidak secure) —
      // diamkan saja, tombol tetap bisa dicoba lagi.
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-[#7E7C7C]">Kode Referral Kamu</p>
        <p className="text-2xl font-semibold tracking-[-0.02em] text-[#081EEA]">{kodeReferral ?? "-"}</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 truncate rounded-[16px] bg-[#F9F9F9] px-4 py-2.5 text-sm text-[#7E7C7C] sm:text-base">
          {link}
        </div>
        <Button type="button" variant="primary" size="md" onClick={handleCopy} disabled={!kodeReferral}>
          {copied ? "Tersalin!" : "Copy Link"}
        </Button>
      </div>
    </div>
  );
}
