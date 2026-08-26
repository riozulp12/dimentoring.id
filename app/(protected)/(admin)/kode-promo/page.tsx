import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getCampaignOptions, getKelasOptions, getKodePromoList } from "@/lib/admin/getKodePromoData";
import PageTitle from "@/components/dashboard/PageTitle";
import KodePromoClient from "@/components/admin/KodePromoClient";

/** "Kode Promo" (Admin) — PRD Bagian 13 (kode_promo). */
export default async function KodePromoPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [kodePromoList, campaignOptions, kelasOptions] = await Promise.all([
    getKodePromoList(),
    getCampaignOptions(),
    getKelasOptions(),
  ]);

  return (
    <>
      <PageTitle value="Kode Promo" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <KodePromoClient
          initialKodePromoList={kodePromoList}
          campaignOptions={campaignOptions}
          kelasOptions={kelasOptions}
        />
      </div>
    </>
  );
}
