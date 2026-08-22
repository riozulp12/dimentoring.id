import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionRole } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getAccountMenuData } from "@/lib/dashboard/getAccountMenuData";
import { getAccountMenuItems } from "@/lib/dashboard/getAccountMenuItems";
import DashboardLayout from "@/components/dashboard/dashboardLayout";
import type { SidebarRole } from "@/components/dashboard/sidebarMenuConfig";

/**
 * Layout bersama untuk semua halaman yang butuh login (Siswa/Mentor/Admin).
 * Sidebar + Header dirender SEKALI di sini untuk seluruh (siswa)/(mentor)/(admin)
 * route group di bawahnya — role dibaca dari session cookie di server (bukan
 * dari client), sesuai aturan CLAUDE.md soal role tidak boleh dari input client.
 */

const SESSION_ROLE_TO_SIDEBAR_ROLE: Record<SessionRole, SidebarRole> = {
  student: "siswa",
  mentor: "mentor",
  admin: "admin",
};

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    redirect("/login");
  }

  const role = SESSION_ROLE_TO_SIDEBAR_ROLE[session.role];

  // BR-27: cuma relevan untuk role Mentor — status tidak disimpan di session
  // cookie (cuma userId+role), jadi dibaca dari DB di sini.
  const mentorPendingPromise =
    session.role === "mentor"
      ? getMentorRoleStatus(session.userId).then((status) => status === "pending")
      : Promise.resolve(false);

  const [mentorPending, accountData] = await Promise.all([
    mentorPendingPromise,
    getAccountMenuData(session.userId, session.role),
  ]);

  const menuItems = getAccountMenuItems(session.role, accountData.canApplyMentor);

  return (
    <DashboardLayout
      role={role}
      mentorPending={mentorPending}
      firstName={accountData.firstName}
      fullName={accountData.fullName}
      avatarUrl={accountData.avatarUrl}
      menuItems={menuItems}
    >
      {children}
    </DashboardLayout>
  );
}
