"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import Logo from "@/components/ui/Logo";
import LogoutConfirmModal from "@/components/shared/LogoutConfirmModal";
import {
  DashboardIcon,
  AssessmentIcon,
  KelasIcon,
  TryoutIcon,
  ReferralIcon,
  BeasiswaIcon,
  AiMentorIcon,
  SettingIcon,
  AnalyticsIcon,
  LogoutIcon,
} from "./sidebarIcons";
import {
  sidebarMenus,
  sidebarBottomMenus,
  type SidebarIconKey,
  type SidebarRole,
} from "./sidebarMenuConfig";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600"] });

const ICONS: Record<SidebarIconKey, ComponentType<{ className?: string }>> = {
  dashboard: DashboardIcon,
  assessment: AssessmentIcon,
  kelas: KelasIcon,
  tryout: TryoutIcon,
  referral: ReferralIcon,
  beasiswa: BeasiswaIcon,
  "ai-mentor": AiMentorIcon,
  setting: SettingIcon,
  analytics: AnalyticsIcon,
  logout: LogoutIcon,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  icon,
  label,
  href,
  active,
  locked,
  collapsed,
  onNavigate,
  onClick,
}: {
  icon: SidebarIconKey;
  label: string;
  href: string;
  active: boolean;
  locked?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  /** Cuma dipakai untuk item "Keluar" — buka modal konfirmasi, bukan navigasi langsung. */
  onClick?: () => void;
}) {
  const Icon = ICONS[icon];
  const labelClass = collapsed ? "lg:hidden" : "";

  if (locked) {
    return (
      <div
        aria-disabled="true"
        title="Tersedia setelah akun disetujui Admin"
        className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2.5 text-[#b3b1b1]"
      >
        <Icon className="size-5 shrink-0" />
        <span className={`text-sm leading-[1.4] font-normal tracking-[-0.2px] whitespace-nowrap ${labelClass}`}>
          {label}
        </span>
      </div>
    );
  }

  if (icon === "logout") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={collapsed ? label : undefined}
        className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[#7e7c7c] transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Icon className="size-5 shrink-0 group-hover:text-red-600" />
        <span className={`text-sm leading-[1.4] font-normal tracking-[-0.2px] whitespace-nowrap ${labelClass}`}>
          {label}
        </span>
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${
        active ? "bg-[#081eea] text-white" : "text-[#7e7c7c] hover:bg-gray-50"
      }`}
    >
      <Icon className="size-5 shrink-0" />
      <span
        className={`text-sm leading-[1.4] tracking-[-0.2px] whitespace-nowrap ${
          active ? "font-semibold" : "font-normal"
        } ${labelClass}`}
      >
        {label}
      </span>
    </Link>
  );
}

function Divider() {
  return <div className="h-px w-full shrink-0 bg-[#afafaf]/30" />;
}

type SidebarProps = {
  role: SidebarRole;
  /** BR-27: true kalau UserRole Mentor sesi ini berstatus 'pending'. */
  mentorPending?: boolean;
  isOpen?: boolean;
  /** true = mode desktop icon-only (label disembunyikan, posisi icon tidak berubah). */
  collapsed?: boolean;
  onClose?: () => void;
};

export default function Sidebar({
  role,
  mentorPending = false,
  isOpen = false,
  collapsed = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const groups = sidebarMenus[role];
  const bottomItems = sidebarBottomMenus[role];
  const groupLabelClass = collapsed ? "lg:hidden" : "";
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`${inter.className} fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col items-center gap-6 bg-white px-4 py-6 shadow-[1px_2px_4px_rgba(0,0,0,0.1)] transition-[transform,width] duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div className="relative flex w-full items-center justify-center">
          <Link href="/" aria-label="Ke landing page" className="flex items-center">
            <Logo mark={collapsed ? "icon" : "full"} className="h-8 w-auto" priority />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu"
            className="absolute right-0 flex size-8 items-center justify-center rounded-lg text-[#7e7c7c] hover:bg-gray-100 lg:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <Divider />

        <div className="flex w-full flex-1 flex-col justify-between overflow-y-auto">
          <div className="flex w-full flex-col gap-2">
            {groups.map((group, index) => (
              <div key={group.group} className="flex w-full flex-col gap-2">
                {index > 0 ? <Divider /> : null}
                <p className={`text-sm leading-[1.4] tracking-[-0.2px] text-[#7e7c7c] ${groupLabelClass}`}>
                  {group.group}
                </p>
                <nav className="flex w-full flex-col items-start gap-1">
                  {group.items.map((item) => (
                    <NavRow
                      key={item.href}
                      icon={item.icon}
                      label={item.label}
                      href={item.href}
                      active={isActive(pathname, item.href)}
                      locked={mentorPending && item.lockedForPendingMentor}
                      collapsed={collapsed}
                      onNavigate={onClose}
                    />
                  ))}
                </nav>
              </div>
            ))}
          </div>

          <div className="flex w-full flex-col">
            <Divider />
            <nav className="flex w-full flex-col items-start gap-1 pt-1">
              {bottomItems.map((item) => (
                <NavRow
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={item.icon === "logout" ? false : isActive(pathname, item.href)}
                  collapsed={collapsed}
                  onNavigate={onClose}
                  onClick={
                    item.icon === "logout"
                      ? () => {
                          onClose?.();
                          setLogoutModalOpen(true);
                        }
                      : undefined
                  }
                />
              ))}
            </nav>
          </div>
        </div>
      </aside>

      <LogoutConfirmModal open={logoutModalOpen} onClose={() => setLogoutModalOpen(false)} />
    </>
  );
}
