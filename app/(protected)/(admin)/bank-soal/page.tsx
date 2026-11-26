import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import PageTitle from "@/components/dashboard/PageTitle";
import DaftarBatchImpor from "@/components/admin/DaftarBatchImpor";
import { pesanKelas } from "@/components/studio-soal/gaya";
import { requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { getBatchImpor } from "@/lib/admin/bankSoal";

/** "Bank Soal" (Admin) — batch impor soal Buatan Sendiri. */
export default async function BankSoalPage() {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(cookie);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }
  const auth = await requireAdminAktif(cookie);
  const batch = auth.ok ? await getBatchImpor() : "gagal";

  return (
    <>
      <PageTitle value="Bank Soal" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        {!auth.ok ? (
          <p role="alert" className={pesanKelas("gagal")}>
            {auth.error}
          </p>
        ) : batch === "gagal" ? (
          <p role="alert" className={pesanKelas("gagal")}>
            Daftar batch belum bisa dimuat. Muat ulang halaman sebentar lagi.
          </p>
        ) : (
          <DaftarBatchImpor batch={batch} />
        )}
      </div>
    </>
  );
}
