import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getSesiPerluReview } from "@/lib/admin/getSesiReviewData";
import PageTitle from "@/components/dashboard/PageTitle";
import SesiReviewClient from "@/components/admin/SesiReviewClient";

/** "Sesi Perlu Ditinjau" (Admin) — PRD Bagian 7.5.5 FR-A3, BR-34. */
export default async function SesiReviewPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const items = await getSesiPerluReview();

  return (
    <>
      <PageTitle value="Sesi Perlu Ditinjau" />
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <SesiReviewClient initialItems={items} />
      </div>
    </>
  );
}
