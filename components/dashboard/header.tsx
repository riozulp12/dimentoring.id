"use client";

import { Inter } from "next/font/google";
import AccountMenu, { type AccountMenuItem } from "./AccountMenu";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600"] });

type HeaderProps = {
  title: string;
  onMenuClick?: () => void;
  /** true = sidebar desktop lagi collapsed (icon-only) — geser posisi header mengikuti. */
  collapsed?: boolean;
  firstName: string;
  fullName: string;
  avatarUrl: string | null;
  menuItems: AccountMenuItem[];
  /** BR-27/PRD 12.2: badge "On Review" untuk Mentor dengan UserRole.status = 'pending'. */
  mentorStatus?: "pending";
  /** Level gamifikasi referral (mis. "Rookie Referrer") — ditampilkan di item "Profil" dropdown akun. */
  referralLevel?: string | null;
};

export default function Header({
  title,
  onMenuClick,
  collapsed = false,
  firstName,
  fullName,
  avatarUrl,
  menuItems,
  mentorStatus,
  referralLevel,
}: HeaderProps) {
  return (
    <header
      className={`${inter.className} fixed inset-x-0 top-0 z-30 flex h-20 items-center justify-between bg-white px-4 shadow-[1px_2px_4px_rgba(0,0,0,0.1)] transition-[left] duration-200 sm:px-5 ${collapsed ? "lg:left-20" : "lg:left-64"}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Buka/tutup menu"
          className="-ml-1 flex size-9 items-center justify-center rounded-lg text-[#7e7c7c] hover:bg-gray-100"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-5" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 6H20M4 12H20M4 18H20"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
          {title}
        </h1>
      </div>

      <AccountMenu
        firstName={firstName}
        fullName={fullName}
        avatarUrl={avatarUrl}
        menuItems={menuItems}
        mentorStatus={mentorStatus}
        referralLevel={referralLevel}
      />
    </header>
  );
}
