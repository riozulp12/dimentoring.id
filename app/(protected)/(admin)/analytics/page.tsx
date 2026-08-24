import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import {
  getCampaignList,
  getMarketingStats,
  getPendaftaranPerSumber,
  getPengeluaranList,
  getPengeluaranPerBulan,
  getSalesPerBulan,
} from "@/lib/admin/getAnalyticsData";
import PageTitle from "@/components/dashboard/PageTitle";
import AnalyticsClient from "@/components/admin/AnalyticsClient";

/** "Analytics" (Admin) — PRD Bagian 13 (utm_source/utm_campaign, iklan_campaign, pengeluaran_bisnis, enrollments+kelas). */
export default async function AnalyticsPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [stats, perSumber, campaigns, salesPerBulan, pengeluaranPerBulan, pengeluaranList] = await Promise.all([
    getMarketingStats(),
    getPendaftaranPerSumber(),
    getCampaignList(),
    getSalesPerBulan(),
    getPengeluaranPerBulan(),
    getPengeluaranList(),
  ]);

  return (
    <>
      <PageTitle value="Analytics" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <AnalyticsClient
          stats={stats}
          perSumber={perSumber}
          salesPerBulan={salesPerBulan}
          pengeluaranPerBulan={pengeluaranPerBulan}
          initialCampaigns={campaigns}
          initialPengeluaran={pengeluaranList}
        />
      </div>
    </>
  );
}
