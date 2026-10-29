import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getStudioSoalMentor } from "@/lib/mentor/getStudioSoalData";
import { getKelengkapanDraf, getStimulusMentor } from "@/lib/mentor/studioSoal";
import PageTitle from "@/components/dashboard/PageTitle";
import StudioSoalMentor from "@/components/mentor/StudioSoalMentor";

/** "Studio Soal" (Mentor) — subtes yang ditugaskan Admin, daftar soal & stimulus (PR 3a), tulis soal/stimulus (PR 3b). */
export default async function StudioSoalPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "mentor") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  // BR-27: fitur mengajar (termasuk Studio Soal) terkunci selama Pending.
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    redirect("/dashboard/mentor");
  }

  const [data, stimulus, belumLengkap] = await Promise.all([
    getStudioSoalMentor(session.userId),
    getStimulusMentor(session.userId),
    getKelengkapanDraf(session.userId),
  ]);

  return (
    <>
      <PageTitle value="Studio Soal" />
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        {data === "gagal" || stimulus === "gagal" ? (
          <div className="rounded-[20px] border-[0.8px] border-line bg-white px-5 py-12 text-center">
            <p className="text-base text-muted">Gagal memuat Studio Soal. Coba muat ulang halaman.</p>
          </div>
        ) : (
          <StudioSoalMentor data={data} stimulus={stimulus} belumLengkap={belumLengkap} />
        )}
      </div>
    </>
  );
}
