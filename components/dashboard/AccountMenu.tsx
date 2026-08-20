"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NotificationIcon, DefaultAvatarIcon } from "./headerIcons";

/**
 * Avatar + notifikasi + dropdown menu akun — SATU komponen dipakai baik di
 * Navbar landing page (components/ui/Navbar.tsx) maupun Header dashboard
 * (components/dashboard/header.tsx), supaya perilakunya konsisten di kedua
 * tempat tanpa ditulis dua kali. PRD Bagian 7.0.6 (FR-1.9) & Bagian 12.1
 * (Role Switcher — BEDA fitur, belum dibangun di sini).
 */

export interface AccountMenuItem {
  label: string;
  href: string;
}

export interface AccountMenuProps {
  firstName: string;
  avatarUrl: string | null;
  menuItems: AccountMenuItem[];
  /** BR-27/PRD 12.2: badge "On Review" untuk Mentor dengan UserRole.status = 'pending'. */
  mentorStatus?: "pending";
  onNotificationClick?: () => void;
}

function OnReviewBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium leading-none whitespace-nowrap text-amber-700 sm:text-sm">
      On Review
    </span>
  );
}

export default function AccountMenu({
  firstName,
  avatarUrl,
  menuItems,
  mentorStatus,
  onNotificationClick,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {mentorStatus === "pending" ? <OnReviewBadge /> : null}

      <button
        type="button"
        onClick={onNotificationClick}
        aria-label="Notifikasi"
        className="flex size-8 items-center justify-center rounded-lg text-[#7e7c7c] hover:bg-gray-100"
      >
        <NotificationIcon className="size-5" />
      </button>

      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg sm:gap-3"
        >
          <span className="hidden text-sm text-[#081eea] sm:inline">{firstName}</span>

          <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d9d9d9] text-[#7e7c7c] sm:size-9">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={firstName} fill className="object-cover" sizes="36px" />
            ) : (
              <DefaultAvatarIcon className="size-5" />
            )}
          </div>
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute top-full right-0 z-40 mt-2 w-48 rounded-[16px] border-[0.8px] border-[#E3E3E3] bg-white py-1.5 shadow-[1px_2px_4px_rgba(0,0,0,0.1)]"
          >
            {menuItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm text-black transition-colors hover:bg-gray-50"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
