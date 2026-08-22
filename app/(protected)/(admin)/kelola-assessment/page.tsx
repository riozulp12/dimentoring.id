import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getPtnJurusanList, getProvinsiOptions, getUniversitasOptions } from "@/lib/admin/getKelolaAssessmentData";
import PageTitle from "@/components/dashboard/PageTitle";
import KelolaAssessmentClient from "@/components/admin/KelolaAssessmentClient";

/** "Kelola Assessment (Data PTN)" (Admin) — PRD Bagian 7.4.2, BR-28, Bagian 13. */
export default async function KelolaAssessmentPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [ptnList, provinsiOptions, universitasOptions] = await Promise.all([
    getPtnJurusanList(),
    getProvinsiOptions(),
    getUniversitasOptions(),
  ]);

  return (
    <>
      <PageTitle value="Kelola Assessment (Data PTN)" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <KelolaAssessmentClient
          initialPtnList={ptnList}
          universitasOptions={universitasOptions}
          provinsiOptions={provinsiOptions}
        />
      </div>
    </>
  );
}
