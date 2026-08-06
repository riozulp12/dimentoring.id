"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import Button from "./Button";
import Logo from "./Logo";

export type NavItemKey = "home" | "program" | "testimonial" | "faq";

export interface NavbarProps {
  activeItem?: NavItemKey;
  isLoggedIn?: boolean;
  userName?: string;
  avatarSrc?: string;
  onLoginClick?: () => void;
  onRegisterClick?: () => void;
  onNotificationClick?: () => void;
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
      className="group flex flex-col items-center gap-1 text-2xl leading-[1.5] tracking-[-0.48px] text-[#7E7C7C] transition-colors duration-150 data-[active=true]:text-[color:var(--nav-active-color)]"
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

export default function Navbar({
  activeItem,
  isLoggedIn = false,
  userName = "Dulce",
  avatarSrc = "/images/navbar-avatar-placeholder.png",
  onLoginClick,
  onRegisterClick,
  onNotificationClick,
}: NavbarProps) {
  return (
    <nav className="flex w-full items-center justify-between gap-16 bg-white px-20 py-8 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]">
      <Logo variant="primary" mark="full" priority />

      <div className="flex items-center gap-16">
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
        <div className="flex items-center gap-8">
          <button
            type="button"
            onClick={onNotificationClick}
            aria-label="Notifikasi"
            className="shrink-0"
          >
            <Image src="/icons/navbar-notification.svg" width={32} height={32} alt="" />
          </button>
          <div className="flex items-center gap-6">
            <span className="text-2xl font-normal leading-[1.5] tracking-[-0.48px] text-[#081EEA]">
              {userName}
            </span>
            <Image
              src={avatarSrc}
              width={56}
              height={56}
              alt={userName}
              className="rounded-full object-cover"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-8">
          <Button variant="primary" size="lg" onClick={onLoginClick}>
            Login
          </Button>
          <Button variant="secondary" size="lg" onClick={onRegisterClick}>
            Daftar
          </Button>
        </div>
      )}
    </nav>
  );
}
