import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getActiveMentorsWithSubtes, getKelasList, getSubtesOptions } from "@/lib/admin/getKelolaKelasData";
import PageTitle from "@/components/dashboard/PageTitle";
import KelolaKelasClient from "@/components/admin/KelolaKelasClient";

/** "Kelola Kelas" (Admin) — PRD Bagian 7.5, 7.5.3. */
export default async function KelolaKelasPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [kelasList, subtesOptions, mentorOptions] = await Promise.all([
    getKelasList(),
    getSubtesOptions(),
    getActiveMentorsWithSubtes(),
  ]);

  return (
    <>
      <PageTitle value="Kelola Kelas" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <KelolaKelasClient initialKelasList={kelasList} subtesOptions={subtesOptions} mentorOptions={mentorOptions} />
      </div>
    </>
  );
}
