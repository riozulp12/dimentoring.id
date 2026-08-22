import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getReferralHistory, getReferralStats, getRewardHistory } from "@/lib/referral/getReferralData";
import PageTitle from "@/components/dashboard/PageTitle";
import ReferralSummary from "@/components/shared/ReferralSummary";

/** "Referral & Poin" (Siswa) — PRD Bagian 7.1. */
export default async function ReferralPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "student") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [stats, referralHistory, rewardHistory, headersList] = await Promise.all([
    getReferralStats(session.userId),
    getReferralHistory(session.userId),
    getRewardHistory(session.userId),
    headers(),
  ]);

  // Link referral butuh domain lengkap — dihitung dari header request (bukan
  // window.location di client) supaya benar di domain manapun tanpa hydration
  // mismatch, dan tetap konsisten sebagai Server Component.
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const referralLink = stats.kodeReferral ? `${protocol}://${host}/r/${stats.kodeReferral}` : "";

  return (
    <>
      <PageTitle value="Referral & Poin" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <ReferralSummary stats={stats} link={referralLink} referralHistory={referralHistory} rewardHistory={rewardHistory} />
      </div>
    </>
  );
}
