"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import Avatar from "@/components/ui/Avatar";
import Dropdown from "@/components/ui/Dropdown";
import LogoutConfirmModal from "@/components/shared/LogoutConfirmModal";
import { formatRelativeTime } from "@/lib/shared/formatRelativeTime";
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
  /** Level gamifikasi referral (mis. "Rookie Referrer") — ditampilkan di bawah nama pada item "Profil". */
  referralLevel?: string | null;
}

interface NotifikasiItem {
  id: string;
  tipe: string;
  judul: string;
  pesan: string | null;
  link_tujuan: string | null;
  dibaca: boolean;
  created_at: string;
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
  referralLevel,
}: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotifikasiItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifikasi")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.success) return;
        setNotifications(json.notifications ?? []);
        setUnreadCount(json.unreadCount ?? 0);
      })
      .catch(() => {
        // Gagal muat notifikasi tidak boleh mengganggu render menu akun — biarkan list kosong.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleNotifClick(notif: NotifikasiItem) {
    setNotifOpen(false);
    if (!notif.dibaca) {
      try {
        const response = await fetch(`/api/notifikasi/${notif.id}/baca`, { method: "PATCH" });
        if (response.ok) {
          setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, dibaca: true } : n)));
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch {
        // best-effort — navigasi tetap lanjut meski gagal menandai dibaca
      }
    }
    if (notif.link_tujuan) {
      router.push(notif.link_tujuan);
    }
  }

  async function handleMarkAllRead() {
    try {
      const response = await fetch("/api/notifikasi/baca-semua", { method: "PATCH" });
      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, dibaca: true })));
        setUnreadCount(0);
      }
    } catch {
      // biarkan state apa adanya kalau gagal — user bisa coba lagi
    }
  }

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {mentorStatus === "pending" ? <OnReviewBadge /> : null}

      <Dropdown
        open={notifOpen}
        onOpenChange={setNotifOpen}
        align="right"
        panelClassName="max-h-[70vh] w-80 overflow-y-auto"
        trigger={
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            aria-label="Notifikasi"
            aria-haspopup="menu"
            aria-expanded={notifOpen}
            className="relative flex size-8 items-center justify-center rounded-lg text-[#7e7c7c] hover:bg-gray-100"
          >
            <NotificationIcon className="size-5" />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E70A0A] px-1 text-[10px] leading-none font-semibold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </button>
        }
      >
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm font-semibold text-black">Notifikasi</span>
          {notifications.length > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-medium text-[#081EEA] hover:underline"
            >
              Tandai semua dibaca
            </button>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[#7E7C7C]">Belum ada notifikasi</p>
        ) : (
          notifications.map((notif) => (
            <button
              key={notif.id}
              type="button"
              role="menuitem"
              onClick={() => handleNotifClick(notif)}
              className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 ${
                notif.dibaca ? "" : "bg-[#F9FAFF]"
              }`}
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${notif.dibaca ? "" : "bg-[#081EEA]"}`}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-black">{notif.judul}</span>
                {notif.pesan ? (
                  <span className="line-clamp-2 text-xs text-[#7E7C7C]">{notif.pesan}</span>
                ) : null}
                <span className="text-xs text-[#AFAFAF]">{formatRelativeTime(notif.created_at)}</span>
              </span>
            </button>
          ))
        )}
      </Dropdown>

      <Dropdown
        open={open}
        onOpenChange={setOpen}
        align="right"
        panelClassName="w-56"
        trigger={
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
        }
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
                <span className="flex min-w-0 flex-col">
                  <span className="min-w-0 truncate text-sm font-medium text-black">{fullName}</span>
                  {referralLevel ? (
                    <span className="min-w-0 truncate text-xs text-[#7E7C7C]">{referralLevel}</span>
                  ) : null}
                </span>
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
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-black transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <LogoutIcon className="size-4 shrink-0 text-[#7e7c7c] group-hover:text-red-600" />
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
      </Dropdown>

      <LogoutConfirmModal open={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} />
    </div>
  );
}
