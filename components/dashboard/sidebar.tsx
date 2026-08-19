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

const inter = Inter({ subsets: ["latin"], weight: ["400", "600"] });

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const belajarItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard/siswa", icon: DashboardIcon },
  { label: "Assessment Prediksi PTN", href: "/dashboard/siswa/assessment", icon: AssessmentIcon },
  { label: "Kelas Saya", href: "/dashboard/siswa/kelas", icon: KelasIcon },
  { label: "Try Out", href: "/dashboard/siswa/tryout", icon: TryoutIcon },
];

const lainnyaItems: NavItem[] = [
  { label: "Referral & Poin", href: "/dashboard/siswa/referral", icon: ReferralIcon },
  { label: "Beasiswa & Event", href: "/dashboard/siswa/beasiswa", icon: BeasiswaIcon },
  { label: "AI Mentor", href: "/dashboard/siswa/ai-mentor", icon: AiMentorIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard/siswa") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
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
        {item.label}
      </span>
    </Link>
  );
}

function Divider() {
  return <div className="h-px w-full shrink-0 bg-[#afafaf]/30" />;
}

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();

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
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-[1.4] tracking-[-0.2px] text-[#7e7c7c]">Belajar</p>
              <nav className="flex w-full flex-col items-start gap-1">
                {belajarItems.map((item) => (
                  <NavRow
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    onNavigate={onClose}
                  />
                ))}
              </nav>
            </div>

            <Divider />

            <div className="flex w-full flex-col gap-2">
              <p className="text-sm leading-[1.4] tracking-[-0.2px] text-[#7e7c7c]">Lainnya</p>
              <nav className="flex w-full flex-col items-start gap-1">
                {lainnyaItems.map((item) => (
                  <NavRow
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    onNavigate={onClose}
                  />
                ))}
              </nav>
            </div>
          </div>

          <div className="flex w-full flex-col">
            <Divider />
            <nav className="flex w-full flex-col items-start gap-1 pt-1">
              <NavRow
                item={{ label: "Pengaturan", href: "/dashboard/siswa/pengaturan", icon: SettingIcon }}
                active={isActive(pathname, "/dashboard/siswa/pengaturan")}
                onNavigate={onClose}
              />
              <NavRow
                item={{ label: "Keluar", href: "/logout", icon: LogoutIcon }}
                active={false}
                onNavigate={onClose}
              />
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}
