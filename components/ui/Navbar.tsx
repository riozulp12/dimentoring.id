"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Button from "./Button";
import Logo from "./Logo";

export type NavItemKey = "home" | "program" | "testimonial" | "faq";

export interface NavbarProps {
  activeItem?: NavItemKey;
  isLoggedIn?: boolean;
  userName?: string;
  avatarSrc?: string;
  /** BR-27 / PRD Bagian 12.2: badge "On Review" untuk Mentor status UserRole.status = 'pending'. */
  mentorStatus?: "pending";
  onLoginClick?: () => void;
  onRegisterClick?: () => void;
  onNotificationClick?: () => void;
}

function OnReviewBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium leading-none text-amber-700">
      On Review
    </span>
  );
}

interface NavItemConfig {
  key: NavItemKey;
  label: string;
  hasDropdown?: boolean;
  activeColor?: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  { key: "home", label: "Home" },
  { key: "program", label: "Program", hasDropdown: true },
  { key: "testimonial", label: "Testimonial" },
  { key: "faq", label: "FAQ", activeColor: "#051185" },
];

function NavLink({ label, hasDropdown, isActive, activeColor = "#081EEA" }: {
  label: string;
  hasDropdown?: boolean;
  isActive: boolean;
  activeColor?: string;
}) {
  return (
    <a
      href="#"
      data-active={isActive}
      style={{ "--nav-active-color": activeColor } as CSSProperties}
      className="group flex flex-col items-center gap-1 text-[20px] leading-[1.5] tracking-[-0.36px] text-[#7E7C7C] transition-colors duration-150 data-[active=true]:text-[color:var(--nav-active-color)]"
    >
      <span className="flex items-center gap-4 font-normal group-data-[active=true]:font-semibold">
        {label}
        {hasDropdown ? (
          <Image src="/icons/navbar-chevron-down.svg" width={24} height={24} alt="" />
        ) : null}
      </span>
      <Image
        src="/icons/navbar-active-underline.svg"
        width={43}
        height={9}
        alt=""
        className="h-[6px] w-11 opacity-0 transition-opacity duration-150 group-data-[active=true]:opacity-100"
      />
    </a>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-4 w-6">
      <span
        className={`absolute left-0 top-0 block h-0.5 w-6 rounded-full bg-black transition-transform duration-200 ${
          open ? "translate-y-[7px] rotate-45" : ""
        }`}
      />
      <span
        className={`absolute left-0 top-[7px] block h-0.5 w-6 rounded-full bg-black transition-opacity duration-200 ${
          open ? "opacity-0" : ""
        }`}
      />
      <span
        className={`absolute left-0 top-[14px] block h-0.5 w-6 rounded-full bg-black transition-transform duration-200 ${
          open ? "-translate-y-[7px] -rotate-45" : ""
        }`}
      />
    </span>
  );
}

export default function Navbar({
  activeItem,
  isLoggedIn = false,
  userName = "Dulce",
  avatarSrc = "/images/navbar-avatar-placeholder.png",
  mentorStatus,
  onLoginClick,
  onRegisterClick,
  onNotificationClick,
}: NavbarProps) {
  const router = useRouter();
  const handleLoginClick = onLoginClick ?? (() => router.push("/login"));
  const handleRegisterClick = onRegisterClick ?? (() => router.push("/daftar"));
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const [spacerHeight, setSpacerHeight] = useState(80);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const observer = new ResizeObserver(([entry]) => {
      setSpacerHeight(entry.contentRect.height);
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 bg-white shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]">
        <div
          ref={barRef}
          className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 sm:px-8 md:px-12 lg:flex-nowrap lg:gap-4 lg:px-20 lg:py-5 min-[1440px]:gap-16 min-[1440px]:py-8"
        >
          <Logo variant="primary" mark="full" priority className="h-8 w-auto lg:h-9 min-[1440px]:h-10" />

          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-label={isMenuOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={isMenuOpen}
            className="flex items-center justify-center rounded-lg p-2 lg:hidden"
          >
            <MenuIcon open={isMenuOpen} />
          </button>

          <div className="hidden items-center gap-4 lg:flex min-[1440px]:gap-16">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.key}
                label={item.label}
                hasDropdown={item.hasDropdown}
                activeColor={item.activeColor}
                isActive={activeItem === item.key}
              />
            ))}
          </div>

          <div className="hidden lg:flex lg:items-center lg:gap-3 min-[1440px]:gap-8">
            {isLoggedIn ? (
              <>
                <button
                  type="button"
                  onClick={onNotificationClick}
                  aria-label="Notifikasi"
                  className="shrink-0"
                >
                  <Image src="/icons/navbar-notification.svg" width={32} height={32} alt="" />
                </button>
                <div className="flex items-center gap-6">
                  <span className="flex items-center gap-2 text-2xl font-normal leading-[1.5] tracking-[-0.48px] text-[#081EEA]">
                    {userName}
                    {mentorStatus === "pending" ? <OnReviewBadge /> : null}
                  </span>
                  <Image
                    src={avatarSrc}
                    width={56}
                    height={56}
                    alt={userName}
                    className="rounded-full object-cover"
                  />
                </div>
              </>
            ) : (
              <>
                <Button variant="primary" size="md" onClick={handleLoginClick}>
                  Login
                </Button>
                <Button variant="secondary" size="md" onClick={handleRegisterClick}>
                  Daftar
                </Button>
              </>
            )}
          </div>
        </div>

        {isMenuOpen ? (
          <div className="flex w-full flex-col items-center gap-6 border-t border-[#E3E3E3] px-5 pt-5 pb-5 sm:px-8 md:px-12 lg:hidden">
            <div className="flex w-full flex-col items-center gap-5">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.key}
                  label={item.label}
                  hasDropdown={item.hasDropdown}
                  activeColor={item.activeColor}
                  isActive={activeItem === item.key}
                />
              ))}
            </div>

            {isLoggedIn ? (
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-4">
                  <Image
                    src={avatarSrc}
                    width={44}
                    height={44}
                    alt={userName}
                    className="rounded-full object-cover"
                  />
                  <span className="flex items-center gap-2 text-lg font-normal leading-[1.5] tracking-[-0.36px] text-[#081EEA]">
                    {userName}
                    {mentorStatus === "pending" ? <OnReviewBadge /> : null}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onNotificationClick}
                  aria-label="Notifikasi"
                  className="shrink-0"
                >
                  <Image src="/icons/navbar-notification.svg" width={28} height={28} alt="" />
                </button>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-3">
                <Button variant="primary" size="md" onClick={handleLoginClick} className="w-full">
                  Login
                </Button>
                <Button variant="secondary" size="md" onClick={handleRegisterClick} className="w-full">
                  Daftar
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </nav>
      <div style={{ height: spacerHeight }} aria-hidden="true" />
    </>
  );
}
