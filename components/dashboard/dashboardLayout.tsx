"use client";

import React, { useState } from "react";
import Sidebar from "./sidebar";
import Header from "./header";
import { PageTitleProvider, usePageTitle } from "./pageTitleContext";
import type { SidebarRole } from "./sidebarMenuConfig";
import type { AccountMenuItem } from "./AccountMenu";

type DashboardLayoutProps = {
  role: SidebarRole;
  /** BR-27: true kalau UserRole Mentor sesi ini berstatus 'pending'. */
  mentorPending?: boolean;
  firstName: string;
  fullName: string;
  avatarUrl: string | null;
  menuItems: AccountMenuItem[];
  /** Level gamifikasi referral (mis. "Rookie Referrer") — ditampilkan di item "Profil" dropdown akun. */
  referralLevel?: string | null;
  children: React.ReactNode;
};

function DashboardChrome({
  role,
  mentorPending = false,
  firstName,
  fullName,
  avatarUrl,
  menuItems,
  referralLevel,
  children,
}: DashboardLayoutProps) {
  // Mobile: drawer show/hide penuh. Desktop: collapse ke icon-only. Satu
  // tombol hamburger men-toggle KEDUANYA sekaligus — aman karena efek
  // masing-masing state di-scope lewat breakpoint Tailwind (lg:) di
  // Sidebar/Header, jadi toggle "collapsed" tidak berdampak apa pun di
  // mobile dan toggle "mobileOpen" tidak berdampak apa pun di desktop.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { title } = usePageTitle();

  function handleMenuClick() {
    setMobileOpen((prev) => !prev);
    setCollapsed((prev) => !prev);
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        role={role}
        mentorPending={mentorPending}
        isOpen={mobileOpen}
        collapsed={collapsed}
        onClose={() => setMobileOpen(false)}
      />
      <Header
        title={title}
        onMenuClick={handleMenuClick}
        collapsed={collapsed}
        firstName={firstName}
        fullName={fullName}
        avatarUrl={avatarUrl}
        menuItems={menuItems}
        mentorStatus={mentorPending ? "pending" : undefined}
        referralLevel={referralLevel}
      />

      <main className={`min-h-screen min-w-0 pt-20 transition-[padding] duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"}`}>
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({
  role,
  mentorPending,
  firstName,
  fullName,
  avatarUrl,
  menuItems,
  referralLevel,
  children,
}: DashboardLayoutProps) {
  return (
    <PageTitleProvider>
      <DashboardChrome
        role={role}
        mentorPending={mentorPending}
        firstName={firstName}
        fullName={fullName}
        avatarUrl={avatarUrl}
        menuItems={menuItems}
        referralLevel={referralLevel}
      >
        {children}
      </DashboardChrome>
    </PageTitleProvider>
  );
}
