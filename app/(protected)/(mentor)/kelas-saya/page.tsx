import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getMentorKelasSaya } from "@/lib/mentor/getKelasSayaData";
import PageTitle from "@/components/dashboard/PageTitle";
import KelasSayaCard from "@/components/mentor/KelasSayaCard";

/** "Kelas Saya" (Mentor) — PRD Bagian 7.5. BR-7: cuma kelas yang di-assign Admin. */
export default async function KelasSayaMentorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "mentor") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  // BR-27: fitur mengajar (termasuk Kelas Saya) terkunci selama Pending.
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    redirect("/dashboard/mentor");
  }

  const kelasList = await getMentorKelasSaya(session.userId);

  return (
    <>
      <PageTitle value="Kelas Saya" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        {error ? (
          <p className="w-full rounded-[16px] bg-[#FFEBEB] px-4 py-3 text-center text-sm text-[#E70A0A] sm:text-base">
            {error}
          </p>
        ) : null}

        {kelasList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
            <p className="text-base text-[#7E7C7C]">
              Belum ada kelas yang diampu. Admin akan segera menugaskan kelas untukmu.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {kelasList.map((kelas) => (
              <KelasSayaCard key={kelas.id} {...kelas} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
