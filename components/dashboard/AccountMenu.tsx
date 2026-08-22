"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import Avatar from "@/components/ui/Avatar";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { DashboardIcon, KelasIcon, LogoutIcon, SettingIcon } from "./sidebarIcons";
import { NotificationIcon } from "./headerIcons";

/**
 * Avatar + notifikasi + dropdown menu akun — SATU komponen dipakai baik di
 * Navbar landing page (components/ui/Navbar.tsx) maupun Header dashboard
 * (components/dashboard/header.tsx), supaya perilakunya konsisten di kedua
 * tempat tanpa ditulis dua kali. PRD Bagian 7.0.6 (FR-1.9), Bagian 12.1
 * (Role Switcher — BEDA fitur, belum dibangun di sini), Bagian 12 (setiap
 * item dropdown pakai icon line/outline dari set yang sudah ada).
 */

export type AccountMenuIconKey = "dashboard" | "profil" | "pengaturan" | "jadi-mentor" | "logout";

export interface AccountMenuItem {
  label: string;
  href: string;
  icon: AccountMenuIconKey;
}

export interface AccountMenuProps {
  firstName: string;
  /** Nama lengkap — dipakai item "Profil" (avatar + nama lengkap, beda dari item lain). */
  fullName: string;
  avatarUrl: string | null;
  menuItems: AccountMenuItem[];
  /** BR-27/PRD 12.2: badge "On Review" untuk Mentor dengan UserRole.status = 'pending'. */
  mentorStatus?: "pending";
  onNotificationClick?: () => void;
}

const MENU_ICONS: Record<Exclude<AccountMenuIconKey, "profil">, ComponentType<{ className?: string }>> = {
  dashboard: DashboardIcon,
  pengaturan: SettingIcon,
  "jadi-mentor": KelasIcon,
  logout: LogoutIcon,
};

function OnReviewBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium leading-none whitespace-nowrap text-amber-700 sm:text-sm">
      On Review
    </span>
  );
}

export default function AccountMenu({
  firstName,
  fullName,
  avatarUrl,
  menuItems,
  mentorStatus,
  onNotificationClick,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
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
          <Avatar avatarUrl={avatarUrl} nama={fullName} size="sm" />
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute top-full right-0 z-40 mt-2 w-56 rounded-[16px] border-[0.8px] border-[#E3E3E3] bg-white py-1.5 shadow-[1px_2px_4px_rgba(0,0,0,0.1)]"
          >
            {menuItems.map((item) => {
              if (item.icon === "profil") {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50"
                  >
                    <Avatar avatarUrl={avatarUrl} nama={fullName} size="sm" />
                    <span className="min-w-0 truncate text-sm font-medium text-black">{fullName}</span>
                  </Link>
                );
              }

              if (item.icon === "logout") {
                return (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      setLogoutConfirmOpen(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-black transition-colors hover:bg-gray-50"
                  >
                    <LogoutIcon className="size-4 shrink-0 text-[#7e7c7c]" />
                    {item.label}
                  </button>
                );
              }

              const Icon = MENU_ICONS[item.icon];
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-black transition-colors hover:bg-gray-50"
                >
                  <Icon className="size-4 shrink-0 text-[#7e7c7c]" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      <Modal open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)}>
        <div className="flex flex-col items-center gap-5 text-center">
          <p className="text-lg font-semibold text-black">Apakah kamu yakin ingin keluar?</p>
          <div className="flex w-full gap-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="flex-1"
              onClick={() => setLogoutConfirmOpen(false)}
            >
              Tidak
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1"
              onClick={() => {
                window.location.href = "/api/auth/logout";
              }}
            >
              Iya, Yakin
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
