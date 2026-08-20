import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getSiswaDashboardData } from "@/lib/dashboard/getSiswaDashboardData";
import PageTitle from "@/components/dashboard/PageTitle";
import DashboardOverview from "@/components/dashboard/DashboardOverview";

export default async function StudentDashboard() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // (protected)/layout.tsx sudah memastikan session ada — di sini cuma jaga
  // supaya role LAIN (mis. Mentor) tidak bisa buka Dashboard Siswa lewat URL.
  if (!session) return null;
  if (session.role !== "student") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const data = await getSiswaDashboardData(session.userId);

  return (
    <>
      <PageTitle value="Dashboard Siswa" />
      <DashboardOverview {...data} />
    </>
  );
}
