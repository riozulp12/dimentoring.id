import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { hasRoleAktif } from "@/lib/admin/enrollmentManual";
import { getLeadCampaignOptions, getLeads } from "@/lib/admin/leads";
import PageTitle from "@/components/dashboard/PageTitle";
import LeadsClient from "@/components/admin/LeadsClient";

/** "Leads" (Admin) — PRD 7.4.6 / BR-38 (tabel leads dari Assessment gratis). */
export default async function LeadsPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }
  // Data pribadi (nomor WA): cek juga role admin masih aktif di DB.
  if ((await hasRoleAktif(session.userId, "admin")) !== true) {
    redirect("/login");
  }

  const [leads, campaignOptions] = await Promise.all([getLeads(), getLeadCampaignOptions()]);

  return (
    <>
      <PageTitle value="Leads" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <LeadsClient initialLeads={leads === "gagal" ? [] : leads} initialCampaignOptions={campaignOptions} loadError={leads === "gagal"} />
      </div>
    </>
  );
}
