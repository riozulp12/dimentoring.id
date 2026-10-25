import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getPenugasanStudioSoalData } from "@/lib/admin/getPenugasanStudioSoalData";
import PageTitle from "@/components/dashboard/PageTitle";
import PenugasanStudioSoalClient from "@/components/admin/PenugasanStudioSoalClient";

/** "Penugasan Studio Soal" (Admin) — PR 3a, revisi K2 (docs/design/studio-soal-snbt-tahap1.md), BR-37. */
export default async function PenugasanStudioSoalPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const data = await getPenugasanStudioSoalData();

  return (
    <>
      <PageTitle value="Penugasan Studio Soal" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        {data === "gagal" ? (
          <div className="rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
            <p className="text-base text-[#7E7C7C]">Gagal memuat data penugasan. Coba muat ulang halaman.</p>
          </div>
        ) : (
          <PenugasanStudioSoalClient initialData={data} />
        )}
      </div>
    </>
  );
}
