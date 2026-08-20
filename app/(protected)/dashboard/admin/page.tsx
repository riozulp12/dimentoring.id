import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import {
  getAdminStats,
  getKontenAiPreview,
  getMentorPengajuanQueue,
  getSiswaTerbaru,
} from "@/lib/admin/dashboardData";
import { getUserDisplayName } from "@/lib/dashboard/getUserDisplayName";
import PageTitle from "@/components/dashboard/PageTitle";
import AdminDashboardOverview from "@/components/dashboard/AdminDashboardOverview";

export default async function AdminDashboard() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // (protected)/layout.tsx sudah memastikan session ada — di sini cuma jaga
  // supaya role LAIN (mis. Siswa/Mentor) tidak bisa buka Dashboard Admin lewat URL.
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [adminName, stats, mentorPengajuan, siswaTerbaru, kontenAiPreview] = await Promise.all([
    getUserDisplayName(session.userId, "Admin"),
    getAdminStats(),
    getMentorPengajuanQueue(),
    getSiswaTerbaru(),
    getKontenAiPreview(),
  ]);

  return (
    <>
      <PageTitle value="Dashboard Admin" />
      <AdminDashboardOverview
        adminName={adminName}
        stats={stats}
        mentorPengajuan={mentorPengajuan}
        siswaTerbaru={siswaTerbaru}
        kontenAiPreview={kontenAiPreview}
      />
    </>
  );
}
