"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Button from "./Button";
import Logo from "./Logo";
import AccountMenu, { type AccountMenuItem } from "@/components/dashboard/AccountMenu";
import { PROGRAMS } from "@/components/sections/Program";

export type NavItemKey = "home" | "program" | "cek-peluang" | "mentor" | "testimonial" | "faq";

export interface NavbarProps {
  activeItem?: NavItemKey;
  isLoggedIn?: boolean;
  firstName?: string;
  fullName?: string;
  avatarUrl?: string | null;
  menuItems?: AccountMenuItem[];
  /** BR-27 / PRD Bagian 12.2: badge "On Review" untuk Mentor status UserRole.status = 'pending'. */
  mentorStatus?: "pending";
  onLoginClick?: () => void;
  onRegisterClick?: () => void;
  onNotificationClick?: () => void;
}

interface NavItemConfig {
  key: NavItemKey;
  label: string;
  href: string;
  activeColor?: string;
}

// Home → landing page. Cek Peluang PTN → /assessment langsung (fitur publik
// yang sudah jalan, sengaja diberi tempat menonjol di navbar — PRD 4.3/7.4).
// Mentor/Testimonial/FAQ → anchor scroll ke section landing page yang sama
// (pakai prefix "/#" supaya tetap benar dipanggil dari halaman lain, mis.
// /assessment, bukan cuma dari "/" itu sendiri).
const NAV_ITEMS: NavItemConfig[] = [
  { key: "home", label: "Home", href: "/" },
  { key: "cek-peluang", label: "Cek Peluang PTN", href: "/assessment" },
  { key: "mentor", label: "Mentor", href: "/#mentor" },
  { key: "testimonial", label: "Testimonial", href: "/#testimonial" },
  { key: "faq", label: "FAQ", href: "/#faq", activeColor: "#051185" },
];

/** Section id landing page yang punya nav item terkait — dipakai scroll-spy
 * di bawah supaya nav item aktif otomatis ikut section yang lagi kelihatan
 * pas scroll (bukan cuma statis "home" terus). Hanya jalan kalau section-nya
 * memang ada di DOM (halaman "/"); di halaman lain (mis. /assessment) tidak
 * ada efek karena getElementById selalu null. */
const SCROLL_SPY_SECTIONS: { id: string; key: NavItemKey }[] = [
  { id: "program", key: "program" },
  { id: "mentor", key: "mentor" },
  { id: "testimonial", key: "testimonial" },
  { id: "faq", key: "faq" },
];

function NavLink({
  label,
  href,
  isActive,
  activeColor = "#081EEA",
  onNavigate,
}: {
  label: string;
  href: string;
  isActive: boolean;
  activeColor?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      data-active={isActive}
      style={{ "--nav-active-color": activeColor } as CSSProperties}
      className="group flex flex-col items-center gap-1 text-base leading-[1.5] tracking-[-0.36px] text-[#7E7C7C] transition-colors duration-150 data-[active=true]:text-[color:var(--nav-active-color)]"
    >
      <span className="font-normal group-data-[active=true]:font-semibold">{label}</span>
      <Image
        src="/icons/navbar-active-underline.svg"
        width={43}
        height={9}
        alt=""
        className="h-[6px] w-11 opacity-0 transition-opacity duration-150 group-data-[active=true]:opacity-100"
      />
    </Link>
  );
}

/** Dropdown "Program" — pola visual sama dengan dropdown akun (panel rounded
 * card + baris hover), isi diambil langsung dari data section Program yang
 * sudah ada (jangan duplikasi daftar program), tiap item scroll ke #program. */
function ProgramDropdown({ isActive, onNavigate }: { isActive: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-active={isActive}
        style={{ "--nav-active-color": "#081EEA" } as CSSProperties}
        className="group flex flex-col items-center gap-1 text-base leading-[1.5] tracking-[-0.36px] text-[#7E7C7C] transition-colors duration-150 data-[active=true]:text-[color:var(--nav-active-color)]"
      >
        <span className="flex items-center gap-1.5 font-normal group-data-[active=true]:font-semibold">
          Program
          <Image
            src="/icons/navbar-chevron-down.svg"
            width={24}
            height={24}
            alt=""
            className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </span>
        <Image
          src="/icons/navbar-active-underline.svg"
          width={43}
          height={9}
          alt=""
          className="h-[6px] w-11 opacity-0 transition-opacity duration-150 group-data-[active=true]:opacity-100"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full left-1/2 z-40 mt-2 w-72 -translate-x-1/2 rounded-[16px] border-[0.8px] border-[#E3E3E3] bg-white py-1.5 shadow-[1px_2px_4px_rgba(0,0,0,0.1)]"
        >
          {PROGRAMS.map((program) => (
            <Link
              key={program.title}
              href="/#program"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="block px-4 py-2.5 transition-colors hover:bg-gray-50"
            >
              <span className="block text-sm font-medium text-black">{program.title}</span>
              <span className="block text-xs text-[#7E7C7C]">{program.description}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
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
  firstName = "Pengguna",
  fullName,
  avatarUrl = null,
  menuItems = [],
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

  // Scroll-spy: nav item aktif otomatis ikut section landing page yang lagi
  // kelihatan pas scroll. Kalau section-nya nggak ada di DOM (bukan halaman
  // "/"), `sections` kosong dan effect ini no-op — activeItem dari prop
  // (server-computed, per halaman) yang dipakai apa adanya.
  const [scrollActiveItem, setScrollActiveItem] = useState<NavItemKey | undefined>(undefined);

  useEffect(() => {
    const sections = SCROLL_SPY_SECTIONS.map(({ id, key }) => ({
      el: document.getElementById(id),
      key,
    })).filter((section): section is { el: HTMLElement; key: NavItemKey } => section.el !== null);

    if (sections.length === 0) return;

    setScrollActiveItem("home");

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          const match = sections.find((section) => section.el === visible[0].target);
          if (match) setScrollActiveItem(match.key);
          return;
        }

        const firstSectionTop = sections[0].el.getBoundingClientRect().top;
        if (firstSectionTop > 0) setScrollActiveItem("home");
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section.el));
    return () => observer.disconnect();
  }, []);

  const effectiveActiveItem = scrollActiveItem ?? activeItem;

  const [homeItem, cekPeluangItem, mentorItem, testimonialItem, faqItem] = NAV_ITEMS;

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-50 bg-white shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)]">
        <div
          ref={barRef}
          className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 sm:px-8 md:px-12 lg:flex-nowrap lg:gap-4 lg:px-20 lg:py-5 min-[1440px]:gap-16 min-[1440px]:py-8"
        >
          <Link href="/" aria-label="Ke landing page" className="flex items-center">
            <Logo variant="primary" mark="full" priority className="h-8 w-auto lg:h-9 min-[1440px]:h-10" />
          </Link>

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
            <NavLink label={homeItem.label} href={homeItem.href} isActive={effectiveActiveItem === homeItem.key} />
            <ProgramDropdown isActive={effectiveActiveItem === "program"} />
            <NavLink label={cekPeluangItem.label} href={cekPeluangItem.href} isActive={effectiveActiveItem === cekPeluangItem.key} />
            <NavLink label={mentorItem.label} href={mentorItem.href} isActive={effectiveActiveItem === mentorItem.key} />
            <NavLink
              label={testimonialItem.label}
              href={testimonialItem.href}
              isActive={effectiveActiveItem === testimonialItem.key}
            />
            <NavLink
              label={faqItem.label}
              href={faqItem.href}
              activeColor={faqItem.activeColor}
              isActive={effectiveActiveItem === faqItem.key}
            />
          </div>

          <div className="hidden lg:flex lg:items-center lg:gap-3 min-[1440px]:gap-8">
            {isLoggedIn ? (
              <AccountMenu
                firstName={firstName}
                fullName={fullName ?? firstName}
                avatarUrl={avatarUrl}
                menuItems={menuItems}
                mentorStatus={mentorStatus}
                onNotificationClick={onNotificationClick}
              />
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
              <NavLink
                label={homeItem.label}
                href={homeItem.href}
                isActive={effectiveActiveItem === homeItem.key}
                onNavigate={() => setIsMenuOpen(false)}
              />
              <ProgramDropdown isActive={effectiveActiveItem === "program"} onNavigate={() => setIsMenuOpen(false)} />
              <NavLink
                label={cekPeluangItem.label}
                href={cekPeluangItem.href}
                isActive={effectiveActiveItem === cekPeluangItem.key}
                onNavigate={() => setIsMenuOpen(false)}
              />
              <NavLink
                label={mentorItem.label}
                href={mentorItem.href}
                isActive={effectiveActiveItem === mentorItem.key}
                onNavigate={() => setIsMenuOpen(false)}
              />
              <NavLink
                label={testimonialItem.label}
                href={testimonialItem.href}
                isActive={effectiveActiveItem === testimonialItem.key}
                onNavigate={() => setIsMenuOpen(false)}
              />
              <NavLink
                label={faqItem.label}
                href={faqItem.href}
                activeColor={faqItem.activeColor}
                isActive={effectiveActiveItem === faqItem.key}
                onNavigate={() => setIsMenuOpen(false)}
              />
            </div>

            {isLoggedIn ? (
              <div className="flex w-full items-center justify-between">
                <AccountMenu
                  firstName={firstName}
                  fullName={fullName ?? firstName}
                  avatarUrl={avatarUrl}
                  menuItems={menuItems}
                  mentorStatus={mentorStatus}
                  onNotificationClick={onNotificationClick}
                />
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
