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
  avatarUrl: string | null;
  menuItems: AccountMenuItem[];
  children: React.ReactNode;
};

function DashboardChrome({
  role,
  mentorPending = false,
  firstName,
  avatarUrl,
  menuItems,
  children,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { title } = usePageTitle();

  return (
    <div className="min-h-screen">
      <Sidebar
        role={role}
        mentorPending={mentorPending}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <Header
        title={title}
        onMenuClick={() => setSidebarOpen(true)}
        firstName={firstName}
        avatarUrl={avatarUrl}
        menuItems={menuItems}
        mentorStatus={mentorPending ? "pending" : undefined}
      />

      <main className="min-h-screen min-w-0 pt-14 lg:pl-64">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({
  role,
  mentorPending,
  firstName,
  avatarUrl,
  menuItems,
  children,
}: DashboardLayoutProps) {
  return (
    <PageTitleProvider>
      <DashboardChrome
        role={role}
        mentorPending={mentorPending}
        firstName={firstName}
        avatarUrl={avatarUrl}
        menuItems={menuItems}
      >
        {children}
      </DashboardChrome>
    </PageTitleProvider>
  );
}
