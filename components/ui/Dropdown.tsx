"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface DropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Elemen pemicu (button dsb.) — dirender apa adanya sebagai child pertama wrapper relative. */
  trigger: ReactNode;
  /** Isi panel saat terbuka. */
  children: ReactNode;
  /** Diabaikan kalau widthMode="match-trigger" (selalu left-0 right-0). */
  align?: "left" | "right" | "center";
  /** "match-trigger" = lebar panel PERSIS selebar trigger (dipakai SelectField).
   *  "auto" = lebar dari panelClassName, posisi dari align (dipakai menu Navbar). */
  widthMode?: "match-trigger" | "auto";
  panelClassName?: string;
  panelRole?: "menu" | "listbox";
  /** Class tambahan di wrapper luar (mis. "flex-1" supaya width-nya ikut aturan flex parent). */
  className?: string;
}

/**
 * Primitif panel dropdown reusable — gaya visual SAMA dipakai di mana pun:
 * rounded-[16px], border-[0.8px] border-[#E3E3E3], bg-white, shadow halus,
 * baris hover:bg-gray-50, animasi buka fade+scale (lihat .animate-dropdown-in
 * di app/globals.css). Dipakai oleh AccountMenu (avatar/notifikasi), Navbar
 * ProgramDropdown, dan SelectField (select form bergaya sama, lebar mengikuti
 * trigger). Urusan buka/tutup (klik luar, Escape) ditangani di sini supaya
 * tidak perlu ditulis ulang di tiap pemakai.
 */
export default function Dropdown({
  open,
  onOpenChange,
  trigger,
  children,
  align = "left",
  widthMode = "auto",
  panelClassName,
  panelRole = "menu",
  className,
}: DropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  const positionClass =
    widthMode === "match-trigger"
      ? "left-0 right-0"
      : align === "right"
        ? "right-0"
        : align === "center"
          ? "left-1/2 -translate-x-1/2"
          : "left-0";

  return (
    <div ref={containerRef} className={["relative", className].filter(Boolean).join(" ")}>
      {trigger}
      {open ? (
        <div
          role={panelRole}
          className={[
            "animate-dropdown-in absolute top-full z-40 mt-2 rounded-[16px] border-[0.8px] border-[#E3E3E3] bg-white py-1.5 shadow-[1px_2px_4px_rgba(0,0,0,0.1)]",
            positionClass,
            panelClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
