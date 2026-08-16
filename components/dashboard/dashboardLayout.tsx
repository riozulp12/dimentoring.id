import React from "react";
import Sidebar from "./sidebar";
import Header from "./header";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen flex-row">
      <Sidebar />

      <div className="flex w-full flex-col">
        <Header />

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}