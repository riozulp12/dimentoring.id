import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getSiswaList } from "@/lib/admin/getManajemenSiswaData";
import PageTitle from "@/components/dashboard/PageTitle";
import ManajemenSiswaClient from "@/components/admin/ManajemenSiswaClient";

/** "Manajemen Siswa" (Admin) — PRD Bagian 5 (User Roles), Bagian 13 (users, user_roles, enrollments). */
export default async function ManajemenSiswaPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const siswa = await getSiswaList();

  return (
    <>
      <PageTitle value="Manajemen Siswa" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <ManajemenSiswaClient initialSiswa={siswa} />
      </div>
    </>
  );
}
