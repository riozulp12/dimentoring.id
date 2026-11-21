"use client";

import type { ReactNode } from "react";
import { trackLead } from "@/lib/analytics/metaPixel";

/** Tombol daftar/klaim ke tautan eksternal; klik mengirim event Lead ke Meta Pixel (tanpa data user). */
export default function DaftarLeadLink({
  href,
  kategori,
  className,
  children,
}: {
  href: string;
  kategori?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackLead({ kategori })}
    >
      {children}
    </a>
  );
}
