import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getAdminReviewKontenQueue, getKontenInfoAdminList } from "@/lib/admin/getKelolaKontenData";
import PageTitle from "@/components/dashboard/PageTitle";
import KelolaKontenClient from "@/components/admin/KelolaKontenClient";

/** "Kelola Konten" (Admin) — PRD Bagian 13 (konten_info, soal_ai, materi), Bagian 7.7, BR-31. */
export default async function KelolaKontenPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [infoItems, reviewItems] = await Promise.all([
    getKontenInfoAdminList(),
    getAdminReviewKontenQueue(),
  ]);

  return (
    <>
      <PageTitle value="Kelola Konten" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <KelolaKontenClient initialInfo={infoItems} initialReview={reviewItems} />
      </div>
    </>
  );
}
