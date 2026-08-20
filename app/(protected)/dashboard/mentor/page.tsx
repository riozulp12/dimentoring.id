import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getMentorKelasTerdaftar, getMentorProgressByKelas, getMentorStats } from "@/lib/mentor/dashboardData";
import { getInfoBeasiswaEvent } from "@/lib/dashboard/getInfoBeasiswaEvent";
import { getUserDisplayName } from "@/lib/dashboard/getUserDisplayName";
import PageTitle from "@/components/dashboard/PageTitle";
import MentorDashboardOverview from "@/components/dashboard/MentorDashboardOverview";

export default async function MentorDashboard() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // (protected)/layout.tsx sudah memastikan session ada — di sini cuma jaga
  // supaya role LAIN (mis. Siswa) tidak bisa buka Dashboard Mentor lewat URL.
  if (!session) return null;
  if (session.role !== "mentor") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const pending = (await getMentorRoleStatus(session.userId)) === "pending";
  const mentorName = await getUserDisplayName(session.userId, "Mentor");

  // BR-27: mentor pending belum punya kelas/siswa binaan (belum di-assign
  // Admin) — skip query data mengajar, cukup tampilkan pesan terkunci.
  const [stats, progressByKelas, kelasTerdaftar, beasiswaEvent] = pending
    ? [
        { kelasDiampu: 0, siswaBinaan: 0, rataRataProgress: null, kontenMenungguReview: 0 },
        [],
        [],
        [],
      ]
    : await Promise.all([
        getMentorStats(session.userId),
        getMentorProgressByKelas(session.userId),
        getMentorKelasTerdaftar(session.userId),
        getInfoBeasiswaEvent(),
      ]);

  return (
    <>
      <PageTitle value="Dashboard Mentor" />
      <MentorDashboardOverview
        mentorName={mentorName}
        pending={pending}
        stats={stats}
        progressByKelas={progressByKelas}
        kelasTerdaftar={kelasTerdaftar}
        beasiswaEvent={beasiswaEvent}
      />
    </>
  );
}
