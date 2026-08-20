import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getReviewKontenQueue } from "@/lib/mentor/reviewKonten";
import PageTitle from "@/components/dashboard/PageTitle";
import ReviewKontenList from "@/components/mentor/ReviewKontenList";

export default async function ReviewKontenPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "mentor") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  // BR-27: fitur mengajar (termasuk review konten) terkunci selama Pending.
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    redirect("/dashboard/mentor");
  }

  const items = await getReviewKontenQueue(session.userId);

  return (
    <>
      <PageTitle value="Materi & Latihan Soal" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <ReviewKontenList items={items} />
      </div>
    </>
  );
}
