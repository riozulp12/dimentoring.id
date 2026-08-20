"use client";

import { Inter } from "next/font/google";
import AccountMenu, { type AccountMenuItem } from "./AccountMenu";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600"] });

type HeaderProps = {
  title: string;
  onMenuClick?: () => void;
  firstName: string;
  avatarUrl: string | null;
  menuItems: AccountMenuItem[];
  /** BR-27/PRD 12.2: badge "On Review" untuk Mentor dengan UserRole.status = 'pending'. */
  mentorStatus?: "pending";
};

export default function Header({
  title,
  onMenuClick,
  firstName,
  avatarUrl,
  menuItems,
  mentorStatus,
}: HeaderProps) {
  return (
    <header
      className={`${inter.className} fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between bg-white px-4 shadow-[1px_2px_4px_rgba(0,0,0,0.1)] sm:px-5 lg:left-64`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Buka menu"
          className="-ml-1 flex size-9 items-center justify-center rounded-lg text-[#7e7c7c] hover:bg-gray-100 lg:hidden"
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

        <h1 className="text-lg font-semibold tracking-tight text-black sm:text-xl">
          {title}
        </h1>
      </div>

      <AccountMenu
        firstName={firstName}
        avatarUrl={avatarUrl}
        menuItems={menuItems}
        mentorStatus={mentorStatus}
      />
    </header>
  );
}
