"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import { NotificationIcon } from "./headerIcons";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600"] });

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/siswa": "Dashboard Siswa",
  "/dashboard/siswa/assessment": "Assessment Prediksi PTN",
  "/dashboard/siswa/kelas": "Kelas Saya",
  "/dashboard/siswa/tryout": "Try Out",
  "/dashboard/siswa/riwayat": "Riwayat Try Out",
  "/dashboard/siswa/referral": "Referral & Poin",
  "/dashboard/siswa/beasiswa": "Beasiswa & Event",
  "/dashboard/siswa/ai-mentor": "AI Mentor",
  "/dashboard/siswa/pengaturan": "Pengaturan",
};

function getPageTitle(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.keys(PAGE_TITLES)
    .filter((href) => href !== "/dashboard/siswa" && pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_TITLES[match] : "Dashboard Siswa";
}

type HeaderProps = {
  onMenuClick?: () => void;
  userName?: string;
  avatarSrc?: string;
};

export default function Header({
  onMenuClick,
  userName = "Dulce",
  avatarSrc = "/images/navbar-avatar-placeholder.png",
}: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

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

      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          aria-label="Notifikasi"
          className="flex size-8 items-center justify-center rounded-lg text-[#7e7c7c] hover:bg-gray-100"
        >
          <NotificationIcon className="size-5" />
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-sm text-[#081eea] sm:inline">{userName}</span>

          <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-[#d9d9d9] sm:size-9">
            <Image src={avatarSrc} alt={userName} fill className="object-cover" sizes="36px" />
          </div>
        </div>
      </div>
    </header>
  );
}
