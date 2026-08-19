"use client";

import React, { useState } from "react";
import Sidebar from "./sidebar";
import Header from "./header";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <main className="min-h-screen min-w-0 pt-14 lg:pl-64">
        {children}
      </main>
    </div>
  );
}
