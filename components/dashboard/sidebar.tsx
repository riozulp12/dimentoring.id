"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import Logo from "@/components/ui/Logo";
import {
  DashboardIcon,
  AssessmentIcon,
  KelasIcon,
  TryoutIcon,
  ReferralIcon,
  BeasiswaIcon,
  AiMentorIcon,
  SettingIcon,
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
  onNavigate,
}: {
  icon: SidebarIconKey;
  label: string;
  href: string;
  active: boolean;
  locked?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[icon];

  if (locked) {
    return (
      <div
        aria-disabled="true"
        title="Tersedia setelah akun disetujui Admin"
        className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2.5 text-[#b3b1b1]"
      >
        <Icon className="size-5 shrink-0" />
        <span className="text-sm leading-[1.4] font-normal tracking-[-0.2px] whitespace-nowrap">
          {label}
        </span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${
        active ? "bg-[#081eea] text-white" : "text-[#7e7c7c] hover:bg-gray-50"
      }`}
    >
      <Icon className="size-5 shrink-0" />
      <span
        className={`text-sm leading-[1.4] tracking-[-0.2px] whitespace-nowrap ${
          active ? "font-semibold" : "font-normal"
        }`}
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
  onClose?: () => void;
};

export default function Sidebar({ role, mentorPending = false, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const groups = sidebarMenus[role];
  const bottomItems = sidebarBottomMenus[role];

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
        className={`${inter.className} fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col items-center gap-6 bg-white px-4 py-6 shadow-[1px_2px_4px_rgba(0,0,0,0.1)] transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative flex w-full items-center justify-center">
          <Logo className="h-8 w-auto" priority />
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
                <p className="text-sm leading-[1.4] tracking-[-0.2px] text-[#7e7c7c]">{group.group}</p>
                <nav className="flex w-full flex-col items-start gap-1">
                  {group.items.map((item) => (
                    <NavRow
                      key={item.href}
                      icon={item.icon}
                      label={item.label}
                      href={item.href}
                      active={isActive(pathname, item.href)}
                      locked={mentorPending && item.lockedForPendingMentor}
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
                  onNavigate={onClose}
                />
              ))}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}
