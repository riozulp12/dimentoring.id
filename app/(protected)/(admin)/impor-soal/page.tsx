import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import PageTitle from "@/components/dashboard/PageTitle";
import ImporSoalClient from "@/components/admin/ImporSoalClient";
import TabStudioSoal from "@/components/admin/TabStudioSoal";

/** "Unggah Soal" (Admin) — Word atau CSV, soal massal Buatan Sendiri, simpan sebagai draf, terbitkan oleh Admin. */
export default async function ImporSoalPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  return (
    <>
      <PageTitle value="Unggah Soal" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <TabStudioSoal aktif="/impor-soal" />
        <ImporSoalClient />
      </div>
    </>
  );
}
